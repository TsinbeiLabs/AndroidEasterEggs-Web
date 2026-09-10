import {
  bakeGrid,
  ICS_PLATLOGO,
  NYANDROID_PALETTE,
  PLATLOGO_PALETTE,
  drawGrid,
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
 * 20 depth layers (z = (i/20)^2, so z peaks at 0.9025 for i = 19: scale
 * 0.1..1.815, speed 100..912.25 px/s). The sprite is the PlatLogo pixel grid
 * rotated 90 degrees clockwise; frames 10-11 of the 12 frame / 80 ms loop blank the
 * two eye cells for a blink, and each cat and star carries its own 0-1000 ms start
 * delay so the frames never line up. Any input exits.
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

/**
 * Frames 10 and 11 of `i_nyandroid_anim` are the blink: their pure-white pixel count
 * drops from 2000 to 1800, i.e. exactly the two 10 x 10 eye-highlight cells go out.
 * In the rotated grid those are the only two `W` cells inside the head; the other
 * eighteen are the `SWWWWWWWWWS` ice-cream stripe rows, which must stay lit.
 */
const EYE_CELLS: ReadonlyArray<readonly [number, number]> = [
  [19, 7],
  [19, 11],
];

function blinkGrid(grid: readonly string[]): string[] {
  const out = grid.slice();
  for (const [col, row] of EYE_CELLS) {
    out[row] = out[row].slice(0, col) + 'G' + out[row].slice(col + 1);
  }
  return out;
}

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
  /** AnimationDrawable start delay, `Nyandroid.java:162-166`. */
  phase: number;
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
  const catBlink = bakeGrid(blinkGrid(rotated), NYANDROID_PALETTE, 16);

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
        phase: random() * 1000,
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
    // `PlatLogoActivity.java:98-104` fires the toast on every ACTION_UP while the
    // view is pressed, so lifting after one or two pulses still toasts.
    context.toast(LONG_PRESS_TOAST, 2);
    holdStart = -1;
  });

  const offKey = context.onKeyDown(() => {
    if (scene === 'nyandroid') exitNyandroid();
  });

  /**
   * `Nyandroid.java:203-208`: `onSizeChanged` posts `reset()`, which throws away every
   * star and cat and re-scatters them for the new board size.
   */
  const offResize = context.onResize(() => {
    if (scene === 'nyandroid') scatter();
  });

  const offFrame = context.onFrame((dt, t) => {
    // The hold schedule runs before the scene dispatch so that the frame which fires
    // the fourth pulse goes straight on to draw Nyandroid rather than leaving the
    // host's clearRect as a one-frame blank at the exact moment of the transition.
    if (scene === 'platlogo') updateHold();
    if (scene === 'platlogo') drawPlatLogo(t);
    else drawNyandroid(dt, t);
  });

  /**
   * `PlatLogoActivity.java:41-77`: `mSuperLongPress` first runs at
   * `2 * getLongPressTimeout()` (1000 ms) and reposts every `getLongPressTimeout()`
   * (500 ms) while `mCount <= 3`, each time buzzing for `50 * mCount` ms and setting
   * `scale = 1 + 0.25 * mCount^2`. On the fourth pulse `mCount` reaches 4, so it
   * launches Nyandroid instead of reposting.
   */
  function updateHold(): void {
    if (holdStart < 0) return;
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

  function drawPlatLogo(t: number): void {
    const { ctx, width, height } = context;

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#14181d');
    gradient.addColorStop(1, '#05070a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

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

    ctx.imageSmoothingEnabled = true;
    for (const cat of cats) {
      const w = CAT_W * cat.scale;
      const h = CAT_H * cat.scale;
      cat.x += cat.v * dt;
      if (cat.x > width + 2) {
        cat.x = -w - 2;
        cat.y = context.random() * Math.max(1, height - h);
      }
      // `Nyandroid.java:162-166` starts every cat's AnimationDrawable after a random
      // 0-1000 ms delay, so the 12 frame / 80 ms boil — and the blink that lands on
      // frames 10-11, i.e. the last 160 ms of each 960 ms loop — is desynchronised
      // across the flock rather than pulsing in lockstep.
      const local = nowMs + cat.phase;
      const sprite = local % CAT_FRAME_MS >= CAT_FRAME_MS - CAT_BLINK_MS ? catBlink : catSprite;
      // Hand-drawn +/-1 cell "boil" of the original 12 frame animation.
      const wobbleX = Math.round(Math.sin((local / CAT_FRAME_MS) * Math.PI * 2));
      const wobbleY = Math.round(Math.cos((local / CAT_FRAME_MS) * Math.PI * 4));
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
      offResize();
      offFrame();
    },
  };
}
