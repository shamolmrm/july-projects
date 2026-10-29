// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — MV3 Service Worker
//  Handles: Extension lifecycle, offscreen docs, side panel, tab/message routing
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

let offscreenDocCreated = false;

// ── Default Settings ───────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  enableHands:         true,
  enableFace:          true,
  modelComplexity:     1,
  maxHands:            2,
  detectionConfidence: 5,
  showLandmarks:       true,
  showConnections:     true,
  mirrorVideo:         true,
  showHUD:             true,
  overlayTheme:        'indigo-cyan',
  inferenceBackend:    'auto',
  targetFPS:           30,
  cameraRes:           720,
  useOffscreen:        true,
  autoDetect:          false,
  floatingPanel:       true,
};

// ── Install ────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log(`[AI Vision Pro] ${reason === 'install' ? 'Installed' : 'Updated'}`);
  chrome.storage.local.get(['settings'], (r) => {
    if (!r.settings) {
      chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    }
  });
});

// ── Action Click → Toggle Side Panel ─────────────────────────────────────
chrome.action.onClicked.addListener(async (tab) => {
  // Try side panel first; fall back to popup is configured in manifest
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.warn('[AI Vision] Side panel not available:', e.message);
  }
});

// ── Enable side panel on every tab ────────────────────────────────────────
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel/sidepanel.html',
      enabled: true,
    });
  } catch (_) {}
});

// ── Offscreen Document ─────────────────────────────────────────────────────
async function setupOffscreen() {
  if (offscreenDocCreated) return;
  if (await chrome.offscreen.hasDocument()) { offscreenDocCreated = true; return; }

  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['USER_MEDIA', 'BLOBS'],
    justification: 'MediaPipe AI inference off the main thread',
  });
  offscreenDocCreated = true;
  console.log('[AI Vision] Offscreen document created');
}

async function closeOffscreen() {
  if (!offscreenDocCreated) return;
  if (await chrome.offscreen.hasDocument()) {
    await chrome.offscreen.closeDocument();
  }
  offscreenDocCreated = false;
}

// ── Message Router ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const { type } = msg;

  // ── From popup / sidepanel ──
  if (type === 'START_OFFSCREEN') {
    setupOffscreen()
      .then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (type === 'STOP_OFFSCREEN') {
    closeOffscreen()
      .then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  // ── Content script events ──
  if (type === 'CONTENT_VIDEO_FOUND') {
    console.log(`[AI Vision] Videos found on ${msg.url}: ${msg.count}`);
    // Could show badge count
    chrome.action.setBadgeText({ text: String(msg.count) });
    chrome.action.setBadgeBackgroundColor({ color: '#818cf8' });
    return false;
  }

  if (type === 'CONTENT_VISION_STARTED') {
    console.log(`[AI Vision] Vision started on: ${msg.url}`);
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    return false;
  }

  // ── Show floating panel on current tab ──
  if (type === 'SHOW_CONTENT_PANEL') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SHOW_PANEL' }, (r) => {
          sendResponse(r || { shown: false });
        });
      }
    });
    return true;
  }

  // ── Get video info from active tab ──
  if (type === 'GET_PAGE_VIDEO_INFO') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_VIDEO_INFO' }, (r) => {
          sendResponse(r || { count: 0, videos: [] });
        });
      }
    });
    return true;
  }

  // ── Forward to offscreen ──
  if (msg.target === 'offscreen') {
    chrome.runtime.sendMessage({ ...msg, fromBackground: true }).catch(() => {});
    return false;
  }

  return false;
});

// ── Tab Updates: clear badge on navigation ─────────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading') {
    chrome.action.setBadgeText({ tabId, text: '' });
  }
});

// ── Periodic keepalive (prevents SW from sleeping during active processing) ──
// Note: In production use chrome.alarms for this instead
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepalive') {
    port.onDisconnect.addListener(() => {
      console.log('[AI Vision] Keepalive port disconnected');
    });
  }
});
