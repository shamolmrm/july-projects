// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Content Script
//  Injected into web pages. Intercepts <video> elements and overlays AI detections.
//  Also provides a floating control panel for activating vision on any video.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const EXTENSION_ID = chrome.runtime.id;
let floatingPanel = null;
let activeCanvas = null;
let activeVideo = null;
let isProcessing = false;

// ── Styles ────────────────────────────────────────────────────────────────
const PANEL_STYLES = `
  #ai-vision-panel {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    background: rgba(10,11,20,0.92);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(129,140,248,0.35);
    border-radius: 14px;
    padding: 14px;
    width: 220px;
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 12px;
    color: #f0f4ff;
    box-shadow: 0 0 30px rgba(129,140,248,0.2), 0 8px 32px rgba(0,0,0,0.5);
    user-select: none;
  }
  #ai-vision-panel .avp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  #ai-vision-panel .avp-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    font-size: 13px;
  }
  #ai-vision-panel .avp-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #475569;
    transition: all 0.3s;
  }
  #ai-vision-panel .avp-dot.active {
    background: #10b981;
    box-shadow: 0 0 6px rgba(16,185,129,0.6);
    animation: avp-pulse 1.5s ease infinite;
  }
  @keyframes avp-pulse {
    0%,100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  #ai-vision-panel .avp-close {
    cursor: pointer;
    color: #475569;
    font-size: 16px;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    transition: color 0.2s, background 0.2s;
    background: none;
    border: none;
  }
  #ai-vision-panel .avp-close:hover {
    color: #f43f5e;
    background: rgba(244,63,94,0.1);
  }
  #ai-vision-panel .avp-info {
    font-size: 11px;
    color: #64748b;
    margin-bottom: 10px;
    line-height: 1.5;
  }
  #ai-vision-panel .avp-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-bottom: 10px;
  }
  #ai-vision-panel .avp-stat {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(129,140,248,0.12);
    border-radius: 8px;
    padding: 7px 9px;
  }
  #ai-vision-panel .avp-stat-label {
    font-size: 9px;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
  }
  #ai-vision-panel .avp-stat-val {
    font-size: 14px;
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
    color: #818cf8;
    margin-top: 2px;
  }
  #ai-vision-panel .avp-btn {
    width: 100%;
    padding: 9px;
    border-radius: 8px;
    border: 1px solid;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    margin-top: 4px;
  }
  #ai-vision-panel .avp-btn-start {
    background: rgba(129,140,248,0.15);
    border-color: #818cf8;
    color: #818cf8;
  }
  #ai-vision-panel .avp-btn-start:hover {
    background: rgba(129,140,248,0.3);
    box-shadow: 0 0 16px rgba(129,140,248,0.25);
  }
  #ai-vision-panel .avp-btn-stop {
    background: rgba(244,63,94,0.1);
    border-color: #f43f5e;
    color: #f43f5e;
  }
  #ai-vision-panel .avp-canvas-overlay {
    position: absolute;
    top: 0; left: 0;
    pointer-events: none;
    z-index: 9999;
  }
`;

// ── Inject CSS ─────────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('ai-vision-styles')) return;
  const style = document.createElement('style');
  style.id = 'ai-vision-styles';
  style.textContent = PANEL_STYLES;
  document.head.appendChild(style);
}

// ── Create Floating Panel ─────────────────────────────────────────────────
function createPanel() {
  if (floatingPanel) return;
  injectStyles();

  floatingPanel = document.createElement('div');
  floatingPanel.id = 'ai-vision-panel';
  floatingPanel.innerHTML = `
    <div class="avp-header">
      <div class="avp-title">
        <div class="avp-dot" id="avp-dot"></div>
        🧿 AI Vision
      </div>
      <button class="avp-close" id="avp-close">✕</button>
    </div>
    <div class="avp-info" id="avp-info">
      Activate AI vision on this page's video elements
    </div>
    <div class="avp-stats">
      <div class="avp-stat">
        <div class="avp-stat-label">Hands</div>
        <div class="avp-stat-val" id="avp-hands">—</div>
      </div>
      <div class="avp-stat">
        <div class="avp-stat-label">Face</div>
        <div class="avp-stat-val" id="avp-face">—</div>
      </div>
      <div class="avp-stat">
        <div class="avp-stat-label">FPS</div>
        <div class="avp-stat-val" id="avp-fps">—</div>
      </div>
      <div class="avp-stat">
        <div class="avp-stat-label">Latency</div>
        <div class="avp-stat-val" id="avp-lat">—</div>
      </div>
    </div>
    <button class="avp-btn avp-btn-start" id="avp-start">▶ Start Vision</button>
  `;

  document.body.appendChild(floatingPanel);

  // Draggable panel
  makeDraggable(floatingPanel);

  document.getElementById('avp-close').onclick = removePanel;
  document.getElementById('avp-start').onclick = toggleVision;
}

