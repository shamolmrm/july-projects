// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — MV3 Background Service Worker
//  Handles: extension lifecycle, offscreen document, side panel,
//           tab management, message routing, settings persistence,
//           and service worker keepalive via chrome.alarms.
// ─────────────────────────────────────────────────────────────────────────────

import { MessageBus } from '@/shared/messaging/MessageBus';
import { DEFAULT_SETTINGS } from '@/config/media.config';
import { createLogger } from '@/shared/utils/logger';
import { sanitizeSettings } from '@/shared/utils/validators';
import type { AppSettings } from '@/types/messages.types';

const log = createLogger('ServiceWorker');
const bus = new MessageBus('background');

// ── Offscreen document state ───────────────────────────────────────────────

const OFFSCREEN_URL = chrome.runtime.getURL('offscreen/offscreen.html');
let offscreenCreating = false;

async function hasOffscreenDocument(): Promise<boolean> {
  // @ts-ignore — Chrome 116+ API
  return chrome.offscreen.hasDocument();
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) return;
  if (offscreenCreating) {
    // Wait for in-progress creation
    await new Promise<void>(resolve => {
      const check = setInterval(async () => {
        if (await hasOffscreenDocument()) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
    return;
  }

  offscreenCreating = true;
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      // @ts-ignore
      reasons: ['USER_MEDIA', 'BLOBS'],
      justification: 'MediaPipe AI inference and WebRTC media capture in isolated context',
    });
    log.info('Offscreen document created');
  } catch (err) {
    log.error('Failed to create offscreen document', err);
    throw err;
  } finally {
    offscreenCreating = false;
  }
}

async function closeOffscreenDocument(): Promise<void> {
  if (!await hasOffscreenDocument()) return;
  try {
    await chrome.offscreen.closeDocument();
    log.info('Offscreen document closed');
  } catch (err) {
    log.error('Failed to close offscreen document', err);
  }
}

// ── Settings persistence ───────────────────────────────────────────────────

async function loadSettings(): Promise<AppSettings> {
  const result = await chrome.storage.local.get(['settings']);
  const stored = result['settings'];
  if (stored && typeof stored === 'object') {
    return { ...DEFAULT_SETTINGS, ...sanitizeSettings(stored) } as AppSettings;
  }
  return DEFAULT_SETTINGS;
}

async function saveSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const updated = { ...current, ...sanitizeSettings(partial) } as AppSettings;
  await chrome.storage.local.set({ settings: updated });
  return updated;
}

// ── Badge helpers ──────────────────────────────────────────────────────────

function setBadge(text: string, color: string, tabId?: number): void {
  const opts = { text, ...(tabId ? { tabId } : {}) };
  chrome.action.setBadgeText(opts).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color, ...(tabId ? { tabId } : {}) }).catch(() => {});
}

// ── Side panel setup ───────────────────────────────────────────────────────

async function enableSidePanel(tabId: number): Promise<void> {
  try {
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel/index.html',
      enabled: true,
    });
  } catch {
    // sidePanel API may not be available in all Chrome versions
  }
}

// ── Message routing ────────────────────────────────────────────────────────

// Route: popup → create offscreen document
bus.on('OFFSCREEN_CREATE', async () => {
  try {
    await ensureOffscreenDocument();
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

// Route: popup → close offscreen document
bus.on('OFFSCREEN_CLOSE', async () => {
  try {
    await closeOffscreenDocument();
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

// Route: forward PIPELINE_START to offscreen
bus.on('PIPELINE_START', async (msg) => {
  try {
    await ensureOffscreenDocument();
    // Forward to offscreen — sendMessage again with offscreen target
    await chrome.runtime.sendMessage({ ...msg, _forwardedByBackground: true });
    setBadge('●', '#10b981');
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

// Route: PIPELINE_STOP
bus.on('PIPELINE_STOP', async (msg) => {
  try {
    await chrome.runtime.sendMessage({ ...msg, _forwardedByBackground: true });
    setBadge('', '#818cf8');
    await closeOffscreenDocument();
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

// Route: get settings
bus.on('SETTINGS_GET', async () => {
  const settings = await loadSettings();
  return { success: true, data: settings };
});

// Route: update settings
bus.on('SETTINGS_UPDATE', async (msg) => {
  const m = msg as { payload?: Partial<AppSettings> };
  const updated = await saveSettings(m.payload ?? {});
  return { success: true, data: updated };
});

// Route: content script events
bus.on('CONTENT_VISION_STARTED', () => {
  setBadge('ON', '#10b981');
});

bus.on('CONTENT_VIDEO_FOUND', (msg) => {
  const m = msg as { count?: number };
  setBadge(String(m.count ?? 0), '#818cf8');
});

// Route: benchmark
bus.on('BENCHMARK_START', async (msg) => {
  await ensureOffscreenDocument();
  chrome.runtime.sendMessage({ ...msg, _forwardedByBackground: true }).catch(() => {});
});

// ── Extension lifecycle ────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  log.info(`Extension ${reason}`);

  if (reason === 'install') {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    log.info('Default settings written');
  }

  // Set up alarm for service worker keepalive
  await chrome.alarms.create('keepalive', { periodInMinutes: 0.4 }); // ~25s
});

// ── Alarm handler (keepalive ping) ─────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') {
    log.debug('Keepalive tick');
  }
});

// ── Tab event handlers ─────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await enableSidePanel(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    setBadge('', '#818cf8', tabId);
  }
});

// ── Action click → open side panel ────────────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch {
    log.warn('Side panel not available, popup used instead');
  }
});

// ── Long-lived connection port (from popup / sidepanel) ───────────────────

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepalive') {
    port.onDisconnect.addListener(() => {
      log.debug('Keepalive port disconnected');
    });
  }

  if (port.name === 'inference-stream') {
    // Relays inference results from offscreen → popup/sidepanel
    port.onDisconnect.addListener(() => {
      log.debug('Inference stream port disconnected');
    });
  }
});

log.info('Service worker initialized');
