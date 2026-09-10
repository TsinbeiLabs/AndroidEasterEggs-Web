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
 * +750 ms over 700 ms, the `l_platlogo` wordmark at +1000 ms over 300 ms) and
 * every later tap re-rolls one of the six FLAVOURS pairs. Five taps arm the
 * long press that opens LLand.
 *
 * LLand: hold anywhere (or Space / ArrowUp) to rise at a constant 550 dp/s,
 * release to fall under `dv += 30` per 1/60 s step. Seven candy arts on 90 dp
 * pops, 170 dp gap, 3 s cadence, 100 dp/s scroll, four skies, 50 % mirrored
 * world, 20 parallax scenery items, one solid green droid.
 */

const FLAVORS: ReadonlyArray<readonly [string, string]> = [
  ['#9C27B0', '#BA68C8'],
  ['#FF9800', '#FFB74D'],
  ['#F06292', '#F8BBD0'],
  ['#AFB42B', '#CDDC39'],
  ['#FFEB3B', '#FFF176'],
  ['#795548', '#A1887F'],
];

/**
 * `l_platlogo.xml`, the lowercase "lollipop" wordmark in its 560 unit viewport.
 * The `o` and `p` counters are separate counter-wound subpaths of the same
 * element, so the default non-zero fill leaves them open.
 */
