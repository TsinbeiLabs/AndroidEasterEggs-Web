import type { Egg, EggContext } from '../../core/types';
import { createLandroidEgg } from '../shared/landroidEgg';

/**
 * Android 17 Cinnamon Bun.
 *
 * Two changes over Baklava: the starfield becomes radial (stars are placed in
 * polar coordinates and expand exponentially, respawning near the centre, with
 * tails scaled by `1 / (1 + speed * warp)`) and starts at warp 0.1, and the logo
 * is gated behind the heptadecagram minigame — connect all 17 dots without
 * repeating and close the loop (SPACE skips it), then the puzzle fades out over
 * 500 ms while the logo fades in and warp eases 0.1 -> 1 over 250 ms. Planets are
 * coloured by `hsv(radius % 360, 0.75, 1)`.
 */
export default function createCinnamonBun(context: EggContext): Egg {
  return createLandroidEgg(context, {
    patch: 'cinnamon',
    stars: 128,
    planes: 4,
    rotation: 45,
    maxWarp: 16,
    mode: 'radial',
    initialWarp: 0.1,
    unlockKey: 'egg_mode_cinnamon_bun',
    heptadecagram: true,
    hint: '先一笔画连完 17 个点解锁 logo，再按住 5 秒进入曲速',
    landroid: {
      dessertCode: 'CB',
      autopilot: true,
      autoButton: true,
      legacyLandingMarker: false,
      hsvPlanets: true,
      defaultZoom: 1,
      dynamicZoom: false,
    },
  });
}
