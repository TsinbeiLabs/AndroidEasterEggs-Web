import { PLATLOGO_EASE } from '../../core/easing';
import { Tweens } from '../../core/tween';
import type { Egg, EggContext } from '../../core/types';
import { FlappyGame, type FlappyConfig, type PopVisual } from '../shared/flappy';
import { drawLollipopPop, LOLLIPOP_POPS, SPINNY_POPS } from '../shared/flappyArt';

/**
 * Android 5.0 / 5.1 Lollipop.
 *
 * PlatLogo: a lollipop on a stick. It grows to 0.3x at +800 ms; the first tap
 * runs the reveal (candy 0.3 -> 1 at +500 ms over 700 ms, stick fading in at
 * +750 ms over 700 ms, the "lollipop" wordmark at +1000 ms over 300 ms) and
 * every later tap re-rolls one of the six FLAVOURS pairs. Five taps arm the
 * long press that opens LLand.
 *
 * LLand: hold anywhere (or Space / ArrowUp) to rise at a constant 550 dp/s,
 * release to fall under `dv += 30` per 1/60 s step. Seven candy arts on 90 dp
 * pops, 170 dp gap, 3 s cadence, 100 dp/s scroll, four skies, 50 % mirrored
 * world, 20 parallax scenery items.
 */

const FLAVORS: ReadonlyArray<readonly [string, string]> = [
  ['#9C27B0', '#BA68C8'],
  ['#FF9800', '#FFB74D'],
  ['#F06292', '#F8BBD0'],
  ['#AFB42B', '#CDDC39'],
  ['#FFEB3B', '#FFF176'],
  ['#795548', '#A1887F'],
];

const LONG_PRESS_MS = 500;
const TAPS_TO_ARM = 5;
const HOLD_KEYS = ['Space', 'ArrowUp', 'Enter', 'KeyW'];

const LLAND_CONFIG: FlappyConfig = {
  popSize: 90,
  stemWidth: 12,
  gap: 170,
  obstacleMin: 40,
  buildingWidthMin: 20,
  popHitFraction: 0.5,
  hudRadius: 8,
  hudTextSize: 32,
  maxPlayers: 1,
  scenes: ['city'],
  stemColors: ['#FFFFFF', '#AAAAAA'],
  candyCaneStemChance: 0,
  scoreByPipeId: false,
  showTouches: false,
  splash: false,
  vibrateOnDeath: false,
  weightedSky: false,
  makePop: (random): PopVisual => {
    const art = LOLLIPOP_POPS[Math.floor(random() * LOLLIPOP_POPS.length)];
    return {
      spin: SPINNY_POPS.has(art) ? (random() < 0.5 ? -45 : 45) : 0,
      mirrorX: random() < 0.5,
      mirrorY: false,
      render: (ctx, size) => drawLollipopPop(ctx, size, art),
    };
  },
};

interface Ripple {
  x: number;
  y: number;
  born: number;
}

type Scene = 'platlogo' | 'lland';

