// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Performance Configuration
// ─────────────────────────────────────────────────────────────────────────────

import type { PerformanceThresholds } from '@/types/performance.types';

/**
 * Performance alert thresholds — triggers UI warnings
 */
export const PERFORMANCE_THRESHOLDS: PerformanceThresholds = {
  minFPS:          15,    // Below this = red
  maxInferenceMs:  150,   // Above this = frame skip triggered
  maxLatencyMs:    200,   // End-to-end pipeline latency alert
  maxMemoryMB:     512,   // Heap memory warning
};

/**
 * Benchmark configuration
 */
export const BENCHMARK_CONFIG = {
  /** Duration of full benchmark run (ms) */
  durationMs:           30_000,
  /** How often to capture performance snapshots (ms) */
  snapshotIntervalMs:   500,
  /** Warmup period before measuring (ms) */
  warmupMs:             5_000,
  /** Number of frames in benchmark summary */
  reportMaxSamples:     120,
} as const;

/**
 * FPS smoothing window (frames)
 */
export const FPS_SMOOTH_WINDOW = 60;

/**
 * Memory monitor interval (ms)
 */
export const MEMORY_MONITOR_INTERVAL_MS = 2_000;

/**
 * Minimum time between performance snapshot emissions (ms)
 */
export const PERF_EMIT_INTERVAL_MS = 500;

/**
 * Frame skip strategy: skip inference every N frames when behind
 */
export const FRAME_SKIP_RATIO = 2;

/**
 * Memory pool configuration
 */
export const MEMORY_POOL_CONFIG = {
  /** Max number of ImageData objects to pool */
  imageDataPoolSize: 8,
  /** Max number of Float32Array tensor buffers to pool */
  tensorBufferPoolSize: 16,
} as const;

/**
 * Rendering configuration
 */
export const RENDER_CONFIG = {
  /** Canvas 2D context options */
  contextOptions: {
    alpha:              true,
    desynchronized:     true,   // Reduces latency
    willReadFrequently: false,
  },
  /** WebGL context options */
  webglOptions: {
    alpha:                        true,
    antialias:                    false,  // Disabled for perf
    depth:                        false,
    stencil:                      false,
    preserveDrawingBuffer:        false,
    powerPreference:              'high-performance' as WebGLPowerPreference,
    failIfMajorPerformanceCaveat: false,
  },
} as const;
