// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — AI / Inference Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Supported AI backends in order of preference
 */
export type AIBackend = 'webgpu' | 'webgl' | 'wasm' | 'cpu';

/**
 * Available AI model types
 */
export type ModelType =
  | 'face-detection'
  | 'face-mesh'
  | 'hand-detection'
  | 'pose-detection'
  | 'object-detection'
  | 'segmentation'
  | 'tracking';

/**
 * AI framework provider
 */
export type AIProvider = 'mediapipe' | 'tensorflow' | 'onnx';

/**
 * Model configuration for a specific inference task
 */
export interface ModelConfig {
  readonly id: string;
  readonly name: string;
  readonly type: ModelType;
  readonly provider: AIProvider;
  readonly backend: AIBackend;
  readonly maxDetections: number;
  readonly minConfidence: number;
  readonly minTrackingConfidence: number;
  readonly modelComplexity: 0 | 1 | 2;
  readonly refineLandmarks: boolean;
  readonly smoothLandmarks: boolean;
  readonly cdnUrl?: string;
  readonly localPath?: string;
}

/**
 * Normalized 2D point (0.0–1.0 relative coordinates)
 */
export interface NormalizedPoint {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
  readonly visibility?: number;
}

/**
 * Bounding box in normalized coordinates
 */
export interface BoundingBox {
  readonly xMin: number;
  readonly yMin: number;
  readonly width: number;
  readonly height: number;
  readonly score: number;
}

/**
 * A single detected hand with landmarks and metadata
 */
export interface HandDetection {
  readonly index: number;
  readonly handedness: 'Left' | 'Right';
  readonly score: number;
  readonly landmarks: NormalizedPoint[];
  readonly worldLandmarks: NormalizedPoint[];
  readonly boundingBox: BoundingBox;
}

/**
 * A single detected face with 468 landmarks
 */
export interface FaceDetection {
  readonly index: number;
  readonly score: number;
  readonly landmarks: NormalizedPoint[];
  readonly boundingBox: BoundingBox;
  readonly keypoints?: {
    readonly leftEye: NormalizedPoint;
    readonly rightEye: NormalizedPoint;
    readonly noseTip: NormalizedPoint;
    readonly mouthCenter: NormalizedPoint;
    readonly leftEarTragion: NormalizedPoint;
    readonly rightEarTragion: NormalizedPoint;
  };
}

/**
 * A single pose with 33 body landmarks
 */
export interface PoseDetection {
  readonly index: number;
  readonly score: number;
  readonly landmarks: NormalizedPoint[];
  readonly worldLandmarks: NormalizedPoint[];
  readonly boundingBox: BoundingBox;
}

/**
 * Detected object with category and bounding box
 */
export interface ObjectDetection {
  readonly id: number;
  readonly label: string;
  readonly score: number;
  readonly boundingBox: BoundingBox;
  readonly trackingId?: number;
}

/**
 * Segmentation mask result
 */
export interface SegmentationResult {
  readonly mask: ImageData | null;
  readonly width: number;
  readonly height: number;
  readonly type: 'person' | 'background';
}

/**
 * Aggregated inference results for a single frame
 */
export interface InferenceResult {
  readonly frameId: number;
  readonly timestamp: number;
  readonly inferenceTimeMs: number;
  readonly hands?: HandDetection[];
  readonly faces?: FaceDetection[];
  readonly poses?: PoseDetection[];
  readonly objects?: ObjectDetection[];
  readonly segmentation?: SegmentationResult;
}

/**
 * Inference engine lifecycle state
 */
export type InferenceEngineState = 'idle' | 'loading' | 'ready' | 'running' | 'paused' | 'error';

/**
 * Engine initialization options
 */
export interface InferenceEngineOptions {
  readonly backend: AIBackend;
  readonly models: ModelType[];
  readonly config: Partial<ModelConfig>;
  readonly enableWarmup: boolean;
}
