import { PLATLOGO_EASE } from '../../core/easing';
import { Tweens } from '../../core/tween';
import type { Egg, EggContext, EggFactory } from '../../core/types';
import { drawVectorArt } from '../shared/vectorArt';
import type { VectorArt } from '../shared/vectorArtTypes';

/**
 * Android 1.0 - 2.2 (Base, Petit Four, Cupcake, Donut, Eclair, Froyo).
 *
 * Upstream serves all six from one Compose `PlatLogoActivity`: a centred logo at
 * `min(width, height) * 0.6` (`PlatLogoActivity.kt:124-126`) that toasts
 * "Android <version>: <nickname>" on tap, and nothing else — no long press, no
 * animation, no secondary screen.
 *
 * Each variant's `iconRes` is a hand-drawn vector in `res/drawable-anydpi`, and the
 * port draws exactly those: `b_android_classic` (shared by Base and Petit Four) is
 * the `#a6c44b` bugdroid, while `_cupcake` / `_donut` / `_eclair` / `_froyo` are
 * multi-tone dessert illustrations (Donut's five `<aapt:attr>` gradients included).
 * The art module is imported lazily so its ~78 KB of path data stays out of the
 * shell bundle. The nickname and version captions underneath are a port addition;
 * upstream shows them only in the tap toast.
 */

export type BaseArtName =
  | 'baseClassic'
  | 'baseCupcake'
  | 'baseDonut'
  | 'baseEclair'
  | 'baseFroyo';

interface Variant {
  version: string;
  nickname: string;
  /** Which `b_android_*` drawable this variant's `iconRes` points at. */
  art: BaseArtName;
}

export function createBaseEgg(variant: Variant): EggFactory {
  return async (context: EggContext): Promise<Egg> => {
    const art: VectorArt = (await import('../shared/baseArt'))[variant.art];

    const tweens = new Tweens();
    let scale = 0.6;
    let alpha = 0;
    let wasDown = false;

    const offFrame = context.onFrame((_dt, t) => {
      const now = t * 1000;
      tweens.update(now);
      const { ctx, width, height, pointer } = context;
      const size = Math.min(width, height) * 0.6 * scale;

      // `PlatLogoActivity.kt:128-138` hangs `clickable` off the `Image`, whose box is a
      // centred square of `minOf(maxWidth, maxHeight) * 0.6f`; taps outside it do nothing.
      if (pointer.down && !wasDown) {
        const half = size / 2;
        if (Math.abs(pointer.x - width / 2) <= half && Math.abs(pointer.y - height / 2) <= half) {
          context.toast(`Android ${variant.version}: ${variant.nickname}`, 2);
        }
      }
      wasDown = pointer.down;

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#15181d');
      gradient.addColorStop(1, '#080a0d');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.globalAlpha = alpha;

      // The upstream `Image` box is the centred `0.6 * minSide` square; the art is
      // fitted inside it and lifted a little to leave room for the captions.
      ctx.save();
      const artSize = size * 0.84;
      ctx.translate(width / 2 - artSize / 2, height / 2 - size * 0.18 - artSize / 2);
      drawVectorArt(ctx, art, artSize);
      ctx.restore();

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
      hint: '点击 logo 区域',
      destroy() {
        offFrame();
        tweens.cancelAll();
      },
    };
  };
}
