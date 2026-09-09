import type { Egg, EggContext } from '../../core/types';
import { createLandroidEgg } from '../shared/landroidEgg';

/**
 * Android 14 Upside Down Cake — the first Landroid.
 *
 * 34 stars in 2 planes, warp 1 -> 10 over a 5 s hold, launch at 6 s. The sandbox
 * is the leanest variant: no autopilot, landings marked with a red X instead of a
 * flag, every planet the same Eigengrau4, default camera zoom 0.25 and a hard
 * coded `UDC-<seed % 100000>` designation.
 */
export default function createUpsideDownCake(context: EggContext): Egg {
  return createLandroidEgg(context, {
    patch: 'udc',
    stars: 34,
    planes: 2,
    rotation: 0,
    maxWarp: 10,
    mode: 'linear',
    initialWarp: 1,
    unlockKey: 'egg_mode_u',
    heptadecagram: false,
    hint: '按住 5 秒进入曲速，松手取消；进入后 ←/→ 转向，按住空格或画面点火',
    landroid: {
      dessertCode: 'UDC',
      autopilot: false,
      autoButton: false,
      legacyLandingMarker: true,
      hsvPlanets: false,
      defaultZoom: 0.25,
      dynamicZoom: false,
    },
  });
}
