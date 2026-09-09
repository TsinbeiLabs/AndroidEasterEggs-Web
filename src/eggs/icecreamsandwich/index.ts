import {
  bakeGrid,
  ICS_PLATLOGO,
  NYANDROID_PALETTE,
  PLATLOGO_PALETTE,
  drawGrid,
  remap,
  rotateCw,
} from '../../core/pixelart';
import type { Egg, EggContext } from '../../core/types';

/**
 * Android 4.0 Ice Cream Sandwich.
 *
 * PlatLogo: hold the logo — at 1000 / 1500 / 2000 / 2500 ms it pulses to
 * 1 + 0.25n^2 (1.25x, 2x, 3.25x, 5x) with a 50n ms buzz, then Nyandroid starts.
 * A short tap instead toasts "Android 4.0: Ice Cream Sandwich".
 *
 * Nyandroid: #003366 sky, 20 static twinkling stars and 20 flying droids in
 * 20 depth layers (z = (i/20)^2, scale 0.1..1.905, speed 100..905 px/s). The
 * sprite is the PlatLogo pixel grid rotated 90 degrees clockwise, with a blink
 * on the last 160 ms of every 960 ms animation loop. Any input exits.
 */

const HOLD_STEPS_MS = [1000, 1500, 2000, 2500];
const LONG_PRESS_TOAST = 'Android 4.0: Ice Cream Sandwich';

const NYANDROID_BG = '#003366';
const NUM_CATS = 20;
const NUM_STARS = 20;
const CAT_MIN_SCALE = 0.1;
const CAT_MAX_SCALE = 2;
const CAT_VMIN = 100;
const CAT_VMAX = 1000;
/** Visible art of the 320 px sprite at density 480: 240 x 200 px = 80 x 66.7 dp. */
const CAT_W = 80;
const CAT_H = 66.7;
const CAT_FRAME_MS = 960;
const CAT_BLINK_MS = 160;

const STAR_FRAME_MS = 200;
const STAR_FRAMES = 6;
const STAR_CELLS = 7;
const STAR_SIZE_DP = 23.33;
const STAR_TWINKLE: ReadonlyArray<readonly [number, number][]> = [
  [],
  [
    [3, 3],
  ],
  [
    [3, 2],
    [2, 3],
    [3, 3],
    [4, 3],
    [3, 4],
  ],
  [
    [2, 1],
    [0, 3],
    [1, 3],
    [3, 3],
    [5, 3],
    [6, 3],
    [2, 4],
    [2, 5],
  ],
  [
    [2, 0],
    [2, 1],
    [0, 3],
    [1, 3],
    [3, 3],
    [5, 3],
    [6, 3],
    [2, 5],
    [2, 6],
  ],
  [
    [2, 0],
    [1, 1],
    [5, 1],
    [0, 3],
    [6, 3],
    [1, 5],
    [5, 5],
    [2, 6],
  ],
];

interface Cat {
  z: number;
  scale: number;
  v: number;
  x: number;
  y: number;
}

interface Star {
  x: number;
  y: number;
  scale: number;
  phase: number;
}

type Scene = 'platlogo' | 'nyandroid';

function vibrate(pattern: number): void {
  navigator.vibrate?.(pattern);
}

