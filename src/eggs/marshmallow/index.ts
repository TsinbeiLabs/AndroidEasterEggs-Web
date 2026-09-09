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
 * 100 px touch overlay.
 */

const M_SHADOW = new Path2D('M13.5,34.5 l13.3,13.3 c11,-1.3 19.7,-10 21,-21 L34.5,13.5 L13.5,34.5 z');
const M_RIGHT = new Path2D('M24,24 c0,0 0,2.4 0,5.2 s0,5.2 0,5.2 L34.5,24 V13.5 L24,24 z');
const M_LEFT = new Path2D('M24,24 L13.5,13.5 V24 L24,34.5 c0,0 0,-2.4 0,-5.2 S24,24 24,24 z');
const M_FOOT_LEFT = new Path2D('M13.5,34.5 l10.5,0 l-10.5,-10.5 z');
const M_FOOT_RIGHT = new Path2D('M34.5,34.5 l0,-10.5 l-10.5,10.5 z');

const MM_BODY = new Path2D(
  'M34.9,13.2 c-0.8,-0.8 -4.2,-2.4 -10.9,-2.4 s-10.1,1.6 -10.9,2.4 c-0.8,0.8 -2.4,4.2 -2.4,10.9 s1.6,10.1 2.4,10.9 c0.8,0.8 4.2,2.4 10.9,2.4 s10.1,-1.6 10.9,-2.4 c0.8,-0.8 2.4,-4.2 2.4,-10.9 S35.6,14 34.9,13.2 z',
);

const LONG_PRESS_MS = 500;
const TAPS_TO_ARM = 5;
const HOLD_KEYS = ['Space', 'ArrowUp', 'Enter', 'KeyW'];

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
  const to = (x: number) => Math.round(x * 255);
  return `rgb(${to(r)}, ${to(g)}, ${to(b)})`;
}

const MLAND_CONFIG: FlappyConfig = {
  popSize: 130,
  stemWidth: 8,
  gap: 140,
  obstacleMin: 66,
  buildingWidthMin: 50,
  popHitFraction: 1 / 3,
  hudRadius: 4,
  hudTextSize: 22,
  maxPlayers: 6,
  scenes: ['city', 'tx', 'zrh'],
  stemColors: ['#BCAAA4', '#A1887F'],
  candyCaneStemChance: 0.01,
  scoreByPipeId: true,
  showTouches: true,
  splash: true,
  vibrateOnDeath: true,
  weightedSky: true,
  makePop: (random, top): PopVisual => {
    const look: MarshmallowLook = {
      antenna: random() < 0.5 ? 0 : 1,
      eyes: random() > 0.5 ? (random() < 0.5 ? 0 : 1) : -1,
      mouth: -1,
    };
    if (look.eyes >= 0 && random() > 0.8) {
      look.mouth = Math.floor(random() * 4) as 0 | 1 | 2 | 3;
    }
    return {
      spin: 0,
      mirrorX: false,
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
  let activePlayer = 0;
  const ripples: Ripple[] = [];

  let game: FlappyGame | null = null;

  const enterGame = (): void => {
    if (context.store.get<number>('m_egg_mode', 0) === 0) {
      context.store.set('m_egg_mode', Date.now());
    }
    scene = 'mland';
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
      MLAND_CONFIG,
    );
  };

  const offFrame = context.onFrame((dt, t) => {
    const now = t * 1000;
    tweens.update(now);

    if (scene === 'mland') {
      const gameRef = game;
      if (gameRef === null) return;

      const splashHit = gameRef.splashHit(context.pointer.x, context.pointer.y);
      if (context.pointer.down && !wasDown) {
        if (splashHit === 'play') gameRef.pressPlay();
        else if (splashHit === 'plus') gameRef.setPlayerCount(gameRef.scores.length + 1);
        else if (splashHit === 'minus') gameRef.setPlayerCount(Math.max(1, gameRef.scores.length - 1));
        else {
          activePlayer = gameRef.playerIndexAt(context.pointer.x);
          gameRef.poke(activePlayer, context.pointer.x, context.pointer.y);
        }
      }
      if (!context.pointer.down && wasDown) gameRef.unpoke(activePlayer);
      wasDown = context.pointer.down;

      const held = HOLD_KEYS.some((code) => context.keys.has(code));
      if (held && !wasKey) gameRef.poke(0, context.pointer.x, context.pointer.y);
      if (!held && wasKey) gameRef.unpoke(0);
      wasKey = held;

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
      ctx.globalAlpha = marshmallowAlpha;
      ctx.fillStyle = '#FFFFFF';
      ctx.fill(MM_BODY);
      ctx.save();
      ctx.globalAlpha = marshmallowAlpha * 0.87;
      ctx.fillStyle = '#EBEBEB';
      ctx.beginPath();
      ctx.ellipse(24, 13.7, 10.7, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(31.7, 5.9);
      ctx.lineTo(29.9, 12.9);
      ctx.moveTo(16.5, 5.9);
      ctx.lineTo(18.2, 12.9);
      ctx.stroke();
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
        wasDown = false;
        wasKey = false;
      }
    },
  });

  return {
    hint: '点 5 次以上再长按进入 MLand；splash 上按播放，可用 ± 增加玩家',
    destroy() {
      offFrame();
      tweens.cancelAll();
      game = null;
    },
  };
}
