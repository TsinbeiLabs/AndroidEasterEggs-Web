import type { Egg, EggContext } from '../../core/types';
import { PlatLogoClock } from '../shared/clock';
import { NekoPanel } from '../shared/neko';
import { mountPaintChips, type PaintChipsHandle } from '../shared/paintchips';

/**
 * Android 13 Tiramisu.
 *
 * Same clock PlatLogo as Snow Cone with three differences: it unlocks at 13:00
 * instead of 12:00, the logo is the accent1 "13" flower, and a long press on the
 * grown bubble field swaps every bubble for an emoji drawn from one of the 14
 * upstream sets (fruits, cats, hearts, moon phases, zodiac, clock faces, ...).
 * Like upstream the screen stays open after the unlock and only `t_egg_mode` is
 * written; the secondary screens are reached through the action buttons.
 */

type Scene = 'clock' | 'chips' | 'neko';

export default function createTiramisu(context: EggContext): Egg {
  let scene: Scene = 'clock';
  let clock: PlatLogoClock | null = null;
  let chips: PaintChipsHandle | null = null;
  const neko = new NekoPanel(context, {
    heading: 'Neko · Android 13',
    subtitle: 'Tiramisu 的快速设置磁贴版',
    controls: true,
    messages: ['😸', '😹', '😺', '😻', '😼', '😽', '😾', '😿', '🙀', '💩', '🐁'],
  });

  const showChips = (): void => {
    neko.destroy();
    chips?.destroy();
    scene = 'chips';
    chips = mountPaintChips(context, {
      heading: 'Paint Chips · Android 13',
      subtitle: '与 Snow Cone 相同的 13 x 5 动态取色网格',
    });
  };

  const showNeko = (): void => {
    chips?.destroy();
    chips = null;
    scene = 'neko';
    neko.mount();
  };

  clock = new PlatLogoClock(context, {
    unlockHour: 1,
    logo: 'thirteen',
    emojiBubbles: true,
    onUnlock: () => {
      // SpUtils.putLong(this, "t_egg_mode", System.currentTimeMillis())
      if (context.store.get<number>('t_egg_mode', 0) === 0) {
        context.store.set('t_egg_mode', Date.now());
      }
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
    hint: '拖到 13:00 松手解锁；解锁后长按气泡背景换成 emoji',
    destroy() {
      clock?.destroy();
      clock = null;
      chips?.destroy();
      chips = null;
      neko.destroy();
    },
  };
}
