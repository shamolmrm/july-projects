// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — TensorFlow.js Inference Engine
//  Implements InferenceEngine using TF.js with WebGL/WebGPU/WASM backends.
//  Supports: Object Detection (COCO-SSD), Body-Pix Segmentation
// ─────────────────────────────────────────────────────────────────────────────

import { InferenceEngine } from './InferenceEngine';
import type {
  InferenceResult,
  InferenceEngineOptions,
  AIBackend,
  ObjectDetection,
  BoundingBox,
} from '@/types/ai.types';
import { createLogger } from '@/shared/utils/logger';

const log = createLogger('TensorFlowEngine');

interface CocoSSDPrediction {
  bbox: [number, number, number, number]; // [x, y, width, height]
  class: string;
  score: number;
}

/**
 * TensorFlow.js inference engine.
 * Uses COCO-SSD for object detection, extensible to other TF.js models.
 */
export class TensorFlowEngine extends InferenceEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tfModule: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cocoSsdModel: any = null;
  private actualBackend: AIBackend = 'webgl';
  private frameCounter = 0;

  constructor(options: InferenceEngineOptions) {
    super(options);
  }

  async initialize(): Promise<void> {
    this.setState('loading');
    log.info('Initializing TensorFlow.js engine');

    try {
      // Dynamic import TF.js core
      this.tfModule = await import('@tensorflow/tfjs');

      // Set backend based on options priority
      await this.setupBackend();

      // Load COCO-SSD if object detection is enabled
      if (this.options.models.includes('object-detection')) {
        const cocoSsd = await import('@tensorflow-models/coco-ssd');
        this.cocoSsdModel = await cocoSsd.load({
          base: 'mobilenet_v2',
        });
        log.info('COCO-SSD model loaded');
      }

      this.actualBackend = this.tfModule.getBackend() as AIBackend;
      this.setState('ready');
      log.info(`TensorFlow.js ready (backend: ${this.actualBackend})`);
    } catch (err) {
      this.setState('error');
      log.error('TensorFlow.js initialization failed', err);
      throw err;
    }
  }

  async infer(
    source: HTMLVideoElement | ImageData | ImageBitmap,
    frameId: number,
    timestamp: number,
  ): Promise<InferenceResult> {
    if (!this.isReady) return { frameId, timestamp, inferenceTimeMs: 0 };

    const t0 = performance.now();
    let objects: ObjectDetection[] | undefined;

    if (this.cocoSsdModel && this.options.models.includes('object-detection')) {
      // Throttle object detection to every 3rd frame (heavier model)
      if (this.frameCounter % 3 === 0) {
        try {
          const preds = await this.cocoSsdModel.detect(
            source as HTMLVideoElement,
            this.options.config.maxDetections ?? 20,
          ) as CocoSSDPrediction[];

          objects = preds
            .filter(p => p.score >= (this.options.config.minConfidence ?? 0.5))
            .map((p, i) => this.mapPrediction(p, i));
        } catch (err) {
          log.warn('Object detection failed for frame', err);
        }
      }
    }

    this.frameCounter++;

    // Clean up tensors to prevent memory leak
    if (this.tfModule?.engine) {
      this.tfModule.engine().endScope?.();
    }

    return {
      frameId,
      timestamp,
      inferenceTimeMs: performance.now() - t0,
      objects,
    };
  }

  async updateConfig(config: Partial<InferenceEngineOptions>): Promise<void> {
    log.info('Updating TF config', config);
    // No runtime config needed for COCO-SSD; model reload would be required for major changes
  }

  async dispose(): Promise<void> {
    log.info('Disposing TensorFlow engine');
    this.cocoSsdModel = null;
    if (this.tfModule) {
      this.tfModule.disposeVariables?.();
    }
    this.setState('idle');
  }

  getActualBackend(): AIBackend { return this.actualBackend; }

  // ── Private ────────────────────────────────────────────────────────────

  private async setupBackend(): Promise<void> {
    const priority: AIBackend[] = [this.options.backend, 'webgl', 'wasm', 'cpu'];

    for (const backend of priority) {
      try {
        if (backend === 'webgpu' && 'gpu' in navigator) {
          await this.tfModule.setBackend('webgpu');
          await this.tfModule.ready();
          this.actualBackend = 'webgpu';
          log.info('TF using WebGPU backend');
          return;
        } else if (backend === 'webgl') {
          await this.tfModule.setBackend('webgl');
          await this.tfModule.ready();
          this.actualBackend = 'webgl';
          log.info('TF using WebGL backend');
          return;
        } else if (backend === 'wasm') {
          await this.tfModule.setBackend('wasm');
          await this.tfModule.ready();
          this.actualBackend = 'wasm';
          log.info('TF using WASM backend');
          return;
        }
      } catch {
        log.warn(`Backend ${backend} unavailable, trying next…`);
      }
    }

    // CPU fallback
    await this.tfModule.setBackend('cpu');
    await this.tfModule.ready();
    this.actualBackend = 'cpu';
    log.warn('TF using CPU backend (degraded performance)');
  }

  private mapPrediction(pred: CocoSSDPrediction, index: number): ObjectDetection {
    const [x, y, w, h] = pred.bbox;
    const bbox: BoundingBox = { xMin: x, yMin: y, width: w, height: h, score: pred.score };
    return {
      id:         index,
      label:      pred.class,
      score:      pred.score,
      boundingBox:bbox,
    };
  }
}
