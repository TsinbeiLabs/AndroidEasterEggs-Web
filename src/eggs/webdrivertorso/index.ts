import type { Egg, EggContext } from '../../core/types';

/**
 * Android L Preview — "Webdriver Torso".
 *
 * The famous YouTube test channel: a white page, one blue and one red rectangle
 * that jump to a new random geometry every 1000 ms (tweened over 200 ms), and a
 * monospace caption naming the fake video file. Long pressing the BLUE rectangle
 * is the actual easter egg — upstream it launches KitKat's Dessert Case, so here
 * it routes to the KitKat egg.
 */

const REFRESH_MS = 1000;
const TWEEN_MS = 200;
const LONG_PRESS_MS = 500;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const BUILD_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomBuild(random: () => number): string {
  let out = 'L';
  for (let i = 0; i < 5; i++) out += BUILD_CHARS[Math.floor(random() * BUILD_CHARS.length)];
  return out;
}

function randomRect(random: () => number, w: number, h: number): Rect {
  const rw = random() * w;
  const rh = random() * h;
  return { x: random() * (w - rw), y: random() * (h - rh), w: rw, h: rh };
}

export default function createWebdriverTorso(context: EggContext): Egg {
  const build = randomBuild(context.random);
  const caption = `android_L.flv - build ${build}`;

  let current: [Rect, Rect] = [
    randomRect(context.random, context.width, context.height),
    randomRect(context.random, context.width, context.height),
  ];
  let target: [Rect, Rect] = current;
  let from: [Rect, Rect] = current;
  let lastRefresh = 0;
  let tweenStart = -1;
  let downAt = -1;
  let downOnBlue = false;
  let wasDown = false;
  let launched = false;

  const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    w: a.w + (b.w - a.w) * t,
    h: a.h + (b.h - a.h) * t,
  });

  const offResize = context.onResize((w, h) => {
    current = [randomRect(context.random, w, h), randomRect(context.random, w, h)];
    target = current;
    from = current;
  });

  const offFrame = context.onFrame((_dt, t) => {
    const now = t * 1000;
    const { ctx, width, height } = context;

    if (now - lastRefresh >= REFRESH_MS) {
      lastRefresh = now;
      from = current;
      target = [randomRect(context.random, width, height), randomRect(context.random, width, height)];
      tweenStart = now;
    }

    const p = tweenStart < 0 ? 1 : Math.min(1, (now - tweenStart) / TWEEN_MS);
    current = [lerpRect(from[0], target[0], p), lerpRect(from[1], target[1], p)];

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#0000FF';
    ctx.fillRect(current[0].x, current[0].y, current[0].w, current[0].h);
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(current[1].x, current[1].y, current[1].w, current[1].h);

    const size = 14;
    ctx.font = `700 ${size}px ui-monospace, "SFMono-Regular", Menlo, monospace`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(caption, 12, height - 12);

    if (context.pointer.down && !wasDown) {
      downAt = now;
      const [bx, by] = [context.pointer.x, context.pointer.y];
      const blue = current[0];
      downOnBlue = bx >= blue.x && bx <= blue.x + blue.w && by >= blue.y && by <= blue.y + blue.h;
    }
    if (context.pointer.down && downAt >= 0 && !launched && downOnBlue) {
      if (now - downAt >= LONG_PRESS_MS) {
        launched = true;
        if (context.store.get<number>('l_egg_mode', 0) === 0) {
          context.store.set('l_egg_mode', Date.now());
        }
        context.toast('Couldn\'t catch a break. → Dessert Case', 2);
        window.setTimeout(() => {
          window.location.hash = '#/eggs/kitkat';
        }, 400);
      }
    }
    if (!context.pointer.down) {
      downAt = -1;
      downOnBlue = false;
    }
    wasDown = context.pointer.down;
  });

  return {
    hint: '长按蓝色方块 → KitKat Dessert Case',
    destroy() {
      offFrame();
      offResize();
    },
  };
}
