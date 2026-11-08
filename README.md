# AI Vision Pro — Chrome Extension (WebRTC + on-device AI)

Real-time webcam AI inside a Chrome extension (Manifest V3). All inference runs locally in the browser — no video leaves the machine.

## What's inside

| Folder | What it is |
|---|---|
| [`1/`](1/) | **Proof of concept** — plain JS MV3 extension: MediaPipe Hands (21 landmarks) + FaceMesh (478 points), canvas overlay, popup, side panel, offscreen document, standalone `demo.html` and `benchmark.html`. |
| `Chrome Extension & WebRTC Developer/` | **Production rebuild** — React + TypeScript + Vite. Face detection, hand tracking, pose estimation and object detection with MediaPipe, TensorFlow.js and ONNX Runtime Web; WebRTC media pipeline, WebGPU acceleration, workers. Build plan in `implementation_plan.md`. |

## Tech stack
Chrome Extension MV3 · WebRTC / getUserMedia · MediaPipe · TensorFlow.js · ONNX Runtime Web · WebGPU · OffscreenCanvas · Service Worker · React · TypeScript · Vite

## Run
**PoC:** `chrome://extensions` → Developer mode → *Load unpacked* → select `1/`. Or open `1/demo.html` directly.

**Production version:**
```bash
cd "Chrome Extension & WebRTC Developer"
npm install
npm run build      # then Load unpacked → dist/
```
