import { PLATLOGO_EASE } from '../../core/easing';
import { Tweens } from '../../core/tween';
import type { Egg, EggContext } from '../../core/types';

/**
 * Android 8.0 / 8.1 Oreo.
 *
 * PlatLogo: the concentric "cookie" (8.0) or the stacked cookie with an embossed
 * droid and dotted rim (8.1), rippling in #776677. Five taps arm the long press
 * that opens the aquarium.
 *
 * Ocquarium: an OctopusDrawable port. Everything lives in a 100 unit space
 * scaled by sizePx/100, where sizePx is a random 40-180 dp diameter chosen once
 * per launch. The mantle is an 80 x 100 ellipse centred 10 units above `point`
 * with a 4 unit mouth slit, two r=6 eyes at (+/-16, -12) that blink for 200 ms
 * at p=0.001 per frame, and eight 3-link tentacles anchored along y=+26 at
 * x = bias*30. Link 1 is rigid, links 2 and 3 are SpringForce chains with
 * dampingRatio 0.3 (DAMPING_RATIO_LOW_BOUNCY) and stiffness 50
 * (STIFFNESS_VERY_LOW) and 25 (STIFFNESS_VERY_LOW / 2). Tentacles are tapered
 * strokes: discs of radius lerp(14 -> 2) stamped every max(r/4, 800/sizePx)
 * units, always ending with a disc at the path end. Drift runs at ay=30 with
 * vy clamped to 35, a -100 jet impulse every 5-10 s and ax = 15*sin(t*0.25).
 * Only a press that lands on the octopus grabs it (hitTest on ACTION_DOWN);
 * releasing resumes the drift with the TimeAnimator clock reset to 0 while
 * the velocities and the next-jump time persist, exactly like cancel()+start().
 */

const BASE_SCALE = 100;
const BODY_COLOR = '#101010';
const ARM_BACK_COLOR = '#000000';
const EYE_COLOR = '#808080';
const RIPPLE_COLOR = 'rgba(119, 102, 119, 0.55)';

const BACK_ARMS = [1, 3, 4, 6];
const FRONT_ARMS = [0, 2, 5, 7];

const MAX_VY = 35;
const JUMP_VY = -100;
const MAX_VX = 15;
const GRAVITY = 30;

/** `SpringForce.DAMPING_RATIO_LOW_BOUNCY`. */
const DAMPING_RATIO = 0.3;
/** `SpringForce.STIFFNESS_LOW` — link 1 is always locked, this is never simulated. */
const STIFFNESS_LOW = 200;
/** `SpringForce.STIFFNESS_VERY_LOW`. */
const STIFFNESS_VERY_LOW = 50;

const LONG_PRESS_MS = 500;
const TAPS_TO_ARM = 5;

/**
 * `o_platlogo.xml`: the darker lower-right cookie chip is NOT a radial wedge —
 * its straight edges run from the r=14 circle out to the r=20 circle along
 * y = x -/+ 19.8, so the exact pathData is reused verbatim (48 unit viewport).
 */
