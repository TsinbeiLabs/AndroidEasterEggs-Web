export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export interface DroidOptions {
  /** Centre of the head arc, in canvas coordinates. */
  x: number;
  y: number;
  /** Head radius; every other dimension derives from it. */
  unit: number;
  bodyColor?: string;
  eyeColor?: string;
  alpha?: number;
  /** Rotate the whole droid around (x, y). */
  rotation?: number;
  /** Arms swing outwards by this many radians. */
  armAngle?: number;
  /** Legs splay sideways by this fraction of `unit`. */
  legSpread?: number;
  /** Antenna length multiplier. */
  antenna?: number;
}

/**
 * The classic Android bugdroid, drawn from vector primitives so it scales to
 * any DPR without bitmap assets. `unit` is the head radius.
 */
export function drawDroid(ctx: CanvasRenderingContext2D, options: DroidOptions): void {
  const {
    x,
    y,
    unit,
    bodyColor = '#a4ca39',
    eyeColor = '#ffffff',
    alpha = 1,
    rotation = 0,
    armAngle = 0,
    legSpread = 0,
    antenna = 1,
  } = options;

  const gap = unit * 0.16;
  const bodyW = unit * 2;
  const bodyH = unit * 1.86;
  const limbW = unit * 0.44;
  const limbH = unit * 1.42;
  const sideGap = unit * 0.22;
  const eyeR = unit * 0.13;
  const eyeY = y - unit * 0.42;
  const eyeDX = unit * 0.45;

  ctx.save();
  // Multiply, so a caller's reveal fade is not overwritten by the default alpha.
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = bodyColor;

  // antennae
  ctx.strokeStyle = bodyColor;
  ctx.lineWidth = limbW * 0.42;
  ctx.lineCap = 'round';
  const antLen = unit * 0.62 * antenna;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * unit * 0.5, -unit * 0.86);
    ctx.lineTo(dir * unit * 0.86, -unit * 0.86 - antLen);
    ctx.stroke();
  }

  // head
  ctx.beginPath();
  ctx.arc(0, 0, unit, Math.PI, 0);
  ctx.closePath();
  ctx.fill();

  // eyes
  ctx.fillStyle = eyeColor;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(dir * eyeDX, eyeY - y, eyeR, 0, Math.PI * 2);
    ctx.fill();
  }

  // body
  ctx.fillStyle = bodyColor;
  roundRectPath(ctx, -bodyW / 2, gap, bodyW, bodyH, unit * 0.24);
  ctx.fill();

  // arms
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(dir * (bodyW / 2 + sideGap + limbW / 2), gap + limbW * 0.2);
    ctx.rotate(dir * armAngle);
    roundRectPath(ctx, -limbW / 2, 0, limbW, limbH, limbW / 2);
    ctx.fill();
    ctx.restore();
  }

  // legs
  const legY = gap + bodyH - limbW * 0.1;
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(dir * (bodyW * 0.25 + legSpread), legY);
    roundRectPath(ctx, -limbW / 2, 0, limbW, limbH * 0.82, limbW / 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

export function drawStar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  outer: number,
  inner: number,
  points: number,
  rotation = 0,
): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (Math.PI * i) / points;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Fill text centred at (x, y). */
export function drawCentredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
): void {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

export const ANDROID_GREEN = '#a4ca39';
export const ANDROID_GREEN_DARK = '#7cb342';
