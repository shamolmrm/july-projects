// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Device Enumerator
//  Lists available cameras and microphones, watches for device changes
// ─────────────────────────────────────────────────────────────────────────────

import type { MediaDeviceInfo as AppMediaDevice } from '@/types/media.types';
import { createLogger } from '@/shared/utils/logger';

const log = createLogger('DeviceEnumerator');

type DeviceChangeCallback = (devices: {
  cameras: AppMediaDevice[];
  microphones: AppMediaDevice[];
}) => void;

/**
 * Enumerates and monitors media input devices.
 * Abstracts the native MediaDevices API for testability and reuse.
 */
export class DeviceEnumerator {
  private cameras: AppMediaDevice[] = [];
  private microphones: AppMediaDevice[] = [];
  private readonly listeners: Set<DeviceChangeCallback> = new Set();
  private boundHandler: (() => void) | null = null;

  /**
   * Enumerate all available media devices.
   * Requires at least one active stream or the labels will be empty strings.
   */
  async enumerate(): Promise<{ cameras: AppMediaDevice[]; microphones: AppMediaDevice[] }> {
    try {
      const rawDevices = await navigator.mediaDevices.enumerateDevices();

      this.cameras = rawDevices
        .filter(d => d.kind === 'videoinput')
        .map(d => ({
          deviceId: d.deviceId,
          groupId:  d.groupId,
          kind:     'videoinput' as const,
          label:    d.label || `Camera ${this.cameras.length + 1}`,
        }));

      this.microphones = rawDevices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({
          deviceId: d.deviceId,
          groupId:  d.groupId,
          kind:     'audioinput' as const,
          label:    d.label || `Microphone ${this.microphones.length + 1}`,
        }));

      log.debug(`Found ${this.cameras.length} cameras, ${this.microphones.length} mics`);
      return { cameras: this.cameras, microphones: this.microphones };
    } catch (err) {
      log.error('Device enumeration failed', err);
      return { cameras: [], microphones: [] };
    }
  }

  /**
   * Start watching for device plug/unplug events
   */
  startWatching(): void {
    if (this.boundHandler) return;
    this.boundHandler = async () => {
      const devices = await this.enumerate();
      this.listeners.forEach(cb => cb(devices));
    };
    navigator.mediaDevices.addEventListener('devicechange', this.boundHandler);
    log.debug('Watching for device changes');
  }

  stopWatching(): void {
    if (this.boundHandler) {
      navigator.mediaDevices.removeEventListener('devicechange', this.boundHandler);
      this.boundHandler = null;
    }
  }

  onDeviceChange(cb: DeviceChangeCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  get currentCameras(): AppMediaDevice[] { return [...this.cameras]; }
  get currentMicrophones(): AppMediaDevice[] { return [...this.microphones]; }

  /**
   * Returns the default (first) camera, or the one with matching deviceId
   */
  findCamera(deviceId?: string): AppMediaDevice | undefined {
    if (deviceId) return this.cameras.find(c => c.deviceId === deviceId);
    return this.cameras[0];
  }
}
