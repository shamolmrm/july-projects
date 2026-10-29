// ─────────────────────────────────────────────────────────────────────────────
//  AI Vision Pro — Overlay Painter
//  Draws AI detection results onto a canvas context:
//  bounding boxes, landmarks, skeleton connections, labels, masks
// ─────────────────────────────────────────────────────────────────────────────

import type {
  InferenceResult,
  HandDetection,
  FaceDetection,
  PoseDetection,
  ObjectDetection,
  NormalizedPoint,
} from '@/types/ai.types';
import type { AppSettings } from '@/types/messages.types';
import { HAND_CONNECTIONS, POSE_CONNECTIONS } from '@/config/ai.config';

type DrawContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Theme color palettes */
const THEMES = {
  'indigo-cyan': {
    primary:    '#818cf8',
    secondary:  '#06b6d4',
    tertiary:   '#c084fc',
    text:       '#f1f5f9',
    box:        '#818cf8',
  },
  'green-emerald': {
    primary:    '#22c55e',
    secondary:  '#10b981',
    tertiary:   '#84cc16',
    text:       '#f0fdf4',
    box:        '#22c55e',
  },
  'orange-red': {
    primary:    '#f97316',
    secondary:  '#ef4444',
    tertiary:   '#fbbf24',
    text:       '#fff7ed',
    box:        '#f97316',
  },
  'purple-pink': {
    primary:    '#a855f7',
    secondary:  '#ec4899',
    tertiary:   '#f43f5e',
    text:       '#fdf4ff',
    box:        '#a855f7',
  },
} as const;

/**
 * High-performance overlay painter.
 * All drawing is batched per frame to minimize state changes.
 */
export class OverlayPainter {
  private theme: typeof THEMES['indigo-cyan'];

  constructor(private readonly settings: Pick<AppSettings, 'overlayTheme' | 'showLandmarks' | 'showBoundingBoxes' | 'showLabels'>) {
    this.theme = THEMES[settings.overlayTheme] ?? THEMES['indigo-cyan'];
  }

  /**
   * Main entry: paints all inference results onto the context
   */
  paint(
    ctx: DrawContext,
    result: InferenceResult,
    canvasWidth: number,
    canvasHeight: number,
    mirrored = true,
  ): void {
    const W = canvasWidth;
    const H = canvasHeight;

    // Batch save state
    ctx.save();

    // Mirror transform if needed
    if (mirrored) {
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    }

    if (result.hands?.length) {
      for (const hand of result.hands) {
        this.drawHand(ctx, hand, W, H);
      }
    }

    if (result.faces?.length) {
      for (const face of result.faces) {
        this.drawFace(ctx, face, W, H);
      }
    }

    if (result.poses?.length) {
      for (const pose of result.poses) {
        this.drawPose(ctx, pose, W, H);
      }
    }

    if (result.objects?.length) {
      // Objects use pixel coords (not normalized), skip mirror transform
      ctx.restore();
      ctx.save();
      for (const obj of result.objects) {
        this.drawObject(ctx, obj, W, H);
      }
    }

    ctx.restore();
  }

  /**
   * Update theme at runtime
   */
  setTheme(theme: AppSettings['overlayTheme']): void {
    this.theme = THEMES[theme] ?? THEMES['indigo-cyan'];
  }

  // ── Hand overlay ───────────────────────────────────────────────────────

  private drawHand(ctx: DrawContext, hand: HandDetection, W: number, H: number): void {
    const lms = hand.landmarks;
    const col = this.theme.primary;
    const tipCol = this.theme.secondary;

    // Draw connections
    if (this.settings.showLandmarks) {
      ctx.strokeStyle = col + 'bb';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';

      for (const [a, b] of HAND_CONNECTIONS) {
        const lA = lms[a];
        const lB = lms[b];
        if (!lA || !lB) continue;
        ctx.beginPath();
        ctx.moveTo(lA.x * W, lA.y * H);
        ctx.lineTo(lB.x * W, lB.y * H);
        ctx.stroke();
      }

      // Draw joints
      const FINGER_TIPS = new Set([4, 8, 12, 16, 20]);
      for (let i = 0; i < lms.length; i++) {
        const lm = lms[i];
        if (!lm) continue;
        const isTip = FINGER_TIPS.has(i);
        const r = isTip ? 6 : 3.5;

        ctx.beginPath();
        ctx.arc(lm.x * W, lm.y * H, r, 0, Math.PI * 2);
        ctx.fillStyle = isTip ? tipCol : col;
        ctx.fill();

        // Glow effect on tips
        if (isTip) {
          ctx.beginPath();
          ctx.arc(lm.x * W, lm.y * H, r + 3, 0, Math.PI * 2);
          ctx.fillStyle = tipCol + '40';
          ctx.fill();
        }
      }
    }

    // Draw bounding box
    if (this.settings.showBoundingBoxes) {
      this.drawBoundingBox(ctx, hand.boundingBox, W, H, this.theme.box, `${hand.handedness} Hand`);
    }
  }

  // ── Face overlay ───────────────────────────────────────────────────────

