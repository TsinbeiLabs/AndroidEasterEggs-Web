import { drawDroid } from '../../core/art';
import { EGGS } from '../../core/registry';
import type { Egg, EggContext } from '../../core/types';

/**
 * RocketLauncher — `com.android.launcher2.RocketLauncher`, the warp-speed
 * screensaver hidden in the Android 4.0 launcher ("Easter Egg of the Launcher
 * in Android 4.0 (Ice Cream Sandwich)", shipped here as an activity + dream).
 *
 * `Board` is a square the size of the screen's long side, centred, over which
 * 20 fixed stars, `NUM_ICONS` = 20 fast `FlyingStar`s and 20 `FlyingIcon`s
 * (the app's other easter-egg icons by default, `VALUE_EASTER_EGG_ICONS`) fly
 * radially outwards from the centre. Per `FlyingIcon.update(dt)`:
 * `dist += v*dt`, position advances along (sin a, cos a), scale grows as
 * `lerp(0, endscale, sqrt(dist/fuse))` clamped to endscale, stretched by
 * `lerp(1, 0.75, ((v-VMIN)/(VMAX-VMIN))^3)` in x and `lerp(1, 1.5, ...)` in y
 * (fast stars exceed VMAX, so x flips negative — a mirrored streak, which is
 * the upstream warp look), and alpha ramps sqrt(dist/0.15fuse) in, then
 * `1-((dist-0.75fuse)/(0.25fuse))^2` out. Views are rotated `180 - angle`,
 * pointing "up" along the flight path.
 *
 * Interaction (`Board.onTouchEvent` / `onInterceptTouchEvent` /
 * `FlyingIcon.onTouchEvent`): while cruising, the board intercepts touches and
 * a tap engages the maneuvering thrusters — `mSpeedScale` decays at 2/s to
 * `MANEUVERING_THRUST_SCALE` = 0.1 and recovers at 1/s afterwards, disengaged
 * by `resetWarpTimer()` after 5000 ms without interaction. While maneuvering,
 * touches reach the icons: an icon with alpha >= 0.5 can be pressed (blue
 * `homescreen_small_blue` highlight, press lost when the finger leaves its
 * transformed bounds) and released to launch — `endscale = 0`, scale -> 15 and
 * alpha -> 0 over `LAUNCH_ZOOM_TIME * 1.25` = 500 ms with an
 * `AccelerateInterpolator(3)`, and the component is started after 400 ms.
 * Here "starting the component" navigates to that egg; the flying icons are
 * bugdroids in random colours (the upstream icons are the other eggs'
 * drawables) and the stars are procedural sparkles (upstream uses the
 * `widget_resize_handle_bottom` bitmap, and bitmaps are not ported).
 *
 * The board also replays its intro on every resize (`onSizeChanged` ->
 * `freeStart` -> `reset` + restart): for the first `START_ZOOM_TIME` = 3000 ms
 * the whole board scales in by `1-(t-1)^4` from a singularity. The loading
 * spinner upstream shows while the icon map resolves has no web counterpart —
 * the procedural icons exist immediately.
 */

const NUM_ICONS = 20; // Board.NUM_ICONS (stars get the first NUM_ICONS slots)
const FIXED_STARS = 20; // the fixed-star loop in Board.reset()
const MANEUVERING_THRUST_SCALE = 0.1; // Board.MANEUVERING_THRUST_SCALE
const LAUNCH_ZOOM_TIME = 400; // Board.LAUNCH_ZOOM_TIME, ms
const START_ZOOM_TIME = 3000; // the TimeAnimator's START_ZOOM_TIME, ms
const WARP_TIMEOUT = 5000; // resetWarpTimer()'s postDelayed, ms

// FlyingIcon constants. ANGULAR_VMAX/VMIN only feed the unused `vr` (the
// rotation update is commented out upstream), so they are not ported.
const VMAX = 1000;
const VMIN = 100;
const SCALE_MIN = 0.5;
const SCALE_MAX = 4;

