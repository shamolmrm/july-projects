// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Model Registry
//  Central registry for model lifecycle: load, cache, swap, unload.
//  Implements a factory pattern for creating typed inference engines.
// ─────────────────────────────────────────────────────────────────────────────

import type { AIBackend, ModelType, InferenceEngineOptions } from '@/types/ai.types';
import { InferenceEngine } from './InferenceEngine';
import { MediaPipeEngine } from './MediaPipeEngine';
import { TensorFlowEngine } from './TensorFlowEngine';
import { OnnxEngine } from './OnnxEngine';
import { createLogger } from '@/shared/utils/logger';

const log = createLogger('ModelRegistry');

type EngineType = 'mediapipe' | 'tensorflow' | 'onnx';

interface RegistryEntry {
  engine: InferenceEngine;
  type: EngineType;
  models: ModelType[];
  loadedAt: number;
}

/**
 * Singleton Model Registry.
 * Manages engine instances, caching, and configuration changes.
 *
 * Key design: only ONE engine instance per type is active at a time.
 * Engines are lazily initialized and cached until explicitly disposed.
 */
export class ModelRegistry {
  private static instance: ModelRegistry | null = null;
  private readonly engines = new Map<EngineType, RegistryEntry>();

  private constructor() {}

  static getInstance(): ModelRegistry {
    if (!ModelRegistry.instance) {
      ModelRegistry.instance = new ModelRegistry();
    }
    return ModelRegistry.instance;
  }

  /**
   * Creates or retrieves an inference engine for the given model types and backend.
   * Intelligently selects the best provider for each model type.
   */
  async getEngine(
    models: ModelType[],
    backend: AIBackend,
    config: Partial<InferenceEngineOptions['config']> = {},
  ): Promise<InferenceEngine> {
    const engineType = this.selectEngineType(models);
    const existing = this.engines.get(engineType);

    if (existing) {
      // Check if configuration changed significantly
      const sameModels = models.every(m => existing.models.includes(m)) &&
                         existing.models.length === models.length;
      if (sameModels) {
        log.debug(`Reusing existing ${engineType} engine`);
        return existing.engine;
      }

      // Dispose old engine and create new one with updated config
      await existing.engine.dispose();
      this.engines.delete(engineType);
    }

    const engine = this.createEngine(engineType, models, backend, config);
    await engine.initialize();

    this.engines.set(engineType, {
      engine,
      type: engineType,
      models,
      loadedAt: Date.now(),
    });

    log.info(`Engine ready: ${engineType} with models: [${models.join(', ')}]`);
    return engine;
  }

  /**
   * Updates engine configuration without rebuilding the session
   */
  async updateEngineConfig(
    models: ModelType[],
    config: Partial<InferenceEngineOptions>,
  ): Promise<void> {
    const engineType = this.selectEngineType(models);
    const entry = this.engines.get(engineType);
    if (!entry) return;

    await entry.engine.updateConfig(config);
    log.debug(`Updated config for ${engineType} engine`);
  }

  /**
   * Disposes a specific engine
   */
  async disposeEngine(engineType: EngineType): Promise<void> {
    const entry = this.engines.get(engineType);
    if (!entry) return;

    await entry.engine.dispose();
    this.engines.delete(engineType);
    log.info(`Disposed ${engineType} engine`);
  }

  /**
   * Disposes all engines
   */
  async disposeAll(): Promise<void> {
    const disposePromises = Array.from(this.engines.keys()).map(k => this.disposeEngine(k));
    await Promise.all(disposePromises);
    log.info('All engines disposed');
  }

  /**
   * Lists all loaded engine types and their model coverage
   */
  getLoadedEngines(): Array<{ type: EngineType; models: ModelType[]; loadedAt: number }> {
    return Array.from(this.engines.values()).map(e => ({
      type: e.type,
      models: e.models,
      loadedAt: e.loadedAt,
    }));
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /**
   * Determines the best engine provider for a set of model types.
   * MediaPipe: face, hands, pose, segmentation
   * TensorFlow: object detection, body segmentation
   * ONNX: custom models
   */
  private selectEngineType(models: ModelType[]): EngineType {
    const tfModels: ModelType[] = ['object-detection'];
    const hasOnlyTF = models.every(m => tfModels.includes(m));
    if (hasOnlyTF) return 'tensorflow';

    // Default to MediaPipe for most real-time vision tasks
    return 'mediapipe';
  }

  private createEngine(
    engineType: EngineType,
    models: ModelType[],
    backend: AIBackend,
    config: Partial<InferenceEngineOptions['config']>,
  ): InferenceEngine {
    const options: InferenceEngineOptions = {
      backend,
      models,
      config: config as InferenceEngineOptions['config'],
      enableWarmup: true,
    };

    switch (engineType) {
      case 'mediapipe':   return new MediaPipeEngine(options);
      case 'tensorflow':  return new TensorFlowEngine(options);
      case 'onnx':        return new OnnxEngine(options, '');
      default:            return new MediaPipeEngine(options);
    }
  }
}
