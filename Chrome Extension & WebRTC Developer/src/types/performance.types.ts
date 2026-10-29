// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Performance & Benchmark Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single FPS measurement sample
 */
export interface FPSSample {
  readonly timestamp: number;
  readonly fps: number;
  readonly droppedFrames: number;
}

/**
 * Inference timing breakdown
 */
export interface InferenceTiming {
  readonly preprocessMs: number;
  readonly inferenceMs: number;
  readonly postprocessMs: number;
  readonly totalMs: number;
}

/**
 * Render timing breakdown
 */
export interface RenderTiming {
  readonly drawFrameMs: number;
  readonly overlayMs: number;
  readonly totalMs: number;
}

/**
 * Memory usage snapshot
 */
export interface MemorySnapshot {
  readonly timestamp: number;
  readonly usedJSHeapMB: number;
  readonly totalJSHeapMB: number;
  readonly externalMB: number;
  readonly heapLimitMB: number;
  readonly tensorsInMemory?: number;
  readonly numBytesInGPU?: number;
}

/**
 * Pipeline latency measurements
 */
export interface LatencyMeasurement {
  readonly captureToInferenceMs: number;
  readonly inferenceToRenderMs: number;
  readonly endToEndMs: number;
}

/**
 * Complete performance snapshot at a point in time
 */
export interface PerformanceSnapshot {
  readonly timestamp: number;
  readonly fps: number;
  readonly targetFPS: number;
  readonly droppedFrames: number;
  readonly totalFrames: number;
  readonly inference: InferenceTiming;
  readonly render: RenderTiming;
  readonly latency: LatencyMeasurement;
  readonly memory: MemorySnapshot;
  readonly cpuUtilizationPercent?: number;
  readonly gpuUtilizationPercent?: number;
  readonly backend: string;
  readonly resolution: string;
}

/**
 * Aggregated benchmark results
 */
export interface BenchmarkResult {
  readonly id: string;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly durationMs: number;
  readonly totalFramesProcessed: number;
  readonly totalFramesDropped: number;
  readonly avgFPS: number;
  readonly minFPS: number;
  readonly maxFPS: number;
  readonly p50FPS: number;
  readonly p95FPS: number;
  readonly p99FPS: number;
  readonly avgInferenceMs: number;
  readonly p95InferenceMs: number;
  readonly avgRenderMs: number;
  readonly avgEndToEndLatencyMs: number;
  readonly peakMemoryMB: number;
  readonly avgMemoryMB: number;
  readonly backend: string;
  readonly resolution: string;
  readonly modelsActive: string[];
  readonly systemInfo: SystemInfo;
  readonly samples: PerformanceSnapshot[];
}

/**
 * System information at benchmark start
 */
export interface SystemInfo {
  readonly userAgent: string;
  readonly platform: string;
  readonly cpuCores: number;
  readonly deviceMemoryGB?: number;
  readonly gpuRenderer?: string;
  readonly gpuVendor?: string;
  readonly webgpuSupported: boolean;
  readonly webglSupported: boolean;
  readonly wasmSupported: boolean;
  readonly offscreenCanvasSupported: boolean;
  readonly sharedArrayBufferSupported: boolean;
}

/**
 * Performance thresholds for alerts
 */
export interface PerformanceThresholds {
  readonly minFPS: number;
  readonly maxInferenceMs: number;
  readonly maxLatencyMs: number;
  readonly maxMemoryMB: number;
}
