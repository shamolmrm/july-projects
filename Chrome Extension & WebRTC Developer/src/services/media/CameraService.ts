// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Camera Service
//  Manages webcam access: permission requests, stream lifecycle,
//  resolution switching, device selection, error mapping
// ─────────────────────────────────────────────────────────────────────────────

import type {
  CameraConstraints,
  MediaStreamState,
  MediaError,
  MediaErrorCode,
  VideoResolution,
  MediaDeviceInfo as AppMediaDevice,
} from '@/types/media.types';
import { buildVideoConstraints } from '@/config/media.config';
import { createLogger } from '@/shared/utils/logger';
import { DeviceEnumerator } from './DeviceEnumerator';

const log = createLogger('CameraService');

type StreamStateCallback = (state: MediaStreamState) => void;
type ErrorCallback = (error: MediaError) => void;

/**
 * Manages the full lifecycle of a webcam MediaStream.
 *
 * Responsibilities:
 *  - Request camera permissions
 *  - Open / close stream
 *  - Switch camera device
 *  - Switch resolution
 *  - Map browser errors to typed MediaError
 *  - Notify listeners on state changes
 */
export class CameraService {
  private state: MediaStreamState = {
    stream:         null,
    videoTrack:     null,
    audioTrack:     null,
    videoDevice:    null,
    audioDevice:    null,
    resolution:     '720p',
    actualWidth:    0,
    actualHeight:   0,
    actualFrameRate:0,
    isActive:       false,
  };

