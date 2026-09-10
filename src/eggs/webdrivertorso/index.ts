import type { Egg, EggContext } from '../../core/types';

/**
 * Android L Preview — "Webdriver Torso".
 *
 * The famous YouTube test channel: a white page, one blue (`Color.BLUE`, child 0) and
 * one red (`Color.RED`, child 1) rectangle that jump to a new random geometry every
 * 1000 ms, tweened over 200 ms with `ValueAnimator`'s default accelerate/decelerate,
 * plus a bold 14 sp monospace caption at bottom left naming the fake video file.
 * Long pressing the BLUE rectangle is the actual easter egg: upstream it stamps
 * `l_egg_mode` and launches KitKat's Dessert Case, so here it routes to the KitKat egg.
 */

const REFRESH_MS = 1000;
const TWEEN_MS = 200;
const LONG_PRESS_MS = 500;
/** `ViewConfiguration.getScaledTouchSlop()`, used by `View.pointInView`. */
const TOUCH_SLOP = 8;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * `AccelerateDecelerateInterpolator` — `RefreshTorso.kt:26-41` builds a bare
 * `ValueAnimator.ofFloat(0f, 1f)` and never sets an interpolator, so it inherits
 * `ValueAnimator`'s default rather than running linear.
 */
function accelerateDecelerate(t: number): number {
  return Math.cos((t + 1) * Math.PI) / 2 + 0.5;
}

/** `Build.VERSION.INCREMENTAL` is a numeric changelist, e.g. `1273228`. */
function randomBuild(random: () => number): string {
  return String(1000000 + Math.floor(random() * 9000000));
}

function randomRect(random: () => number, w: number, h: number): Rect {
  const rw = random() * w;
  const rh = random() * h;
  return { x: random() * (w - rw), y: random() * (h - rh), w: rw, h: rh };
}

/** `View.pointInView(x, y, slop)` in the view's own coordinate space. */
function contains(rect: Rect, x: number, y: number, slop: number): boolean {
  return (
    x >= rect.x - slop &&
    x <= rect.x + rect.w + slop &&
    y >= rect.y - slop &&
    y <= rect.y + rect.h + slop
  );
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

    const p = tweenStart < 0 ? 1 : accelerateDecelerate(Math.min(1, (now - tweenStart) / TWEEN_MS));
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
      downOnBlue = contains(current[0], context.pointer.x, context.pointer.y, TOUCH_SLOP);
    } else if (context.pointer.down && downOnBlue && downAt >= 0) {
      // `View.onTouchEvent` drops the pending long press as soon as the pointer is no
      // longer inside the view. The blue rect retargets every second and tweens there
      // over 200 ms, so it can slide out from under a stationary finger; re-test the
      // live geometry each frame instead of only on the way down.
      if (!contains(current[0], context.pointer.x, context.pointer.y, TOUCH_SLOP)) {
        downAt = -1;
        downOnBlue = false;
      }
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
