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
 * dampingRatio 0.3 and stiffness 10 and 5. Tentacles are tapered strokes: discs
 * of radius lerp(14 -> 2) stamped every max(r/4, 800/sizePx) units. Drift runs
 * at ay=30 with vy clamped to 35, a -100 jet impulse every 5-10 s and
 * ax = 15*sin(t*0.25). Dragging moves the head 1:1 and releasing always jets.
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
/** Spring integration is only stable for small steps; clamp long frames. */
const SPRING_MAX_DT = 1 / 30;

const LONG_PRESS_MS = 500;
const TAPS_TO_ARM = 5;

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
          50,
          true,
        ),
        makeLink(
          40 * bias + (context.random() * 120 - 60),
          30 + context.random() * 50,
          10,
          false,
        ),
        makeLink(context.random() * 80 - 40, context.random() * 120 - 80, 5, false),
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

function stepSprings(octo: Octopus, dt: number): void {
  for (const arm of octo.arms) {
    const [l1, l2, l3] = arm.links;
    const [l1ex, l1ey] = linkEnd(l1);
    const [l2ex, l2ey] = linkEnd(l2);

    for (const [link, tx, ty] of [
      [l2, l1ex, l1ey],
      [l3, l2ex, l2ey],
    ] as Array<[Link, number, number]>) {
      const damping = 2 * 0.3 * Math.sqrt(link.stiffness);
      const ax = -link.stiffness * (link.x - tx) - damping * link.vx;
      const ay = -link.stiffness * (link.y - ty) - damping * link.vy;
      link.vx += ax * dt;
      link.vy += ay * dt;
      link.x += link.vx * dt;
      link.y += link.vy * dt;
    }
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
  let d = 0;
  while (d <= total) {
    const r = 14 + (2 - 14) * (d / total);
    const [x, y] = at(d);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    d += Math.max(r * 0.25, minStep);
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

  // The mouth slit: the grey disc showing through a 4 unit gap in the mantle.
  ctx.fillStyle = EYE_COLOR;
  ctx.fillRect(px - 35.1, py + 8, 70.2, 4);

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
    if (scene === 'aquarium') octo = makeOctopus(context, context.width, context.height);
  });

  const offFrame = context.onFrame((dt, t) => {
    const now = t * 1000;
    tweens.update(now);

    if (context.pointer.down && !wasDown) downAt = now;
    if (!context.pointer.down && wasDown) {
      const held = downAt < 0 ? 0 : now - downAt;
      downAt = -1;
      if (scene === 'platlogo') {
        if (held >= LONG_PRESS_MS) {
          if (taps >= TAPS_TO_ARM) {
            enterAquarium(now);
            wasDown = context.pointer.down;
            return;
          }
        } else {
          taps++;
          ripples.push({ x: context.pointer.x, y: context.pointer.y, born: now });
        }
      } else if (octo !== null) {
        dragging = false;
        octo.vy = JUMP_VY;
        octo.nextJumpAt = driftTime + 5000 + context.random() * 5000;
      }
    }
    wasDown = context.pointer.down;

    if (scene === 'platlogo') {
      drawPlatLogo(now);
      return;
    }

    const oct = octo;
    if (oct === null) return;

    sceneAlpha = Math.min(1, Math.max(0, (now - sceneStart - 500) / 5000));

    const k = oct.sizePx / BASE_SCALE;
    const boundsW = context.width / k;
    const boundsH = context.height / k;

    if (context.pointer.down) {
      const x = context.pointer.x / k;
      const y = context.pointer.y / k;
      if (!dragging && Math.hypot(x - oct.px, y - oct.py) < BASE_SCALE / 2) {
        dragging = true;
      }
      if (dragging) {
        oct.px = x;
        oct.py = y;
      }
    }

    if (!dragging) {
      driftTime += dt * 1000;
      if (driftTime > oct.nextJumpAt) {
        oct.vy = JUMP_VY;
        oct.nextJumpAt = driftTime + 5000 + context.random() * 5000;
      }
      if (oct.blinking && driftTime > oct.unblinkAt) oct.blinking = false;
      else if (!oct.blinking && context.random() < 0.001) {
        oct.blinking = true;
        oct.unblinkAt = driftTime + 200;
      }

      const ax = MAX_VX * Math.sin((driftTime / 1000) * 0.25);
      oct.vx = Math.max(-MAX_VX, Math.min(MAX_VX, oct.vx + dt * ax));
      oct.vy = Math.max(-3500, Math.min(MAX_VY, oct.vy + dt * GRAVITY));

      if (oct.py - 50 > boundsH) oct.vy = JUMP_VY;
      else if (oct.py + 100 < 0) oct.vy = MAX_VY;

      oct.px = Math.max(0, Math.min(boundsW, oct.px + dt * oct.vx));
      oct.py += dt * oct.vy;
    }

    repositionArms(oct);
    stepSprings(oct, Math.min(dt, SPRING_MAX_DT));

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

    const size = Math.max(40, Math.min(Math.min(width, height), 600) - 100) * scale;
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
    ctx.beginPath();
    ctx.arc(24, 24, 20, -Math.PI / 4, (3 * Math.PI) / 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#FED44F';
    ctx.beginPath();
    ctx.arc(24, 24, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFC107';
    ctx.beginPath();
    ctx.arc(24, 24, 14, -Math.PI / 4, (3 * Math.PI) / 4);
    ctx.closePath();
    ctx.fill();

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

    // Embossed droid outline.
    ctx.strokeStyle = '#453F41';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(17, 17.5);
    ctx.lineTo(17, 27.5);
    ctx.arc(18.5, 27.5, 1.5, Math.PI, 0, true);
    ctx.lineTo(20, 22);
    ctx.moveTo(28.5, 17.5);
    ctx.lineTo(28.5, 27.5);
    ctx.arc(27, 27.5, 1.5, 0, Math.PI, true);
    ctx.lineTo(25.5, 22);
    ctx.moveTo(15.5, 17);
    ctx.arc(22, 17, 6.5, Math.PI, 0);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(19.5, 29.5);
    ctx.lineTo(19.5, 33.5);
    ctx.arc(20.5, 33.5, 1, Math.PI, 0, true);
    ctx.lineTo(21.5, 29.5);
    ctx.moveTo(24.5, 29.5);
    ctx.lineTo(24.5, 33.5);
    ctx.arc(25.5, 33.5, 1, Math.PI, 0, true);
    ctx.lineTo(26.5, 29.5);
    ctx.moveTo(13.5, 19.5);
    ctx.lineTo(13.5, 26.5);
    ctx.arc(13.5, 26.5, 2, Math.PI, 0, true);
    ctx.moveTo(30.5, 19.5);
    ctx.lineTo(30.5, 26.5);
    ctx.arc(30.5, 26.5, 2, Math.PI, 0, true);
    ctx.moveTo(16.6, 11.2);
    ctx.lineTo(19, 15);
    ctx.moveTo(27.2, 11.2);
    ctx.lineTo(25, 15);
    ctx.stroke();

    ctx.fillStyle = '#453F41';
    for (const ex of [19.5, 24.5]) {
      ctx.beginPath();
      ctx.arc(ex, 14.5, 0.65, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = '#453F41';
    ctx.lineWidth = 1;
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(22 + Math.cos(a) * 15.5, 22 + Math.sin(a) * 15.5);
      ctx.lineTo(22 + Math.cos(a) * 18.5, 22 + Math.sin(a) * 18.5);
      ctx.stroke();
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
        enterAquarium(performance.now());
        sceneStart = performance.now() - 600;
      } else {
        scene = 'platlogo';
        octo = null;
      }
    },
  });

  return {
    hint: '点 5 次以上再长按进入水族箱；按住章鱼可拖动，松手会喷水',
    destroy() {
      offFrame();
      offResize();
      tweens.cancelAll();
    },
  };
}
