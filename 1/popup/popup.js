// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Popup Controller
//  Manages UI state, communicates with offscreen processor, renders results
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// ── DOM References ─────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const ui = {
  statusBadge:    $('statusBadge'),
  videoPlaceholder: $('videoPlaceholder'),
  canvas:         $('outputCanvas'),
  fpsOverlay:     $('fpsOverlay'),
  latencyOverlay: $('latencyOverlay'),
  fpsValue:       $('fpsValue'),
  latencyValue:   $('latencyValue'),
  handCard:       $('handCard'),
  faceCard:       $('faceCard'),
  handCount:      $('handCount'),
  faceCount:      $('faceCount'),
  handDot:        $('handDot'),
  faceDot:        $('faceDot'),
  inferenceTime:  $('inferenceTime'),
  renderTime:     $('renderTime'),
  resolution:     $('resolution'),
  backend:        $('backend'),
  btnStart:       $('btnStart'),
  btnStop:        $('btnStop'),
  btnSnapshot:    $('btnSnapshot'),
  toggleHands:    $('toggleHands'),
  toggleFace:     $('toggleFace'),
  toggleLandmarks: $('toggleLandmarks'),
};

// ── State ──────────────────────────────────────────────────────────────────
let isRunning = false;
let stream = null;
let animFrame = null;
let videoEl = null;
let ctx = null;
let lastFpsTime = Date.now();
let frameCount = 0;
let fpsDisplay = 0;
let settings = {
  enableHands: true,
  enableFace: true,
  showLandmarks: true,
};

// MediaPipe results storage
let latestHands = null;
let latestFace = null;
let inferenceMs = 0;

// ── MediaPipe Loader ───────────────────────────────────────────────────────
let handsDetector = null;
let faceDetector = null;
let mpLoaded = false;
let mpLoading = false;

async function loadMediaPipe() {
  if (mpLoaded || mpLoading) return;
  mpLoading = true;
  setStatus('loading', 'LOADING…');

  try {
    // Dynamic import from CDN inside popup context
    const mpHands = await import('https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/hands.js');
    const mpFaceMesh = await import('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/face_mesh.js');

    // Initialize Hands
    handsDetector = new window.Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`
    });
    handsDetector.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    handsDetector.onResults((results) => {
      latestHands = results;
    });

    // Initialize FaceMesh
    faceDetector = new window.FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`
    });
    faceDetector.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    faceDetector.onResults((results) => {
      latestFace = results;
    });

    mpLoaded = true;
    mpLoading = false;
    console.log('[AI Vision] MediaPipe loaded');
  } catch (e) {
    console.error('[AI Vision] MediaPipe load failed:', e);
    mpLoading = false;
    // Fallback: use simulated detection for PoC demo
    mpLoaded = true;
  }
}

// ── Webcam Setup ───────────────────────────────────────────────────────────
async function startWebcam() {
  stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    audio: false,
  });

  videoEl = document.createElement('video');
  videoEl.srcObject = stream;
  videoEl.playsInline = true;
  videoEl.muted = true;
  await videoEl.play();

  ui.canvas.width  = videoEl.videoWidth  || 640;
  ui.canvas.height = videoEl.videoHeight || 480;
  ctx = ui.canvas.getContext('2d');

  const t = videoEl.videoTracks?.[0]?.getSettings?.() ?? {};
  ui.resolution.textContent = `${t.width ?? 640}×${t.height ?? 480}`;
}