export default function createLollipop(context: EggContext): Egg {
  const tweens = new Tweens();
  let scene: Scene = 'platlogo';
  let flavorIndex = Math.floor(context.random() * FLAVORS.length) * 2 % FLAVORS.length;
  let candyScale = 0;
  let stickAlpha = 0;
  let wordAlpha = 0;
  let taps = 0;
  let revealed = false;
  let downAt = -1;
  let wasDown = false;
  let wasKey = false;
  const ripples: Ripple[] = [];

  let game: FlappyGame | null = null;

  const newFlavor = (): number => {
    const pairs = FLAVORS.length;
    return Math.floor(context.random() * pairs);
  };

  flavorIndex = newFlavor();

  const reveal = (now: number): void => {
    if (revealed) return;
    revealed = true;
    tweens.add(
      { duration: 700, delay: 500, ease: PLATLOGO_EASE, from: 0.3, to: 1, onUpdate: (v) => (candyScale = v) },
      now,
    );
    tweens.add(
      { duration: 700, delay: 750, ease: PLATLOGO_EASE, from: 0, to: 1, onUpdate: (v) => (stickAlpha = v) },
      now,
    );
    tweens.add(
      { duration: 300, delay: 1000, ease: PLATLOGO_EASE, from: 0, to: 1, onUpdate: (v) => (wordAlpha = v) },
      now,
    );
  };

  const enterGame = (): void => {
    if (context.store.get<number>('l_egg_mode', 0) === 0) {
      context.store.set('l_egg_mode', Date.now());
    }
    scene = 'lland';
    game = new FlappyGame(
      {
        get width() {
          return context.width;
        },
        get height() {
          return context.height;
        },
        random: () => context.random(),
        randomInt: (min, max) => context.randomInt(min, max),
        pick: (items) => context.pick(items),
        toast: (message, seconds) => context.toast(message, seconds),
      },
      LLAND_CONFIG,
    );
  };

  const offFrame = context.onFrame((dt, t) => {
    const now = t * 1000;
    tweens.update(now);

    if (scene === 'lland') {
      const gameRef = game;
      if (gameRef !== null) {
        const held = HOLD_KEYS.some((code) => context.keys.has(code));
        if (held && !wasKey) gameRef.poke(0, context.pointer.x, context.pointer.y);
        if (!held && wasKey) gameRef.unpoke(0);
        wasKey = held;

        if (context.pointer.down && !wasDown) gameRef.poke(0, context.pointer.x, context.pointer.y);
        if (!context.pointer.down && wasDown) gameRef.unpoke(0);
        wasDown = context.pointer.down;

        gameRef.update(dt);
        gameRef.render(context.ctx);
      }
      return;
    }

    // PlatLogo input, polled so the two scenes never fight over events.
    if (context.pointer.down && !wasDown) {
      downAt = now;
      ripples.push({ x: context.pointer.x, y: context.pointer.y, born: now });
      if (taps > 0) flavorIndex = newFlavor();
    }
    if (!context.pointer.down && wasDown && downAt >= 0) {
      const held = now - downAt;
      downAt = -1;
      if (held < LONG_PRESS_MS) {
        taps++;
        if (taps === 1) reveal(now);
      }
    }
    if (context.pointer.down && downAt >= 0 && now - downAt >= LONG_PRESS_MS) {
      downAt = -1;
      if (taps >= TAPS_TO_ARM) {
        enterGame();
        return;
      }
      if (!revealed) reveal(now);
      taps = Math.max(taps, 1);
    }
    wasDown = context.pointer.down;

    const heldKeys = HOLD_KEYS.some((code) => context.keys.has(code));
    if (heldKeys && !wasKey) {
      wasKey = true;
      taps++;
      if (taps === 1) reveal(now);
      else if (taps > TAPS_TO_ARM) enterGame();
    }
    if (!heldKeys) wasKey = false;

    drawPlatLogo(now);
  });

  function drawPlatLogo(now: number): void {
    const { ctx, width, height } = context;

    ctx.fillStyle = '#12141a';
    ctx.fillRect(0, 0, width, height);

    const size = Math.max(40, Math.min(Math.min(width, height), 600) - 100) * candyScale;
    const cx = width / 2;
    const cy = height / 2;
    const stickW = 32;
    const [fill, rippleColor] = FLAVORS[flavorIndex];

    if (stickAlpha > 0.001) {
      ctx.save();
      ctx.globalAlpha = stickAlpha;
      const gradient = ctx.createLinearGradient(cx - stickW / 2, 0, cx + stickW / 2, 0);
      gradient.addColorStop(0, '#FFFFFF');
      gradient.addColorStop(1, '#AAAAAA');
      ctx.fillStyle = gradient;
      ctx.fillRect(cx - stickW / 2, cy, stickW, height - cy);

      ctx.fillStyle = '#AAAAAA';
      ctx.beginPath();
      ctx.moveTo(cx - stickW / 2, cy);
      ctx.lineTo(cx + stickW / 2, cy);
      ctx.lineTo(cx + stickW / 2, cy + size / 2 + stickW * 1.5);
      ctx.lineTo(cx - stickW / 2, cy + size / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    if (candyScale > 0.001) {
      ctx.save();
      ctx.translate(cx, cy);

      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
      ctx.fill();

      // Tap ripples, in the lighter flavour tint.
      for (let i = ripples.length - 1; i >= 0; i--) {
        const ripple = ripples[i];
        const age = (now - ripple.born) / 400;
        if (age >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.globalAlpha = 0.45 * (1 - age);
        ctx.fillStyle = rippleColor;
        ctx.beginPath();
        ctx.arc(ripple.x - cx, ripple.y - cy, (size / 2) * age, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (wordAlpha > 0.001) {
        ctx.save();
        ctx.globalAlpha = wordAlpha;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `600 ${size * 0.19}px system-ui, "Helvetica Neue", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('lollipop', 0, size * 0.02);
        ctx.restore();
      }

      // The 0x10FFFFFF specular overlay from (0.15, 0.15) to (0.6, 0.6).
      ctx.fillStyle = 'rgba(255, 255, 255, 0.063)';
      ctx.beginPath();
      ctx.ellipse(
        -size / 2 + size * 0.375,
        -size / 2 + size * 0.375,
        size * 0.225,
        size * 0.225,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      ctx.restore();
    }
  }

  // Entry: 0 -> 0.3 at +800 ms over 500 ms.
  tweens.add(
    { delay: 800, duration: 500, ease: PLATLOGO_EASE, from: 0, to: 0.3, onUpdate: (v) => (candyScale = v) },
    0,
  );

  context.actions.add({
    id: 'lland',
    label: '进入 LLand',
    run: () => {
      if (scene === 'platlogo') {
        revealed = true;
        candyScale = 1;
        stickAlpha = 1;
        wordAlpha = 1;
        enterGame();
      } else {
        scene = 'platlogo';
        game = null;
        wasDown = false;
        wasKey = false;
      }
    },
  });

  return {
    hint: '点 5 次以上再长按进入 LLand；游戏中按住鼠标或空格上升',
    destroy() {
      offFrame();
      tweens.cancelAll();
      game = null;
    },
  };
}
