# 🧿 AI Vision Pro — Chrome Extension PoC

> Real-time webcam AI processing with MediaPipe running 100% locally in the browser.
> Built as a **Proof of Concept** for Chrome Extension & WebRTC + AI/CV developer role.

---

## 🚀 Tech Stack

| Technology | Usage |
|---|---|
| **Chrome Extension MV3** | Extension architecture |
| **WebRTC / getUserMedia** | Webcam access |
| **MediaPipe Hands** | 21-point hand landmark detection |
| **MediaPipe FaceMesh** | 478-point face mesh |
| **Canvas API** | Real-time overlay rendering |
| **OffscreenCanvas / Document** | MV3 background processing |
| **WebGPU** | GPU-accelerated inference (if supported) |
| **Service Worker** | MV3 background script |

---

## 📁 Project Structure

```
ai-vision-pro/
├── manifest.json              # Chrome Extension MV3 manifest
├── demo.html                  # ✅ Standalone demo (open directly in browser)
├── background/
│   └── service-worker.js      # MV3 Service Worker
├── popup/
│   ├── popup.html             # Extension popup UI
│   ├── popup.css              # Dark glassmorphism styles
│   └── popup.js               # Popup controller + MediaPipe
└── offscreen/
    ├── offscreen.html         # MV3 offscreen document
    └── offscreen.js           # Background AI processor
```

---

## 🖥️ Running the Demo (Fastest)

1. Open `demo.html` directly in Chrome
2. Click **"Start Vision"**
3. Allow webcam access
4. See real-time hand tracking + face mesh!

> ℹ️ No build step required. MediaPipe loads from CDN.

---

## 🔌 Loading as Chrome Extension

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer Mode** (top right)
3. Click **"Load unpacked"**
4. Select this folder (`ai-vision-pro/`)
5. Click the extension icon in toolbar
6. Click **"Start Vision"** in popup

---

## 🤖 Features

### Real-time Detections
- ✅ **Hand Tracking** — 21 landmarks per hand, up to 2 hands
- ✅ **Face Mesh** — 478 landmark face mesh with iris refinement
- ✅ **Fingertip Detection** — Special highlighting for fingertips

### Performance Dashboard
- ✅ Live **FPS counter**
- ✅ **Inference time** per frame (ms)
- ✅ **Render time** per frame (ms)
- ✅ **Confidence scores** with animated bars
- ✅ WebGPU vs WebGL backend detection

### Controls
- ✅ Toggle hand/face detection independently
- ✅ Toggle landmarks / connections
- ✅ Mirror video
- ✅ Save snapshot (PNG)

---

## 🏗️ Architecture (MV3)

```
📷 Webcam (getUserMedia)
    ↓
🎞️ MediaStream / MediaStreamTrack
    ↓
🖥️ Offscreen Document (MV3 — avoids blocking)
    ↓
🤖 AI Inference (MediaPipe / TensorFlow.js / ONNX)
    ↓
🎨 Canvas Overlay Rendering
    ↓
👁️ User sees result
```

---

## 📊 PoC Evaluation Areas

| Area | Status | Notes |
|---|---|---|
| Real-time webcam processing | ✅ | 30fps target, Canvas rendering |
| AI/CV integration | ✅ | MediaPipe Hands + FaceMesh |
| Browser-based rendering | ✅ | Canvas 2D, WebGL |
| MediaStream manipulation | ✅ | getUserMedia, track controls |
| Chrome Extension architecture | ✅ | Full MV3 setup |
| Performance optimization | ✅ | Throttled inference, async |
| Local vs cloud inference | ✅ | 100% local (no server needed) |
| Technical feasibility | ✅ | **FEASIBLE** |

---

## 🔧 Next Steps (MVP)

1. **WebGPU acceleration** — 3-5x faster inference
2. **OffscreenCanvas** — Process frames off main thread
3. **Custom TF.js model** — Train domain-specific model
4. **WebRTC streaming** — Stream processed video to peers
5. **ONNX Runtime Web** — More model format support
6. **Chrome Side Panel** — Better UX than popup
7. **Persistent background** — Service worker optimizations

---

*Built with ❤️ as a technical proof of concept*