const OREO_CHIP = new Path2D(
  'M44,24.2010101 L33.9004889,14.101499 L14.101499,33.9004889 L24.2010101,44' +
    ' C29.2525804,43.9497929 34.2887564,41.9975027 38.1431296,38.1431296' +
    ' C41.9975027,34.2887564 43.9497929,29.2525804 44,24.2010101 Z',
);
const OREO_CHIP_INNER = new Path2D(
  'M37.7829445,26.469236 L29.6578482,18.3441397 L18.3441397,29.6578482 L26.469236,37.7829445' +
    ' C29.1911841,37.2979273 31.7972024,36.0037754 33.9004889,33.9004889' +
    ' C36.0037754,31.7972024 37.2979273,29.1911841 37.7829445,26.469236 Z',
);
/** `o_point_platlogo.xml`: the embossed 8.1 droid outline, stroked at width 1. */
const POINT_DROID = new Path2D(
  'M26.5 29.5v3c0 1.13-0.87 2-2 2s-2-0.87-2-2v-3h-1v3c0 1.13-0.87 2-2 2s-2-0.87-2-2v-3H17' +
    'a1.5 1.5 0 0 1-1.5-1.5V17.5h13V28a1.5 1.5 0 0 1-1.5 1.5h-0.5z' +
    'M13.5 17.5c1.13 0 2 0.87 2 2v7c0 1.13-0.87 2-2 2s-2-0.87-2-2v-7c0-1.13 0.87-2 2-2z' +
    'M30.5 17.5c1.13 0 2 0.87 2 2v7c0 1.13-0.87 2-2 2s-2-0.87-2-2v-7c0-1.13 0.87-2 2-2z' +
    'M26.3 12.11A6.46 6.46 0 0 1 28.5 17v0.5h-13V17a6.46 6.46 0 0 1 2.2-4.89l-0.9-0.9' +
    'a0.98 0.98 0 0 1 0-1.41 0.98 0.98 0 0 1 1.4 0l1.26 1.25A6.33 6.33 0 0 1 22 10.5' +
    'c0.87 0 1.73 0.2 2.54 0.55L25.8 9.8a0.98 0.98 0 0 1 1.4 0 0.98 0.98 0 0 1 0 1.4l-0.9 0.91z',
);

interface Link {
  x: number;
  y: number;
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  stiffness: number;
  locked: boolean;
}

interface Arm {
  bias: number;
  links: [Link, Link, Link];
}

interface Octopus {
  px: number;
  py: number;
  vx: number;
  vy: number;
  sizePx: number;
  blinking: boolean;
  unblinkAt: number;
  nextJumpAt: number;
  arms: Arm[];
}

function makeLink(dx: number, dy: number, stiffness: number, locked: boolean): Link {
  return { x: 0, y: 0, dx, dy, vx: 0, vy: 0, stiffness, locked };
}

function makeOctopus(context: EggContext, width: number, height: number): Octopus {
  const sizePx = (40 + context.random() * 140) * 1;
  const arms: Arm[] = [];

  for (let i = 0; i < 8; i++) {
    const bias = i / 7 - 0.5;
    arms.push({
      bias,
      links: [
        makeLink(
          10 * bias + context.random() * 20,
          20 + context.random() * 30,
          STIFFNESS_LOW,
          true,
        ),
        makeLink(
          40 * bias + (context.random() * 120 - 60),
          30 + context.random() * 50,
          STIFFNESS_VERY_LOW,
          false,
        ),
        makeLink(
          context.random() * 80 - 40,
          context.random() * 120 - 80,
          STIFFNESS_VERY_LOW / 2,
          false,
        ),
      ],
    });
  }

  const octo: Octopus = {
    px: width / 2 / (sizePx / BASE_SCALE),
    py: height / 2 / (sizePx / BASE_SCALE),
    vx: 0,
    vy: 0,
    sizePx,
    blinking: false,
    unblinkAt: 0,
    nextJumpAt: 0,
    arms,
  };
  repositionArms(octo);
  settleArms(octo);
  return octo;
}

function repositionArms(octo: Octopus): void {
  for (const arm of octo.arms) {
    const [l1] = arm.links;
    l1.x = octo.px + arm.bias * 30;
    l1.y = octo.py + 26;
  }
}

/** `lockArms(true); moveTo(...); lockArms(false)` — the rigid rest pose. */
function settleArms(octo: Octopus): void {
  repositionArms(octo);
  for (const arm of octo.arms) {
    const [l1, l2, l3] = arm.links;
    l2.x = l1.x + l1.dx;
    l2.y = l1.y + l1.dy;
    l3.x = l2.x + l2.dx;
    l3.y = l2.y + l2.dy;
    for (const link of arm.links) {
      link.vx = 0;
      link.vy = 0;
    }
  }
}