  private drawFace(ctx: DrawContext, face: FaceDetection, W: number, H: number): void {
    if (this.settings.showLandmarks && face.landmarks.length) {
      // Draw sparse landmarks for performance (every 4th point)
      ctx.fillStyle = this.theme.secondary + '99';
      for (let i = 0; i < face.landmarks.length; i += 4) {
        const lm = face.landmarks[i];
        if (!lm) continue;
        ctx.beginPath();
        ctx.arc(lm.x * W, lm.y * H, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw key face contours
      this.drawFaceContour(ctx, face.landmarks, W, H, [
        // Jawline approximate
        10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
        397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
        172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10
      ]);

      // Draw eye contours
      this.drawFaceContour(ctx, face.landmarks, W, H, [
        33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33
      ]);
      this.drawFaceContour(ctx, face.landmarks, W, H, [
        362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 362
      ]);
    }

    if (this.settings.showBoundingBoxes) {
      this.drawBoundingBox(ctx, face.boundingBox, W, H, this.theme.secondary, 'Face');
    }
  }

  private drawFaceContour(
    ctx: DrawContext,
    landmarks: NormalizedPoint[],
    W: number, H: number,
    indices: number[],
  ): void {
    if (indices.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = this.theme.secondary + '66';
    ctx.lineWidth = 1;

    const first = landmarks[indices[0]!];
    if (!first) return;
    ctx.moveTo(first.x * W, first.y * H);

    for (let k = 1; k < indices.length; k++) {
      const lm = landmarks[indices[k]!];
      if (!lm) continue;
      ctx.lineTo(lm.x * W, lm.y * H);
    }
    ctx.stroke();
  }

  // ── Pose overlay ───────────────────────────────────────────────────────

  private drawPose(ctx: DrawContext, pose: PoseDetection, W: number, H: number): void {
    if (!this.settings.showLandmarks) return;

    const lms = pose.landmarks;
    const col = this.theme.tertiary;

    // Draw skeleton connections
    ctx.strokeStyle = col + 'cc';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    for (const [a, b] of POSE_CONNECTIONS) {
      const lA = lms[a];
      const lB = lms[b];
      if (!lA || !lB) continue;
      if ((lA.visibility ?? 1) < 0.5 || (lB.visibility ?? 1) < 0.5) continue;

      ctx.beginPath();
      ctx.moveTo(lA.x * W, lA.y * H);
      ctx.lineTo(lB.x * W, lB.y * H);
      ctx.stroke();
    }

    // Draw joints
    for (const lm of lms) {
      if ((lm.visibility ?? 1) < 0.5) continue;
      ctx.beginPath();
      ctx.arc(lm.x * W, lm.y * H, 4, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    }
  }

  // ── Object overlay ─────────────────────────────────────────────────────

  private drawObject(ctx: DrawContext, obj: ObjectDetection, W: number, H: number): void {
    const { boundingBox, label, score } = obj;

    // Convert normalized to pixels
    const x = boundingBox.xMin;
    const y = boundingBox.yMin;
    const w = boundingBox.width;
    const h = boundingBox.height;

    // Bounding box
    ctx.strokeStyle = this.theme.box;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // Fill with translucent color
    ctx.fillStyle = this.theme.box + '22';
    ctx.fillRect(x, y, w, h);

    // Label
    if (this.settings.showLabels) {
      const labelText = `${label} ${(score * 100).toFixed(0)}%`;
      const fontSize = 13;
      ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;

      const textW = ctx.measureText(labelText).width;
      const padX = 6, padY = 4;
      const tagH = fontSize + padY * 2;
      const tagY = Math.max(0, y - tagH);

      ctx.fillStyle = this.theme.box;
      ctx.fillRect(x - 1, tagY, textW + padX * 2, tagH);

      ctx.fillStyle = '#000';
      ctx.fillText(labelText, x + padX - 1, tagY + fontSize + padY - 2);
    }
  }

  // ── Shared helpers ─────────────────────────────────────────────────────

  private drawBoundingBox(
    ctx: DrawContext,
    box: { xMin: number; yMin: number; width: number; height: number; score: number },
    W: number, H: number,
    color: string,
    label?: string,
  ): void {
    const x = box.xMin * W;
    const y = box.yMin * H;
    const w = box.width * W;
    const h = box.height * H;

    // Rounded bounding box using bezier corners
    const r = 6;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Label tag
    if (label && this.settings.showLabels) {
      const scoreText = ` ${(box.score * 100).toFixed(0)}%`;
      const text = label + scoreText;
      const fontSize = 11;
      ctx.font = `500 ${fontSize}px Inter, system-ui, sans-serif`;
      const tw = ctx.measureText(text).width;
      const tagH = fontSize + 8;

      ctx.fillStyle = color + 'ee';
      ctx.beginPath();
      ctx.roundRect?.(x, y - tagH - 2, tw + 12, tagH, 4);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.fillText(text, x + 6, y - 8);
    }
  }

  /**
   * Draws the performance HUD overlay
   */
  paintHUD(
    ctx: DrawContext,
    fps: number,
    inferenceMs: number,
    renderMs: number,
    canvasWidth: number,
  ): void {
    const x = canvasWidth - 10;
    const y = 10;
    const lineH = 18;
    const fontSize = 11;

    ctx.font = `500 ${fontSize}px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'right';

    const lines = [
      { label: 'FPS', value: String(fps), color: fps >= 24 ? '#22c55e' : fps >= 15 ? '#f59e0b' : '#ef4444' },
      { label: 'INF', value: `${inferenceMs.toFixed(0)}ms`, color: inferenceMs < 100 ? '#22c55e' : '#f59e0b' },
      { label: 'RND', value: `${renderMs.toFixed(0)}ms`, color: '#818cf8' },
    ];

    lines.forEach((line, i) => {
      const yPos = y + i * lineH;

      // Background pill
      const text = `${line.label}: ${line.value}`;
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = '#00000088';
      ctx.beginPath();
      ctx.roundRect?.(x - tw - 12, yPos, tw + 12, lineH - 2, 4);
      ctx.fill();

      ctx.fillStyle = line.color;
      ctx.fillText(text, x - 6, yPos + fontSize - 1);
    });

    ctx.textAlign = 'left'; // Reset
  }
}
