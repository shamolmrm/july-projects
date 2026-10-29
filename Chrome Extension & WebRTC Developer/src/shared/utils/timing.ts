// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Timing Utilities
//  High-resolution performance timing helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * High-resolution timestamp (performance.now() when available, Date.now() fallback)
 */
export function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Measures the execution time of a synchronous function
 */
export function measureSync<T>(fn: () => T): { result: T; durationMs: number } {
  const start = now();
  const result = fn();
  return { result, durationMs: now() - start };
}

/**
 * Measures the execution time of an async function
 */
export async function measureAsync<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; durationMs: number }> {
  const start = now();
  const result = await fn();
  return { result, durationMs: now() - start };
}

/**
 * Rolling average accumulator for smooth FPS / latency values
 */
export class RollingAverage {
  private readonly samples: number[];
  private index = 0;
  private count = 0;
  private _sum = 0;

  constructor(private readonly windowSize: number) {
    this.samples = new Array<number>(windowSize).fill(0);
  }

  push(value: number): void {
    const old = this.samples[this.index] ?? 0;
    this.samples[this.index] = value;
    this._sum += value - old;
    this.index = (this.index + 1) % this.windowSize;
    if (this.count < this.windowSize) this.count++;
  }

  get average(): number {
    return this.count === 0 ? 0 : this._sum / this.count;
  }

  get min(): number {
    return this.count === 0 ? 0 : Math.min(...this.samples.slice(0, this.count));
  }

  get max(): number {
    return this.count === 0 ? 0 : Math.max(...this.samples.slice(0, this.count));
  }

  /** Returns percentile (0–100) from current window */
  percentile(p: number): number {
    if (this.count === 0) return 0;
    const sorted = [...this.samples.slice(0, this.count)].sort((a, b) => a - b);
    const idx = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[idx] ?? 0;
  }

  reset(): void {
    this.samples.fill(0);
    this.index = 0;
    this.count = 0;
    this._sum = 0;
  }
}

/**
 * Frame rate controller — tracks actual FPS and provides timing decisions.
 */
export class FrameRateController {
  private lastFrameTime = 0;
  private frameCount = 0;
  private lastFpsCalcTime = 0;
  private _currentFPS = 0;
  private readonly fpsAvg = new RollingAverage(30);

  constructor(private readonly targetFPS: number) {}

  /**
   * Returns true if enough time has passed to render the next frame.
   * Should be called inside rAF / rVFC callback.
   */
  shouldProcessFrame(currentTime: number): boolean {
    const interval = 1000 / this.targetFPS;
    return currentTime - this.lastFrameTime >= interval - 0.5; // 0.5ms tolerance
  }

  /**
   * Called after processing a frame to update FPS statistics.
   */
  recordFrame(currentTime: number): void {
    if (this.lastFrameTime > 0) {
      const delta = currentTime - this.lastFrameTime;
      if (delta > 0) this.fpsAvg.push(1000 / delta);
    }
    this.lastFrameTime = currentTime;
    this.frameCount++;

    if (currentTime - this.lastFpsCalcTime >= 1000) {
      this._currentFPS = this.frameCount;
      this.frameCount = 0;
      this.lastFpsCalcTime = currentTime;
    }
  }

  get currentFPS(): number { return this._currentFPS; }
  get smoothFPS(): number  { return Math.round(this.fpsAvg.average); }
  get targetFrameInterval(): number { return 1000 / this.targetFPS; }
}

/**
 * Debounce utility — returns a debounced version of the given function
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  waitMs: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

/**
 * Throttle utility — limits calls to at most once per interval
 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  intervalMs: number,
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now_ = now();
    if (now_ - lastCall >= intervalMs) {
      lastCall = now_;
      fn(...args);
    }
  };
}

/**
 * Sleep utility for async delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a unique ID string
 */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
