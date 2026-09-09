import type { Egg, EggContext } from '../../core/types';
import { createLandroidEgg } from '../shared/landroidEgg';

/**
 * Android 15 Vanilla Ice Cream — Landroid gains the Autopilot class, landing legs
 * and the chartreuse flag, smoothed camera, an activity line from the expanded
 * Namer word lists, and a dessert-code designation (`VIC-…`). Upstream only turns
 * the autopilot on in the Daydream, so the AUTO button stays hidden here and the
 * default camera zoom becomes 1.
 */
export default function createVanillaIceCream(context: EggContext): Egg {
  return createLandroidEgg(context, {
    patch: 'vic',
    stars: 34,
    planes: 2,
    rotation: 0,
    maxWarp: 10,
    mode: 'linear',
    initialWarp: 1,
    unlockKey: 'egg_mode_v',
    heptadecagram: false,
    hint: '按住 5 秒进入曲速；着陆要对准地表（机头与法线夹角 45° 内）',
    landroid: {
      dessertCode: 'VIC',
      autopilot: true,
      autoButton: false,
      legacyLandingMarker: false,
      hsvPlanets: false,
      defaultZoom: 1,
      dynamicZoom: false,
    },
  });
}
