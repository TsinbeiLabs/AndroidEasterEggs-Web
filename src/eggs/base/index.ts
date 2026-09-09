import { drawDroid } from '../../core/art';
import { PLATLOGO_EASE } from '../../core/easing';
import { Tweens } from '../../core/tween';
import type { Egg, EggContext, EggFactory } from '../../core/types';

/**
 * Android 1.0 - 2.2 (Base, Petit Four, Cupcake, Donut, Eclair, Froyo).
 *
 * Upstream serves all six from one Compose `PlatLogoActivity`: a centred logo at
 * `min(width, height) * 0.6` that toasts "Android <version>: <nickname>" on tap.
 * The AOSP art for these versions is a raster logo, so each is drawn here as the
 * bugdroid in a version-specific accent with the dessert name underneath.
 */

interface Variant {
  version: string;
  nickname: string;
  accent: string;
}

export function createBaseEgg(variant: Variant): EggFactory {
  return (context: EggContext): Egg => {
    const tweens = new Tweens();
    let scale = 0.6;
    let alpha = 0;
    let wasDown = false;

    const offFrame = context.onFrame((_dt, t) => {
      const now = t * 1000;
      tweens.update(now);
      const { ctx, width, height, pointer } = context;

      if (pointer.down && !wasDown) {
        context.toast(`Android ${variant.version}: ${variant.nickname}`, 2);
      }
      wasDown = pointer.down;

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#15181d');
      gradient.addColorStop(1, '#080a0d');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      const size = Math.min(width, height) * 0.6 * scale;
      ctx.save();
      ctx.globalAlpha = alpha;
      drawDroid(ctx, {
        x: width / 2,
        y: height / 2 - size * 0.16,
        unit: size * 0.16,
        bodyColor: variant.accent,
        eyeColor: '#101418',
      });

      ctx.fillStyle = '#FFFFFF';
      ctx.font = `600 ${Math.max(16, size * 0.09)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(variant.nickname, width / 2, height / 2 + size * 0.34);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.font = `400 ${Math.max(12, size * 0.055)}px system-ui, sans-serif`;
      ctx.fillText(`Android ${variant.version}`, width / 2, height / 2 + size * 0.44);
      ctx.restore();
    });

    tweens.add(
      { delay: 200, duration: 400, ease: PLATLOGO_EASE, from: 0.6, to: 1, onUpdate: (v) => (scale = v) },
      0,
    );
    tweens.add(
      { delay: 200, duration: 400, ease: PLATLOGO_EASE, from: 0, to: 1, onUpdate: (v) => (alpha = v) },
      0,
    );

    return {
      hint: '点击任意位置',
      destroy() {
        offFrame();
        tweens.cancelAll();
      },
    };
  };
}
