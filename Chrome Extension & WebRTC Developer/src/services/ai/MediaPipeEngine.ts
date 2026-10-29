// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — MediaPipe Inference Engine
//  Implements the InferenceEngine abstraction using MediaPipe Tasks Vision.
//  Supports: Face Detection, Face Mesh, Hand Tracking, Pose, Segmentation
// ─────────────────────────────────────────────────────────────────────────────

import { InferenceEngine } from './InferenceEngine';
import type {
  InferenceResult,
  InferenceEngineOptions,
  AIBackend,
  HandDetection,
  FaceDetection,
  PoseDetection,
  NormalizedPoint,
  BoundingBox,
} from '@/types/ai.types';
import { MEDIAPIPE_CDN, DEFAULT_MODEL_CONFIGS, WARMUP_FRAMES } from '@/config/ai.config';
import { createLogger } from '@/shared/utils/logger';

const log = createLogger('MediaPipeEngine');

/**
 * MediaPipe Hands detector instance type (via CDN dynamic import)
 */
interface MPHands {
  setOptions(opts: object): void;
  onResults(cb: (results: MPHandsResults) => void): void;
  send(input: { image: HTMLVideoElement | HTMLCanvasElement | ImageData }): Promise<void>;
  close(): void;
}

interface MPFaceMesh {
  setOptions(opts: object): void;
  onResults(cb: (results: MPFaceResults) => void): void;
  send(input: { image: HTMLVideoElement | HTMLCanvasElement | ImageData }): Promise<void>;
  close(): void;
}

interface MPPose {
  setOptions(opts: object): void;
  onResults(cb: (results: MPPoseResults) => void): void;
  send(input: { image: HTMLVideoElement | HTMLCanvasElement | ImageData }): Promise<void>;
  close(): void;
}

interface MPSelfieSegmentation {
  setOptions(opts: object): void;
  onResults(cb: (results: MPSegResults) => void): void;
  send(input: { image: HTMLVideoElement | HTMLCanvasElement | ImageData }): Promise<void>;
  close(): void;
}

interface MPLandmark { x: number; y: number; z: number; visibility?: number; }
interface MPHandsResults {
  multiHandLandmarks?: MPLandmark[][];
  multiHandWorldLandmarks?: MPLandmark[][];
  multiHandedness?: Array<{ label: 'Left' | 'Right'; score: number }>;
}
interface MPFaceResults {
  multiFaceLandmarks?: MPLandmark[][];
}
interface MPPoseResults {
  poseLandmarks?: MPLandmark[];
  poseWorldLandmarks?: MPLandmark[];
}
interface MPSegResults {
  segmentationMask?: ImageBitmap | null;
}

/**
 * Full MediaPipe-based inference engine.
 * Dynamically loads only the models that are enabled in options.
 */
export class MediaPipeEngine extends InferenceEngine {
  private handsModel:    MPHands | null = null;
  private faceMeshModel: MPFaceMesh | null = null;
  private poseModel:     MPPose | null = null;
  private segModel:      MPSelfieSegmentation | null = null;
  private actualBackend: AIBackend = 'webgl';

  // Latest results from async callbacks
  private latestHands: MPHandsResults | null = null;
  private latestFace:  MPFaceResults | null = null;
  private latestPose:  MPPoseResults | null = null;
  private latestSeg:   MPSegResults | null = null;

  constructor(options: InferenceEngineOptions) {
    super(options);
  }

  // ── InferenceEngine Implementation ────────────────────────────────────

  async initialize(): Promise<void> {
    this.setState('loading');
    log.info('Initializing MediaPipe engine', { models: this.options.models });

    try {
      await this.loadEnabledModels();

      // Detect backend
      this.actualBackend = await this.detectBackend();

      this.setState('ready');
      log.info(`MediaPipe engine ready (backend: ${this.actualBackend})`);
    } catch (err) {
      this.setState('error');
      log.error('MediaPipe engine initialization failed', err);
      throw err;
    }
  }

