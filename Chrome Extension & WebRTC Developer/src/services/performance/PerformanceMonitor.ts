// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Performance Monitor
//  Aggregates real-time performance metrics: FPS, inference, render,
//  memory, latency. Emits snapshots at configurable intervals.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  PerformanceSnapshot,
  InferenceTiming,
  RenderTiming,
  LatencyMeasurement,
  MemorySnapshot,
} from '@/types/performance.types';
import { RollingAverage } from '@/shared/utils/timing';
import { PERF_EMIT_INTERVAL_MS, FPS_SMOOTH_WINDOW, MEMORY_MONITOR_INTERVAL_MS } from '@/config/performance.config';
import { createLogger } from '@/shared/utils/logger';

const log = createLogger('PerformanceMonitor');

type SnapshotCallback = (snapshot: PerformanceSnapshot) => void;

declare const performance: Performance & {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
};

/**
 * Real-time performance monitor.
 * Collects metrics from pipeline, inference, and renderer,
 * then emits aggregated PerformanceSnapshot at PERF_EMIT_INTERVAL.
 */
export class PerformanceMonitor {
  // Rolling averages
  private readonly fpsAvg         = new RollingAverage(FPS_SMOOTH_WINDOW);
  private readonly inferenceAvg   = new RollingAverage(30);
  private readonly renderAvg      = new RollingAverage(30);
  private readonly latencyAvg     = new RollingAverage(30);
  private readonly memoryAvg      = new RollingAverage(10);

  // Counters
  private totalFrames   = 0;
  private droppedFrames = 0;
  private lastEmitTime  = 0;
  private lastFpsTime   = performance.now();
  private frameCount    = 0;
  private currentFPS    = 0;

  // Current values
  private lastInference: InferenceTiming = { preprocessMs: 0, inferenceMs: 0, postprocessMs: 0, totalMs: 0 };
  private lastRender:    RenderTiming    = { drawFrameMs: 0, overlayMs: 0, totalMs: 0 };
  private lastLatency:   LatencyMeasurement = { captureToInferenceMs: 0, inferenceToRenderMs: 0, endToEndMs: 0 };

  private memoryInterval: ReturnType<typeof setInterval> | null = null;
  private latestMemory: MemorySnapshot | null = null;

  private readonly listeners: Set<SnapshotCallback> = new Set();
  private backend = 'webgl';
  private resolution = '720p';
  private targetFPS = 30;

  constructor(private readonly models: string[] = []) {}

  /**
   * Start monitoring: begins memory polling, resets counters
   */
  start(config: { backend: string; resolution: string; targetFPS: number }): void {
    this.backend    = config.backend;
    this.resolution = config.resolution;
    this.targetFPS  = config.targetFPS;
    this.reset();

    // Poll memory every 2s (memory API is expensive to call per frame)
    this.memoryInterval = setInterval(() => {
      this.sampleMemory();
    }, MEMORY_MONITOR_INTERVAL_MS);

    log.info('Performance monitor started', config);
  }

  stop(): void {
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
      this.memoryInterval = null;
    }
    log.info('Performance monitor stopped');
  }

  // ── Recording API ──────────────────────────────────────────────────────

  /**
   * Record a processed frame (called from rendering loop)
   */
  recordFrame(
    inference: InferenceTiming,
    render: RenderTiming,
    captureTimestamp: number,
  ): void {
    this.totalFrames++;
    this.frameCount++;

    const now = performance.now();

    // FPS calculation (1-second window)
    if (now - this.lastFpsTime >= 1000) {
      this.currentFPS = this.frameCount;
      this.fpsAvg.push(this.currentFPS);
      this.frameCount = 0;
      this.lastFpsTime = now;
    }

    // Store latest timings
    this.lastInference = inference;
    this.lastRender = render;

    // Latency calculation
    const endToEnd = now - captureTimestamp;
    this.lastLatency = {
      captureToInferenceMs: inference.totalMs,
      inferenceToRenderMs:  render.totalMs,
      endToEndMs:           endToEnd,
    };

    this.inferenceAvg.push(inference.totalMs);
    this.renderAvg.push(render.totalMs);
    this.latencyAvg.push(endToEnd);

    // Emit snapshot periodically
    if (now - this.lastEmitTime >= PERF_EMIT_INTERVAL_MS) {
      this.lastEmitTime = now;
      this.emitSnapshot(now);
    }
  }

  /**
   * Record a dropped frame
   */
  recordDrop(): void {
    this.droppedFrames++;
  }

  // ── Subscription ───────────────────────────────────────────────────────

  onSnapshot(cb: SnapshotCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // ── Accessors ──────────────────────────────────────────────────────────

  get smoothFPS(): number { return Math.round(this.fpsAvg.average); }
  get avgInferenceMs(): number { return this.inferenceAvg.average; }
  get avgRenderMs(): number { return this.renderAvg.average; }
  get avgLatencyMs(): number { return this.latencyAvg.average; }
  get totalFrameCount(): number { return this.totalFrames; }
  get droppedFrameCount(): number { return this.droppedFrames; }

  getLatestSnapshot(): PerformanceSnapshot {
    return this.buildSnapshot(performance.now());
  }

  // ── Private ────────────────────────────────────────────────────────────

  private emitSnapshot(now: number): void {
    const snapshot = this.buildSnapshot(now);
    this.listeners.forEach(cb => cb(snapshot));
  }

  private buildSnapshot(now: number): PerformanceSnapshot {
    const mem = this.latestMemory ?? this.sampleMemory();
    return {
      timestamp:    now,
      fps:          this.currentFPS,
      targetFPS:    this.targetFPS,
      droppedFrames:this.droppedFrames,
      totalFrames:  this.totalFrames,
      inference:    this.lastInference,
      render:       this.lastRender,
      latency:      this.lastLatency,
      memory:       mem,
      backend:      this.backend,
      resolution:   this.resolution,
    };
  }

  private sampleMemory(): MemorySnapshot {
    const mem = performance.memory;
    const snapshot: MemorySnapshot = {
      timestamp:       performance.now(),
      usedJSHeapMB:   mem ? mem.usedJSHeapSize / 1_048_576 : 0,
      totalJSHeapMB:  mem ? mem.totalJSHeapSize / 1_048_576 : 0,
      externalMB:     0,
      heapLimitMB:    mem ? mem.jsHeapSizeLimit / 1_048_576 : 0,
    };
    this.latestMemory = snapshot;
    this.memoryAvg.push(snapshot.usedJSHeapMB);
    return snapshot;
  }

  private reset(): void {
    this.totalFrames   = 0;
    this.droppedFrames = 0;
    this.frameCount    = 0;
    this.currentFPS    = 0;
    this.lastFpsTime   = performance.now();
    this.lastEmitTime  = 0;
    this.fpsAvg.reset();
    this.inferenceAvg.reset();
    this.renderAvg.reset();
    this.latencyAvg.reset();
    this.memoryAvg.reset();
  }
}
