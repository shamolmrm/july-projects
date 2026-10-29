// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Input Validators
//  Runtime validation for messages, settings, and media inputs
// ─────────────────────────────────────────────────────────────────────────────

import type { MessageType, AppSettings } from '@/types/messages.types';
import type { VideoResolution } from '@/types/media.types';
import type { AIBackend } from '@/types/ai.types';

const VALID_MESSAGE_TYPES: Set<MessageType> = new Set([
  'PIPELINE_START', 'PIPELINE_STOP', 'PIPELINE_PAUSE', 'PIPELINE_RESUME',
  'PIPELINE_STATUS', 'PIPELINE_ERROR', 'PIPELINE_READY',
  'OFFSCREEN_CREATE', 'OFFSCREEN_CLOSE', 'OFFSCREEN_START', 'OFFSCREEN_STOP',
  'OFFSCREEN_READY', 'OFFSCREEN_ERROR', 'OFFSCREEN_FRAME', 'OFFSCREEN_METRICS',
  'SETTINGS_UPDATE', 'SETTINGS_GET', 'SETTINGS_RESPONSE',
  'INFERENCE_RESULT', 'INFERENCE_CONFIG', 'MODEL_LOAD', 'MODEL_LOADED', 'MODEL_ERROR',
  'PERF_SNAPSHOT', 'BENCHMARK_START', 'BENCHMARK_STOP', 'BENCHMARK_RESULT',
  'CONTENT_PANEL_SHOW', 'CONTENT_PANEL_HIDE', 'CONTENT_VIDEO_FOUND', 'CONTENT_VISION_STARTED',
  'BADGE_UPDATE', 'TAB_FOCUS',
  'WORKER_INIT', 'WORKER_READY', 'WORKER_PROCESS', 'WORKER_RESULT', 'WORKER_ERROR', 'WORKER_TERMINATE',
]);

const VALID_RESOLUTIONS: Set<VideoResolution> = new Set(['360p', '480p', '720p', '1080p', '4K']);
const VALID_BACKENDS: Set<AIBackend> = new Set(['webgpu', 'webgl', 'wasm', 'cpu']);

/**
 * Validates that a message object has a valid 'type' field.
 */
export function isValidMessageType(msg: unknown): msg is { type: MessageType } {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    typeof (msg as { type: unknown }).type === 'string' &&
    VALID_MESSAGE_TYPES.has((msg as { type: MessageType }).type)
  );
}

/**
 * Validates chrome extension message shape
 */
export function isValidExtensionMessage(msg: unknown): boolean {
  if (!isValidMessageType(msg)) return false;
  const m = msg as Record<string, unknown>;
  if (typeof m['id'] !== 'string') return false;
  if (typeof m['timestamp'] !== 'number') return false;
  if (typeof m['source'] !== 'string') return false;
  return true;
}

/**
 * Validates a VideoResolution string
 */
export function isValidResolution(value: unknown): value is VideoResolution {
  return typeof value === 'string' && VALID_RESOLUTIONS.has(value as VideoResolution);
}

/**
 * Validates an AIBackend string
 */
export function isValidBackend(value: unknown): value is AIBackend {
  return typeof value === 'string' && VALID_BACKENDS.has(value as AIBackend);
}

/**
 * Sanitizes AppSettings — returns only known keys with validated values.
 * Prevents prototype pollution and unknown settings injection.
 */
export function sanitizeSettings(raw: unknown): Partial<AppSettings> {
  if (typeof raw !== 'object' || raw === null) return {};

  const r = raw as Record<string, unknown>;
  const out: Partial<AppSettings> = {};

  // String fields
  if (typeof r['selectedDeviceId'] === 'string') {
    out.selectedDeviceId = r['selectedDeviceId'].slice(0, 256);
  }
  if (isValidResolution(r['resolution'])) {
    out.resolution = r['resolution'];
  }
  if (isValidBackend(r['backend'])) {
    out.backend = r['backend'];
  }
  if (typeof r['overlayTheme'] === 'string' &&
      ['indigo-cyan','green-emerald','orange-red','purple-pink'].includes(r['overlayTheme'])) {
    out.overlayTheme = r['overlayTheme'] as AppSettings['overlayTheme'];
  }

  // Number fields with range validation
  if (typeof r['targetFPS'] === 'number' && r['targetFPS'] >= 5 && r['targetFPS'] <= 60) {
    out.targetFPS = Math.round(r['targetFPS']);
  }
  if (typeof r['modelComplexity'] === 'number' && [0, 1, 2].includes(r['modelComplexity'])) {
    out.modelComplexity = r['modelComplexity'] as 0 | 1 | 2;
  }
  if (typeof r['maxHands'] === 'number' && [1, 2].includes(r['maxHands'])) {
    out.maxHands = r['maxHands'] as 1 | 2;
  }
  if (typeof r['maxFaces'] === 'number' && [1, 2, 3].includes(r['maxFaces'])) {
    out.maxFaces = r['maxFaces'] as 1 | 2 | 3;
  }
  if (typeof r['minDetectionConfidence'] === 'number' &&
      r['minDetectionConfidence'] >= 0 && r['minDetectionConfidence'] <= 1) {
    out.minDetectionConfidence = r['minDetectionConfidence'];
  }
  if (typeof r['minTrackingConfidence'] === 'number' &&
      r['minTrackingConfidence'] >= 0 && r['minTrackingConfidence'] <= 1) {
    out.minTrackingConfidence = r['minTrackingConfidence'];
  }
  if (typeof r['frameSkipThreshold'] === 'number' &&
      r['frameSkipThreshold'] >= 16 && r['frameSkipThreshold'] <= 500) {
    out.frameSkipThreshold = r['frameSkipThreshold'];
  }
  if (typeof r['workerCount'] === 'number' && r['workerCount'] >= 1 && r['workerCount'] <= 8) {
    out.workerCount = Math.round(r['workerCount']);
  }

  // Boolean fields
  const boolFields: (keyof AppSettings)[] = [
    'mirrorVideo', 'enableAudio',
    'enableFaceDetection', 'enableFaceMesh', 'enableHandDetection',
    'enablePoseDetection', 'enableObjectDetection', 'enableSegmentation',
    'showLandmarks', 'showBoundingBoxes', 'showLabels',
    'showSegmentationMask', 'showHUD',
    'enableOffscreenCanvas', 'enableFrameSkip',
    'floatingPanel', 'darkMode', 'autoStart',
  ];
  for (const field of boolFields) {
    if (typeof r[field] === 'boolean') {
      (out as Record<string, unknown>)[field] = r[field];
    }
  }

  return out;
}

/**
 * Validates that a MediaStream is alive and has video track
 */
export function isActiveVideoStream(stream: MediaStream | null | undefined): stream is MediaStream {
  if (!stream) return false;
  const tracks = stream.getVideoTracks();
  return tracks.length > 0 && tracks[0]?.readyState === 'live';
}

/**
 * Clamps a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