  async infer(
    source: HTMLVideoElement | ImageData | ImageBitmap,
    frameId: number,
    timestamp: number,
  ): Promise<InferenceResult> {
    if (this.state === 'idle' || this.state === 'error') {
      return this.emptyResult(frameId, timestamp);
    }

    const t0 = performance.now();

    // Send frame to all enabled models concurrently
    const sendPromises: Promise<void>[] = [];
    const input = { image: source as HTMLVideoElement };

    if (this.handsModel)    sendPromises.push(this.handsModel.send(input).catch(() => {}));
    if (this.faceMeshModel) sendPromises.push(this.faceMeshModel.send(input).catch(() => {}));
    if (this.poseModel)     sendPromises.push(this.poseModel.send(input).catch(() => {}));
    if (this.segModel)      sendPromises.push(this.segModel.send(input).catch(() => {}));

    await Promise.all(sendPromises);

    const inferenceTimeMs = performance.now() - t0;

    return {
      frameId,
      timestamp,
      inferenceTimeMs,
      hands:   this.handsModel    ? this.parseHands()   : undefined,
      faces:   this.faceMeshModel ? this.parseFaces()   : undefined,
      poses:   this.poseModel     ? this.parsePoses()   : undefined,
    };
  }

  async updateConfig(config: Partial<InferenceEngineOptions>): Promise<void> {
    log.info('Updating MediaPipe config', config);

    if (config.config?.modelComplexity !== undefined) {
      this.handsModel?.setOptions({ modelComplexity: config.config.modelComplexity });
      this.faceMeshModel?.setOptions({ modelComplexity: config.config.modelComplexity });
    }
    if (config.config?.maxDetections !== undefined) {
      this.handsModel?.setOptions({ maxNumHands: Math.min(config.config.maxDetections, 2) });
      this.faceMeshModel?.setOptions({ maxNumFaces: Math.min(config.config.maxDetections, 3) });
    }
  }

  async dispose(): Promise<void> {
    log.info('Disposing MediaPipe engine');
    this.handsModel?.close();
    this.faceMeshModel?.close();
    this.poseModel?.close();
    this.segModel?.close();

    this.handsModel    = null;
    this.faceMeshModel = null;
    this.poseModel     = null;
    this.segModel      = null;

    this.latestHands = null;
    this.latestFace  = null;
    this.latestPose  = null;
    this.latestSeg   = null;

    this.setState('idle');
  }

  getActualBackend(): AIBackend { return this.actualBackend; }

  // ── Private model loaders ──────────────────────────────────────────────

  private async loadEnabledModels(): Promise<void> {
    const models = this.options.models;
    const cfg = { ...DEFAULT_MODEL_CONFIGS['hand-detection'], ...this.options.config };

    const loaders: Promise<void>[] = [];

    if (models.includes('hand-detection')) {
      loaders.push(this.loadHandsModel(cfg));
    }
    if (models.includes('face-mesh') || models.includes('face-detection')) {
      loaders.push(this.loadFaceMeshModel(cfg));
    }
    if (models.includes('pose-detection')) {
      loaders.push(this.loadPoseModel(cfg));
    }
    if (models.includes('segmentation')) {
      loaders.push(this.loadSegmentationModel());
    }

    await Promise.all(loaders);
  }

  private async loadHandsModel(cfg: typeof DEFAULT_MODEL_CONFIGS['hand-detection']): Promise<void> {
    log.info('Loading MediaPipe Hands…');
    const cdnBase = MEDIAPIPE_CDN.hands;
    // Dynamic import — works in extension context after CSP allows it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Hands } = await import(`${cdnBase}/hands.js`) as any;

    this.handsModel = new Hands({
      locateFile: (file: string) => `${cdnBase}/${file}`,
    });

    this.handsModel!.setOptions({
      maxNumHands:           cfg.maxDetections,
      modelComplexity:       cfg.modelComplexity,
      minDetectionConfidence:cfg.minConfidence,
      minTrackingConfidence: cfg.minTrackingConfidence,
    });

    this.handsModel!.onResults((r) => { this.latestHands = r; });
    log.info('MediaPipe Hands loaded');
  }

  private async loadFaceMeshModel(cfg: typeof DEFAULT_MODEL_CONFIGS['face-mesh']): Promise<void> {
    log.info('Loading MediaPipe FaceMesh…');
    const cdnBase = MEDIAPIPE_CDN.faceMesh;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { FaceMesh } = await import(`${cdnBase}/face_mesh.js`) as any;

    this.faceMeshModel = new FaceMesh({
      locateFile: (file: string) => `${cdnBase}/${file}`,
    });

    this.faceMeshModel!.setOptions({
      maxNumFaces:            Math.min(cfg.maxDetections, 3),
      refineLandmarks:        cfg.refineLandmarks,
      minDetectionConfidence: cfg.minConfidence,
      minTrackingConfidence:  cfg.minTrackingConfidence,
    });

    this.faceMeshModel!.onResults((r) => { this.latestFace = r; });
    log.info('MediaPipe FaceMesh loaded');
  }

