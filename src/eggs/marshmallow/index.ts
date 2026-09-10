import { PLATLOGO_EASE } from '../../core/easing';
import { Tweens } from '../../core/tween';
import type { Egg, EggContext } from '../../core/types';
import { FlappyGame, type FlappyConfig, type PopVisual } from '../shared/flappy';
import { drawMarshmallow, type MarshmallowLook } from '../shared/flappyArt';

/**
 * Android 6.0 Marshmallow.
 *
 * PlatLogo: a disc split into two HSV tints of one random hue (0.4 and 0.5
 * saturation) with the faceted "M" wordmark on top; the first tap fades the
 * marshmallow candy in over it (300 ms). Five taps arm the long press that
 * opens MLand.
 *
 * MLand: LLand's physics with 1-6 players, marshmallow pops (130 dp, hit radius
 * size/3, never spinning), 8 dp chocolate stems (1 % candy cane), three scenes
 * (city / Texas cacti / Zurich mountains), per-player death with an 80 ms buzz,
 * pipe-id scoring, a splash with a play button and a 3-2-1-0 countdown, and the
 * 100 px touch overlay. Each finger owns the screen column it is in, so several
 * players can be flown at once.
 */

const M_SHADOW = new Path2D('M13.5,34.5 l13.3,13.3 c11,-1.3 19.7,-10 21,-21 L34.5,13.5 L13.5,34.5 z');
const M_RIGHT = new Path2D('M24,24 c0,0 0,2.4 0,5.2 s0,5.2 0,5.2 L34.5,24 V13.5 L24,24 z');
const M_LEFT = new Path2D('M24,24 L13.5,13.5 V24 L24,34.5 c0,0 0,-2.4 0,-5.2 S24,24 24,24 z');
const M_FOOT_LEFT = new Path2D('M13.5,34.5 l10.5,0 l-10.5,-10.5 z');
const M_FOOT_RIGHT = new Path2D('M34.5,34.5 l0,-10.5 l-10.5,10.5 z');

const MM_BODY = new Path2D(
  'M34.9,13.2 c-0.8,-0.8 -4.2,-2.4 -10.9,-2.4 s-10.1,1.6 -10.9,2.4 c-0.8,0.8 -2.4,4.2 -2.4,10.9 s1.6,10.1 2.4,10.9 c0.8,0.8 4.2,2.4 10.9,2.4 s10.1,-1.6 10.9,-2.4 c0.8,-0.8 2.4,-4.2 2.4,-10.9 S35.6,14 34.9,13.2 z',
);
/** `m_platlogo.xml`'s second path: the top face, x 13.3..34.7, y 10.8..16.6. */
const MM_TOP = new Path2D(
  'M34.7,13.7 c0,0.8 -1.2,1.5 -3.1,2.1 c-1.9,0.5 -4.6,0.8 -7.6,0.8 s-5.6,-0.3 -7.6,-0.8 ' +
    'c-1.9,-0.5 -3.1,-1.2 -3.1,-2.1 s1.2,-1.5 3.1,-2.1 c1.9,-0.5 4.6,-0.8 7.6,-0.8 ' +
    's5.6,0.3 7.6,0.8 C33.5,12.1 34.7,12.9 34.7,13.7 z',
);
/** `m_platlogo.xml`'s last two paths: the candy's two splayed antennae. */
const MM_ANTENNAE = new Path2D(
  'M30,13 c-0.1,0 -0.1,0 -0.2,0 c-0.4,-0.1 -0.7,-0.6 -0.6,-1 l1.3,-5.5 c0.1,-0.4 0.6,-0.7 1,-0.6 ' +
    'c0.4,0.1 0.7,0.6 0.6,1 l-1.3,5.5 C30.7,12.7 30.4,13 30,13 z' +
    'M18,13 c-0.4,0 -0.7,-0.3 -0.8,-0.6 l-1.3,-5.5 c-0.1,-0.4 0.2,-0.9 0.6,-1 c0.4,-0.1 0.9,0.2 1,0.6 ' +
    'l1.3,5.5 c0.1,0.4 -0.2,0.9 -0.6,1 C18.1,13 18.1,13 18,13 z',
);

const LONG_PRESS_MS = 500;
const TAPS_TO_ARM = 5;
const HOLD_KEYS = ['Space', 'ArrowUp', 'Enter', 'KeyW'];
/** Stand-ins for upstream's one-gamepad-per-player mapping (`getControllerPlayer`). */
const DIGIT_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];

function hsv(h: number, s: number, v: number): string {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const [r, g, b] = (
    [
      [v, t, p],
      [q, v, p],
      [p, v, t],
      [p, q, v],
      [t, p, v],
      [v, p, q],
    ] as number[][]
  )[i % 6] as [number, number, number];
  const to = (x: number): number => Math.trunc(x * 255);
  return `rgb(${to(r)}, ${to(g)}, ${to(b)})`;
}

