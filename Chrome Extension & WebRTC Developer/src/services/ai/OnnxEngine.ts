// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — ONNX Runtime Web Inference Engine
//  Implements InferenceEngine using ONNX Runtime Web for custom ONNX models.
//  Supports WebGPU, WebGL, WASM backends with automatic selection.
// ─────────────────────────────────────────────────────────────────────────────

import { InferenceEngine } from './InferenceEngine';
import type {
  InferenceResult,
  InferenceEngineOptions,
  AIBackend,
} from '@/types/ai.types';
import { createLogger } from '@/shared/utils/logger';

const log = createLogger('OnnxEngine');

/**
 * ONNX Runtime Web inference engine.
 * Designed for running custom ONNX models (face recognition, custom detectors, etc.)
 * Uses SIMD WASM by default, upgrades to WebGPU/WebGL if available.
 */
export class OnnxEngine extends InferenceEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ort: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private session: any = null;
  private actualBackend: AIBackend = 'wasm';
  private modelPath: string = '';

  constructor(options: InferenceEngineOptions, modelPath: string) {
    super(options);
    this.modelPath = modelPath;
  }

  async initialize(): Promise<void> {
    this.setState('loading');
    log.info('Initializing ONNX Runtime engine');

    try {
      this.ort = await import('onnxruntime-web');

      // Configure ONNX Runtime
      await this.configureRuntime();

      if (this.modelPath) {
        this.session = await this.ort.InferenceSession.create(
          this.modelPath,
          {
            executionProviders: [this.getExecutionProvider()],
            graphOptimizationLevel: 'all',
            enableCpuMemArena: true,
            enableMemPattern: true,
            executionMode: 'parallel',
          }
        );
        log.info(`ONNX model loaded: ${this.modelPath}`);
      }

      this.setState('ready');
      log.info(`ONNX Runtime ready (backend: ${this.actualBackend})`);
    } catch (err) {
      this.setState('error');
      log.error('ONNX Runtime initialization failed', err);
      throw err;
    }
  }

  async infer(
    source: HTMLVideoElement | ImageData | ImageBitmap,
    frameId: number,
    timestamp: number,
  ): Promise<InferenceResult> {
    if (!this.isReady || !this.session) {
      return { frameId, timestamp, inferenceTimeMs: 0 };
    }

    const t0 = performance.now();

    try {
      // Preprocess: extract ImageData from source
      const imageData = await this.extractImageData(source);
      const inputTensor = this.preprocessToTensor(imageData);

      // Run inference
      const feeds = { input: inputTensor };
      const results = await this.session.run(feeds);

      // Postprocess (model-specific, returns raw results here)
      log.debug('ONNX inference complete', results);

      return {
        frameId,
        timestamp,
        inferenceTimeMs: performance.now() - t0,
      };
    } catch (err) {
      log.error('ONNX inference error', err);
      return { frameId, timestamp, inferenceTimeMs: performance.now() - t0 };
    }
  }

  async updateConfig(_config: Partial<InferenceEngineOptions>): Promise<void> {
    // ONNX sessions are immutable after creation; reload session if needed
    log.info('ONNX config update (session reload may be required)');
  }

  async dispose(): Promise<void> {
    log.info('Disposing ONNX engine');
    if (this.session) {
      await this.session.release?.();
      this.session = null;
    }
    this.setState('idle');
  }

  getActualBackend(): AIBackend { return this.actualBackend; }

  // ── Private ────────────────────────────────────────────────────────────

  private async configureRuntime(): Promise<void> {
    // Configure WASM paths (served from extension web_accessible_resources)
    this.ort.env.wasm.wasmPaths = chrome.runtime.getURL('assets/');
    this.ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency ?? 4, 4);
    this.ort.env.wasm.simd = true;

    // Detect best available execution provider
    if ('gpu' in navigator) {
      const adapter = await navigator.gpu?.requestAdapter();
      if (adapter) {
        this.actualBackend = 'webgpu';
        return;
      }
    }

    const canvas = document.createElement('canvas');
    if (canvas.getContext('webgl2')) {
      this.actualBackend = 'webgl';
      return;
    }

    this.actualBackend = 'wasm';
  }

  private getExecutionProvider(): string {
    switch (this.actualBackend) {
      case 'webgpu': return 'webgpu';
      case 'webgl':  return 'webgl';
      default:       return 'wasm';
    }
  }

  private async extractImageData(
    source: HTMLVideoElement | ImageData | ImageBitmap
  ): Promise<ImageData> {
    if (source instanceof ImageData) return source;

    const canvas = new OffscreenCanvas(
      (source as HTMLVideoElement).videoWidth || (source as ImageBitmap).width || 224,
      (source as HTMLVideoElement).videoHeight || (source as ImageBitmap).height || 224,
    );
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(source as CanvasImageSource, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  private preprocessToTensor(imageData: ImageData): unknown {
    // Normalize pixel values to [0, 1] and reshape to [1, 3, H, W] (NCHW format)
    const { width, height, data } = imageData;
    const float32 = new Float32Array(3 * height * width);
    const pixelCount = height * width;

    for (let i = 0; i < pixelCount; i++) {
      float32[i]                 = data[i * 4]! / 255;     // R
      float32[i + pixelCount]    = data[i * 4 + 1]! / 255; // G
      float32[i + 2 * pixelCount]= data[i * 4 + 2]! / 255; // B
    }

    return new this.ort.Tensor('float32', float32, [1, 3, height, width]);
  }
}