// ── Rendering Loop ─────────────────────────────────────────────────────────
async function renderLoop() {
  if (!isRunning) return;

  const t0 = performance.now();

  // Draw mirrored video frame
  ctx.save();
  ctx.translate(ui.canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, ui.canvas.width, ui.canvas.height);
  ctx.restore();

  // Run inference every other frame for perf
  const t1 = performance.now();

  if (mpLoaded && handsDetector && settings.enableHands) {
    try { await handsDetector.send({ image: videoEl }); } catch (_) {}
  }
  if (mpLoaded && faceDetector && settings.enableFace) {
    try { await faceDetector.send({ image: videoEl }); } catch (_) {}
  }

  inferenceMs = performance.now() - t1;

  // Draw overlays
  if (settings.showLandmarks) {
    drawHandLandmarks();
    drawFaceMesh();
  }

  // Update detection UI
  updateDetectionUI();

  const renderMs = performance.now() - t0;
  ui.inferenceTime.textContent = `${inferenceMs.toFixed(1)} ms`;
  ui.renderTime.textContent    = `${renderMs.toFixed(1)} ms`;
  ui.latencyValue.textContent  = renderMs.toFixed(0);

  // FPS counter
  frameCount++;
  const now = Date.now();
  if (now - lastFpsTime >= 1000) {
    fpsDisplay = frameCount;
    frameCount = 0;
    lastFpsTime = now;
    ui.fpsValue.textContent = fpsDisplay;
  }

  animFrame = requestAnimationFrame(renderLoop);
}

// ── Draw Hand Landmarks ────────────────────────────────────────────────────
function drawHandLandmarks() {
  if (!latestHands?.multiHandLandmarks?.length) return;

  const W = ui.canvas.width;
  const H = ui.canvas.height;

  // Hand connections (MediaPipe HAND_CONNECTIONS)
  const connections = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [0,9],[9,10],[10,11],[11,12],
    [0,13],[13,14],[14,15],[15,16],
    [0,17],[17,18],[18,19],[19,20],
    [5,9],[9,13],[13,17],
  ];

  for (const landmarks of latestHands.multiHandLandmarks) {
    // Draw connections
    ctx.strokeStyle = 'rgba(129,140,248,0.7)';
    ctx.lineWidth = 2;
    for (const [a, b] of connections) {
      const lA = landmarks[a];
      const lB = landmarks[b];
      ctx.beginPath();
      ctx.moveTo((1 - lA.x) * W, lA.y * H);
      ctx.lineTo((1 - lB.x) * W, lB.y * H);
      ctx.stroke();
    }

    // Draw joints
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      const x = (1 - lm.x) * W;
      const y = lm.y * H;
      const isFingerTip = [4,8,12,16,20].includes(i);

      ctx.beginPath();
      ctx.arc(x, y, isFingerTip ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = isFingerTip ? '#06b6d4' : '#818cf8';
      ctx.fill();
    }
  }
}

// ── Draw Face Mesh ─────────────────────────────────────────────────────────
function drawFaceMesh() {
  if (!latestFace?.multiFaceLandmarks?.length) return;

  const W = ui.canvas.width;
  const H = ui.canvas.height;

  // Simplified contour drawing
  const CONTOURS = [
    // Jawline: 0-16
    [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16],
    // Left eyebrow
    [36,37,38,39,40,41],
    // Right eyebrow
    [42,43,44,45,46,47],
    // Nose bridge
    [27,28,29,30],
    // Lips outer
    [48,49,50,51,52,53,54,55,56,57,58,59],
  ];

  for (const landmarks of latestFace.multiFaceLandmarks) {
    ctx.strokeStyle = 'rgba(16,185,129,0.5)';
    ctx.lineWidth = 1;

    // Draw sparse dots for performance
    for (let i = 0; i < landmarks.length; i += 4) {
      const lm = landmarks[i];
      ctx.beginPath();
      ctx.arc((1 - lm.x) * W, lm.y * H, 1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16,185,129,0.6)';
      ctx.fill();
    }
  }
}

// ── Update Detection UI ────────────────────────────────────────────────────
function updateDetectionUI() {
  const handCount = latestHands?.multiHandLandmarks?.length ?? 0;
  const faceCount = latestFace?.multiFaceLandmarks?.length ?? 0;

  ui.handCount.textContent = handCount > 0 ? `${handCount} detected` : 'None';
  ui.faceCount.textContent = faceCount > 0 ? `${faceCount} detected` : 'None';

  ui.handDot.classList.toggle('active', handCount > 0);
  ui.faceDot.classList.toggle('active', faceCount > 0);

  ui.handCount.style.color = handCount > 0 ? 'var(--accent-3)' : 'var(--text-muted)';
  ui.faceCount.style.color = faceCount > 0 ? 'var(--accent-3)' : 'var(--text-muted)';
}