const MLAND_CONFIG: FlappyConfig = {
  popSize: 130,
  stemWidth: 8,
  gap: 140,
  // `m_obstacle_height_min` is 48dp, but Params' sanity check bumps it to
  // OBSTACLE_WIDTH/2 + 1 = 66 because 48 <= 130/2 (MLand.java:134-137).
  obstacleMin: 66,
  buildingWidthMin: 50,
  popHitFraction: 1 / 3,
  hud: {
    radius: 4,
    textSize: 22,
    bold: true,
    padX: 12,
    centered: true,
    top: 12,
    left: 0,
    chipHeight: 40,
    gap: 0,
  },
  maxPlayers: 6,
  scenes: ['city', 'tx', 'zrh'],
  // `Player.sColors`, assigned round-robin (0xFF78C557 is commented out upstream).
  playerColors: ['#DB4437', '#3B78E7', '#F4B400', '#0F9D58', '#7B1880', '#9E9E9E'],
  stemColors: ['#BCAAA4', '#A1887F'],
  candyCaneStemChance: 0.01,
  // MLand.java:1409-1410: OBSTACLE_WIDTH * 0.4 deep, painted through a
  // PorterDuffColorFilter(0x22000000, MULTIPLY) ~= 13 % black.
  stemShadowDepth: 0.4,
  stemShadowColor: 'rgba(0, 0, 0, 0.133)',
  scoreByPipeId: true,
  showTouches: true,
  splash: true,
  vibrateOnDeath: true,
  weightedSky: true,
  startYJitter: true,
  // `m_scenery_z` is declared but the setTranslationZ call is commented out
  // ("no more shadows for these things"), so MLand scenery keeps child order.
  sceneryZ: 0,
  makePop: (random, top): PopVisual => {
    const look: MarshmallowLook = {
      // `antenna = pick(ANTENNAE)` — always present.
      antenna: random() < 0.5 ? 0 : 1,
      eyes: random() > 0.5 ? (random() < 0.5 ? 0 : 1) : -1,
      mouth: -1,
    };
    if (look.eyes >= 0 && random() > 0.8) {
      // `pick(MOUTHS)` = MOUTHS[irand(0, 3)], and MLand's irand rounds.
      look.mouth = Math.min(3, Math.round(random() * 3)) as 0 | 1 | 2 | 3;
    }
    return {
      // MLand never assigns `mRotate`, so its pops do not spin.
      spin: 0,
      // `p1.setScaleY(-0.25f)` animated to -1: the top marshmallow is flipped.
      mirrorY: top,
      render: (ctx, size) => drawMarshmallow(ctx, size, look),
    };
  },
};

interface Ripple {
  x: number;
  y: number;
  born: number;
}

type Scene = 'platlogo' | 'mland';

