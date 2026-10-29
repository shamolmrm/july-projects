// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Media Configuration
// ─────────────────────────────────────────────────────────────────────────────

import type { AppSettings } from '@/types/messages.types';
import type { VideoResolution } from '@/types/media.types';
import { RESOLUTION_DIMENSIONS } from '@/types/media.types';

/**
 * Default application settings stored in chrome.storage.local
 */
export const DEFAULT_SETTINGS: AppSettings = {
  // Camera
  selectedDeviceId:           '',
  resolution:                 '720p',
  targetFPS:                  30,
  mirrorVideo:                true,
  enableAudio:                false,

  // AI Models
  enableFaceDetection:        false,
  enableFaceMesh:             true,
  enableHandDetection:        true,
  enablePoseDetection:        false,
  enableObjectDetection:      false,
  enableSegmentation:         false,
  modelComplexity:            1,
  maxHands:                   2,
  maxFaces:                   2,
  minDetectionConfidence:     0.5,
  minTrackingConfidence:      0.5,

  // Rendering
  showLandmarks:              true,
  showBoundingBoxes:          true,
  showLabels:                 true,
  showSegmentationMask:       false,
  showHUD:                    true,
  overlayTheme:               'indigo-cyan',

  // Performance
  backend:                    'webgl',
  enableOffscreenCanvas:      true,
  enableFrameSkip:            true,
  frameSkipThreshold:         80,
  workerCount:                2,

  // UI
  floatingPanel:              true,
  darkMode:                   true,
  autoStart:                  false,
};

/**
 * MediaDevices getUserMedia constraints builder
 */
export function buildVideoConstraints(
  deviceId: string | undefined,
  resolution: VideoResolution,
  frameRate: number,
  facingMode: 'user' | 'environment' = 'user',
): MediaTrackConstraints {
  const dims = RESOLUTION_DIMENSIONS[resolution];
  return {
    deviceId:   deviceId ? { exact: deviceId } : undefined,
    width:      { ideal: dims.width,  max: dims.width  },
    height:     { ideal: dims.height, max: dims.height },
    frameRate:  { ideal: frameRate,   max: 60           },
    facingMode: { ideal: facingMode },
  };
}

/**
 * Microphone constraints
 */
export const MICROPHONE_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation:  true,
  noiseSuppression:  true,
  autoGainControl:   true,
};

/**
 * Frame extraction configuration
 */
export const FRAME_EXTRACTION = {
  /** Maximum frames held in the queue before dropping */
  maxQueueSize:         5,
  /** Time between frames at target FPS */
  frameIntervalMs:      (fps: number) => 1000 / fps,
  /** Minimum time between sent frames to inference worker */
  minInferenceInterval: 33,   // ~30fps cap for inference
} as const;

/**
 * Keepalive interval for service worker (ms)
 */
export const SW_KEEPALIVE_INTERVAL_MS = 25_000;
