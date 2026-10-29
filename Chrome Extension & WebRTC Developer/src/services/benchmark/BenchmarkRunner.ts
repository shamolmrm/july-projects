// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Benchmark Runner
//  Runs a timed benchmark, collects performance samples, and generates
//  a detailed statistical report with percentiles and system info.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  BenchmarkResult,
  PerformanceSnapshot,
  SystemInfo,
} from '@/types/performance.types';
import { BENCHMARK_CONFIG } from '@/config/performance.config';
import { generateId, sleep } from '@/shared/utils/timing';
import { createLogger } from '@/shared/utils/logger';

const log = createLogger('BenchmarkRunner');

type BenchmarkProgressCallback = (progress: number, currentFPS: number) => void;
type BenchmarkCompleteCallback = (result: BenchmarkResult) => void;

/**
 * Runs a full benchmark against the active pipeline and generates a report.
 */
export class BenchmarkRunner {
  private running = false;
  private samples: PerformanceSnapshot[] = [];
  private progressListeners: Set<BenchmarkProgressCallback> = new Set();
  private completeListeners: Set<BenchmarkCompleteCallback> = new Set();

  /**
   * Start a benchmark run.
   * @param snapshotSource - function that returns the current snapshot
   */
  async run(snapshotSource: () => PerformanceSnapshot): Promise<BenchmarkResult> {
    if (this.running) throw new Error('Benchmark already running');

    this.running = true;
    this.samples = [];
    log.info('Benchmark started');

    const benchmarkId = generateId();
    const startedAt   = Date.now();

    // Warmup phase
    log.info(`Warmup: ${BENCHMARK_CONFIG.warmupMs}ms`);
    await sleep(BENCHMARK_CONFIG.warmupMs);

    const measureStart = Date.now();
    const measureEnd   = measureStart + BENCHMARK_CONFIG.durationMs;

    // Sampling loop
    while (Date.now() < measureEnd && this.running) {
      await sleep(BENCHMARK_CONFIG.snapshotIntervalMs);
      const snap = snapshotSource();
      this.samples.push(snap);

      // Report progress
      const elapsed   = Date.now() - measureStart;
      const progress  = Math.min(elapsed / BENCHMARK_CONFIG.durationMs, 1);
      this.progressListeners.forEach(cb => cb(progress, snap.fps));
    }

    const completedAt = Date.now();
    this.running = false;

    const result = this.computeResult(benchmarkId, startedAt, completedAt);
    this.completeListeners.forEach(cb => cb(result));

    log.info('Benchmark complete', {
      avgFPS: result.avgFPS,
      avgInferenceMs: result.avgInferenceMs,
      totalFrames: result.totalFramesProcessed,
    });

    return result;
  }

  stop(): void {
    this.running = false;
    log.info('Benchmark stopped early');
  }

  onProgress(cb: BenchmarkProgressCallback): () => void {
    this.progressListeners.add(cb);
    return () => this.progressListeners.delete(cb);
  }

  onComplete(cb: BenchmarkCompleteCallback): () => void {
    this.completeListeners.add(cb);
    return () => this.completeListeners.delete(cb);
  }

  get isRunning(): boolean { return this.running; }

  // ── Private ────────────────────────────────────────────────────────────

  private computeResult(id: string, startedAt: number, completedAt: number): BenchmarkResult {
    const fpsValues        = this.samples.map(s => s.fps);
    const inferenceValues  = this.samples.map(s => s.inference.totalMs);
    const renderValues     = this.samples.map(s => s.render.totalMs);
    const latencyValues    = this.samples.map(s => s.latency.endToEndMs);
    const memoryValues     = this.samples.map(s => s.memory.usedJSHeapMB);

    const lastSnap = this.samples[this.samples.length - 1];

    return {
      id,
      startedAt,
      completedAt,
      durationMs:            completedAt - startedAt,
      totalFramesProcessed:  lastSnap?.totalFrames ?? 0,
      totalFramesDropped:    lastSnap?.droppedFrames ?? 0,

      avgFPS:    this.mean(fpsValues),
      minFPS:    Math.min(...fpsValues),
      maxFPS:    Math.max(...fpsValues),
      p50FPS:    this.percentile(fpsValues, 50),
      p95FPS:    this.percentile(fpsValues, 95),
      p99FPS:    this.percentile(fpsValues, 99),

      avgInferenceMs:       this.mean(inferenceValues),
      p95InferenceMs:       this.percentile(inferenceValues, 95),
      avgRenderMs:          this.mean(renderValues),
      avgEndToEndLatencyMs: this.mean(latencyValues),

      peakMemoryMB: Math.max(...memoryValues),
      avgMemoryMB:  this.mean(memoryValues),

      backend:      lastSnap?.backend ?? 'unknown',
      resolution:   lastSnap?.resolution ?? 'unknown',
      modelsActive: [],

      systemInfo:   this.collectSystemInfo(),
      samples:      this.samples.slice(0, BENCHMARK_CONFIG.reportMaxSamples),
    };
  }

  private mean(values: number[]): number {
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private percentile(values: number[], p: number): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[idx] ?? 0;
  }

  private collectSystemInfo(): SystemInfo {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');

    return {
      userAgent:  navigator.userAgent,
      platform:   navigator.platform,
      cpuCores:   navigator.hardwareConcurrency ?? 1,
      deviceMemoryGB:          (navigator as { deviceMemory?: number }).deviceMemory,
      gpuRenderer:             debugInfo
        ? gl?.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string
        : undefined,
      gpuVendor:               debugInfo
        ? gl?.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string
        : undefined,
      webgpuSupported:          'gpu' in navigator,
      webglSupported:           !!gl,
      wasmSupported:            typeof WebAssembly !== 'undefined',
      offscreenCanvasSupported: typeof OffscreenCanvas !== 'undefined',
      sharedArrayBufferSupported: typeof SharedArrayBuffer !== 'undefined',
    };
  }
}
