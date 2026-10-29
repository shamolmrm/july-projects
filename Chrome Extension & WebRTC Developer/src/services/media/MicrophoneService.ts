// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Microphone Service
//  Manages microphone access: permission, stream lifecycle, error handling
// ─────────────────────────────────────────────────────────────────────────────

import type { MicrophoneConstraints, MediaError } from '@/types/media.types';
import { MICROPHONE_CONSTRAINTS } from '@/config/media.config';
import { createLogger } from '@/shared/utils/logger';

const log = createLogger('MicrophoneService');

export class MicrophoneService {
  private stream: MediaStream | null = null;
  private audioTrack: MediaStreamTrack | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  /**
   * Starts microphone capture with the given constraints
   */
  async start(constraints: MicrophoneConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
  }): Promise<MediaStream> {
    log.info('Starting microphone', constraints);

    if (this.stream) {
      await this.stop();
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId:          constraints.deviceId ? { exact: constraints.deviceId } : undefined,
          echoCancellation:  constraints.echoCancellation,
          noiseSuppression:  constraints.noiseSuppression,
          autoGainControl:   true,
          sampleRate:        constraints.sampleRate,
        },
        video: false,
      });

      this.audioTrack = this.stream.getAudioTracks()[0] ?? null;

      if (this.audioTrack) {
        log.info(`Microphone started: ${this.audioTrack.label}`);

        // Setup Web Audio API for volume analysis
        this.audioContext = new AudioContext();
        this.source = this.audioContext.createMediaStreamSource(this.stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.source.connect(this.analyser);
      }

      return this.stream;
    } catch (err) {
      const mediaErr: MediaError = {
        code: 'PERMISSION_DENIED',
        message: err instanceof Error ? err.message : String(err),
        originalError: err instanceof Error ? err : undefined,
      };
      log.error('Microphone start failed', mediaErr);
      throw mediaErr;
    }
  }

  /**
   * Stops microphone and releases all resources
   */
  async stop(): Promise<void> {
    log.info('Stopping microphone');

    if (this.source) { this.source.disconnect(); this.source = null; }
    if (this.audioContext) { await this.audioContext.close(); this.audioContext = null; }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.audioTrack = null;
    this.analyser = null;
  }

  /**
   * Returns current audio volume level (0–1) from analyser.
   * Used for audio-reactive visual effects.
   */
  getVolumeLevel(): number {
    if (!this.analyser) return 0;

    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    const sum = data.reduce((a, b) => a + b, 0);
    return sum / (data.length * 255);
  }

  mute(): void { if (this.audioTrack) this.audioTrack.enabled = false; }
  unmute(): void { if (this.audioTrack) this.audioTrack.enabled = true; }

  get isActive(): boolean { return !!this.stream && !!this.audioTrack; }
  get track(): MediaStreamTrack | null { return this.audioTrack; }
  get activeStream(): MediaStream | null { return this.stream; }
  get defaultConstraints(): typeof MICROPHONE_CONSTRAINTS { return MICROPHONE_CONSTRAINTS; }
}
