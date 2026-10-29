// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Offscreen Document Orchestrator
//  Runs in the Chrome offscreen document context (has full DOM/media APIs).
//  Orchestrates: camera → AI inference → results → popup/sidepanel
// ─────────────────────────────────────────────────────────────────────────────

import { CameraService } from '@/services/media/CameraService';
import { MediaPipeEngine } from '@/services/ai/MediaPipeEngine';
import { PerformanceMonitor } from '@/services/performance/PerformanceMonitor';
import { DEFAULT_SETTINGS } from '@/config/media.config';
import { createLogger } from '@/shared/utils/logger';
import { generateId } from '@/shared/utils/timing';
import type { AppSettings } from '@/types/messages.types';
import type { ModelType, AIBackend, InferenceResult } from '@/types/ai.types';
import type { InferenceTiming, RenderTiming } from '@/types/performance.types';

const log = createLogger('Offscreen');

// ── Internal state ─────────────────────────────────────────────────────────

let settings: AppSettings    = DEFAULT_SETTINGS;
let isRunning                = false;
let inferenceEngine: MediaPipeEngine | null = null;
let cameraService: CameraService | null = null;
let perfMonitor: PerformanceMonitor | null = null;
let videoEl: HTMLVideoElement | null = null;
let animFrame: number | null = null;
let lastInferenceResult: InferenceResult | null = null;
let frameCounter = 0;
let isPendingInference = false;

// ── Chrome Message Handler ─────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(async (msg, _sender, sendResponse) => {
  const { type } = msg;

  if (type === 'PIPELINE_START') {
    if (msg._forwardedByBackground) {
      await startPipeline(msg.payload ?? {});
      sendResponse({ success: true });
      return true;
    }
  }

  if (type === 'PIPELINE_STOP') {
    if (msg._forwardedByBackground) {
      await stopPipeline();
      sendResponse({ success: true });
      return true;
    }
  }

  if (type === 'SETTINGS_UPDATE' && msg._forwardedByBackground) {
    settings = { ...settings, ...msg.payload };
    if (inferenceEngine) {
      await inferenceEngine.updateConfig({
        models: getEnabledModels(settings),
        config: {
          maxDetections:         settings.maxHands,
          minConfidence:         settings.minDetectionConfidence,
          minTrackingConfidence: settings.minTrackingConfidence,
          modelComplexity:       settings.modelComplexity,
        } as unknown as AppSettings,
      });
    }
    sendResponse({ success: true });
    return true;
  }

  if (type === 'BENCHMARK_START') {
    sendResponse({ success: true });
    return true;
  }

  return false;
});

// ── Pipeline lifecycle ─────────────────────────────────────────────────────

async function startPipeline(pipelineSettings: Partial<AppSettings>): Promise<void> {
  if (isRunning) {
    log.warn('Pipeline already running');
    return;
  }

  settings = { ...settings, ...pipelineSettings };
  isRunning = true;

  log.info('Starting offscreen pipeline', settings);

  try {
    // Initialize camera
    cameraService = new CameraService();
    const stream = await cameraService.start({
      deviceId:   settings.selectedDeviceId || undefined,
      resolution: settings.resolution,
      frameRate:  settings.targetFPS,
      mirror:     settings.mirrorVideo,
    });

    // Attach to video element
    videoEl = document.getElementById('video') as HTMLVideoElement;
    videoEl.srcObject = stream;
    videoEl.playsInline = true;
    videoEl.muted = true;

    await new Promise<void>((resolve, reject) => {
      videoEl!.onloadedmetadata = () => videoEl!.play().then(resolve).catch(reject);
      videoEl!.onerror = () => reject(new Error('Video load error'));
    });

    // Initialize AI engine
    const models = getEnabledModels(settings);
    inferenceEngine = new MediaPipeEngine({
      backend: settings.backend as AIBackend,
      models,
      config: {
        maxDetections:         settings.maxHands,
        minConfidence:         settings.minDetectionConfidence,
        minTrackingConfidence: settings.minTrackingConfidence,
        modelComplexity:       settings.modelComplexity,
        refineLandmarks:       true,
        smoothLandmarks:       true,
      } as Parameters<typeof MediaPipeEngine.prototype.initialize>[0] extends never ? never : never,
      enableWarmup: true,
    });

    await inferenceEngine.initialize();

    // Start performance monitor
    perfMonitor = new PerformanceMonitor(models);
    perfMonitor.start({
      backend:    settings.backend,
      resolution: settings.resolution,
      targetFPS:  settings.targetFPS,
    });

    // Notify popup
    chrome.runtime.sendMessage({
      type:      'OFFSCREEN_READY',
      id:        generateId(),
      timestamp: Date.now(),
      source:    'offscreen',
      resolution:`${videoEl.videoWidth}×${videoEl.videoHeight}`,
    }).catch(() => {});

    // Start processing loop
    scheduleFrame();
    log.info('Pipeline started successfully');
  } catch (err) {
    log.error('Pipeline start failed', err);
    isRunning = false;

    chrome.runtime.sendMessage({
      type:      'PIPELINE_ERROR',
      id:        generateId(),
      timestamp: Date.now(),
      source:    'offscreen',
      error:     err instanceof Error ? err.message : String(err),
    }).catch(() => {});
  }
}