function linkEnd(link: Link): [number, number] {
  return [link.x + link.dx, link.y + link.dy];
}

/**
 * `SpringForce.updateValueAndVelocity` (androidx.dynamicanimation, mass 1):
 * the exact closed-form solution of the damped harmonic oscillator, which is
 * what upstream integrates once per display frame.
 */
function springStep(
  value: number,
  velocity: number,
  target: number,
  stiffness: number,
  dt: number,
): [number, number] {
  const naturalFreq = Math.sqrt(stiffness);
  const dampedFreq = naturalFreq * Math.sqrt(1 - DAMPING_RATIO * DAMPING_RATIO);
  const decay = Math.exp(-DAMPING_RATIO * naturalFreq * dt);
  const cosCoeff = decay;
  const sinCoeff = (1 / dampedFreq) * DAMPING_RATIO * naturalFreq * decay;
  const displacement = (value - target) * cosCoeff + velocity * sinCoeff;
  const newVelocity =
    (value - target) * (-sinCoeff) * dampedFreq * dampedFreq + velocity * cosCoeff;
  return [displacement + target, newVelocity];
}

function stepSprings(octo: Octopus, dt: number): void {
  for (const arm of octo.arms) {
    const [l1, l2, l3] = arm.links;

    // Link 2 springs toward link 1's end.
    const [l1ex, l1ey] = linkEnd(l1);
    [l2.x, l2.vx] = springStep(l2.x, l2.vx, l1ex, l2.stiffness, dt);
    [l2.y, l2.vy] = springStep(l2.y, l2.vy, l1ey, l2.stiffness, dt);

    // Link 3 springs toward link 2's end, re-read AFTER link 2 moved: the
    // chained `animateTo(end())` update listener retargets it within the same
    // frame.
    const [l2ex, l2ey] = linkEnd(l2);
    [l3.x, l3.vx] = springStep(l3.x, l3.vx, l2ex, l3.stiffness, dt);
    [l3.y, l3.vy] = springStep(l3.y, l3.vy, l2ey, l3.stiffness, dt);
  }
}

function armPolyline(arm: Arm): Array<[number, number]> {
  const [l1, l2, l3] = arm.links;
  const [l2ex, l2ey] = linkEnd(l2);
  const [l3ex, l3ey] = linkEnd(l3);
  const midX = l2.x + l2.dx / 2;
  const midY = l2.y + l2.dy / 2;

  const points: Array<[number, number]> = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    points.push([
      mt * mt * l1.x + 2 * mt * t * l2.x + t * t * midX,
      mt * mt * l1.y + 2 * mt * t * l2.y + t * t * midY,
    ]);
  }
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    points.push([
      mt * mt * midX + 2 * mt * t * l2ex + t * t * l3ex,
      mt * mt * midY + 2 * mt * t * l2ey + t * t * l3ey,
    ]);
  }
  return points;
}

function drawArm(ctx: CanvasRenderingContext2D, arm: Arm, color: string, minStep: number): void {
  const points = armPolyline(arm);
  const lengths: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    lengths.push(total);
  }
  if (total <= 0) return;

  const at = (dist: number): [number, number] => {
    let i = 1;
    while (i < lengths.length - 1 && lengths[i] < dist) i++;
    const span = lengths[i] - lengths[i - 1] || 1;
    const t = (dist - lengths[i - 1]) / span;
    return [
      points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
      points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
    ];
  };

  ctx.fillStyle = color;
  // `TaperedPathStroke.drawPath`: walk forward by max(r/4, minStep) and always
  // stamp the final disc at t = len, so the tapered tip is never truncated.
  let d = 0;
  let last = false;
  for (;;) {
    if (d >= total) {
      d = total;
      last = true;
    }
    const r = 14 + (2 - 14) * (d / total);
    const [x, y] = at(d);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    d += Math.max(r * 0.25, minStep);
    if (last) break;
  }
}

