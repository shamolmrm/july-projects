// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Media / WebRTC Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Supported video resolutions
 */
export type VideoResolution = '360p' | '480p' | '720p' | '1080p' | '4K';

/**
 * Resolution dimensions lookup
 */
export const RESOLUTION_DIMENSIONS: Record<VideoResolution, { width: number; height: number }> = {
  '360p':  { width: 640,  height: 360  },
  '480p':  { width: 854,  height: 480  },
  '720p':  { width: 1280, height: 720  },
  '1080p': { width: 1920, height: 1080 },
  '4K':    { width: 3840, height: 2160 },
};

/**
 * Enumerated camera/microphone device
 */
export interface MediaDeviceInfo {
  readonly deviceId: string;
  readonly groupId: string;
  readonly kind: 'videoinput' | 'audioinput' | 'audiooutput';
  readonly label: string;
}

/**
 * Camera constraint options
 */
export interface CameraConstraints {
  readonly deviceId?: string;
  readonly resolution: VideoResolution;
  readonly frameRate: number;
  readonly facingMode?: 'user' | 'environment';
  readonly mirror: boolean;
}

/**
 * Microphone constraint options
 */
export interface MicrophoneConstraints {
  readonly deviceId?: string;
  readonly echoCancellation: boolean;
  readonly noiseSuppression: boolean;
  readonly sampleRate?: number;
}

/**
 * Combined media constraints
 */
export interface MediaConstraints {
  readonly camera: CameraConstraints;
  readonly microphone?: MicrophoneConstraints;
  readonly enableAudio: boolean;
}

/**
 * Active media stream state
 */
export interface MediaStreamState {
  readonly stream: MediaStream | null;
  readonly videoTrack: MediaStreamTrack | null;
  readonly audioTrack: MediaStreamTrack | null;
  readonly videoDevice: MediaDeviceInfo | null;
  readonly audioDevice: MediaDeviceInfo | null;
  readonly resolution: VideoResolution;
  readonly actualWidth: number;
  readonly actualHeight: number;
  readonly actualFrameRate: number;
  readonly isActive: boolean;
}

/**
 * A single captured video frame with metadata
 */
export interface VideoFrame {
  readonly id: number;
  readonly timestamp: number;
  readonly imageData: ImageData;
  readonly width: number;
  readonly height: number;
  readonly presentationTime?: number;
}

/**
 * Frame queue configuration
 */
export interface FrameQueueConfig {
  readonly maxSize: number;
  readonly dropStrategy: 'oldest' | 'newest';
  readonly enableBackpressure: boolean;
}

/**
 * Pipeline processing status
 */
export type PipelineStatus = 'idle' | 'initializing' | 'running' | 'paused' | 'stopping' | 'error';

/**
 * Media pipeline configuration
 */
export interface PipelineConfig {
  readonly targetFPS: number;
  readonly enableFrameSkip: boolean;
  readonly frameSkipThreshold: number;
  readonly enableOffscreen: boolean;
  readonly workerCount: number;
}

/**
 * Error types from the media pipeline
 */
export type MediaErrorCode =
  | 'PERMISSION_DENIED'
  | 'DEVICE_NOT_FOUND'
  | 'DEVICE_IN_USE'
  | 'OVERCONSTRAINED'
  | 'SECURITY_ERROR'
  | 'UNKNOWN';

export interface MediaError {
  readonly code: MediaErrorCode;
  readonly message: string;
  readonly originalError?: Error;
}
