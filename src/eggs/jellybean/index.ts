import { PLATLOGO_EASE } from '../../core/easing';
import { Tweens } from '../../core/tween';
import type { Egg, EggContext } from '../../core/types';

/**
 * Android 4.1 – 4.3 Jelly Bean.
 *
 * PlatLogo: a red jelly bean; the first tap makes it grin and toasts
 * "Android 4.x / JELLY BEAN" (upstream randomises the minor version because
 * the egg covers 4.1-4.3). A 500 ms long press opens BeanBag.
 *
 * BeanBag: 40 beans drifting at constant velocity with no gravity and no
 * collisions (upstream computes `overlap()` and throws the result away).
 * z = (i/40)^2 gives 40 depth layers, scale 0.2..1, speed 0..40 px/s per axis,
 * spin +/-30 deg/s. Dragging applies the upstream velocity EMA and releasing
 * flings the bean with a spin of up to 1080 deg/s. 1/9 of the beans have a
 * face and 0.1 % are an untinted candy cane.
 */

const LONG_PRESS_MS = 500;
const NUM_BEANS = 40;
const MIN_SCALE = 0.2;
const MAX_SCALE = 1;
const LUCKY = 0.001;
const RECYCLE_MARGIN = 576;

/** Upstream draws the 243 x 161 px art at 81 x 54 dp; bumped for desktop. */
const BEAN_W = 118;
const BEAN_H = BEAN_W * (161 / 243);

/** Candy cane: drawn in its own 220 x 270 box, shown at 96 x 190 CSS px. */
const CANE_MIN_X = 20;
const CANE_MIN_Y = 0;
const CANE_BOX_W = 200;
const CANE_BOX_H = 270;
const CANE_W = 96;
const CANE_H = 190;

const TINTS = [
  '#00CC00',
  '#CC0000',
  '#0000CC',
  '#FFFF00',
  '#FF8000',
  '#00CCFF',
  '#FF0080',
  '#8000FF',
  '#FF8080',
  '#8080FF',
  '#B0C0D0',
  '#DDDDDD',
  '#333333',
] as const;

/** Row extents of `j_redbean0` (256 x 256, content bbox (5,56)-(247,216)). */
const BEAN_ROWS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 131, 149],
  [0.05, 86, 188],
  [0.1, 66, 206],
  [0.15, 52, 217],
  [0.2, 41, 225],
  [0.25, 32, 232],
  [0.3, 25, 237],
  [0.35, 19, 241],
  [0.4, 14, 245],
  [0.45, 10, 246],
  [0.5, 8, 247],
  [0.55, 6, 247],
  [0.6, 5, 247],
  [0.65, 5, 244],
  [0.7, 6, 241],
  [0.75, 8, 236],
  [0.8, 11, 229],
  [0.85, 15, 220],
  [0.9, 21, 209],
  [0.95, 30, 107],
  [1, 53, 73],
];

const BEAN_BOX_W = 243;
const BEAN_BOX_H = 161;

function buildBeanPath(): Path2D {
  const path = new Path2D();
  const x = (v: number) => v - 5;
  const y = (t: number) => t * BEAN_BOX_H;

  for (let i = 0; i < BEAN_ROWS.length; i++) {
    const [t, left] = BEAN_ROWS[i];
    const px = x(left);
    const py = y(t);
    if (i === 0) path.moveTo(px, py);
    else path.lineTo(px, py);
  }
  for (let i = BEAN_ROWS.length - 1; i >= 0; i--) {
    const [t, , right] = BEAN_ROWS[i];
    path.lineTo(x(right), y(t));
  }
  path.closePath();
  return path;
}

const BEAN_PATH = buildBeanPath();

function shade(hex: string, factor: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = Math.round(((value >> 16) & 0xff) * factor);
  const g = Math.round(((value >> 8) & 0xff) * factor);
  const b = Math.round((value & 0xff) * factor);
  return `rgb(${r}, ${g}, ${b})`;
}

