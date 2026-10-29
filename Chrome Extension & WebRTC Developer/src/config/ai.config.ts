// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — AI / Inference Configuration
// ─────────────────────────────────────────────────────────────────────────────

import type { AIBackend, ModelConfig, ModelType } from '@/types/ai.types';

/**
 * Backend detection and priority ordering
 */
export const BACKEND_PRIORITY: AIBackend[] = ['webgpu', 'webgl', 'wasm', 'cpu'];

/**
 * MediaPipe CDN base URLs for model assets
 */
export const MEDIAPIPE_CDN = {
  hands:       'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915',
  faceMesh:    'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619',
  faceDetect:  'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4.1646425229',
  pose:        'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404',
  selfie:      'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747',
  tasksVision: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
} as const;

/**
 * TensorFlow.js model URLs
 */
export const TENSORFLOW_MODELS = {
  cocoSsd:     'https://tfhub.dev/tensorflow/tfjs-model/ssd_mobilenet_v2/1/default/1',
  bodyPix:     'https://storage.googleapis.com/tfjs-models/savedmodel/bodypix/mobilenet/float/075/model-stride16.json',
} as const;

/**
 * Default model configurations
 */
export const DEFAULT_MODEL_CONFIGS: Record<ModelType, ModelConfig> = {
  'face-detection': {
    id:                     'mediapipe-face-detection',
    name:                   'Face Detection (MediaPipe)',
    type:                   'face-detection',
    provider:               'mediapipe',
    backend:                'webgl',
    maxDetections:          3,
    minConfidence:          0.5,
    minTrackingConfidence:  0.5,
    modelComplexity:        1,
    refineLandmarks:        false,
    smoothLandmarks:        true,
    cdnUrl:                 MEDIAPIPE_CDN.faceDetect,
  },
  'face-mesh': {
    id:                     'mediapipe-face-mesh',
    name:                   'Face Mesh (MediaPipe)',
    type:                   'face-mesh',
    provider:               'mediapipe',
    backend:                'webgl',
    maxDetections:          2,
    minConfidence:          0.5,
    minTrackingConfidence:  0.5,
    modelComplexity:        1,
    refineLandmarks:        true,
    smoothLandmarks:        true,
    cdnUrl:                 MEDIAPIPE_CDN.faceMesh,
  },
  'hand-detection': {
    id:                     'mediapipe-hands',
    name:                   'Hand Tracking (MediaPipe)',
    type:                   'hand-detection',
    provider:               'mediapipe',
    backend:                'webgl',
    maxDetections:          2,
    minConfidence:          0.5,
    minTrackingConfidence:  0.5,
    modelComplexity:        1,
    refineLandmarks:        false,
    smoothLandmarks:        true,
    cdnUrl:                 MEDIAPIPE_CDN.hands,
  },
  'pose-detection': {
    id:                     'mediapipe-pose',
    name:                   'Pose Estimation (MediaPipe BlazePose)',
    type:                   'pose-detection',
    provider:               'mediapipe',
    backend:                'webgl',
    maxDetections:          1,
    minConfidence:          0.5,
    minTrackingConfidence:  0.5,
    modelComplexity:        1,
    refineLandmarks:        false,
    smoothLandmarks:        true,
    cdnUrl:                 MEDIAPIPE_CDN.pose,
  },
  'object-detection': {
    id:                     'tensorflow-coco-ssd',
    name:                   'Object Detection (COCO-SSD)',
    type:                   'object-detection',
    provider:               'tensorflow',
    backend:                'webgl',
    maxDetections:          20,
    minConfidence:          0.5,
    minTrackingConfidence:  0.3,
    modelComplexity:        1,
    refineLandmarks:        false,
    smoothLandmarks:        false,
    cdnUrl:                 TENSORFLOW_MODELS.cocoSsd,
  },
  'segmentation': {
    id:                     'mediapipe-selfie-segmentation',
    name:                   'Selfie Segmentation (MediaPipe)',
    type:                   'segmentation',
    provider:               'mediapipe',
    backend:                'webgl',
    maxDetections:          1,
    minConfidence:          0.5,
    minTrackingConfidence:  0.5,
    modelComplexity:        1,
    refineLandmarks:        false,
    smoothLandmarks:        false,
    cdnUrl:                 MEDIAPIPE_CDN.selfie,
  },
  'tracking': {
    id:                     'mediapipe-object-tracking',
    name:                   'Object Tracking',
    type:                   'tracking',
    provider:               'mediapipe',
    backend:                'webgl',
    maxDetections:          10,
    minConfidence:          0.4,
    minTrackingConfidence:  0.4,
    modelComplexity:        0,
    refineLandmarks:        false,
    smoothLandmarks:        false,
  },
};

/**
 * Hand landmark indices for skeleton drawing
 */
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

/**
 * Pose landmark indices (COCO / BlazePose 33 keypoints)
 */
export const POSE_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [18, 20],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [24, 26], [25, 27], [26, 28],
  [27, 29], [28, 30], [27, 31], [28, 32], [29, 31], [30, 32],
];

/**
 * Inference warmup frame count (reduces cold-start latency)
 */
export const WARMUP_FRAMES = 3;

/**
 * Maximum acceptable inference time (ms) before triggering frame skip
 */
export const MAX_INFERENCE_MS = 150;

/**
 * Model cache TTL in milliseconds (24 hours)
 */
export const MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
