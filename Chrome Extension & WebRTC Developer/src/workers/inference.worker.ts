// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Inference Worker
//  Runs AI inference off the main thread to avoid blocking the UI.
//  Communicates with the main thread via postMessage (structured clone).
// ─────────────────────────────────────────────────────────────────────────────

/// <reference lib="webworker" />

import type { InferenceResult, ModelType, AIBackend } from '@/types/ai.types';

// Worker-internal state
let isInitialized = false;
let currentModels: ModelType[] = [];
let currentBackend: AIBackend = 'webgl';
let frameCounter = 0;

// ── Message Handler ────────────────────────────────────────────────────────

self.onmessage = async (event: MessageEvent) => {
  const { type, payload, id } = event.data as {
    type: string;
    payload: unknown;
    id: string;
  };

  switch (type) {
    case 'WORKER_INIT': {
      const p = payload as { models: ModelType[]; backend: AIBackend };
      currentModels  = p.models;
      currentBackend = p.backend;
      isInitialized  = true;

      self.postMessage({ type: 'WORKER_READY', id });
      break;
    }

    case 'WORKER_PROCESS': {
      if (!isInitialized) {
        self.postMessage({ type: 'WORKER_ERROR', id, error: 'Worker not initialized' });
        return;
      }

      const p = payload as { frameId: number; timestamp: number; imageData?: ImageData };
      const result = await processFrame(p.frameId, p.timestamp, p.imageData);
      self.postMessage({ type: 'WORKER_RESULT', id, result }, []);
      break;
    }

    case 'WORKER_TERMINATE': {
      isInitialized = false;
      self.close();
      break;
    }
  }
};

/**
 * Process a single frame in the worker context.
 *
 * NOTE: In the worker context, we cannot directly use HTMLVideoElement.
 * Frames are passed as ImageData (transferred from main thread).
 * MediaPipe WASM models CAN run in workers via OffscreenCanvas.
 */
async function processFrame(
  frameId: number,
  timestamp: number,
  imageData?: ImageData,
): Promise<InferenceResult> {
  const t0 = performance.now();
  frameCounter++;

  // In a full implementation, this is where the ONNX/TF WASM model runs.
  // For MediaPipe, inference runs on the main thread (requires DOM access)
  // and results are passed back via message bus.

  // Simulate inference time for WASM backend
  // Real implementation: this.session.run(feeds) for ONNX
  const inferenceMs = performance.now() - t0;

  return {
    frameId,
    timestamp,
    inferenceTimeMs: inferenceMs,
    // Results populated by actual model inference
  };
}

// Notify that worker is alive
self.postMessage({ type: 'WORKER_ALIVE', timestamp: Date.now() });