const WORDMARK = new Path2D(
  // l
  'M65.4,221.0l11.17,0.0l0.0,98.27l-11.17,0.0z' +
    // o
    'M169.490005,279.880005c0.0,22.639999 -18.32,41.12 -40.810,41.12c-22.639999,0.0 -41.040,-18.48 -41.040,-41.12c0.0,-22.48 18.389999,-40.880 41.040,-40.880C151.169998,239.0 169.490005,257.399994 169.490005,279.880005z' +
    'M158.089996,280.040009c0.0,-16.43 -13.13,-29.870 -29.41,-29.870c-16.51,0.0 -29.4,13.44 -29.4,29.870c0.0,16.280 12.89,29.799999 29.4,29.799999C144.960007,309.8387 158.089996,296.309998 158.089996,280.040009z' +
    // l, l
    'M180.58,221.0l11.17,0.0l0.0,98.27l-11.17,0.0z' +
    'M204.8,221.0l11.17,0.0l0.0,98.27l-11.17,0.0z' +
    // i
    'M229.02,221.0l11.17,0.0l0.0,11.48l-11.17,0.0z' +
    'M229.02,240.65l11.17,0.0l0.0,78.62l-11.17,0.0z' +
    // p
    'M264.079987,240.736l0.0,9.82c7.31,-7.15 17.139999,-11.56 28.07,-11.56c22.639999,0.0 40.799999,18.48 40.799999,41.12c0.0,22.48 -18.16,40.880 -40.799999,40.880c-10.93,0.0 -20.280,-4.09 -27.59,-10.93L264.559998,339.0l-11.32,0.0l0.0,-98.269997L264.079987,240.731z' +
    'M265.809998,264.869995c-0.47,0.79 -1.26,2.04 -1.26,4.79l0.0,21.07c0.0,1.97 0.47,3.07 1.1,4.17c5.19,8.88 14.78,14.94 25.63,14.94c16.43,0.0 29.950,-13.44 29.950,-29.870c0.0,-16.280 -13.52,-29.799999 -29.950,-29.799999C280.51,250.169998 271.0,256.059998 265.809998,264.869995z' +
    // o
    'M423.790009,279.880005c0.0,22.639999 -18.32,41.12 -40.810,41.12c-22.639999,0.0 -41.040,-18.48 -41.040,-41.12c0.0,-22.48 18.389999,-40.880 41.040,-40.880C405.470,239.0 423.790009,257.399994 423.790009,279.880005z' +
    'M412.395,280.040009c0.0,-16.43 -13.13,-29.870 -29.41,-29.870c-16.51,0.0 -29.4,13.44 -29.4,29.870c0.0,16.280 12.89,29.799999 29.4,29.799999C399.26,309.8387 412.395,296.309998 412.395,280.040009z' +
    // p
    'M445.731,240.736l0.0,9.82c7.31,-7.15 17.139999,-11.56 28.07,-11.56c22.639999,0.0 40.799999,18.48 40.799999,41.12c0.0,22.48 -18.16,40.880 -40.799999,40.880c-10.93,0.0 -20.280,-4.09 -27.59,-10.93L446.210052,339.0l-11.32,0.0l0.0,-98.269997L445.731,240.731z' +
    'M447.459991,264.869995c-0.47,0.79 -1.26,2.04 -1.26,4.79l0.0,21.07c0.0,1.97 0.47,3.07 1.1,4.17c5.19,8.88 14.78,14.94 25.63,14.94c16.43,0.0 29.950,-13.44 29.950,-29.870c0.0,-16.280 -13.52,-29.799999 -29.950,-29.799999C462.160004,250.169998 452.649994,256.059998 447.459991,264.869995z',
);

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
  hud: {
    radius: 8,
    textSize: 32,
    bold: false,
    padX: 16,
    centered: false,
    top: 32,
    left: 16,
    chipHeight: 54,
    gap: 0,
  },
  maxPlayers: 1,
  scenes: ['city'],
  // LLand.java:717 tints the single droid solid green.
  playerColors: ['#00FF00'],
  stemColors: ['#FFFFFF', '#AAAAAA'],
  candyCaneStemChance: 0,
  // LLand.java:913-914: OBSTACLE_WIDTH/2 deep, painted in solid #FFAAAAAA.
  stemShadowDepth: 0.5,
  stemShadowColor: '#AAAAAA',
  scoreByPipeId: false,
  showTouches: false,
  splash: false,
  vibrateOnDeath: false,
  weightedSky: false,
  startYJitter: false,
  // `l_scenery_z` = 6dp: buildings are raised by SCENERY_Z * (1 + z).
  sceneryZ: 6,
  makePop: (random): PopVisual => {
    const art = LOLLIPOP_POPS[Math.floor(random() * LOLLIPOP_POPS.length)];
    return {
      // `mRotate = spinny ? (frand() < 0.5 ? -1 : 1) : 0`, stepped at 45 deg/s.
      spin: SPINNY_POPS.has(art) ? (random() < 0.5 ? -45 : 45) : 0,
      // `Pop`'s constructor does `setScaleX(frand() < 0.5 ? -1 : 1)`, but the
      // spawn code immediately overwrites it with setScaleX(0.25f) and animates
      // to 1f, so upstream pops are never actually mirrored.
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
  let flavorIndex = 0;
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

  /** `newColorIndex()` picks one of the six [fill, ripple] pairs at random. */
  const newFlavor = (): number => Math.floor(context.random() * FLAVORS.length);

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
        ctx: context.ctx,
        random: () => context.random(),
        randomInt: (min, max) => context.randomInt(min, max),
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
        if (held && !wasKey) gameRef.pokeKey(0);
        if (!held && wasKey) gameRef.unpoke(0);
        wasKey = held;

        // LLand only handles ACTION_DOWN/ACTION_UP, so any number of fingers on
        // the single primary pointer reads as one hold.
        if (context.pointer.justPressed) {
          gameRef.poke(0, context.pointer.x, context.pointer.y);
        }
        if (wasDown && !context.pointer.down) gameRef.unpoke(0);
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

    // `size = min(min(w, h), 600dp) - 100dp`; the stick's shadow is cast by the
    // full-size candy, so it does not grow with the reveal.
    const fullSize = Math.max(40, Math.min(Math.min(width, height), 600) - 100);
    const size = fullSize * candyScale;
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
      ctx.lineTo(cx + stickW / 2, cy + fullSize / 2 + stickW * 1.5);
      ctx.lineTo(cx - stickW / 2, cy + fullSize / 2);
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
        ctx.scale(size / 560, size / 560);
        ctx.translate(-280, -280);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill(WORDMARK);
        ctx.restore();
      }

      // The 0x10FFFFFF specular overlay from (0.15, 0.15) to (0.6, 0.6), drawn
      // above the wordmark because it lives in the ImageView's overlay.
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
