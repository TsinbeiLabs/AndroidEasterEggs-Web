import type { Egg, EggContext } from '../../core/types';
import { NekoPanel } from '../shared/neko';
import { mountPaintChips, type PaintChipsHandle } from '../shared/paintchips';
import { PlatLogoClock } from '../shared/clock';

/**
 * Android 12 / 12L Snow Cone.
 *
 * The PlatLogo is the settable analog clock over a 2000-bubble packed field; set
 * it to 12:00 and let go to fade the clock out, pop the accent3 "12" logo in with
 * an overshoot and grow the bubbles. Unlocking enables both secondary screens:
 * Paint Chips (the 13 x 5 dynamic colour grid) and the Neko collector.
 */

type Scene = 'clock' | 'chips' | 'neko';

export default function createS(context: EggContext): Egg {
  let scene: Scene = 'clock';
  let clock: PlatLogoClock | null = null;
  let chips: PaintChipsHandle | null = null;
  const neko = new NekoPanel(context, {
    heading: 'Neko · Android 12',
    subtitle: 'Snow Cone 的快速设置磁贴版',
    controls: true,
    messages: ['😸', '😹', '😺', '😻', '😼', '😽', '😾', '😿', '🙀', '💩', '🐁'],
  });

  const showChips = (): void => {
    neko.destroy();
    chips?.destroy();
    scene = 'chips';
    chips = mountPaintChips(context, {
      heading: 'Paint Chips · Android 12',
      subtitle: 'system_neutral1 / neutral2 / accent1 / accent2 / accent3 的 13 档色调',
    });
  };

  const showNeko = (): void => {
    chips?.destroy();
    chips = null;
    scene = 'neko';
    neko.mount();
  };

  clock = new PlatLogoClock(context, {
    unlockHour: 0,
    logo: 'twelve',
    discColor: '#787296',
    emojiBubbles: false,
    onUnlock: () => {
      if (context.store.get<number>('s_egg_mode', 0) === 0) {
        context.store.set('s_egg_mode', Date.now());
      }
      clock?.destroy();
      clock = null;
      showChips();
    },
  });

  context.actions.add({
    id: 'chips',
    label: 'Paint Chips',
    run: () => {
      if (scene === 'chips') return;
      clock?.destroy();
      clock = null;
      showChips();
    },
  });

  context.actions.add({
    id: 'neko',
    label: 'Neko',
    run: () => {
      if (scene === 'neko') return;
      clock?.destroy();
      clock = null;
      showNeko();
    },
  });

  context.actions.add({
    id: 'feed',
    label: '喂猫（立即结算）',
    run: () => neko.visitNow(),
  });

  return {
    hint: '拖动时钟指针到 12:00 松手解锁',
    destroy() {
      clock?.destroy();
      clock = null;
      chips?.destroy();
      chips = null;
      neko.destroy();
    },
  };
}
