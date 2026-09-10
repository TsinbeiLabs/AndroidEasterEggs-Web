import { drawGrid, GINGERBREAD_PALETTE, ICS_PLATLOGO } from '../../core/pixelart';
import type { Egg, EggContext } from '../../core/types';

/**
 * Android 2.3 Gingerbread — a single full screen illustration of a zombie
 * android, credited to Jack Larson. Upstream just shows a JPEG and toasts the
 * credit on every ACTION_UP, so this is a stylised vector redraw of the same
 * composition (720 x 480 reference frame, FIT_CENTER).
 */

const REF_W = 720;
const REF_H = 480;

const SKY_STOPS: Array<[number, string]> = [
  [0, '#1b2030'],
  [0.42, '#2E447B'],
  [0.78, '#3d4a5c'],
  [1, '#516577'],
];

/** Pale blobs (moon / tombstones / highlights) measured from the original art. */
const BLOBS: Array<{ x: number; y: number; w: number; h: number; round: boolean }> = [
  { x: 664, y: 76, w: 48, h: 64, round: true },
  { x: 342, y: 106, w: 66, h: 110, round: false },
  { x: 152, y: 64, w: 52, h: 94, round: false },
  { x: 146, y: 230, w: 26, h: 44, round: false },
  { x: 292, y: 404, w: 41, h: 40, round: false },
];

interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
}

function makeStars(random: () => number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < 70; i++) {
    stars.push({
      x: random() * REF_W,
      y: random() * REF_H * 0.62,
      r: 0.8 + random() * 1.6,
      phase: random() * Math.PI * 2,
    });
  }
  return stars;
}

function drawSky(ctx: CanvasRenderingContext2D): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, REF_H * 0.62);
  for (const [stop, color] of SKY_STOPS) gradient.addColorStop(stop, color);
  ctx.fillStyle = gradient;
  // The gradient stops at the horizon (REF_H * 0.62 = 297.6) but the ground curve
  // dips to y = 336 at the right edge, so the rect has to reach the bottom of the
  // frame or an unpainted band of backdrop shows through between the two. The
  // last stop just repeats below the horizon, where `drawGround` covers it.
  ctx.fillRect(0, 0, REF_W, REF_H);
}

function drawGround(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#5B363E';
  ctx.beginPath();
  ctx.moveTo(0, REF_H);
  ctx.lineTo(0, 268);
  ctx.bezierCurveTo(180, 232, 320, 330, 470, 318);
  ctx.bezierCurveTo(590, 308, 660, 352, REF_W, 336);
  ctx.lineTo(REF_W, REF_H);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#764C4E';
  ctx.beginPath();
  ctx.moveTo(0, REF_H);
  ctx.lineTo(0, 372);
  ctx.bezierCurveTo(160, 350, 300, 404, 430, 396);
  ctx.bezierCurveTo(560, 388, 640, 424, REF_W, 410);
  ctx.lineTo(REF_W, REF_H);
  ctx.closePath();
  ctx.fill();
}

function drawBlobs(ctx: CanvasRenderingContext2D): void {
  for (const blob of BLOBS) {
    ctx.fillStyle = 'rgba(216, 216, 216, 0.72)';
    ctx.beginPath();
    if (blob.round) {
      ctx.ellipse(blob.x + blob.w / 2, blob.y + blob.h / 2, blob.w / 2, blob.h / 2, 0, 0, Math.PI * 2);
    } else {
      const r = blob.w * 0.42;
      ctx.moveTo(blob.x, blob.y + blob.h);
      ctx.lineTo(blob.x, blob.y + r);
      ctx.quadraticCurveTo(blob.x + blob.w / 2, blob.y - r * 0.4, blob.x + blob.w, blob.y + r);
      ctx.lineTo(blob.x + blob.w, blob.y + blob.h);
      ctx.closePath();
    }
    ctx.fill();
  }
}

function drawStars(ctx: CanvasRenderingContext2D, stars: readonly Star[], t: number): void {
  for (const star of stars) {
    const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.6 + star.phase));
    ctx.fillStyle = `rgba(255, 255, 255, ${(0.55 * twinkle).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawZombie(ctx: CanvasRenderingContext2D, t: number): void {
  // The painted figure's silhouette bbox is (378, 38) - (632, 422), i.e. 254 x 384.
  // The shared ICS grid is 20 x 24 cells, so keeping the cells square (254 / 20)
  // reproduces the measured width exactly and lands the feet at y = 343, just below
  // the ground curve; stretching to the full 384 px height would turn every pixel
  // block into a 12.7 x 16 rectangle.
  const cell = 254 / 20;
  const originX = 378;
  const originY = 38;

  ctx.save();
  // Slight lean plus a slow sway, for the shambling read. The shear pivots on the
  // bottom row of the grid so the feet stay planted.
  ctx.translate(originX + (cell * 20) / 2, originY + cell * 24);
  ctx.transform(1, 0, -0.05 + Math.sin(t * 0.8) * 0.012, 1, 0, 0);
  ctx.translate(-(originX + (cell * 20) / 2), -(originY + cell * 24));
  drawGrid(ctx, ICS_PLATLOGO, GINGERBREAD_PALETTE, cell, originX, originY);
  ctx.restore();
}

export default function createGingerbread(context: EggContext): Egg {
  const stars = makeStars(context.random);

  const offPointer = context.onPointerUp(() => {
    context.toast('Zombie art by Jack Larson', 2);
  });

  const offFrame = context.onFrame((_dt, t) => {
    const { ctx, width, height } = context;
    const scale = Math.min(width / REF_W, height / REF_H);
    const offsetX = (width - REF_W * scale) / 2;
    const offsetY = (height - REF_H * scale) / 2;

    ctx.fillStyle = '#12161f';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.rect(0, 0, REF_W, REF_H);
    ctx.clip();

    drawSky(ctx);
    drawStars(ctx, stars, t);
    drawGround(ctx);
    drawBlobs(ctx);
    drawZombie(ctx, t);

    ctx.restore();
  });

  return {
    hint: '点击任意位置查看插画署名',
    destroy() {
      offPointer();
      offFrame();
    },
  };
}