  private async loadPoseModel(cfg: typeof DEFAULT_MODEL_CONFIGS['pose-detection']): Promise<void> {
    log.info('Loading MediaPipe Pose…');
    const cdnBase = MEDIAPIPE_CDN.pose;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Pose } = await import(`${cdnBase}/pose.js`) as any;

    this.poseModel = new Pose({
      locateFile: (file: string) => `${cdnBase}/${file}`,
    });

    this.poseModel!.setOptions({
      modelComplexity:        cfg.modelComplexity,
      smoothLandmarks:        cfg.smoothLandmarks,
      enableSegmentation:     false,
      minDetectionConfidence: cfg.minConfidence,
      minTrackingConfidence:  cfg.minTrackingConfidence,
    });

    this.poseModel!.onResults((r) => { this.latestPose = r; });
    log.info('MediaPipe Pose loaded');
  }

  private async loadSegmentationModel(): Promise<void> {
    log.info('Loading MediaPipe Selfie Segmentation…');
    const cdnBase = MEDIAPIPE_CDN.selfie;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { SelfieSegmentation } = await import(`${cdnBase}/selfie_segmentation.js`) as any;

    this.segModel = new SelfieSegmentation({
      locateFile: (file: string) => `${cdnBase}/${file}`,
    });

    this.segModel!.setOptions({ modelSelection: 1 });
    this.segModel!.onResults((r) => { this.latestSeg = r; });
    log.info('MediaPipe Segmentation loaded');
  }

  // ── Result parsers ─────────────────────────────────────────────────────

  private parseHands(): HandDetection[] {
    if (!this.latestHands?.multiHandLandmarks?.length) return [];

    return this.latestHands.multiHandLandmarks.map((lms, i) => {
      const handedness = this.latestHands?.multiHandedness?.[i];
      const worldLms = this.latestHands?.multiHandWorldLandmarks?.[i] ?? lms;

      const xs = lms.map(l => l.x);
      const ys = lms.map(l => l.y);

      return {
        index:      i,
        handedness: (handedness?.label ?? 'Right') as 'Left' | 'Right',
        score:      handedness?.score ?? 1,
        landmarks:  lms.map(l => ({ x: l.x, y: l.y, z: l.z })) as NormalizedPoint[],
        worldLandmarks: worldLms.map(l => ({ x: l.x, y: l.y, z: l.z })) as NormalizedPoint[],
        boundingBox: this.computeBoundingBox(xs, ys, handedness?.score ?? 1),
      };
    });
  }

  private parseFaces(): FaceDetection[] {
    if (!this.latestFace?.multiFaceLandmarks?.length) return [];

    return this.latestFace.multiFaceLandmarks.map((lms, i) => {
      const xs = lms.map(l => l.x);
      const ys = lms.map(l => l.y);

      return {
        index:      i,
        score:      1.0,
        landmarks:  lms.map(l => ({ x: l.x, y: l.y, z: l.z })) as NormalizedPoint[],
        boundingBox:this.computeBoundingBox(xs, ys, 1.0),
      };
    });
  }

  private parsePoses(): PoseDetection[] {
    if (!this.latestPose?.poseLandmarks) return [];

    const lms = this.latestPose.poseLandmarks;
    const worldLms = this.latestPose.poseWorldLandmarks ?? lms;
    const xs = lms.map(l => l.x);
    const ys = lms.map(l => l.y);

    return [{
      index:          0,
      score:          lms[0]?.visibility ?? 1,
      landmarks:      lms.map(l => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility })) as NormalizedPoint[],
      worldLandmarks: worldLms.map(l => ({ x: l.x, y: l.y, z: l.z })) as NormalizedPoint[],
      boundingBox:    this.computeBoundingBox(xs, ys, 1),
    }];
  }

  private computeBoundingBox(xs: number[], ys: number[], score: number): BoundingBox {
    const xMin = Math.min(...xs);
    const yMin = Math.min(...ys);
    const xMax = Math.max(...xs);
    const yMax = Math.max(...ys);
    return {
      xMin,
      yMin,
      width:  xMax - xMin,
      height: yMax - yMin,
      score,
    };
  }

  private emptyResult(frameId: number, timestamp: number): InferenceResult {
    return { frameId, timestamp, inferenceTimeMs: 0 };
  }

  private async detectBackend(): Promise<AIBackend> {
    if ('gpu' in navigator) {
      const adapter = await navigator.gpu?.requestAdapter();
      if (adapter) return 'webgpu';
    }
    // Check WebGL support
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) return 'webgl';
    return 'wasm';
  }
}
