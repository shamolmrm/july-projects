// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Chrome Extension Message Types
//  All inter-context messages must conform to these types for type safety.
// ─────────────────────────────────────────────────────────────────────────────

import type { ModelType, InferenceResult, AIBackend } from './ai.types';
import type { VideoResolution, PipelineStatus } from './media.types';
import type { PerformanceSnapshot, BenchmarkResult } from './performance.types';

// ── Message Type Literals ──────────────────────────────────────────────────

export type MessageType =
  // ── Lifecycle ──
  | 'PIPELINE_START'
  | 'PIPELINE_STOP'
  | 'PIPELINE_PAUSE'
  | 'PIPELINE_RESUME'
  | 'PIPELINE_STATUS'
  | 'PIPELINE_ERROR'
  | 'PIPELINE_READY'

  // ── Offscreen management ──
  | 'OFFSCREEN_CREATE'
  | 'OFFSCREEN_CLOSE'
  | 'OFFSCREEN_START'
  | 'OFFSCREEN_STOP'
  | 'OFFSCREEN_READY'
  | 'OFFSCREEN_ERROR'
  | 'OFFSCREEN_FRAME'
  | 'OFFSCREEN_METRICS'

  // ── Settings ──
  | 'SETTINGS_UPDATE'
  | 'SETTINGS_GET'
  | 'SETTINGS_RESPONSE'

  // ── AI Inference ──
  | 'INFERENCE_RESULT'
  | 'INFERENCE_CONFIG'
  | 'MODEL_LOAD'
  | 'MODEL_LOADED'
  | 'MODEL_ERROR'

  // ── Performance ──
  | 'PERF_SNAPSHOT'
  | 'BENCHMARK_START'
  | 'BENCHMARK_STOP'
  | 'BENCHMARK_RESULT'

  // ── Content Script ──
  | 'CONTENT_PANEL_SHOW'
  | 'CONTENT_PANEL_HIDE'
  | 'CONTENT_VIDEO_FOUND'
  | 'CONTENT_VISION_STARTED'

  // ── Tab/Badge ──
  | 'BADGE_UPDATE'
  | 'TAB_FOCUS'

  // ── Worker messages ──
  | 'WORKER_INIT'
  | 'WORKER_READY'
  | 'WORKER_PROCESS'
  | 'WORKER_RESULT'
  | 'WORKER_ERROR'
  | 'WORKER_TERMINATE';

// ── Base message interface ─────────────────────────────────────────────────

export interface BaseMessage {
  readonly type: MessageType;
  readonly id: string;
  readonly timestamp: number;
  readonly source: MessageSource;
  readonly target?: MessageTarget;
}

export type MessageSource = 'popup' | 'sidepanel' | 'background' | 'offscreen' | 'content' | 'worker';
export type MessageTarget = MessageSource | 'broadcast';

// ── Typed message payloads ─────────────────────────────────────────────────

export interface PipelineStartMessage extends BaseMessage {
  readonly type: 'PIPELINE_START';
  readonly payload: {
    readonly deviceId?: string;
    readonly resolution: VideoResolution;
    readonly targetFPS: number;
    readonly enableAudio: boolean;
    readonly models: ModelType[];
    readonly backend: AIBackend;
  };
}

export interface PipelineStopMessage extends BaseMessage {
  readonly type: 'PIPELINE_STOP';
}

export interface PipelineStatusMessage extends BaseMessage {
  readonly type: 'PIPELINE_STATUS';
  readonly payload: {
    readonly status: PipelineStatus;
    readonly message?: string;
  };
}

export interface InferenceResultMessage extends BaseMessage {
  readonly type: 'INFERENCE_RESULT';
  readonly payload: InferenceResult;
}

export interface PerformanceSnapshotMessage extends BaseMessage {
  readonly type: 'PERF_SNAPSHOT';
  readonly payload: PerformanceSnapshot;
}

export interface BenchmarkResultMessage extends BaseMessage {
  readonly type: 'BENCHMARK_RESULT';
  readonly payload: BenchmarkResult;
}

export interface SettingsUpdateMessage extends BaseMessage {
  readonly type: 'SETTINGS_UPDATE';
  readonly payload: Partial<AppSettings>;
}

export interface SettingsResponseMessage extends BaseMessage {
  readonly type: 'SETTINGS_RESPONSE';
  readonly payload: AppSettings;
}

export interface ModelLoadMessage extends BaseMessage {
  readonly type: 'MODEL_LOAD';
  readonly payload: {
    readonly modelType: ModelType;
    readonly backend: AIBackend;
  };
}

export interface WorkerInitMessage extends BaseMessage {
  readonly type: 'WORKER_INIT';
  readonly payload: {
    readonly workerId: string;
    readonly backend: AIBackend;
    readonly models: ModelType[];
  };
}

export interface WorkerResultMessage extends BaseMessage {
  readonly type: 'WORKER_RESULT';
  readonly payload: InferenceResult;
}

// ── Union discriminated type ───────────────────────────────────────────────

export type ExtensionMessage =
  | PipelineStartMessage
  | PipelineStopMessage
  | PipelineStatusMessage
  | InferenceResultMessage
  | PerformanceSnapshotMessage
  | BenchmarkResultMessage
  | SettingsUpdateMessage
  | SettingsResponseMessage
  | ModelLoadMessage
  | WorkerInitMessage
  | WorkerResultMessage
  | BaseMessage;

// ── Application Settings ───────────────────────────────────────────────────

export interface AppSettings {
  // Camera
  readonly selectedDeviceId: string;
  readonly resolution: VideoResolution;
  readonly targetFPS: number;
  readonly mirrorVideo: boolean;
  readonly enableAudio: boolean;

  // AI Models
  readonly enableFaceDetection: boolean;
  readonly enableFaceMesh: boolean;
  readonly enableHandDetection: boolean;
  readonly enablePoseDetection: boolean;
  readonly enableObjectDetection: boolean;
  readonly enableSegmentation: boolean;
  readonly modelComplexity: 0 | 1 | 2;
  readonly maxHands: 1 | 2;
  readonly maxFaces: 1 | 2 | 3;
  readonly minDetectionConfidence: number;
  readonly minTrackingConfidence: number;

  // Rendering
  readonly showLandmarks: boolean;
  readonly showBoundingBoxes: boolean;
  readonly showLabels: boolean;
  readonly showSegmentationMask: boolean;
  readonly showHUD: boolean;
  readonly overlayTheme: 'indigo-cyan' | 'green-emerald' | 'orange-red' | 'purple-pink';

  // Performance
  readonly backend: AIBackend;
  readonly enableOffscreenCanvas: boolean;
  readonly enableFrameSkip: boolean;
  readonly frameSkipThreshold: number;
  readonly workerCount: number;

  // UI
  readonly floatingPanel: boolean;
  readonly darkMode: boolean;
  readonly autoStart: boolean;
}

/**
 * Chrome extension message response wrapper
 */
export interface MessageResponse<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
}
