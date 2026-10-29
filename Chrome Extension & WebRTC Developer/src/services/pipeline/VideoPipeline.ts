// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Video Pipeline
//  Orchestrates: webcam capture → frame extraction → queue → inference
//  Uses requestVideoFrameCallback (rVFC) for precise frame timing.
//  Falls back to requestAnimationFrame if rVFC unavailable.
// ─────────────────────────────────────────────────────────────────────────────

import type { VideoFrame, PipelineStatus, PipelineConfig } from '@/types/media.types';
import type { InferenceResult } from '@/types/ai.types';
import { FrameQueue } from './FrameQueue';
import { FrameRateController } from '@/shared/utils/timing';
import { createLogger } from '@/shared/utils/logger';

const log = createLogger('VideoPipeline');

type FrameCallback = (frame: VideoFrame) => Promise<InferenceResult | null>;
type StatusCallback = (status: PipelineStatus, msg?: string) => void;
type ResultCallback = (result: InferenceResult) => void;

export interface VideoPipelineOptions {
  readonly config: PipelineConfig;
  readonly onFrame: FrameCallback;
  readonly onStatus?: StatusCallback;
  readonly onResult?: ResultCallback;
}

/**
 * Manages the real-time video frame capture and processing pipeline.
 *
 * Architecture:
 *  VideoElement → rVFC/rAF → FrameQueue → InferenceEngine → Results
 *
 * Key features:
 *  - requestVideoFrameCallback for exact frame timing (hardware vsync)
 *  - Frame skipping when inference is slower than capture
 *  - Memory-pooled ImageData objects to reduce GC
 *  - Precise per-frame timestamps for latency tracking
 */
export class VideoPipeline {
  private status: PipelineStatus = 'idle';
  private videoElement: HTMLVideoElement | null = null;
  private canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
  private frameQueue: FrameQueue;
  private rateController: FrameRateController;
  private frameId = 0;
  private rVFCHandle: number | null = null;
  private isProcessingFrame = false;
  private pendingInference = false;

  // ImageData pool to reduce GC pressure
  private readonly imageDataPool: ImageData[] = [];
  private readonly poolSize = 4;

  private readonly options: VideoPipelineOptions;
  private readonly statusListeners: Set<StatusCallback> = new Set();
  private readonly resultListeners: Set<ResultCallback> = new Set();

  constructor(options: VideoPipelineOptions) {
    this.options = options;
    this.frameQueue = new FrameQueue({
      maxSize: options.config.enableFrameSkip ? 3 : 5,
      dropStrategy: 'oldest',
      enableBackpressure: true,
    });
    this.rateController = new FrameRateController(options.config.targetFPS);

    if (options.onStatus) this.statusListeners.add(options.onStatus);
    if (options.onResult) this.resultListeners.add(options.onResult);
  }

  /**
   * Attaches a video element and starts the capture loop
   */
  async start(videoElement: HTMLVideoElement): Promise<void> {
    if (this.status === 'running') return;
    log.info('Starting video pipeline');

    this.videoElement = videoElement;
    this.initCanvas(videoElement.videoWidth, videoElement.videoHeight);
    this.setStatus('running');
    this.scheduleNextFrame();
  }

  /**
   * Pauses frame processing without stopping the stream
   */
  pause(): void {
    if (this.status !== 'running') return;
    this.setStatus('paused');
    this.cancelScheduled();
    log.info('Pipeline paused');
  }

  /**
   * Resumes from paused state
   */
  resume(): void {
    if (this.status !== 'paused') return;
    this.setStatus('running');
    this.scheduleNextFrame();
    log.info('Pipeline resumed');
  }

  /**
   * Stops the pipeline and releases canvas resources
   */
  stop(): void {
    log.info('Stopping video pipeline');
    this.setStatus('stopping');
    this.cancelScheduled();
    this.frameQueue.clear();
    this.imageDataPool.length = 0;

    if (this.videoElement) {
      this.videoElement = null;
    }

    this.canvas = null;
    this.ctx = null;
    this.setStatus('idle');
  }

  onStatus(cb: StatusCallback): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  onResult(cb: ResultCallback): () => void {
    this.resultListeners.add(cb);
    return () => this.resultListeners.delete(cb);
  }

