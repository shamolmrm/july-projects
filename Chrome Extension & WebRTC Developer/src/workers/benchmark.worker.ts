// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Benchmark Worker
//  Performs heavy statistical computations off the main thread.
// ─────────────────────────────────────────────────────────────────────────────

/// <reference lib="webworker" />

import type { PerformanceSnapshot, BenchmarkResult } from '@/types/performance.types';
import { generateId } from '@/shared/utils/timing';

self.onmessage = (event: MessageEvent) => {
  const { type, payload } = event.data as { type: string; payload: unknown };

  switch (type) {
    case 'COMPUTE_BENCHMARK': {
      const p = payload as {
        samples: PerformanceSnapshot[];
        startedAt: number;
        completedAt: number;
        backend: string;
        resolution: string;
        modelsActive: string[];
      };

      const result = computeBenchmarkResult(p);
      self.postMessage({ type: 'BENCHMARK_COMPUTED', result });
      break;
    }
  }
};

function computeBenchmarkResult(p: {
  samples: PerformanceSnapshot[];
  startedAt: number;
  completedAt: number;
  backend: string;
  resolution: string;
  modelsActive: string[];
}): BenchmarkResult {
  const fpsValues        = p.samples.map(s => s.fps);
  const inferenceValues  = p.samples.map(s => s.inference.totalMs);
  const renderValues     = p.samples.map(s => s.render.totalMs);
  const latencyValues    = p.samples.map(s => s.latency.endToEndMs);
  const memoryValues     = p.samples.map(s => s.memory.usedJSHeapMB);

  const lastSnap = p.samples[p.samples.length - 1];

  return {
    id:                   generateId(),
    startedAt:            p.startedAt,
    completedAt:          p.completedAt,
    durationMs:           p.completedAt - p.startedAt,
    totalFramesProcessed: lastSnap?.totalFrames ?? 0,
    totalFramesDropped:   lastSnap?.droppedFrames ?? 0,

    avgFPS:  mean(fpsValues),
    minFPS:  Math.min(...fpsValues),
    maxFPS:  Math.max(...fpsValues),
    p50FPS:  percentile(fpsValues, 50),
    p95FPS:  percentile(fpsValues, 95),
    p99FPS:  percentile(fpsValues, 99),

    avgInferenceMs:       mean(inferenceValues),
    p95InferenceMs:       percentile(inferenceValues, 95),
    avgRenderMs:          mean(renderValues),
    avgEndToEndLatencyMs: mean(latencyValues),

    peakMemoryMB: Math.max(...memoryValues),
    avgMemoryMB:  mean(memoryValues),

    backend:      p.backend,
    resolution:   p.resolution,
    modelsActive: p.modelsActive,

    systemInfo: {
      userAgent:                  'Worker context — collected on main thread',
      platform:                   '',
      cpuCores:                   0,
      webgpuSupported:            false,
      webglSupported:             false,
      wasmSupported:              typeof WebAssembly !== 'undefined',
      offscreenCanvasSupported:   typeof OffscreenCanvas !== 'undefined',
      sharedArrayBufferSupported: typeof SharedArrayBuffer !== 'undefined',
    },

    samples: p.samples,
  };
}

function mean(vals: number[]): number {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function percentile(vals: number[], p: number): number {
  if (!vals.length) return 0;
  const sorted = [...vals].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx] ?? 0;
}