export default function createMarshmallow(context: EggContext): Egg {
  const tweens = new Tweens();
  const hue = context.random();
  const bgColor = hsv(hue, 0.4, 1);
  const fgColor = hsv(hue, 0.5, 1);

  let scene: Scene = 'platlogo';
  let scale = 0.5;
  let alpha = 0;
  let marshmallowAlpha = 0;
  let taps = 0;
  let downAt = -1;
  let wasDown = false;
  let wasKey = false;
  const wasDigit = [false, false, false, false, false, false];
  /** pointerId -> the player that finger is flying, so lifts release the right one. */
  const flying = new Map<number, number>();
  const ripples: Ripple[] = [];

  let game: FlappyGame | null = null;

  const enterGame = (): void => {
    if (context.store.get<number>('m_egg_mode', 0) === 0) {
      context.store.set('m_egg_mode', Date.now());
    }
    scene = 'mland';
    flying.clear();
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
      MLAND_CONFIG,
    );
  };

  const offFrame = context.onFrame((dt, t) => {
    const now = t * 1000;
    tweens.update(now);

    if (scene === 'mland') {
      const gameRef = game;
      if (gameRef === null) return;

      // MLand.onTouchEvent tracks every finger through getActionIndex() and gives
      // each one the player whose column it landed in, so N fingers fly N droids.
      for (const pointer of context.pointers) {
        if (!pointer.justPressed) continue;
        const hit = gameRef.splashHit(pointer.x, pointer.y);
        if (hit === 'play') {
          gameRef.pressPlay();
        } else if (hit === 'plus') {
          gameRef.setPlayerCount(gameRef.playerCount + 1);
        } else if (hit === 'minus') {
          gameRef.setPlayerCount(gameRef.playerCount - 1);
        } else {
          const index = gameRef.playerIndexAt(pointer.x);
          flying.set(pointer.id, index);
          gameRef.poke(index, pointer.x, pointer.y);
        }
      }
      for (const [id, index] of flying) {
        const pointer = context.pointers.find((item) => item.id === id);
        if (pointer !== undefined && pointer.down) continue;
        flying.delete(id);
        gameRef.unpoke(index);
      }

      // Keys map to player 0, exactly like a device with no gamepad attached.
      const held = HOLD_KEYS.some((code) => context.keys.has(code));
      if (held && !wasKey) gameRef.pokeKey(0);
      if (!held && wasKey) gameRef.unpoke(0);
      wasKey = held;

      DIGIT_KEYS.forEach((code, i) => {
        const down = context.keys.has(code);
        if (down && !wasDigit[i]) gameRef.pokeKey(i);
        if (!down && wasDigit[i]) gameRef.unpoke(i);
        wasDigit[i] = down;
      });

      gameRef.update(dt);
      gameRef.render(context.ctx);
      return;
    }

    if (context.pointer.down && !wasDown) {
      downAt = now;
      ripples.push({ x: context.pointer.x, y: context.pointer.y, born: now });
    }
    if (!context.pointer.down && wasDown && downAt >= 0) {
      const held = now - downAt;
      downAt = -1;
      if (held >= LONG_PRESS_MS) {
        if (taps >= TAPS_TO_ARM) enterGame();
      } else {
        taps++;
        if (taps === 1) {
          tweens.add(
            {
              duration: 300,
              ease: PLATLOGO_EASE,
              from: 0,
              to: 1,
              onUpdate: (v) => (marshmallowAlpha = v),
            },
            now,
          );
        }
      }
    }
    wasDown = context.pointer.down;

    const heldKeys = HOLD_KEYS.some((code) => context.keys.has(code));
    if (heldKeys && !wasKey) {
      wasKey = true;
      taps++;
      if (taps === 1) marshmallowAlpha = 1;
      if (taps > TAPS_TO_ARM) enterGame();
    }
    if (!heldKeys) wasKey = false;

    drawPlatLogo(now);
  });

  function drawPlatLogo(now: number): void {
    const { ctx, width, height } = context;
    ctx.fillStyle = '#12141a';
    ctx.fillRect(0, 0, width, height);

    const size = Math.max(40, Math.min(Math.min(width, height), 600) - 100) * scale;
    const cx = width / 2;
    const cy = height / 2;
    const r = size / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);

    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // drawArc(135, 180): the upper-left half disc in the deeper tint.
    ctx.fillStyle = fgColor;
    ctx.beginPath();
    ctx.arc(0, 0, r, (135 * Math.PI) / 180, (315 * Math.PI) / 180);
    ctx.closePath();
    ctx.fill();

    for (let i = ripples.length - 1; i >= 0; i--) {
      const ripple = ripples[i];
      const age = (now - ripple.born) / 400;
      if (age >= 1) {
        ripples.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = 0.35 * (1 - age);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(ripple.x - cx, ripple.y - cy, r * age, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const k = size / 48;
    ctx.save();
    ctx.scale(k, k);
    ctx.translate(-24, -24);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.031)';
    ctx.fill(M_SHADOW);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill(M_RIGHT);
    ctx.fillStyle = '#EEEEEE';
    ctx.fill(M_LEFT);
    ctx.fillStyle = '#DDDDDD';
    ctx.fill(M_FOOT_LEFT);
    ctx.fill(M_FOOT_RIGHT);

    if (marshmallowAlpha > 0.001) {
      ctx.save();
      ctx.globalAlpha = marshmallowAlpha;
      ctx.fillStyle = '#FFFFFF';
      ctx.fill(MM_BODY);
      ctx.fillStyle = '#EBEBEB';
      ctx.fill(MM_TOP);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill(MM_ANTENNAE);
      ctx.restore();
    }
    ctx.restore();

    ctx.restore();
  }

  tweens.add(
    {
      delay: 800,
      duration: 500,
      ease: PLATLOGO_EASE,
      from: 0.5,
      to: 1,
      onUpdate: (v) => (scale = v),
    },
    0,
  );
  tweens.add(
    { delay: 800, duration: 500, ease: PLATLOGO_EASE, from: 0, to: 1, onUpdate: (v) => (alpha = v) },
    0,
  );

  context.actions.add({
    id: 'mland',
    label: '进入 MLand',
    run: () => {
      if (scene === 'platlogo') {
        scale = 1;
        alpha = 1;
        marshmallowAlpha = 1;
        enterGame();
      } else {
        scene = 'platlogo';
        game = null;
        flying.clear();
        wasDown = false;
        wasKey = false;
        wasDigit.fill(false);
      }
    },
  });

  return {
    hint: '点 5 次以上再长按进入 MLand；splash 上按播放，可用 ± 增加玩家，多指各控一列（键盘 1-6）',
    destroy() {
      offFrame();
      tweens.cancelAll();
      flying.clear();
      game = null;
    },
  };
}