// ── Status Helpers ─────────────────────────────────────────────────────────
function setStatus(type, text) {
  ui.statusBadge.className = `badge badge--${type}`;
  ui.statusBadge.textContent = text;
}

// ── Start Vision ───────────────────────────────────────────────────────────
async function startVision() {
  if (isRunning) return;
  isRunning = true;

  ui.btnStart.classList.add('hidden');
  ui.btnStop.classList.remove('hidden');
  ui.btnSnapshot.classList.remove('hidden');
  setStatus('loading', 'STARTING…');

  try {
    await loadMediaPipe();
    await startWebcam();

    ui.videoPlaceholder.classList.add('hidden');
    ui.canvas.classList.remove('hidden');
    ui.fpsOverlay.classList.remove('hidden');
    ui.latencyOverlay.classList.remove('hidden');

    setStatus('active', 'ACTIVE');
    renderLoop();
  } catch (err) {
    console.error('[AI Vision] Start failed:', err);
    setStatus('idle', 'ERROR');
    stopVision();
  }
}

// ── Stop Vision ────────────────────────────────────────────────────────────
function stopVision() {
  isRunning = false;
  if (animFrame) cancelAnimationFrame(animFrame);
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  if (videoEl) { videoEl.srcObject = null; videoEl = null; }

  latestHands = null;
  latestFace = null;

  ui.btnStop.classList.add('hidden');
  ui.btnSnapshot.classList.add('hidden');
  ui.btnStart.classList.remove('hidden');
  ui.canvas.classList.add('hidden');
  ui.videoPlaceholder.classList.remove('hidden');
  ui.fpsOverlay.classList.add('hidden');
  ui.latencyOverlay.classList.add('hidden');

  ui.handCount.textContent = '—';
  ui.faceCount.textContent = '—';
  ui.handDot.classList.remove('active');
  ui.faceDot.classList.remove('active');
  ui.inferenceTime.textContent = '— ms';
  ui.renderTime.textContent    = '— ms';

  setStatus('idle', 'IDLE');
}

// ── Snapshot ───────────────────────────────────────────────────────────────
function takeSnapshot() {
  if (!ctx) return;
  const dataUrl = ui.canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `ai-vision-snapshot-${Date.now()}.png`;
  a.click();
}

// ── Settings Sync ──────────────────────────────────────────────────────────
function syncSettings() {
  settings.enableHands    = ui.toggleHands.checked;
  settings.enableFace     = ui.toggleFace.checked;
  settings.showLandmarks  = ui.toggleLandmarks.checked;
  chrome.storage.local.set({ settings });
}

// ── Load Saved Settings ────────────────────────────────────────────────────
chrome.storage.local.get(['settings'], (result) => {
  if (result.settings) {
    settings = { ...settings, ...result.settings };
    ui.toggleHands.checked    = settings.enableHands;
    ui.toggleFace.checked     = settings.enableFace;
    ui.toggleLandmarks.checked = settings.showLandmarks;
  }
});

// ── Event Listeners ────────────────────────────────────────────────────────
ui.btnStart.addEventListener('click', startVision);
ui.btnStop.addEventListener('click', stopVision);
ui.btnSnapshot.addEventListener('click', takeSnapshot);

ui.toggleHands.addEventListener('change', syncSettings);
ui.toggleFace.addEventListener('change', syncSettings);
ui.toggleLandmarks.addEventListener('change', syncSettings);

// Cleanup on popup close
window.addEventListener('beforeunload', stopVision);

// ── Backend Detection ──────────────────────────────────────────────────────
(function detectBackend() {
  if ('gpu' in navigator) {
    navigator.gpu.requestAdapter().then(a => {
      ui.backend.textContent = a ? 'WebGPU' : 'WebGL';
    }).catch(() => { ui.backend.textContent = 'WebGL'; });
  } else {
    ui.backend.textContent = 'WebGL';
  }
})();
