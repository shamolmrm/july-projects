// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Render Worker
//  Performs heavy canvas compositing in a worker thread using OffscreenCanvas.
//  Receives ImageData from main thread, composites overlays, returns result.
// ─────────────────────────────────────────────────────────────────────────────

/// <reference lib="webworker" />

import type { InferenceResult } from '@/types/ai.types';

let offscreenCanvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data as { type: string; payload: unknown };

  switch (type) {
    case 'RENDER_INIT': {
      const p = payload as { canvas: OffscreenCanvas };
      offscreenCanvas = p.canvas;
      ctx = offscreenCanvas.getContext('2d', {
        alpha:              false,
        desynchronized:     true,
        willReadFrequently: false,
      }) as OffscreenCanvasRenderingContext2D;
      self.postMessage({ type: 'RENDER_READY' });
      break;
    }

    case 'RENDER_FRAME': {
      if (!ctx || !offscreenCanvas) {
        self.postMessage({ type: 'RENDER_ERROR', error: 'Canvas not initialized' });
        return;
      }

      const p = payload as {
        imageData: ImageData;
        result: InferenceResult | null;
        mirrored: boolean;
        width: number;
        height: number;
      };

      const t0 = performance.now();

      // Resize if needed
      if (offscreenCanvas.width !== p.width || offscreenCanvas.height !== p.height) {
        offscreenCanvas.width  = p.width;
        offscreenCanvas.height = p.height;
      }

      // Draw frame
      ctx.save();
      if (p.mirrored) {
        ctx.translate(p.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.putImageData(p.imageData, 0, 0);
      ctx.restore();

      // Note: OverlayPainter would run here too for full worker-side rendering
      // For now, overlay painting happens on main thread after transfer

      const renderMs = performance.now() - t0;
      self.postMessage({ type: 'RENDER_DONE', renderMs });
      break;
    }

    case 'RENDER_TERMINATE':
      offscreenCanvas = null;
      ctx = null;
      self.close();
      break;
  }
};

self.postMessage({ type: 'RENDER_ALIVE' });
