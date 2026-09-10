import { PLATLOGO_EASE } from '../../core/easing';
import { Tweens } from '../../core/tween';
import type { Egg, EggContext } from '../../core/types';
import { NekoPanel } from '../shared/neko';

/**
 * Android 7.0 / 7.1 Nougat — Neko.
 *
 * PlatLogo is the "N" ribbon: five flat paths in a 48 unit viewport (two pastel
 * bars, two 25 % black joint shadows and the diagonal stroke on top), rippling
 * white. It scales 0.5 -> 1 and fades in at +800 ms over 500 ms. Five taps arm
 * the long press that unlocks the cat collector, which lives in `shared/neko`.
 */

const N_PATHS: ReadonlyArray<readonly [string, string, number]> = [
  ['M32,12.5 L32,40.5 L44,35.5 L44,7.5 Z', '#C7D4B6', 1],
  ['M4,40.5 L16,35.5 L16,24.5 L4,12.5 Z', '#FBD3CB', 1],
  ['M44,35.5 L32,23.5 L32,19.5 Z', '#000000', 0.251],
  ['M4,12.5 L16,24.5 L16,28.5 Z', '#000000', 0.251],
  ['M32,23.5 L16,7.5 L4,12.5 L16,24.5 L32,40.5 L44,35.5 Z', '#E0E0D6', 1],
];

const RIPPLE_COLOR = 'rgba(255, 255, 255, 0.5)';
const LONG_PRESS_MS = 500;
const TAPS_TO_ARM = 5;

type Scene = 'platlogo' | 'neko';

export default function createNougat(context: EggContext): Egg {
  const tweens = new Tweens();
  const paths = N_PATHS.map(([d]) => new Path2D(d));
  const neko = new NekoPanel(context, {
    heading: 'Neko · Android 7.0',
    subtitle: '放食物到食盆，等猫来访（Nougat 的快速设置磁贴版）',
  });

  let scene: Scene = 'platlogo';
  let scale = 0.5;
  let alpha = 0;
  let taps = 0;
  let downAt = -1;
  let wasDown = false;
  const ripples: Array<{ x: number; y: number; born: number }> = [];

  const enterNeko = (): void => {
    if (context.store.get<number>('n_egg_mode', 0) === 0) {
      context.store.set('n_egg_mode', Date.now());
    }
    scene = 'neko';
    neko.mount();
  };

  const offFrame = context.onFrame((_dt, t) => {
    const now = t * 1000;
    tweens.update(now);
    const { ctx, width, height } = context;

    ctx.fillStyle = '#12161b';
    ctx.fillRect(0, 0, width, height);
    if (scene === 'neko') return;

    if (context.pointer.down && !wasDown) {
      downAt = now;
      ripples.push({ x: context.pointer.x, y: context.pointer.y, born: now });
    }
    if (!context.pointer.down && wasDown) {
      const held = downAt < 0 ? 0 : now - downAt;
      downAt = -1;
      if (held >= LONG_PRESS_MS && taps >= TAPS_TO_ARM) {
        wasDown = context.pointer.down;
        enterNeko();
        return;
      }
      // Every other release counts as a click — upstream a long press with
      // fewer than 5 taps returns false from `onLongClick`, and the click
      // still fires (and ripples) on release.
      taps++;
    }
    wasDown = context.pointer.down;

    // `PlatLogoActivity`: the view is min(min(w, h), 600dp) - 100dp with a 40dp
    // padding on every side, so the drawable itself is 180 units smaller than
    // the min side cap.
    const size = Math.max(40, Math.min(Math.min(width, height), 600) - 180) * scale;
    const cx = width / 2;
    const cy = height / 2;
    const k = size / 48;

    ctx.save();
    for (let i = ripples.length - 1; i >= 0; i--) {
      const ripple = ripples[i];
      const age = (now - ripple.born) / 400;
      if (age >= 1) {
        ripples.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = alpha * (1 - age);
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = RIPPLE_COLOR;
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, size * 0.6 * age, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.translate(-24, -24);
    N_PATHS.forEach(([, color, opacity], i) => {
      ctx.globalAlpha = alpha * opacity;
      ctx.fillStyle = color;
      ctx.fill(paths[i]);
    });
    ctx.restore();
  });

  tweens.add(
    { delay: 800, duration: 500, ease: PLATLOGO_EASE, from: 0.5, to: 1, onUpdate: (v) => (scale = v) },
    0,
  );
  tweens.add(
    { delay: 800, duration: 500, ease: PLATLOGO_EASE, from: 0, to: 1, onUpdate: (v) => (alpha = v) },
    0,
  );

  context.actions.add({
    id: 'neko',
    label: '打开 Neko',
    run: () => {
      if (scene === 'neko') return;
      scale = 1;
      alpha = 1;
      enterNeko();
    },
  });

  context.actions.add({
    id: 'feed',
    label: '喂猫（立即结算）',
    run: () => neko.visitNow(),
  });

  return {
    hint: '点 5 次以上再长按解锁 Neko；放食物等猫，或用“喂猫”立即结算',
    destroy() {
      offFrame();
      tweens.cancelAll();
      neko.destroy();
    },
  };
}