async function stopPipeline(): Promise<void> {
  if (!isRunning) return;
  isRunning = false;

  if (animFrame !== null) {
    cancelAnimationFrame(animFrame);
    animFrame = null;
  }

  await inferenceEngine?.dispose();
  await cameraService?.stop();
  perfMonitor?.stop();

  inferenceEngine = null;
  cameraService   = null;
  perfMonitor     = null;
  lastInferenceResult = null;

  if (videoEl) {
    videoEl.srcObject = null;
    videoEl = null;
  }

  chrome.runtime.sendMessage({
    type:      'PIPELINE_STATUS',
    id:        generateId(),
    timestamp: Date.now(),
    source:    'offscreen',
    payload:   { status: 'idle' },
  }).catch(() => {});

  log.info('Pipeline stopped');
}

// ── Processing loop ────────────────────────────────────────────────────────

function scheduleFrame(): void {
  if (!isRunning) return;

  if ('requestVideoFrameCallback' in (videoEl ?? {})) {
    (videoEl as HTMLVideoElement & { requestVideoFrameCallback: (cb: (now: number) => void) => void })
      .requestVideoFrameCallback((now) => processFrame(now));
  } else {
    animFrame = requestAnimationFrame((now) => processFrame(now));
  }
}

async function processFrame(now: number): Promise<void> {
  if (!isRunning || !videoEl || !inferenceEngine) {
    scheduleFrame();
    return;
  }

  // Skip if previous inference still running
  if (isPendingInference) {
    scheduleFrame();
    return;
  }

  frameCounter++;
  isPendingInference = true;

  try {
    const t0 = performance.now();
    const result = await inferenceEngine.infer(videoEl, frameCounter, now);
    const inferenceMs = performance.now() - t0;
    lastInferenceResult = result;

    // Record metrics
    const inferenceTiming: InferenceTiming = {
      preprocessMs:  0,
      inferenceMs,
      postprocessMs: 0,
      totalMs:       inferenceMs,
    };
    const renderTiming: RenderTiming = {
      drawFrameMs: 0,
      overlayMs:   0,
      totalMs:     0,
    };

    perfMonitor?.recordFrame(inferenceTiming, renderTiming, now);

    // Broadcast result to all contexts (popup, sidepanel)
    chrome.runtime.sendMessage({
      type:      'INFERENCE_RESULT',
      id:        generateId(),
      timestamp: Date.now(),
      source:    'offscreen',
      payload:   result,
    }).catch(() => {});

    // Broadcast performance snapshot periodically
    if (frameCounter % 30 === 0) {
      const snapshot = perfMonitor?.getLatestSnapshot();
      if (snapshot) {
        chrome.runtime.sendMessage({
          type:      'PERF_SNAPSHOT',
          id:        generateId(),
          timestamp: Date.now(),
          source:    'offscreen',
          payload:   snapshot,
        }).catch(() => {});
      }
    }
  } catch (err) {
    log.error('Frame processing error', err);
  } finally {
    isPendingInference = false;
  }

  scheduleFrame();
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getEnabledModels(s: AppSettings): ModelType[] {
  const models: ModelType[] = [];
  if (s.enableHandDetection)   models.push('hand-detection');
  if (s.enableFaceMesh)        models.push('face-mesh');
  if (s.enableFaceDetection)   models.push('face-detection');
  if (s.enablePoseDetection)   models.push('pose-detection');
  if (s.enableObjectDetection) models.push('object-detection');
  if (s.enableSegmentation)    models.push('segmentation');
  return models;
}

log.info('Offscreen document loaded');
