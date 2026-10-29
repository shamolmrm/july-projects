// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Structured Logger
//  Provides tagged, leveled, structured logging with optional remote transport.
// ─────────────────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly level: LogLevel;
  readonly tag: string;
  readonly message: string;
  readonly data?: unknown;
  readonly timestamp: number;
}

type LogListener = (entry: LogEntry) => void;

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
};

/**
 * Structured logger with tag-based namespacing.
 * In production (NODE_ENV=production) debug logs are suppressed.
 */
class Logger {
  private readonly listeners: Set<LogListener> = new Set();
  private readonly history: LogEntry[] = [];
  private readonly maxHistory = 500;
  private minLevel: LogLevel = import.meta.env.PROD ? 'info' : 'debug';

  private emit(level: LogLevel, tag: string, message: string, data?: unknown): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.minLevel]) return;

    const entry: LogEntry = {
      level,
      tag,
      message,
      data,
      timestamp: Date.now(),
    };

    // Trim history if needed
    if (this.history.length >= this.maxHistory) {
      this.history.shift();
    }
    this.history.push(entry);

    // Console output with styling
    const prefix = `[AI Vision][${tag}]`;
    switch (level) {
      case 'debug': console.debug(`%c${prefix} ${message}`, 'color:#94a3b8', data ?? ''); break;
      case 'info':  console.info (`%c${prefix} ${message}`, 'color:#818cf8', data ?? ''); break;
      case 'warn':  console.warn (`%c${prefix} ${message}`, 'color:#f59e0b', data ?? ''); break;
      case 'error': console.error(`%c${prefix} ${message}`, 'color:#f87171', data ?? ''); break;
    }

    // Notify all listeners (e.g. UI log viewer)
    this.listeners.forEach(fn => fn(entry));
  }

  /**
   * Create a scoped child logger for a specific module
   */
  createChild(tag: string): ScopedLogger {
    return new ScopedLogger(tag, this);
  }

  debug(tag: string, msg: string, data?: unknown): void { this.emit('debug', tag, msg, data); }
  info (tag: string, msg: string, data?: unknown): void { this.emit('info',  tag, msg, data); }
  warn (tag: string, msg: string, data?: unknown): void { this.emit('warn',  tag, msg, data); }
  error(tag: string, msg: string, data?: unknown): void { this.emit('error', tag, msg, data); }

  addListener(fn: LogListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getHistory(level?: LogLevel): LogEntry[] {
    if (!level) return [...this.history];
    return this.history.filter(e => e.level === level);
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  clear(): void {
    this.history.length = 0;
  }
}

/**
 * Scoped logger bound to a specific tag
 */
export class ScopedLogger {
  constructor(
    private readonly tag: string,
    private readonly parent: Logger,
  ) {}

  debug(msg: string, data?: unknown): void { this.parent.debug(this.tag, msg, data); }
  info (msg: string, data?: unknown): void { this.parent.info (this.tag, msg, data); }
  warn (msg: string, data?: unknown): void { this.parent.warn (this.tag, msg, data); }
  error(msg: string, data?: unknown): void { this.parent.error(this.tag, msg, data); }
}

/**
 * Singleton logger instance
 */
export const logger = new Logger();

/**
 * Factory helper for creating module-scoped loggers
 */
export function createLogger(tag: string): ScopedLogger {
  return logger.createChild(tag);
}
