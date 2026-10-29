// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Abstract Inference Engine
//  Base class / interface that all AI backends must implement.
//  Enables hot-swapping between MediaPipe, TensorFlow.js, and ONNX Runtime.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  InferenceResult,
  InferenceEngineState,
  InferenceEngineOptions,
  ModelType,
  AIBackend,
} from '@/types/ai.types';
import type { VideoFrame } from '@/types/media.types';
import { createLogger } from '@/shared/utils/logger';

const log = createLogger('InferenceEngine');

/**
 * Abstract base for all inference engines.
 * Concrete implementations: MediaPipeEngine, TensorFlowEngine, OnnxEngine
 *
 * SOLID: Open/Closed — new backends extend this without modifying existing code.
 */
export abstract class InferenceEngine {
  protected state: InferenceEngineState = 'idle';
  protected readonly options: InferenceEngineOptions;
  private readonly stateListeners: Set<(s: InferenceEngineState) => void> = new Set();

  constructor(options: InferenceEngineOptions) {
    this.options = options;
  }

  /**
   * Initialize the engine: load models, warm up backend
   */
  abstract initialize(): Promise<void>;

  /**
   * Run inference on a single video frame.
   * Must be non-blocking and safe to call every frame.
   */
  abstract infer(
    source: HTMLVideoElement | ImageData | ImageBitmap,
    frameId: number,
    timestamp: number,
  ): Promise<InferenceResult>;

  /**
   * Update model configuration at runtime (e.g., toggle face detection)
   */
  abstract updateConfig(config: Partial<InferenceEngineOptions>): Promise<void>;

  /**
   * Release all model resources and stop the engine
   */
  abstract dispose(): Promise<void>;

  /**
   * Returns the detected backend that was actually used
   */
  abstract getActualBackend(): AIBackend;

  /**
   * Returns enabled model types
   */
  get enabledModels(): ModelType[] {
    return this.options.models;
  }

  get engineState(): InferenceEngineState { return this.state; }
  get isReady(): boolean { return this.state === 'ready' || this.state === 'running'; }

  onStateChange(cb: (s: InferenceEngineState) => void): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  protected setState(state: InferenceEngineState): void {
    this.state = state;
    log.debug(`State → ${state}`);
    this.stateListeners.forEach(cb => cb(state));
  }

  /**
   * Warm-up inference: runs N dummy frames to pre-compile shaders and JIT
   */
  protected async warmUp(
    videoEl: HTMLVideoElement,
    frames = 3,
  ): Promise<void> {
    log.info(`Warming up with ${frames} frames…`);
    for (let i = 0; i < frames; i++) {
      await this.infer(videoEl, -1 - i, performance.now());
    }
    log.info('Warmup complete');
  }
}
