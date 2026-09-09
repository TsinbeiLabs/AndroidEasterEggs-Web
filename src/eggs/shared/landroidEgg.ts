import type { Egg, EggContext } from '../../core/types';
import { Landroid, type LandroidConfig } from './landroid';
import type { PatchKind } from './patches';
import { WarpLogo } from './warpLogo';

/**
 * Shared shell for the four Landroid versions (14 UDC, 15 VIC, 16 Baklava,
 * 17 Cinnamon Bun): a warp PlatLogo that hands off to the sandbox on launch, and
 * a way back.
 */

export interface LandroidEggOptions {
  patch: PatchKind;
  stars: number;
  planes: number;
  rotation: number;
  maxWarp: number;
  mode: 'linear' | 'radial';
  initialWarp: number;
  unlockKey: string;
  heptadecagram: boolean;
  landroid: LandroidConfig;
  hint: string;
}

export function createLandroidEgg(context: EggContext, options: LandroidEggOptions): Egg {
  let logo: WarpLogo | null = null;
  let game: Landroid | null = null;
  let frameOff: (() => void) | null = null;

  const startGame = (): void => {
    logo?.destroy();
    logo = null;
    frameOff?.();

    game = new Landroid(context, options.landroid);
    frameOff = context.onFrame((dt) => {
      const current = game;
      if (current === null) return;
      current.update(dt);
      current.render(context.ctx);
    });
  };

  const startLogo = (): void => {
    game = null;
    frameOff?.();
    frameOff = null;
    logo = new WarpLogo(context, {
      stars: options.stars,
      planes: options.planes,
      rotation: options.rotation,
      maxWarp: options.maxWarp,
      mode: options.mode,
      initialWarp: options.initialWarp,
      patch: options.patch,
      unlockKey: options.unlockKey,
      heptadecagram: options.heptadecagram,
      onLaunch: startGame,
    });
  };

  startLogo();

  const onWheel = (event: WheelEvent): void => {
    const current = game;
    if (current === null) return;
    event.preventDefault();
    current.zoomBy(event.deltaY < 0 ? 1.25 : 0.8);
  };
  context.canvas.addEventListener('wheel', onWheel, { passive: false });

  context.actions.add({
    id: 'toggle',
    label: '星空 / Landroid',
    run: () => {
      if (game === null) startGame();
      else startLogo();
    },
  });

  context.actions.add({
    id: 'reroll',
    label: '新宇宙',
    run: () => {
      game?.reroll();
    },
  });

  return {
    hint: options.hint,
    destroy() {
      context.canvas.removeEventListener('wheel', onWheel);
      logo?.destroy();
      frameOff?.();
      game = null;
      logo = null;
      frameOff = null;
    },
  };
}