  private readonly stateListeners: Set<StreamStateCallback> = new Set();
  private readonly errorListeners: Set<ErrorCallback> = new Set();
  public readonly deviceEnumerator = new DeviceEnumerator();

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Requests camera permission and opens a stream.
   * Returns the opened MediaStream.
   */
  async start(constraints: CameraConstraints): Promise<MediaStream> {
    log.info('Starting camera', constraints);

    // Stop any existing stream first
    if (this.state.isActive) {
      await this.stop();
    }

    const videoConstraints = buildVideoConstraints(
      constraints.deviceId,
      constraints.resolution,
      constraints.frameRate,
      constraints.facingMode ?? 'user',
    );

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });
    } catch (err) {
      const mediaError = this.mapError(err);
      log.error('Camera start failed', mediaError);
      this.notifyError(mediaError);
      throw mediaError;
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      const err: MediaError = { code: 'DEVICE_NOT_FOUND', message: 'No video track in stream' };
      this.notifyError(err);
      throw err;
    }

    // Handle unexpected track end (device unplugged)
    videoTrack.addEventListener('ended', () => {
      log.warn('Video track ended unexpectedly');
      this.stop().catch(e => log.error('Error during emergency stop', e));
    });

    const settings = videoTrack.getSettings();

    // Re-enumerate devices to get labels now we have permission
    await this.deviceEnumerator.enumerate();
    const device = this.deviceEnumerator.findCamera(settings.deviceId);

    this.updateState({
      stream,
      videoTrack,
      audioTrack:     null,
      videoDevice:    device ?? null,
      audioDevice:    null,
      resolution:     constraints.resolution,
      actualWidth:    settings.width   ?? 0,
      actualHeight:   settings.height  ?? 0,
      actualFrameRate:settings.frameRate ?? 0,
      isActive:       true,
    });

    log.info(`Camera started: ${settings.width}×${settings.height} @ ${settings.frameRate}fps`, {
      device: device?.label,
      trackId: videoTrack.id,
    });

    return stream;
  }

  /**
   * Stops the active stream and releases all tracks
   */
  async stop(): Promise<void> {
    log.info('Stopping camera');

    if (this.state.stream) {
      this.state.stream.getTracks().forEach(t => {
        t.stop();
        log.debug(`Track stopped: ${t.kind} ${t.id}`);
      });
    }

    this.updateState({
      stream:         null,
      videoTrack:     null,
      audioTrack:     null,
      videoDevice:    null,
      audioDevice:    null,
      resolution:     this.state.resolution,
      actualWidth:    0,
      actualHeight:   0,
      actualFrameRate:0,
      isActive:       false,
    });
  }

  /**
   * Switches to a different camera device without interrupting the pipeline
   */
  async switchDevice(deviceId: string): Promise<MediaStream> {
    const current = this.state;
    return this.start({
      deviceId,
      resolution:  current.resolution,
      frameRate:   current.actualFrameRate || 30,
      mirror:      true,
    });
  }

  /**
   * Switches resolution on the active track (applies constraint).
   * Falls back to full restart if applyConstraints fails.
   */
  async switchResolution(resolution: VideoResolution): Promise<void> {
    if (!this.state.videoTrack || !this.state.isActive) return;

    const dims = (await import('@/types/media.types')).RESOLUTION_DIMENSIONS[resolution];
    try {
      await this.state.videoTrack.applyConstraints({
        width:  { ideal: dims.width },
        height: { ideal: dims.height },
      });

      const settings = this.state.videoTrack.getSettings();
      this.updateState({
        ...this.state,
        resolution,
        actualWidth:  settings.width  ?? this.state.actualWidth,
        actualHeight: settings.height ?? this.state.actualHeight,
      });
      log.info(`Resolution switched to ${resolution}`);
    } catch (err) {
      log.warn('applyConstraints failed, restarting stream', err);
      await this.start({
        deviceId:   this.state.videoDevice?.deviceId,
        resolution,
        frameRate:  30,
        mirror:     true,
      });
    }
  }

  /**
   * Pauses video track (reduces power usage)
   */
  pauseVideoTrack(): void {
    if (this.state.videoTrack) {
      this.state.videoTrack.enabled = false;
    }
  }

  /**
   * Resumes video track
   */
  resumeVideoTrack(): void {
    if (this.state.videoTrack) {
      this.state.videoTrack.enabled = true;
    }
  }

  /**
   * Returns a clone of the video track for safe external use
   */
  cloneVideoTrack(): MediaStreamTrack | null {
    return this.state.videoTrack?.clone() ?? null;
  }

  /**
   * Returns available cameras (enumerated after permission)
   */
  getAvailableCameras(): AppMediaDevice[] {
    return this.deviceEnumerator.currentCameras;
  }

  /** Current stream state */
  get currentState(): Readonly<MediaStreamState> {
    return this.state;
  }

  // ── Subscription API ───────────────────────────────────────────────────

  onStateChange(cb: StreamStateCallback): () => void {
    this.stateListeners.add(cb);
    // Immediately call with current state
    cb(this.state);
    return () => this.stateListeners.delete(cb);
  }

  onError(cb: ErrorCallback): () => void {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private updateState(next: MediaStreamState): void {
    this.state = next;
    this.stateListeners.forEach(cb => cb(this.state));
  }

  private notifyError(error: MediaError): void {
    this.errorListeners.forEach(cb => cb(error));
  }

  private mapError(err: unknown): MediaError {
    if (!(err instanceof Error)) {
      return { code: 'UNKNOWN', message: String(err) };
    }

    const codeMap: Record<string, MediaErrorCode> = {
      NotAllowedError:     'PERMISSION_DENIED',
      PermissionDeniedError: 'PERMISSION_DENIED',
      NotFoundError:       'DEVICE_NOT_FOUND',
      DevicesNotFoundError:'DEVICE_NOT_FOUND',
      NotReadableError:    'DEVICE_IN_USE',
      TrackStartError:     'DEVICE_IN_USE',
      OverconstrainedError:'OVERCONSTRAINED',
      ConstraintNotSatisfiedError: 'OVERCONSTRAINED',
      SecurityError:       'SECURITY_ERROR',
    };

    const code: MediaErrorCode = codeMap[err.name] ?? 'UNKNOWN';
    return { code, message: err.message, originalError: err };
  }
}
