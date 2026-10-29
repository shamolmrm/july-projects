# AI Vision Pro — Complete Production Chrome Extension

## Overview

Full production-ready Chrome Extension (Manifest V3) with real-time webcam AI inference using MediaPipe, TensorFlow.js, and ONNX Runtime Web. Built with React + TypeScript + Vite, WebRTC media pipeline, OffscreenCanvas + Web Workers, performance benchmarking, and enterprise-grade architecture.

The existing project at `d:\devloper\July\1` has a solid foundation (MV3, side panel, offscreen, popup). We will **completely overhaul** it into a production system.

## Architecture: 15-Phase Build Plan

### Phase 1 — Architecture Documents (Artifact)
- High Level Architecture diagram (mermaid)
- Component / Data Flow / Extension / AI / Rendering Pipeline diagrams

### Phase 2 — Folder Structure
Complete scalable folder structure inside `d:\devloper\July\Chrome Extension & WebRTC Developer\`

### Phase 3 — Manifest V3 (Complete)
Full permissions: camera, microphone, storage, tabs, scripting, activeTab, offscreen, sidePanel

### Phase 4 — Webcam Capture Service
Multi-camera, resolution switching, device selection, microphone, error handling

### Phase 5 — WebRTC Media Pipeline
Frame extraction, synchronization, track cloning, video + audio pipelines

### Phase 6 — AI Inference Engine
Abstraction layer over TensorFlow.js + MediaPipe + ONNX Runtime Web
Models: Face, Pose, Object, Segmentation, Tracking

### Phase 7 — Rendering Pipeline
Canvas + OffscreenCanvas + WebGL, overlays: boxes, landmarks, masks, labels

### Phase 8 — Performance Optimization
requestVideoFrameCallback, frame skipping, queue, Worker threads, memory pools, GC reduction

### Phase 9 — Benchmark System
FPS, inference time, render time, CPU, memory, dropped frames, latency — exportable report

### Phase 10 — Security Layer
Permission validation, message validation, CSP, secure message passing

### Phase 11 — React UI (Complete)
Dashboard, camera/model selectors, performance monitor, FPS/CPU/memory/latency, logs, settings

### Phase 12 — Full TypeScript Implementation
Every file production-ready, no TODOs, no placeholders

### Phase 13 — Documentation (README + Architecture)

### Phase 14 — Technical Feasibility Report

## Proposed File Structure

```
d:\devloper\July\Chrome Extension & WebRTC Developer\
├── manifest.json                     ← MV3 manifest
├── package.json                      ← Vite + React + TS deps
├── vite.config.ts                    ← Vite build config
├── tsconfig.json
├── tsconfig.node.json
├── .eslintrc.json
├── README.md
├── ARCHITECTURE.md
├── FEASIBILITY_REPORT.md
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── types/                        ← Global TypeScript types
│   │   ├── index.ts
│   │   ├── ai.types.ts
│   │   ├── media.types.ts
│   │   ├── performance.types.ts
│   │   └── messages.types.ts
│   ├── config/                       ← App-wide constants & config
│   │   ├── index.ts
│   │   ├── ai.config.ts
│   │   ├── media.config.ts
│   │   └── performance.config.ts
│   ├── shared/                       ← Utilities shared across all contexts
│   │   ├── utils/
│   │   │   ├── logger.ts
│   │   │   ├── validators.ts
│   │   │   ├── serializer.ts
│   │   │   └── timing.ts
│   │   └── messaging/
│   │       ├── MessageBus.ts
│   │       └── MessageValidator.ts
│   ├── background/                   ← MV3 Service Worker
│   │   ├── service-worker.ts
│   │   ├── OffscreenManager.ts
│   │   ├── StorageManager.ts
│   │   ├── TabManager.ts
│   │   └── MessageRouter.ts
│   ├── offscreen/                    ← Offscreen document context
│   │   ├── offscreen.html
│   │   ├── offscreen.ts
│   │   ├── OffscreenOrchestrator.ts
│   │   └── WorkerPool.ts
│   ├── workers/                      ← Web Workers
│   │   ├── inference.worker.ts       ← AI inference worker
│   │   ├── render.worker.ts          ← OffscreenCanvas render worker
│   │   └── benchmark.worker.ts      ← Benchmark computation worker
│   ├── services/                     ← Core service layer
│   │   ├── media/
│   │   │   ├── CameraService.ts      ← Multi-cam, resolution, permissions
│   │   │   ├── MicrophoneService.ts
│   │   │   ├── MediaStreamService.ts
│   │   │   └── DeviceEnumerator.ts
│   │   ├── pipeline/
│   │   │   ├── VideoPipeline.ts      ← Frame extraction, sync, clone
│   │   │   ├── AudioPipeline.ts
│   │   │   ├── FrameQueue.ts
│   │   │   └── FrameSynchronizer.ts
│   │   ├── ai/
│   │   │   ├── InferenceEngine.ts    ← Abstract base
│   │   │   ├── TensorFlowEngine.ts   ← TF.js backend
│   │   │   ├── MediaPipeEngine.ts    ← MediaPipe backend
│   │   │   ├── OnnxEngine.ts         ← ONNX Runtime Web
│   │   │   ├── ModelRegistry.ts      ← Model loader + cache
│   │   │   └── InferenceScheduler.ts ← Frame skip, throttle
│   │   ├── rendering/
│   │   │   ├── RenderEngine.ts       ← Abstract base
│   │   │   ├── CanvasRenderer.ts
│   │   │   ├── WebGLRenderer.ts
│   │   │   ├── OffscreenRenderer.ts
│   │   │   ├── OverlayPainter.ts     ← Boxes, landmarks, masks, labels
│   │   │   └── FrameBuffer.ts
│   │   ├── performance/
│   │   │   ├── PerformanceMonitor.ts ← FPS, inference, render
│   │   │   ├── FrameRateController.ts
│   │   │   ├── MemoryPool.ts
│   │   │   └── GCOptimizer.ts
│   │   └── benchmark/
│   │       ├── BenchmarkRunner.ts
│   │       ├── BenchmarkReport.ts
│   │       └── MetricsCollector.ts
│   ├── api/                          ← Cloud inference API layer
│   │   ├── CloudInferenceClient.ts
│   │   ├── ApiConfig.ts
│   │   └── RetryPolicy.ts
│   ├── vision/                       ← Vision model implementations
│   │   ├── models/
│   │   │   ├── FaceDetectionModel.ts
│   │   │   ├── PoseDetectionModel.ts
│   │   │   ├── ObjectDetectionModel.ts
│   │   │   ├── SegmentationModel.ts
│   │   │   └── TrackingModel.ts
│   │   └── postprocessing/
│   │       ├── NMSSuppressor.ts
│   │       ├── CoordinateNormalizer.ts
│   │       └── ResultAggregator.ts
│   ├── content/                      ← Content script
│   │   ├── content.ts
│   │   ├── FloatingPanel.ts
│   │   └── content.css
│   ├── popup/                        ← React popup app
│   │   ├── index.html
│   │   ├── index.tsx
│   │   ├── App.tsx
│   │   └── popup.css
│   ├── sidepanel/                    ← React side panel app
│   │   ├── index.html
│   │   ├── index.tsx
│   │   ├── App.tsx
│   │   └── sidepanel.css
│   └── components/                   ← Shared React components
│       ├── ui/
│       │   ├── Button.tsx
│       │   ├── Badge.tsx
│       │   ├── Card.tsx
│       │   ├── Toggle.tsx
│       │   ├── Slider.tsx
│       │   └── Select.tsx
│       ├── dashboard/
│       │   ├── Dashboard.tsx
│       │   ├── VideoFeed.tsx
│       │   ├── OverlayCanvas.tsx
│       │   └── StatusBar.tsx
│       ├── camera/
│       │   ├── CameraSelector.tsx
│       │   └── ResolutionPicker.tsx
│       ├── performance/
│       │   ├── PerformanceMonitor.tsx
│       │   ├── FPSGauge.tsx
│       │   ├── LatencyChart.tsx
│       │   └── MemoryGraph.tsx
│       ├── models/
│       │   ├── ModelSelector.tsx
│       │   └── ModelStatus.tsx
│       ├── benchmark/
│       │   ├── BenchmarkPanel.tsx
│       │   └── BenchmarkReport.tsx
│       ├── logs/
│       │   └── LogViewer.tsx
│       └── settings/
│           └── SettingsPanel.tsx
├── public/                           ← Static assets
│   └── icons/
└── dist/                             ← Built extension (gitignored)
```

## Verification Plan

1. `npm run build` completes without errors
2. Load unpacked extension in Chrome
3. Popup opens with React UI  
4. Camera starts, MediaPipe runs, landmarks render
5. Benchmark shows FPS > 20, inference < 100ms
6. Side panel dashboard operational
