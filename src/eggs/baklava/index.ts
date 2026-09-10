import type { Egg, EggContext } from '../../core/types';
import { createLandroidEgg } from '../shared/landroidEgg';

/**
 * Android 16 Baklava — "must go faster".
 *
 * The starfield jumps to 128 stars in 4 planes, is rotated 45 degrees, wraps over
 * a disc instead of the viewport and reaches MAX_WARP 16 with a `frac^2` full
 * screen bloom (HDR white upstream, clamped to SDR here). Landroid gets the AUTO
 * console button, which engages the autopilot state machine and the dynamic
 * camera zoom, and the designation uses the `BKL` dessert code.
 */
export default function createBaklava(context: EggContext): Egg {
  return createLandroidEgg(context, {
    patch: 'baklava',
    previewPatch: null,
    stars: 128,
    planes: 4,
    rotation: 45,
    maxWarp: 16,
    mode: 'linear',
    initialWarp: 1,
    centered: true,
    tailFactor: 1,
    bloom: true,
    unlockKey: 'egg_mode_baklava',
    heptadecagram: false,
    hint: '按住 5 秒进入曲速（可到 16 倍）；进入后点 AUTO 交给自动驾驶',
    landroid: {
      dessertCode: 'BKL',
      autopilot: true,
      autoButton: true,
      legacy: false,
      hsvPlanets: false,
      gravityRings: 8,
      gravityForceMax: 200,
      gravityAlphaMax: 0.5,
      gravityAnimated: false,
      exploredPlanetArt: false,
      orbitColour: 'rgba(0, 255, 255, 0.5)',
      defaultZoom: 1,
      dynamicZoom: false,
    },
  });
}
