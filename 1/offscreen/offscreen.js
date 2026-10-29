// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Offscreen Processor
//  Runs MediaPipe in an isolated offscreen context (MV3 best practice).
//  Sends processed frames back to popup via postMessage / chrome.runtime.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const video  = document.getElementById('video');
const canvas = document.getElementById('canvas');
let ctx = null;
let stream = null;
let isRunning = false;
let handsModel = null;
let faceModel  = null;

// ── Message Handler ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(async (message) => {
  switch (message.type) {
    case 'OFFSCREEN_START':
      await initAndStart(message.settings);
      break;
    case 'OFFSCREEN_STOP':
      stop();
      break;
    case 'OFFSCREEN_SETTINGS':
      // Update settings dynamically
      if (handsModel && message.settings) {
        handsModel.setOptions({
          maxNumHands: message.settings.maxHands ?? 2,
          modelComplexity: message.settings.modelComplexity ?? 1,
        });
      }
      break;
  }
});

// ── Initialize ─────────────────────────────────────────────────────────────
async function initAndStart(settings = {}) {
  try {
    await startCamera();
    await loadModels();
    isRunning = true;
    processLoop();

    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_READY',
      resolution: `${video.videoWidth}×${video.videoHeight}`
    });
  } catch (err) {
    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_ERROR',
      error: err.message
    });
  }
}

// ── Camera ─────────────────────────────────────────────────────────────────
async function startCamera() {
  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: 'user',
      frameRate: { ideal: 30 }
    },
    audio: false
  });

  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;

  await new Promise((resolve, reject) => {
    video.onloadedmetadata = () => video.play().then(resolve).catch(reject);
    video.onerror = reject;
  });

  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  ctx = canvas.getContext('2d', { willReadFrequently: true });
}

// ── Load Models ────────────────────────────────────────────────────────────
async function loadModels() {
  // In a real offscreen context, you'd load MediaPipe here
  // The offscreen doc can load scripts via importScripts or dynamic import
  console.log('[Offscreen] Models would load here in production');
}

// ── Processing Loop ────────────────────────────────────────────────────────
let lastSendTime = 0;
const SEND_INTERVAL_MS = 50; // 20fps max to popup

function processLoop() {
  if (!isRunning) return;

  const t = performance.now();

  // Draw frame to canvas
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Throttle frame sending (avoid flooding popup)
  if (t - lastSendTime > SEND_INTERVAL_MS) {
    lastSendTime = t;

    // Get frame as ImageData for processing
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Send metadata back to popup (in prod: send detection results)
    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_FRAME',
      timestamp: t,
      width: canvas.width,
      height: canvas.height,
      // In production, we'd send: { landmarks, detections, ... }
    });
  }

  requestAnimationFrame(processLoop);
}

// ── Stop ───────────────────────────────────────────────────────────────────
function stop() {
  isRunning = false;
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  video.srcObject = null;
  chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOPPED' });
}

// ── Performance Monitor ────────────────────────────────────────────────────
setInterval(() => {
  if (!isRunning) return;
  const memInfo = performance.memory;
  if (memInfo) {
    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_METRICS',
      heapUsedMB: (memInfo.usedJSHeapSize / 1024 / 1024).toFixed(1),
      heapTotalMB: (memInfo.totalJSHeapSize / 1024 / 1024).toFixed(1),
    });
  }
}, 2000);