function drawBeanShape(
  ctx: CanvasRenderingContext2D,
  tint: string | null,
  face: boolean,
  alpha = 1,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;

  if (tint === null) {
    drawCandyCane(ctx);
    ctx.restore();
    return;
  }

  // Dark rim: fill the whole silhouette dark, then re-fill it offset up-left.
  ctx.fillStyle = shade(tint, 0.5);
  ctx.fill(BEAN_PATH);

  ctx.save();
  ctx.clip(BEAN_PATH);
  ctx.fillStyle = tint;
  ctx.translate(-7, -9);
  ctx.fill(BEAN_PATH);
  ctx.restore();

  // Specular highlight, upper left (measured at (64,73)-(120,100) of 256 px).
  ctx.save();
  ctx.clip(BEAN_PATH);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.ellipse(88, 30, 26, 13, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 127, 127, 0.55)';
  ctx.beginPath();
  ctx.ellipse(88, 30, 34, 19, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.stroke(BEAN_PATH);

  if (face) drawBeanFace(ctx);
  ctx.restore();
}

function drawBeanFace(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#000000';
  ctx.lineCap = 'round';

  // antennae
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(150, 12);
  ctx.lineTo(163, -22);
  ctx.moveTo(60, 22);
  ctx.lineTo(40, -4);
  ctx.stroke();

  // eyes: closed happy crescents
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(80, 78, 22, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(163, 60, 20, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();

  // smile
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(118, 92, 42, Math.PI * 0.15, Math.PI * 0.72);
  ctx.stroke();
}

/** Centreline of `j_jandycane`: shaft on the right, crook curling down-left. */
function canePoint(t: number): [number, number] {
  const knee = 0.62;
  if (t <= knee) {
    return [180, 10 + (t / knee) * 170];
  }
  const u = (t - knee) / (1 - knee);
  const p0: [number, number] = [180, 180];
  const p1: [number, number] = [180, 246];
  const p2: [number, number] = [96, 262];
  const p3: [number, number] = [48, 214];
  const mt = 1 - u;
  const x = mt ** 3 * p0[0] + 3 * mt ** 2 * u * p1[0] + 3 * mt * u ** 2 * p2[0] + u ** 3 * p3[0];
  const y = mt ** 3 * p0[1] + 3 * mt ** 2 * u * p1[1] + 3 * mt * u ** 2 * p2[1] + u ** 3 * p3[1];
  return [x, y];
}

function drawCandyCane(ctx: CanvasRenderingContext2D): void {
  const SEGMENTS = 26;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 44;

  for (let i = 0; i < SEGMENTS; i++) {
    const [x0, y0] = canePoint(i / SEGMENTS);
    const [x1, y1] = canePoint((i + 1.15) / SEGMENTS);
    ctx.strokeStyle = i % 2 === 0 ? '#FF0000' : '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) {
    const [x, y] = canePoint(i / 64);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

interface Bean {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  va: number;
  scale: number;
  tint: string | null;
  face: boolean;
  cane: boolean;
  grabbed: boolean;
}

type Scene = 'platlogo' | 'beanbag';

export default function createJellyBean(context: EggContext): Egg {
  const tweens = new Tweens();
  let scene: Scene = 'platlogo';
  let downAt = -1;
  let longPressed = false;
  let revealFace = false;
  let logoScale = 1;
  let logoAlpha = 1;
  const beans: Bean[] = [];
  let dragged: Bean | null = null;
  let grabDx = 0;
  let grabDy = 0;

  const makeBean = (i: number, scatter: boolean): Bean => {
    const z = Math.pow(i / NUM_BEANS, 2);
    const scale = MIN_SCALE + (MAX_SCALE - MIN_SCALE) * z;
    const cane = context.random() <= LUCKY;
    // 8/9 plain bean, 1/9 bean with a face (`j_redbeandroid`).
    const face = !cane && context.random() < 1 / 9;
    const bean: Bean = {
      x: 0,
      y: 0,
      vx: (context.random() * 80 - 40) * z,
      vy: (context.random() * 80 - 40) * z,
      angle: context.random() * 360,
      va: context.random() * 60 - 30,
      scale,
      tint: cane ? null : context.pick(TINTS),
      face,
      cane,
      grabbed: false,
    };
    resetBean(bean, scatter);
    return bean;
  };

  const resetBean = (bean: Bean, scatter: boolean): void => {
    const { width, height, random } = context;
    const w = (bean.cane ? CANE_W : BEAN_W) * bean.scale;
    const h = (bean.cane ? CANE_H : BEAN_H) * bean.scale;
    if (scatter) {
      bean.x = random() * width;
      bean.y = random() * height;
      return;
    }
    const horizontal = random() < 0.5;
    if (horizontal) {
      bean.x = bean.vx < 0 ? width + w : -w;
      bean.y = random() * Math.max(1, height - h);
    } else {
      bean.y = bean.vy < 0 ? height + h : -h;
      bean.x = random() * Math.max(1, width - w);
    }
  };

  const fillBag = (): void => {
    beans.length = 0;
    for (let i = 0; i < NUM_BEANS; i++) beans.push(makeBean(i, true));
  };

  const enterBeanBag = (): void => {
    scene = 'beanbag';
    fillBag();
    logoScale = 1;
    logoAlpha = 1;
  };

  const beanAt = (px: number, py: number): Bean | null => {
    // Iterate back to front so the topmost bean wins.
    for (let i = beans.length - 1; i >= 0; i--) {
      const bean = beans[i];
      const w = (bean.cane ? CANE_W : BEAN_W) * bean.scale;
      const h = (bean.cane ? CANE_H : BEAN_H) * bean.scale;
      if (Math.abs(px - bean.x) > w * 0.62 || Math.abs(py - bean.y) > h * 0.62) continue;
      // Upstream samples the sprite's alpha; the bbox test is close enough and
      // keeps hit testing cheap for 40 beans.
      return bean;
    }
    return null;
  };

  const offDown = context.onPointerDown((x, y) => {
    if (scene === 'beanbag') {
      const bean = beanAt(x, y);
      if (bean !== null) {
        dragged = bean;
        bean.grabbed = true;
        bean.va = 0;
        grabDx = x - bean.x;
        grabDy = y - bean.y;
      }
      return;
    }
    downAt = performance.now();
    longPressed = false;
  });

  const offUp = context.onPointerUp(() => {
    if (scene === 'beanbag') {
      if (dragged !== null) {
        const bean = dragged;
        bean.grabbed = false;
        const speed = Math.hypot(bean.vx, bean.vy);
        const sign = context.random() < 0.5 ? -1 : 1;
        const magnitude = Math.min(speed * 0.33, 1080);
        bean.va = sign * magnitude * (0.5 + context.random() * 0.5);
        dragged = null;
      }
      return;
    }
    if (downAt < 0) return;
    const held = performance.now() - downAt;
    downAt = -1;
    if (longPressed) return;
    if (held >= LONG_PRESS_MS) {
      enterBeanBag();
      return;
    }
    if (!revealFace) revealFace = true;
    const minor = context.randomInt(1, 3);
    context.toast(`Android 4.${minor} · JELLY BEAN`, 2.5);
  });

  const offFrame = context.onFrame((dt, t) => {
    const now = t * 1000;
    tweens.update(now);

    if (scene === 'platlogo' && downAt >= 0 && !longPressed) {
      if (performance.now() - downAt >= LONG_PRESS_MS) {
        longPressed = true;
        enterBeanBag();
        return;
      }
    }

    if (scene === 'platlogo') drawPlatLogo();
    else stepBag(dt);
  });

  function drawPlatLogo(): void {
    const { ctx, width, height } = context;
    paintBackdrop(ctx, width, height);

    const pad = 32;
    const availW = Math.max(1, width - pad * 2);
    const availH = Math.max(1, height - pad * 2);
    const scale = Math.min(availW / BEAN_BOX_W, availH / BEAN_BOX_H) * 0.86 * logoScale;

    ctx.save();
    ctx.globalAlpha = logoAlpha;
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-BEAN_BOX_W / 2, -BEAN_BOX_H / 2);
    drawBeanShape(ctx, '#FF0000', revealFace);
    ctx.restore();
  }

  function stepBag(dt: number): void {
    const { ctx, width, height } = context;
    paintBackdrop(ctx, width, height);

    for (const bean of beans) {
      if (bean.grabbed && dragged === bean) {
        const targetX = context.pointer.x - grabDx;
        const targetY = context.pointer.y - grabDy;
        if (dt > 0) {
          bean.vx = bean.vx * 0.75 + ((targetX - bean.x) / dt) * 0.25;
          bean.vy = bean.vy * 0.75 + ((targetY - bean.y) / dt) * 0.25;
        }
        bean.x = targetX;
        bean.y = targetY;
      } else {
        bean.x += bean.vx * dt;
        bean.y += bean.vy * dt;
        bean.angle += bean.va * dt;
      }

      if (
        bean.x < -RECYCLE_MARGIN ||
        bean.x > width + RECYCLE_MARGIN ||
        bean.y < -RECYCLE_MARGIN ||
        bean.y > height + RECYCLE_MARGIN
      ) {
        resetBean(bean, false);
      }

      const boxW = bean.cane ? CANE_BOX_W : BEAN_BOX_W;
      const boxH = bean.cane ? CANE_BOX_H : BEAN_BOX_H;
      const drawW = (bean.cane ? CANE_W : BEAN_W) * bean.scale;
      const drawH = (bean.cane ? CANE_H : BEAN_H) * bean.scale;

      ctx.save();
      ctx.translate(bean.x, bean.y);
      ctx.rotate((bean.angle * Math.PI) / 180);
      ctx.scale(drawW / boxW, drawH / boxH);
      if (bean.cane) ctx.translate(-CANE_MIN_X, -CANE_MIN_Y);
      drawBeanShape(ctx, bean.tint, bean.face);
      ctx.restore();
    }
  }

  function paintBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const gradient = ctx.createLinearGradient(0, 0, width * 0.4, height);
    gradient.addColorStop(0, '#1b2430');
    gradient.addColorStop(1, '#0a0e14');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  // Entry: the bean eases in, mirroring the upstream PlatLogo reveal.
  logoScale = 0.6;
  logoAlpha = 0;
  tweens.add(
    {
      duration: 500,
      ease: PLATLOGO_EASE,
      from: 0.6,
      to: 1,
      onUpdate: (v) => {
        logoScale = v;
      },
    },
    0,
  );
  tweens.add(
    {
      duration: 500,
      ease: PLATLOGO_EASE,
      from: 0,
      to: 1,
      onUpdate: (v) => {
        logoAlpha = v;
      },
    },
    0,
  );

  context.actions.add({
    id: 'bag',
    label: '打开 BeanBag',
    run: () => {
      if (scene === 'platlogo') enterBeanBag();
      else {
        scene = 'platlogo';
        logoScale = 1;
        logoAlpha = 1;
      }
    },
  });

  return {
    hint: '点击让豆子咧嘴笑，长按 0.5 秒进入 BeanBag',
    destroy() {
      offDown();
      offUp();
      offFrame();
      tweens.cancelAll();
    },
  };
}