interface FlyingIcon {
  star: boolean;
  /** Top-left position in board coordinates, like View.getX()/getY(). */
  x: number;
  y: number;
  w: number;
  h: number;
  v: number;
  angle: number;
  anglex: number;
  angley: number;
  endscale: number;
  sx: number;
  sy: number;
  alpha: number;
  dist: number;
  fuse: number;
  rotation: number;
  /** Random bugdroid colouring, `Cat.java`-style hsv(rnd*360, .5-1, .5-1). */
  hue: number;
  sat: number;
  val: number;
  eggId: string | null;
  pressed: boolean;
  launching: boolean;
  launchT: number;
  launchSx0: number;
  launchSy0: number;
  launchAlpha0: number;
}

interface FixedStar {
  x: number;
  y: number;
  scale: number;
}

const lerp = (a: number, b: number, f: number): number => (b - a) * f + a;
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

function hsvToCss(h: number, s: number, v: number): string {
  const c = v * s;
  const f = (n: number): number => {
    const k = (n + h / 60) % 12;
    const value = v - c * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
    return Math.round(255 * value);
  };
  return `rgb(${f(0)}, ${f(8)}, ${f(4)})`;
}

/** Four-pointed sparkle standing in for the `widget_resize_handle_bottom` bitmap. */
function drawSparkle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx, cy, cx + r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + r);
  ctx.quadraticCurveTo(cx, cy, cx - r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - r);
  ctx.fill();
}

