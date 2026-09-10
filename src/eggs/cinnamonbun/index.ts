import type { Egg, EggContext } from '../../core/types';
import { createLandroidEgg } from '../shared/landroidEgg';

/**
 * Android 17 Cinnamon Bun.
 *
 * Two changes over Baklava on the PlatLogo: the starfield becomes radial (stars are
 * placed in polar coordinates and expand exponentially, respawning near the centre,
 * with tails scaled by `1 / (1 + speed * warp)`) and starts at warp 0.1, and the logo
 * is gated behind the heptadecagram minigame — connect all 17 dots without repeating
 * and close the loop (SPACE skips it), then the puzzle fades out over 500 ms while the
 * logo fades in and warp eases 0.1 -> 1 over 250 ms.
 *
 * Landroid changes too ("new in a17: things get a little more interesting once you've
 * discovered a planet"): planets are `hsv(radius % 360, 0.75, 1)` but keep an
 * Eigengrau4 rim until landed on, the orbit rings go Eigengrau3, the gravity field
 * becomes 10 animated rings from `lerp(2000f, 0.01f, (i - now % 1f) / 10)`, and an
 * explored planet within 10 000 units at zoom > 0.05 is filled with one of the ten
 * `Assets.kt` textures chosen by its radius.
 */
export default function createCinnamonBun(context: EggContext): Egg {
  return createLandroidEgg(context, {
    patch: 'cinnamon',
    previewPatch: null,
    stars: 128,
    planes: 4,
    rotation: 45,
    maxWarp: 16,
    mode: 'radial',
    initialWarp: 0.1,
    centered: true,
    tailFactor: 1,
    bloom: true,
    unlockKey: 'egg_mode_cinnamon_bun',
    heptadecagram: true,
    hint: '先一笔画连完 17 个点解锁 logo，再按住 5 秒进入曲速',
    landroid: {
      dessertCode: 'CB',
      autopilot: true,
      autoButton: true,
      legacy: false,
      hsvPlanets: true,
      gravityRings: 10,
      gravityForceMax: 2000,
      gravityAlphaMax: 0.75,
      gravityAnimated: true,
      exploredPlanetArt: true,
      orbitColour: '#3C3C4F',
      defaultZoom: 1,
      dynamicZoom: false,
    },
  });
}