// ── Draggable ─────────────────────────────────────────────────────────────
function makeDraggable(el) {
  let ox = 0, oy = 0, x = 0, y = 0;
  const header = el.querySelector('.avp-header');

  header.style.cursor = 'grab';
  header.onmousedown = e => {
    e.preventDefault();
    ox = e.clientX - el.offsetLeft;
    oy = e.clientY - el.offsetTop;
    document.onmousemove = ev => {
      x = ev.clientX - ox;
      y = ev.clientY - oy;
      el.style.left = x + 'px';
      el.style.top  = y + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    };
    document.onmouseup = () => {
      document.onmousemove = null;
      document.onmouseup = null;
    };
    header.style.cursor = 'grabbing';
  };
}

// ── Toggle Vision ─────────────────────────────────────────────────────────
function toggleVision() {
  if (isProcessing) {
    stopVision();
  } else {
    startVision();
  }
}

function startVision() {
  // Find the largest video element on the page
  const videos = Array.from(document.querySelectorAll('video'))
    .filter(v => v.videoWidth > 0 && !v.paused);

  if (videos.length === 0) {
    document.getElementById('avp-info').textContent =
      '⚠️ No active video found on this page';
    return;
  }

  // Pick largest video
  activeVideo = videos.reduce((best, v) =>
    (v.videoWidth * v.videoHeight > best.videoWidth * best.videoHeight) ? v : best
  );

  // Create overlay canvas
  activeCanvas = createOverlayCanvas(activeVideo);
  isProcessing = true;

  const btn = document.getElementById('avp-start');
  btn.textContent = '■ Stop Vision';
  btn.className = 'avp-btn avp-btn-stop';
  document.getElementById('avp-dot').classList.add('active');
  document.getElementById('avp-info').textContent =
    `Processing ${activeVideo.videoWidth}×${activeVideo.videoHeight} video`;

  // Notify background
  chrome.runtime.sendMessage({
    type: 'CONTENT_VISION_STARTED',
    url: window.location.href,
    resolution: `${activeVideo.videoWidth}×${activeVideo.videoHeight}`
  });

  renderLoop();
}

function stopVision() {
  isProcessing = false;
  if (activeCanvas) {
    activeCanvas.remove();
    activeCanvas = null;
  }
  activeVideo = null;

  const btn = document.getElementById('avp-start');
  if (btn) {
    btn.textContent = '▶ Start Vision';
    btn.className = 'avp-btn avp-btn-start';
  }
  const dot = document.getElementById('avp-dot');
  if (dot) dot.classList.remove('active');

  document.getElementById('avp-hands').textContent = '—';
  document.getElementById('avp-face').textContent = '—';
  document.getElementById('avp-fps').textContent = '—';
  document.getElementById('avp-lat').textContent = '—';
}

// ── Overlay Canvas ────────────────────────────────────────────────────────
function createOverlayCanvas(video) {
  const canvas = document.createElement('canvas');
  canvas.className = 'avp-canvas-overlay';

  const rect = video.getBoundingClientRect();
  canvas.style.position = 'fixed';
  canvas.style.left = rect.left + 'px';
  canvas.style.top = rect.top + 'px';
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '2147483646';
  canvas.width = rect.width;
  canvas.height = rect.height;

  document.body.appendChild(canvas);

  // Keep canvas aligned on resize/scroll
  window.addEventListener('resize', () => syncCanvas(video, canvas));
  window.addEventListener('scroll', () => syncCanvas(video, canvas));

  return canvas;
}