export default function createIceCreamSandwich(context: EggContext): Egg {
  const rotated = rotateCw(ICS_PLATLOGO);
  const catSprite = bakeGrid(rotated, NYANDROID_PALETTE, 16);
  const catBlink = bakeGrid(remap(rotated, 'W', 'G'), NYANDROID_PALETTE, 16);

  let scene: Scene = 'platlogo';
  let holdStart = -1;
  let pulses = 0;
  let logoScale = 1;

  const cats: Cat[] = [];
  const stars: Star[] = [];

  const scatter = () => {
    const { width, height, random } = context;
    cats.length = 0;
    stars.length = 0;

    for (let i = 0; i < NUM_CATS; i++) {
      const z = Math.pow(i / NUM_CATS, 2);
      const scale = CAT_MIN_SCALE + (CAT_MAX_SCALE - CAT_MIN_SCALE) * z;
      cats.push({
        z,
        scale,
        v: CAT_VMIN + (CAT_VMAX - CAT_VMIN) * z,
        x: random() * width,
        y: random() * Math.max(1, height - CAT_H * scale),
      });
    }

    for (let i = 0; i < NUM_STARS; i++) {
      stars.push({
        x: random() * width,
        y: random() * height,
        scale: 0.1 + random() * 0.9,
        phase: random() * 1000,
      });
    }
  };

  const enterNyandroid = () => {
    scene = 'nyandroid';
    holdStart = -1;
    pulses = 0;
    logoScale = 1;
    scatter();
  };

  const exitNyandroid = () => {
    scene = 'platlogo';
    logoScale = 1;
    pulses = 0;
    holdStart = -1;
  };

  const offDown = context.onPointerDown(() => {
    if (scene === 'nyandroid') {
      exitNyandroid();
      return;
    }
    holdStart = performance.now();
    pulses = 0;
  });

  const offUp = context.onPointerUp(() => {
    if (scene !== 'platlogo' || holdStart < 0) return;
    if (pulses === 0) context.toast(LONG_PRESS_TOAST, 2);
    holdStart = -1;
  });

  const offKey = context.onKeyDown(() => {
    if (scene === 'nyandroid') exitNyandroid();
  });

  const offFrame = context.onFrame((dt, t) => {
    if (scene === 'platlogo') {
      drawPlatLogo(t);
    } else {
      drawNyandroid(dt, t);
    }
  });

  function drawPlatLogo(t: number): void {
    const { ctx, width, height } = context;

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#14181d');
    gradient.addColorStop(1, '#05070a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    if (holdStart >= 0) {
      const held = performance.now() - holdStart;
      let next = pulses;
      while (next < HOLD_STEPS_MS.length && held >= HOLD_STEPS_MS[next]) {
        next++;
        logoScale = 1 + 0.25 * next * next;
        vibrate(50 * next);
        if (next >= HOLD_STEPS_MS.length) {
          enterNyandroid();
          return;
        }
      }
      pulses = next;
    }

    const cols = ICS_PLATLOGO[0].length;
    const rows = ICS_PLATLOGO.length;
    const cell = Math.min(width / cols, height / rows) * 0.78 * logoScale;
    const x = Math.round((width - cell * cols) / 2);
    const y = Math.round((height - cell * rows) / 2);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.9 + 0.1 * Math.sin(t * 2);
    drawGrid(ctx, ICS_PLATLOGO, PLATLOGO_PALETTE, cell, x, y);
    ctx.restore();
  }

  function drawNyandroid(dt: number, t: number): void {
    const { ctx, width, height } = context;
    const nowMs = t * 1000;

    ctx.fillStyle = NYANDROID_BG;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#FFFFFF';
    for (const star of stars) {
      const local = (nowMs + star.phase) % (STAR_FRAME_MS * STAR_FRAMES);
      const frame = STAR_TWINKLE[Math.floor(local / STAR_FRAME_MS)] ?? STAR_TWINKLE[0];
      const size = STAR_SIZE_DP * star.scale;
      const cell = size / STAR_CELLS;
      const ox = star.x - size / 2;
      const oy = star.y - size / 2;
      for (const [cx, cy] of frame) {
        ctx.fillRect(ox + cx * cell, oy + cy * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }

    const blinking = nowMs % CAT_FRAME_MS >= CAT_FRAME_MS - CAT_BLINK_MS;
    const sprite = blinking ? catBlink : catSprite;
    // Hand-drawn +/-1 cell "boil" of the original 12 frame animation.
    const wobbleX = Math.round(Math.sin((nowMs / CAT_FRAME_MS) * Math.PI * 2));
    const wobbleY = Math.round(Math.cos((nowMs / CAT_FRAME_MS) * Math.PI * 4));

    ctx.imageSmoothingEnabled = true;
    for (const cat of cats) {
      const w = CAT_W * cat.scale;
      const h = CAT_H * cat.scale;
      cat.x += cat.v * dt;
      if (cat.x > width + 2) {
        cat.x = -w - 2;
        cat.y = context.random() * Math.max(1, height - h);
      }
      const cell = w / 24;
      ctx.drawImage(sprite, cat.x + wobbleX * cell, cat.y + wobbleY * cell, w, h);
    }
  }

  return {
    hint: '长按 2.5 秒进入 Nyandroid',
    destroy() {
      offDown();
      offUp();
      offKey();
      offFrame();
    },
  };
}