export default function createRocketLauncher(context: EggContext): Egg {
  const { random, pick } = context;

  // VALUE_EASTER_EGG_ICONS: the other eggs of the app, RocketLauncher excluded.
  const launchable = EGGS.filter(
    (egg) => egg.status === 'ready' && egg.load !== undefined && egg.id !== 'rocket-launcher',
  );

  let boardW = 0;
  let boardScale = 0;
  let totalTime = 0;
  let maneuvering = false;
  let speedScale = 1;
  let warpTimeoutAt = 0;
  let pressed: FlyingIcon | null = null;
  let icons: FlyingIcon[] = [];
  let fixedStars: FixedStar[] = [];
  let iconBase = 48;
  let starBase = 24;
  const launchTimers: number[] = [];

  const makeIcon = (star: boolean): FlyingIcon => ({
    star,
    x: 0,
    y: 0,
    w: star ? starBase : iconBase,
    h: star ? starBase : iconBase,
    v: 0,
    angle: 0,
    anglex: 0,
    angley: 0,
    endscale: 1,
    sx: 0,
    sy: 0,
    alpha: 0,
    dist: 0,
    fuse: 1,
    rotation: 0,
    hue: 0,
    sat: 1,
    val: 1,
    eggId: null,
    pressed: false,
    launching: false,
    launchT: 0,
    launchSx0: 1,
    launchSy0: 1,
    launchAlpha0: 1,
  });

  /** `FlyingIcon.randomize()` + `FlyingStar.randomize()`. */
  const randomize = (icon: FlyingIcon): void => {
    icon.v = lerp(VMIN, VMAX, random());
    icon.angle = random() * 360;
    icon.anglex = Math.sin((icon.angle / 180) * Math.PI);
    icon.angley = Math.cos((icon.angle / 180) * Math.PI);
    icon.endscale = lerp(SCALE_MIN, SCALE_MAX, random());
    icon.hue = random() * 360;
    icon.sat = 0.5 + random() * 0.5;
    icon.val = 0.5 + random() * 0.5;
    if (icon.star) {
      icon.v = lerp(VMAX * 0.75, VMAX * 2, random()); // fasticate
      icon.endscale = lerp(1, 2, random()); // ensmallen
      icon.eggId = null; // FlyingStar.randomizeIcon() leaves `component` null
    } else {
      // pick() returns null for an empty array upstream; keep that guard.
      icon.eggId = launchable.length === 0 ? null : pick(launchable).id;
    }
  };

  /** `FlyingIcon.reset()`. */
  const resetIcon = (icon: FlyingIcon): void => {
    randomize(icon);
    const boardCenterX = (boardW - icon.w) / 2;
    const boardCenterY = (boardW - icon.h) / 2;
    icon.x = boardCenterX;
    icon.y = boardCenterY;
    icon.fuse = Math.max(boardCenterX, boardCenterY);
    if (icon.fuse === 0) icon.fuse = 1; // avoid divide by zero
    icon.rotation = 180 - icon.angle;
    icon.sx = 0;
    icon.sy = 0;
    icon.dist = 0;
    icon.alpha = 0;
    icon.pressed = false;
    if (pressed === icon) pressed = null;
  };

  /** `Board.reset()` + `freeStart()`: rebuild everything and restart the clock. */
  const resetBoard = (): void => {
    const { width, height } = context;
    boardW = Math.max(width, height);
    iconBase = clamp(boardW * 0.05, 36, 64);
    starBase = iconBase * 0.5;

    fixedStars = [];
    for (let i = 0; i < FIXED_STARS; i++) {
      const scale = lerp(0.25, 0.75, random());
      fixedStars.push({
        x: random() * boardW,
        y: random() * boardW,
        scale,
      });
    }

    icons = [];
    for (let i = 0; i < NUM_ICONS * 2; i++) {
      const icon = makeIcon(i < NUM_ICONS);
      icons.push(icon);
      resetIcon(icon);
    }

    totalTime = 0;
    boardScale = 0;
    maneuvering = false;
    speedScale = 1;
    pressed = null;
  };

  /** `FlyingIcon.update(dt)`, dt already scaled by mSpeedScale. */
  const updateIcon = (icon: FlyingIcon, dt: number): void => {
    icon.dist += icon.v * dt;
    icon.x += icon.anglex * icon.v * dt;
    icon.y += icon.angley * icon.v * dt;
    if (icon.endscale > 0) {
      // rangeOf(lerp(0, endscale, sqrt(dist/fuse)), 0, endscale)
      const scale = clamp(
        lerp(0, icon.endscale, Math.sqrt(icon.dist / icon.fuse)),
        0,
        icon.endscale,
      );
      const stretch = Math.pow((icon.v - VMIN) / (VMAX - VMIN), 3);
      icon.sx = scale * lerp(1, 0.75, stretch);
      icon.sy = scale * lerp(1, 1.5, stretch);
      const q1 = icon.fuse * 0.15;
      const q4 = icon.fuse * 0.75;
      if (icon.dist < q1) {
        icon.alpha = Math.sqrt(icon.dist / q1);
      } else if (icon.dist > q4) {
        icon.alpha =
          icon.dist >= icon.fuse ? 0 : 1 - Math.pow((icon.dist - q4) / (icon.fuse - q4), 2);
      } else {
        icon.alpha = 1;
      }
    }
  };

  /** Screen point -> board point, undoing the centred start-zoom scale. */
  const toBoard = (px: number, py: number): { x: number; y: number } => {
    const scale = Math.max(boardScale, 1e-3);
    return {
      x: (px - context.width / 2) / scale + boardW / 2,
      y: (py - context.height / 2) / scale + boardW / 2,
    };
  };

  const iconCenter = (icon: FlyingIcon): { cx: number; cy: number } => ({
    cx: icon.x + icon.w / 2,
    cy: icon.y + icon.h / 2,
  });

  /** Exact rotated-rect hit test, like Android's transformed touch dispatch. */
  const pointInIcon = (px: number, py: number, icon: FlyingIcon): boolean => {
    const { cx, cy } = iconCenter(icon);
    const theta = (icon.rotation * Math.PI) / 180;
    const dx = px - cx;
    const dy = py - cy;
    const lx = dx * Math.cos(theta) + dy * Math.sin(theta);
    const ly = -dx * Math.sin(theta) + dy * Math.cos(theta);
    return Math.abs(lx) <= (Math.abs(icon.sx) * icon.w) / 2 &&
      Math.abs(ly) <= (Math.abs(icon.sy) * icon.h) / 2;
  };

  /** Axis-aligned bounds of the transformed view, like getGlobalVisibleRect. */
  const iconBBoxContains = (px: number, py: number, icon: FlyingIcon): boolean => {
    const { cx, cy } = iconCenter(icon);
    const theta = (icon.rotation * Math.PI) / 180;
    const halfW = (Math.abs(icon.sx) * icon.w) / 2;
    const halfH = (Math.abs(icon.sy) * icon.h) / 2;
    const bw = Math.abs(Math.cos(theta)) * halfW + Math.abs(Math.sin(theta)) * halfH;
    const bh = Math.abs(Math.sin(theta)) * halfW + Math.abs(Math.cos(theta)) * halfH;
    return Math.abs(px - cx) <= bw && Math.abs(py - cy) <= bh;
  };

  const resetWarpTimer = (nowMs: number): void => {
    warpTimeoutAt = nowMs + WARP_TIMEOUT;
  };

  /** Uptime of the last frame (ms); the warp timer runs on the frame clock. */
  let frameNow = 0;
  let lastPointerX = 0;
  let lastPointerY = 0;

  /** `ACTION_UP` on a pressed icon: the launch zoom, then the "startActivity". */
  const launch = (icon: FlyingIcon): void => {
    icon.pressed = false;
    icon.launching = true;
    icon.launchT = 0;
    icon.launchSx0 = icon.sx;
    icon.launchSy0 = icon.sy;
    icon.launchAlpha0 = icon.alpha;
    icon.endscale = 0;
    const timer = window.setTimeout(() => {
      if (icon.eggId !== null) {
        window.location.hash = `#/eggs/${icon.eggId}`;
      }
    }, LAUNCH_ZOOM_TIME);
    launchTimers.push(timer);
  };

  resetBoard();

  const offResize = context.onResize(() => resetBoard());

  const offDown = context.onPointerDown((x, y) => {
    // The board only covers its (possibly still zooming) square.
    const half = (boardW * boardScale) / 2;
    if (Math.abs(x - context.width / 2) > half || Math.abs(y - context.height / 2) > half) {
      return;
    }
    const p = toBoard(x, y);
    if (maneuvering) {
      // onInterceptTouchEvent is false while maneuvering: children first,
      // front (last added) to back. Stars have no component and skip.
      for (let i = icons.length - 1; i >= 0; i--) {
        const icon = icons[i];
        if (icon.star || icon.eggId === null || icon.launching) continue;
        if (icon.alpha < 0.5) continue;
        if (pointInIcon(p.x, p.y, icon)) {
          pressed = icon;
          icon.pressed = true;
          resetWarpTimer(frameNow);
          return;
        }
      }
      // A background tap while maneuvering does nothing upstream.
      return;
    }
    // Board.onTouchEvent ACTION_DOWN: engage the maneuvering thrusters.
    maneuvering = true;
    resetWarpTimer(frameNow);
  });

  const offUp = context.onPointerUp(() => {
    if (pressed === null) return;
    const icon = pressed;
    pressed = null;
    if (icon.pressed) launch(icon);
    icon.pressed = false;
  });

  const offFrame = context.onFrame((dt, t) => {
    frameNow = t * 1000;
    const { ctx, width, height, pointer } = context;

    // Board TimeAnimator: the 3 s start zoom, then warp-speed bookkeeping.
    totalTime += dt * 1000;
    if (totalTime < START_ZOOM_TIME) {
      const x = totalTime / START_ZOOM_TIME;
      boardScale = clamp(1 - Math.pow(x - 1, 4), 0, 1);
    } else {
      boardScale = 1;
    }

    if (maneuvering) {
      // mSpeedScale -= 2 * deltaTime/1000 towards MANEUVERING_THRUST_SCALE.
      speedScale = Math.max(MANEUVERING_THRUST_SCALE, speedScale - 2 * dt);
      if (frameNow >= warpTimeoutAt) maneuvering = false;
    } else {
      // mSpeedScale += deltaTime/1000 back to 1.0.
      speedScale = Math.min(1, speedScale + dt);
    }

    // ACTION_MOVE on a pressed icon keeps the warp timer alive and drops the
    // press once the finger leaves the icon's transformed bounds. A held but
    // unmoved finger generates no MOVE events upstream, so no timer reset.
    if (pressed !== null) {
      if (pointer.down) {
        if (pointer.x !== lastPointerX || pointer.y !== lastPointerY) {
          resetWarpTimer(frameNow);
        }
        const p = toBoard(pointer.x, pointer.y);
        pressed.pressed = iconBBoxContains(p.x, p.y, pressed);
      } else {
        pressed.pressed = false;
        pressed = null;
      }
    }
    lastPointerX = pointer.x;
    lastPointerY = pointer.y;

    const sdt = dt * speedScale;
    for (const icon of icons) {
      updateIcon(icon, sdt);
      if (icon.launching) {
        // AnimatorSet: scale -> 15, alpha -> 0, LAUNCH_ZOOM_TIME * 1.25 ms,
        // AccelerateInterpolator(3) = t^6.
        icon.launchT += dt * 1000;
        const k = Math.min(1, icon.launchT / (LAUNCH_ZOOM_TIME * 1.25));
        const eased = Math.pow(k, 6);
        icon.sx = lerp(icon.launchSx0, 15, eased);
        icon.sy = lerp(icon.launchSy0, 15, eased);
        icon.alpha = lerp(icon.launchAlpha0, 0, eased);
        continue;
      }
      const scaledWidth = icon.w * icon.sx; // signed, as upstream getScaleX()
      const scaledHeight = icon.h * icon.sy;
      if (
        icon.x + scaledWidth < 0 ||
        icon.x - scaledWidth > boardW ||
        icon.y + scaledHeight < 0 ||
        icon.y - scaledHeight > boardW
      ) {
        resetIcon(icon);
      }
    }

    ctx.fillStyle = '#000000'; // Board.setBackgroundColor(0xFF000000)
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(boardScale, boardScale);
    ctx.translate(-boardW / 2, -boardW / 2);

    // Fixed stars: alpha 0.75, scale 0.25..0.75, never moving.
    ctx.fillStyle = '#FFFFFF';
    for (const star of fixedStars) {
      const r = (starBase * star.scale) / 2;
      ctx.globalAlpha = 0.75;
      drawSparkle(ctx, star.x + r, star.y + r, r);
    }
    ctx.globalAlpha = 1;

    for (const icon of icons) {
      if (icon.alpha <= 0.002 || (icon.sx === 0 && icon.sy === 0)) continue;
      const { cx, cy } = iconCenter(icon);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((icon.rotation * Math.PI) / 180);
      ctx.scale(icon.sx, icon.sy);
      ctx.globalAlpha = clamp(icon.alpha, 0, 1);
      if (icon.pressed) {
        // homescreen_small_blue pressed highlight (bitmap substituted).
        ctx.fillStyle = 'rgba(51, 181, 229, 0.55)';
        ctx.beginPath();
        ctx.roundRect(-icon.w * 0.62, -icon.h * 0.62, icon.w * 1.24, icon.h * 1.24, icon.w * 0.2);
        ctx.fill();
      }
      if (icon.star) {
        ctx.fillStyle = '#FFFFFF';
        drawSparkle(ctx, 0, 0, icon.w / 2);
      } else {
        // A bugdroid stands in for the easter-egg icon drawables; unit chosen
        // so the ~3.3u x 4.7u figure fits the icon square.
        const u = icon.w / 4.7;
        drawDroid(ctx, {
          x: 0,
          y: -icon.h * 0.166,
          unit: u,
          bodyColor: hsvToCss(icon.hue, icon.sat, icon.val),
          eyeColor: '#FFFFFF',
        });
      }
      ctx.restore();
    }

    ctx.restore();
  });

  return {
    hint: '点按画面开启机动推进器（减速至 1/10）；减速时按住某个图标松手即可发射对应彩蛋',
    destroy() {
      offResize();
      offDown();
      offUp();
      offFrame();
      for (const timer of launchTimers.splice(0)) window.clearTimeout(timer);
    },
  };
}
