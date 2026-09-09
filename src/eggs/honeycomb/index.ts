import type { Egg, EggContext } from '../../core/types';

/**
 * Android 3.0 – 3.2 Honeycomb — the Tron-styled neon bee with an Android head.
 * Upstream picks one of two colourways at random per launch and toasts
 * "REZZZZZZZ..." on every ACTION_UP. Geometry is the 640 x 640 reference frame
 * measured from the original artwork.
 */

const REF = 640;

interface Palette {
  name: string;
  background: string;
  fill: string;
  outline: string;
}

const PALETTES: readonly Palette[] = [
  { name: 'Tron blue', background: '#000000', fill: '#00467B', outline: '#58BAED' },
  { name: 'Bumblebee', background: '#050709', fill: '#F8F068', outline: '#58BAED' },
];

const ABDOMEN_BANDS: Array<[number, number]> = [
  [228, 47],
  [309, 56],
  [405, 50],
];

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
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
}

function strokeGlow(ctx: CanvasRenderingContext2D, palette: Palette, alpha: number): void {
  ctx.strokeStyle = palette.outline;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 3;
  ctx.shadowColor = palette.outline;
  ctx.shadowBlur = 14;
}

function drawBee(ctx: CanvasRenderingContext2D, palette: Palette, alpha: number): void {
  strokeGlow(ctx, palette, alpha);

  // antennae
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(253, 128);
  ctx.lineTo(248, 96);
  ctx.moveTo(387, 128);
  ctx.lineTo(392, 96);
  ctx.stroke();

  // head dome
  ctx.beginPath();
  ctx.moveTo(200, 232);
  ctx.bezierCurveTo(200, 150, 253, 128, 320, 128);
  ctx.bezierCurveTo(387, 128, 439, 150, 439, 232);
  ctx.closePath();
  ctx.stroke();

  // wings: two hollow lenses
  ctx.beginPath();
  ctx.ellipse(320, 272, 303, 44, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(320, 350, 210, 30, 0, 0, Math.PI * 2);
  ctx.stroke();

  // abdomen bands
  for (const [y, h] of ABDOMEN_BANDS) {
    roundedRect(ctx, 201, y, 237, h, 6);
    ctx.fillStyle = palette.fill;
    ctx.globalAlpha = alpha;
    ctx.fill();
    ctx.stroke();
  }

  // stinger
  ctx.beginPath();
  ctx.moveTo(299, 512);
  ctx.lineTo(340, 512);
  ctx.lineTo(320, 592);
  ctx.closePath();
  ctx.fillStyle = palette.fill;
  ctx.fill();
  ctx.stroke();

  // eyes: filled sockets with an inner glint
  ctx.shadowBlur = 0;
  ctx.globalAlpha = alpha;
  for (const dir of [-1, 1]) {
    const x = dir < 0 ? 240 : 375;
    roundedRect(ctx, x, 155, 35, 35, 6);
    ctx.fillStyle = palette.fill;
    ctx.fill();
    ctx.strokeStyle = palette.outline;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = palette.outline;
    ctx.fillRect(dir < 0 ? x + 20 : x + 3, 175, 12, 12);
  }

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

export default function createHoneycomb(context: EggContext): Egg {
  const palette = context.pick(PALETTES);

  const offPointer = context.onPointerUp(() => {
    context.toast('REZZZZZZZ...', 2);
  });

  const offFrame = context.onFrame((_dt, t) => {
    const { ctx, width, height } = context;
    const scale = (Math.min(width, height) / REF) * 0.92;
    const offsetX = (width - REF * scale) / 2;
    const offsetY = (height - REF * scale) / 2;

    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, width, height);

    // Slow neon pulse, 2 s period, between 0.7 and 1.0 alpha.
    const alpha = 0.85 + 0.15 * Math.sin((t * Math.PI) / 1);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    drawBee(ctx, palette, Math.min(1, Math.max(0.7, alpha)));
    ctx.restore();
  });

  return {
    hint: `${palette.name} · 点击任意位置`,
    destroy() {
      offPointer();
      offFrame();
    },
  };
}