function drawOctopus(ctx: CanvasRenderingContext2D, octo: Octopus): void {
  const minStep = (8 * BASE_SCALE) / octo.sizePx;
  const { px, py } = octo;

  for (const i of BACK_ARMS) drawArm(ctx, octo.arms[i], ARM_BACK_COLOR, minStep);

  ctx.fillStyle = EYE_COLOR;
  ctx.beginPath();
  ctx.arc(px, py, 36, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = BODY_COLOR;
  ctx.beginPath();
  ctx.ellipse(px, py - 10, 40, 50, 0, 0, Math.PI * 2);
  ctx.fill();

  // The mouth slit: the mantle is drawn with `clipOutRect(x-61, y+8, x+61,
  // y+12)`, so what shows through the 4 unit gap is the grey r=36 under-disc
  // — clipped to that circle, not a free-floating bar.
  ctx.save();
  ctx.beginPath();
  ctx.arc(px, py, 36, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = EYE_COLOR;
  ctx.fillRect(px - 61, py + 8, 122, 4);
  ctx.restore();

  ctx.fillStyle = EYE_COLOR;
  for (const dir of [-1, 1]) {
    const ex = px + dir * 16;
    const ey = py - 12;
    ctx.beginPath();
    if (octo.blinking) {
      const r = 0.6;
      ctx.moveTo(ex - 6 + r, ey - 0.6);
      ctx.lineTo(ex + 6 - r, ey - 0.6);
      ctx.arc(ex + 6 - r, ey, r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(ex - 6 + r, ey + 0.6);
      ctx.arc(ex - 6 + r, ey, r, Math.PI / 2, -Math.PI / 2);
      ctx.closePath();
    } else {
      ctx.arc(ex, ey, 6, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  for (const i of FRONT_ARMS) drawArm(ctx, octo.arms[i], BODY_COLOR, minStep);
}

type Scene = 'platlogo' | 'aquarium';

export default function createOreo(context: EggContext): Egg {
  const tweens = new Tweens();
  let scene: Scene = 'platlogo';
  let variant = context.store.get<'8.0' | '8.1'>('variant', '8.0');
  let scale = 0.5;
  let alpha = 0;
  let taps = 0;
  let downAt = -1;
  let wasDown = false;
  const ripples: Array<{ x: number; y: number; born: number }> = [];

  let octo: Octopus | null = null;
  let sceneAlpha = 0;
  let sceneStart = 0;
  let dragging = false;
  let driftTime = 0;
  /** Host clock (ms since egg mount) of the current/last frame, for actions. */
  let frameNow = 0;

  const enterAquarium = (now: number): void => {
    if (context.store.get<number>('o_egg_mode', 0) === 0) {
      context.store.set('o_egg_mode', Date.now());
    }
    scene = 'aquarium';
    sceneAlpha = 0;
    sceneStart = now;
    octo = makeOctopus(context, context.width, context.height);
    dragging = false;
    driftTime = 0;
  };

  const offResize = context.onResize(() => {
    const oct = octo;
    if (scene !== 'aquarium' || oct === null) return;
    // `OctopusDrawable.onBoundsChange`: lockArms(true), moveTo(centre),
    // lockArms(false) — the octopus keeps its size and identity.
    const k = oct.sizePx / BASE_SCALE;
    oct.px = context.width / 2 / k;
    oct.py = context.height / 2 / k;
    settleArms(oct);
  });

  const offFrame = context.onFrame((dt, t) => {
    const now = t * 1000;
    frameNow = now;
    tweens.update(now);

    if (context.pointer.down && !wasDown) {
      downAt = now;
      if (scene === 'platlogo') {
        // The RippleDrawable reacts on touch down.
        ripples.push({ x: context.pointer.x, y: context.pointer.y, born: now });
      } else if (octo !== null) {
        // Ocquarium ACTION_DOWN: only a press that hits the octopus grabs it
        // (`octo.hitTest`); moving over it later in the gesture does nothing.
        const k = octo.sizePx / BASE_SCALE;
        const x = context.pointer.x / k;
        const y = context.pointer.y / k;
        if (Math.hypot(x - octo.px, y - octo.py) < BASE_SCALE / 2) dragging = true;
      }
    }
    if (!context.pointer.down && wasDown) {
      const held = downAt < 0 ? 0 : now - downAt;
      downAt = -1;
      if (scene === 'platlogo') {
        if (held >= LONG_PRESS_MS && taps >= TAPS_TO_ARM) {
          enterAquarium(now);
          wasDown = context.pointer.down;
          return;
        }
        // Upstream every release performs a click — even a long press that
        // returned false from `onLongClick` because fewer than 5 taps were
        // armed — and each click ripples and counts.
        taps++;
      } else {
        // ACTION_UP: touching = false; startDrift() — called for EVERY
        // release, even a tap on empty water. Restarting the TimeAnimator
        // resets totalTime to 0 while the listener fields (vx, vy, nextjump,
        // unblink) persist; there is no jet on release.
        dragging = false;
        driftTime = 0;
      }
    }
    wasDown = context.pointer.down;

    if (scene === 'platlogo') {
      drawPlatLogo(now);
      return;
    }

    const oct = octo;
    if (oct === null) return;

    // `bg.animate().setStartDelay(500).setDuration(5000).alpha(1f)` — a
    // ViewPropertyAnimator, so it runs on AccelerateDecelerateInterpolator.
    const fadeIn = Math.min(1, Math.max(0, (now - sceneStart - 500) / 5000));
    sceneAlpha = 0.5 - Math.cos(Math.PI * fadeIn) / 2;

    const k = oct.sizePx / BASE_SCALE;
    const boundsW = context.width / k;
    const boundsH = context.height / k;

    if (dragging && context.pointer.down) {
      // ACTION_MOVE while touching: moveTo(x, y).
      oct.px = context.pointer.x / k;
      oct.py = context.pointer.y / k;
    }

    if (!dragging) {
      driftTime += dt * 1000;
      if (driftTime > oct.nextJumpAt) {
        oct.vy = JUMP_VY;
        oct.nextJumpAt = driftTime + 5000 + context.random() * 5000;
      }
      // `onTimeUpdate`: the blink re-rolls every frame until it is time to
      // unblink, so blinking can extend itself.
      if (oct.unblinkAt > 0 && driftTime > oct.unblinkAt) {
        oct.blinking = false;
        oct.unblinkAt = 0;
      } else if (context.random() < 0.001) {
        oct.blinking = true;
        oct.unblinkAt = driftTime + 200;
      }

      const ax = MAX_VX * Math.sin((driftTime / 1000) * 0.25);
      oct.vx = Math.max(-MAX_VX, Math.min(MAX_VX, oct.vx + dt * ax));
      oct.vy = Math.max(-100 * MAX_VY, Math.min(MAX_VY, oct.vy + dt * GRAVITY));

      if (oct.py - BASE_SCALE / 2 > boundsH) oct.vy = JUMP_VY;
      else if (oct.py + BASE_SCALE < 0) oct.vy = MAX_VY;

      oct.px = Math.max(0, Math.min(boundsW, oct.px + dt * oct.vx));
      oct.py += dt * oct.vy;
    }

    repositionArms(oct);
    stepSprings(oct, dt);

    const { ctx, width, height } = context;
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#205090');
    sky.addColorStop(1, '#001040');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = sceneAlpha;
    ctx.scale(k, k);
    drawOctopus(ctx, oct);
    ctx.restore();
  });

  function drawPlatLogo(now: number): void {
    const { ctx, width, height } = context;
    ctx.fillStyle = '#12141a';
    ctx.fillRect(0, 0, width, height);

    // `PlatLogoActivity`: the view is min(min(w, h), 600dp) - 100dp with a
    // 40dp padding on every side, so the drawable is 180 units below the cap.
    const size = Math.max(40, Math.min(Math.min(width, height), 600) - 180) * scale;
    const cx = width / 2;
    const cy = height / 2;
    const k = size / 48;

    ctx.save();
    ctx.globalAlpha = alpha;

    for (let i = ripples.length - 1; i >= 0; i--) {
      const ripple = ripples[i];
      const age = (now - ripple.born) / 400;
      if (age >= 1) {
        ripples.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = alpha * (1 - age);
      ctx.fillStyle = RIPPLE_COLOR;
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, size * 0.6 * age, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.translate(-24, -24);
    if (variant === '8.0') drawOreoLogo(ctx);
    else drawPointLogo(ctx);
    ctx.restore();
  }

  function drawOreoLogo(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.066)';
    ctx.beginPath();
    ctx.arc(25, 25, 20.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFC107';
    ctx.beginPath();
    ctx.arc(24, 24, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FE9F00';
    ctx.fill(OREO_CHIP);

    ctx.fillStyle = '#FED44F';
    ctx.beginPath();
    ctx.arc(24, 24, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFC107';
    ctx.fill(OREO_CHIP_INNER);

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(24, 24, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPointLogo(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#2C292A';
    ctx.beginPath();
    ctx.arc(26, 26, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FAFAFA';
    ctx.beginPath();
    ctx.arc(24, 24, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2C292A';
    ctx.beginPath();
    ctx.arc(22, 22, 20, 0, Math.PI * 2);
    ctx.fill();

    // Embossed droid outline: the exact `o_point_platlogo` stroke path
    // (transparent fill, #453F41 at width 1, butt caps and miter joins).
    ctx.strokeStyle = '#453F41';
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.stroke(POINT_DROID);

    ctx.fillStyle = '#453F41';
    for (const ex of [19.5, 24.5]) {
      ctx.beginPath();
      ctx.arc(ex, 14.5, 0.65, 0, Math.PI * 2);
      ctx.fill();
    }

    // The dotted rim: 53 trapezoid ticks (the vector path is 53 subpaths plus
    // a closing sliver that overlaps the first), spanning r 15.5..18.5 around
    // (22, 22), each ~3.37 degrees wide, starting dead at 6 o'clock.
    const tickWidth = (3.375 * Math.PI) / 180;
    for (let i = 0; i < 53; i++) {
      const a0 = ((90 - i * (360 / 53)) * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(22, 22, 18.5, a0 - tickWidth, a0);
      ctx.arc(22, 22, 15.5, a0, a0 - tickWidth, true);
      ctx.closePath();
      ctx.fill();
    }
  }

  tweens.add(
    { delay: 800, duration: 500, ease: PLATLOGO_EASE, from: 0.5, to: 1, onUpdate: (v) => (scale = v) },
    0,
  );
  tweens.add(
    { delay: 800, duration: 500, ease: PLATLOGO_EASE, from: 0, to: 1, onUpdate: (v) => (alpha = v) },
    0,
  );

  context.actions.add({
    id: 'variant',
    label: variant === '8.0' ? '切到 8.1 logo' : '切到 8.0 logo',
    run: () => {
      variant = variant === '8.0' ? '8.1' : '8.0';
      context.store.set('variant', variant);
    },
  });

  context.actions.add({
    id: 'aquarium',
    label: '进入 Ocquarium',
    run: () => {
      if (scene === 'platlogo') {
        scale = 1;
        alpha = 1;
        // `frameNow` is the host clock the fade is measured against —
        // starting 600 ms "ago" skips most of the 500 ms delay.
        enterAquarium(frameNow - 600);
      } else {
        scene = 'platlogo';
        octo = null;
      }
    },
  });

  return {
    hint: '点 5 次以上再长按进入水族箱；按住章鱼可拖动，松手恢复漂移',
    destroy() {
      offFrame();
      offResize();
      tweens.cancelAll();
    },
  };
}