  get currentStatus(): PipelineStatus { return this.status; }
  get queueStats() {
    return {
      size:     this.frameQueue.size,
      dropped:  this.frameQueue.droppedCount,
      dropRate: this.frameQueue.dropRate,
    };
  }

  // ── Private implementation ─────────────────────────────────────────────

  private initCanvas(width: number, height: number): void {
    const w = width  || 640;
    const h = height || 480;

    if (typeof OffscreenCanvas !== 'undefined' && this.options.config.enableOffscreen) {
      this.canvas = new OffscreenCanvas(w, h);
      this.ctx = this.canvas.getContext('2d', {
        willReadFrequently: true,
        alpha: false,
      }) as OffscreenCanvasRenderingContext2D;
    } else {
      const el = document.createElement('canvas');
      el.width = w;
      el.height = h;
      this.canvas = el;
      this.ctx = el.getContext('2d', {
        willReadFrequently: true,
        alpha: false,
      });
    }

    log.debug(`Canvas initialized: ${w}×${h}`);
  }

  private scheduleNextFrame(): void {
    if (!this.videoElement || this.status !== 'running') return;

    // Use requestVideoFrameCallback if available (Chrome 83+)
    if ('requestVideoFrameCallback' in this.videoElement) {
      this.rVFCHandle = this.videoElement.requestVideoFrameCallback(
        (now, metadata) => this.onVideoFrame(now, metadata.presentationTime ?? now)
      );
    } else {
      // Fallback to rAF
      this.rVFCHandle = requestAnimationFrame((now) => this.onVideoFrame(now, now));
    }
  }

  private cancelScheduled(): void {
    if (this.rVFCHandle === null) return;

    if (this.videoElement && 'requestVideoFrameCallback' in this.videoElement) {
      this.videoElement.cancelVideoFrameCallback(this.rVFCHandle);
    } else {
      cancelAnimationFrame(this.rVFCHandle);
    }
    this.rVFCHandle = null;
  }

  private onVideoFrame(now: number, presentationTime: number): void {
    if (this.status !== 'running' || !this.videoElement || !this.ctx || !this.canvas) return;

    // Rate limiting
    if (!this.rateController.shouldProcessFrame(now)) {
      this.scheduleNextFrame();
      return;
    }

    // Frame skip: if inference is running, skip to avoid queue buildup
    if (this.options.config.enableFrameSkip && this.pendingInference) {
      this.rateController.recordFrame(now);
      this.scheduleNextFrame();
      return;
    }

    // Draw current video frame to canvas
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.drawImage(this.videoElement, 0, 0, w, h);

    // Extract ImageData (pooled)
    const imageData = this.acquireImageData(w, h);
    this.ctx.getImageData(0, 0, w, h);
    // Note: We pass the video element directly to MediaPipe for efficiency
    // ImageData extraction is only needed for ONNX/TF backends

    const frame: VideoFrame = {
      id:               ++this.frameId,
      timestamp:        now,
      imageData,
      width:            w,
      height:           h,
      presentationTime,
    };

    this.frameQueue.enqueue(frame);
    this.rateController.recordFrame(now);

    // Run inference asynchronously
    this.runInference(frame);

    this.scheduleNextFrame();
  }

  private async runInference(frame: VideoFrame): Promise<void> {
    if (this.isProcessingFrame) return;
    this.isProcessingFrame = true;
    this.pendingInference = true;

    try {
      const result = await this.options.onFrame(frame);
      if (result) {
        this.resultListeners.forEach(cb => cb(result));
      }
    } catch (err) {
      log.error('Inference error in pipeline', err);
    } finally {
      this.isProcessingFrame = false;
      this.pendingInference = false;
      // Return ImageData to pool
      this.releaseImageData(frame.imageData);
    }
  }

  private acquireImageData(w: number, h: number): ImageData {
    const pooled = this.imageDataPool.pop();
    if (pooled && pooled.width === w && pooled.height === h) {
      return pooled;
    }
    return new ImageData(w, h);
  }

  private releaseImageData(data: ImageData): void {
    if (this.imageDataPool.length < this.poolSize) {
      this.imageDataPool.push(data);
    }
  }

  private setStatus(status: PipelineStatus, msg?: string): void {
    this.status = status;
    this.statusListeners.forEach(cb => cb(status, msg));
    log.debug(`Status → ${status}`, msg);
  }
}
