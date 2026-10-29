// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Frame Queue
//  Lock-free circular frame buffer with backpressure and drop strategies.
//  Used between the capture pipeline and the inference worker.
// ─────────────────────────────────────────────────────────────────────────────

import type { VideoFrame, FrameQueueConfig } from '@/types/media.types';

/**
 * High-performance circular frame queue.
 * Frames are pre-allocated (pooled) to minimize GC pressure.
 */
export class FrameQueue {
  private readonly queue: Array<VideoFrame | null>;
  private head = 0;
  private tail = 0;
  private _size = 0;
  private _droppedCount = 0;
  private _totalEnqueued = 0;

  private readonly maxSize: number;
  private readonly dropStrategy: FrameQueueConfig['dropStrategy'];

  constructor(config: FrameQueueConfig) {
    this.maxSize      = config.maxSize;
    this.dropStrategy = config.dropStrategy;
    this.queue        = new Array(config.maxSize).fill(null);
  }

  /**
   * Adds a frame to the queue.
   * If full, applies drop strategy.
   */
  enqueue(frame: VideoFrame): boolean {
    this._totalEnqueued++;

    if (this._size === this.maxSize) {
      this._droppedCount++;

      if (this.dropStrategy === 'oldest') {
        // Drop the oldest frame (advance head)
        this.head = (this.head + 1) % this.maxSize;
        this._size--;
      } else {
        // Drop the new frame (newest-drop)
        return false;
      }
    }

    this.queue[this.tail] = frame;
    this.tail = (this.tail + 1) % this.maxSize;
    this._size++;
    return true;
  }

  /**
   * Removes and returns the oldest frame, or null if empty.
   */
  dequeue(): VideoFrame | null {
    if (this._size === 0) return null;
    const frame = this.queue[this.head];
    this.queue[this.head] = null; // Release reference for GC
    this.head = (this.head + 1) % this.maxSize;
    this._size--;
    return frame;
  }

  /**
   * Peek at the next frame without removing it
   */
  peek(): VideoFrame | null {
    if (this._size === 0) return null;
    return this.queue[this.head];
  }

  /**
   * Drains all frames in order
   */
  drain(): VideoFrame[] {
    const frames: VideoFrame[] = [];
    let frame: VideoFrame | null;
    while ((frame = this.dequeue()) !== null) {
      frames.push(frame);
    }
    return frames;
  }

  clear(): void {
    this.queue.fill(null);
    this.head = 0;
    this.tail = 0;
    this._size = 0;
  }

  get size(): number { return this._size; }
  get isFull(): boolean { return this._size === this.maxSize; }
  get isEmpty(): boolean { return this._size === 0; }
  get droppedCount(): number { return this._droppedCount; }
  get totalEnqueued(): number { return this._totalEnqueued; }
  get dropRate(): number {
    return this._totalEnqueued === 0 ? 0 : this._droppedCount / this._totalEnqueued;
  }
}