function syncCanvas(video, canvas) {
  const rect = video.getBoundingClientRect();
  canvas.style.left   = rect.left + 'px';
  canvas.style.top    = rect.top + 'px';
  canvas.style.width  = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  canvas.width  = rect.width;
  canvas.height = rect.height;
}

// ── Render Loop (Skeleton — MediaPipe to be injected) ─────────────────────
let frameCount = 0;
let lastFpsTime = Date.now();
let fps = 0;

function renderLoop() {
  if (!isProcessing || !activeCanvas || !activeVideo) return;

  const t0 = performance.now();
  const ctx = activeCanvas.getContext('2d');
  const w = activeCanvas.width;
  const h = activeCanvas.height;

  // Clear previous frame
  ctx.clearRect(0, 0, w, h);

  // Draw scanline overlay (visual indicator that AI is active)
  ctx.strokeStyle = 'rgba(129,140,248,0.15)';
  ctx.lineWidth = 1;
  for (let y = 0; y < h; y += 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Corner brackets (HUD effect)
  drawCornerBrackets(ctx, w, h);

  const latency = (performance.now() - t0).toFixed(1);

  // FPS counter
  frameCount++;
  const now = Date.now();
  if (now - lastFpsTime >= 1000) {
    fps = frameCount;
    frameCount = 0;
    lastFpsTime = now;
    const fpsEl = document.getElementById('avp-fps');
    const latEl = document.getElementById('avp-lat');
    if (fpsEl) fpsEl.textContent = fps;
    if (latEl) latEl.textContent = latency + 'ms';
  }

  requestAnimationFrame(renderLoop);
}

// ── HUD Corner Brackets ───────────────────────────────────────────────────
function drawCornerBrackets(ctx, w, h) {
  const size = Math.min(w, h) * 0.06;
  const thickness = 2;
  const color = 'rgba(129,140,248,0.8)';
  const corners = [
    [0,    0,    1,  1 ],
    [w,    0,    -1, 1 ],
    [0,    h,    1,  -1],
    [w,    h,    -1, -1],
  ];

  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;
  ctx.lineCap = 'round';

  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + dx * size, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * size);
    ctx.stroke();
  }

  // Center crosshair
  const cx = w / 2, cy = h / 2;
  const crossSize = Math.min(w, h) * 0.02;
  ctx.strokeStyle = 'rgba(6,182,212,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - crossSize, cy);
  ctx.lineTo(cx + crossSize, cy);
  ctx.moveTo(cx, cy - crossSize);
  ctx.lineTo(cx, cy + crossSize);
  ctx.stroke();
}

// ── Remove Panel ──────────────────────────────────────────────────────────
function removePanel() {
  stopVision();
  if (floatingPanel) {
    floatingPanel.remove();
    floatingPanel = null;
  }
}

// ── Message Listener (from popup/background) ──────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SHOW_PANEL') {
    createPanel();
    sendResponse({ shown: true });
  }

  if (message.type === 'HIDE_PANEL') {
    removePanel();
    sendResponse({ hidden: true });
  }

  if (message.type === 'GET_VIDEO_INFO') {
    const videos = document.querySelectorAll('video');
    sendResponse({
      count: videos.length,
      videos: Array.from(videos).map(v => ({
        width: v.videoWidth,
        height: v.videoHeight,
        paused: v.paused,
        src: v.src || v.currentSrc,
      }))
    });
  }

  return true;
});

// ── Auto-detect Video Pages ────────────────────────────────────────────────
function checkForVideos() {
  const videos = document.querySelectorAll('video');
  if (videos.length > 0 && !floatingPanel) {
    // Auto-show panel on pages with video (optional — can be toggled)
    // createPanel(); // Uncomment to auto-show
    chrome.runtime.sendMessage({
      type: 'CONTENT_VIDEO_FOUND',
      count: videos.length,
      url: window.location.href
    });
  }
}

// Run check on load and on SPA navigation
checkForVideos();
const observer = new MutationObserver(() => checkForVideos());
observer.observe(document.body, { childList: true, subtree: true });

console.log('[AI Vision Pro] Content script loaded on:', window.location.href);
