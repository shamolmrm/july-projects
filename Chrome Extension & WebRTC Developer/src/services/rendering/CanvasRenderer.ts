// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Canvas Renderer
//  Renders processed video frames + AI overlays to an HTML canvas.
//  Manages: video drawing, overlay compositing, mirroring, and HUD.
// ─────────────────────────────────────────────────────────────────────────────

import type { InferenceResult } from '@/types/ai.types';
import type { AppSettings } from '@/types/messages.types';
import { OverlayPainter } from './OverlayPainter';
import { createLogger } from '@/shared/utils/logger';

const log = createLogger('CanvasRenderer');

export interface RendererStats {
  drawFrameMs: number;
  overlayMs:   number;
  totalMs:     number;
}

/**
 * Canvas 2D renderer for real-time video + AI overlay compositing.
 *
 * Responsibilities:
 *  - Draw mirrored video frame from HTMLVideoElement
 *  - Paint AI detection overlays via OverlayPainter
 *  - Render performance HUD
 *  - Expose render timing stats
 */
export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private overlayPainter: OverlayPainter;
  private lastRenderMs = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private settings: AppSettings,
  ) {
    this.canvas = canvas;

    const ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,   // Hardware-accelerated, reduces latency
    });

    if (!ctx) throw new Error('Failed to get 2D canvas context');
    this.ctx = ctx;

    this.overlayPainter = new OverlayPainter(settings);
    log.info('CanvasRenderer initialized');
  }

  /**
   * Render a complete frame: video + overlays + HUD
   */
  render(
    video: HTMLVideoElement,
    inferenceResult: InferenceResult | null,
    fps: number,
    inferenceMs: number,
  ): RendererStats {
    const t0 = performance.now();
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Step 1: Draw video frame (mirrored)
    this.ctx.save();
    if (this.settings.mirrorVideo) {
      this.ctx.translate(W, 0);
      this.ctx.scale(-1, 1);
    }
    this.ctx.drawImage(video, 0, 0, W, H);
    this.ctx.restore();

    const drawFrameMs = performance.now() - t0;
    const t1 = performance.now();

    // Step 2: Paint AI overlays
    if (inferenceResult) {
      this.overlayPainter.paint(
        this.ctx,
        inferenceResult,
        W, H,
        this.settings.mirrorVideo,
      );
    }

    const overlayMs = performance.now() - t1;

    // Step 3: HUD overlay
    if (this.settings.showHUD) {
      const renderMs = performance.now() - t0;
      this.overlayPainter.paintHUD(this.ctx, fps, inferenceMs, renderMs, W);
    }

    this.lastRenderMs = performance.now() - t0;

    return {
      drawFrameMs,
      overlayMs,
      totalMs: this.lastRenderMs,
    };
  }

  /**
   * Resizes canvas to match video track resolution
   */
  resize(width: number, height: number): void {
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width  = width;
    this.canvas.height = height;
    log.debug(`Canvas resized: ${width}×${height}`);
  }

  /**
   * Updates settings (e.g., theme, mirror, HUD toggles)
   */
  updateSettings(settings: AppSettings): void {
    this.settings = settings;
    this.overlayPainter.setTheme(settings.overlayTheme);
  }

  /**
   * Captures a snapshot of the current canvas as a PNG data URL
   */
  snapshot(quality = 0.9): string {
    return this.canvas.toDataURL('image/png', quality);
  }

  /**
   * Clears the canvas
   */
  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  get renderMs(): number { return this.lastRenderMs; }
}
