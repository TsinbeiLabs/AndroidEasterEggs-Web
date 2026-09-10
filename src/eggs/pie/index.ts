import type { Egg, EggContext } from '../../core/types';
import { PaintApp } from './paint';

/**
 * Android 9.0 Pie.
 *
 * PlatLogo is `PBackground`: concentric rings of 2 or 3 evenly spaced fully
 * saturated colours, whose thickness oscillates with `sin((i/20 + offset) * PI)`
 * while `offset` advances once per minute, over a constant-colour centre disc and
 * the stroked "P" glyph (a dark outline of width 1.334r under a white core of
 * 0.667r). Every single-finger tap re-rolls the palette; the seventh opens
 * PAINT.APK.
 *
 * Like upstream, a two-finger pinch resizes the logo (`bg.setRadius(hypot(p0,
 * p1) / 2)`, clamped to 48dp) and any multi-touch gesture resets the tap
 * count; the wheel is kept as a mouse-only fallback.
 *
 * PAINT.APK is in `./paint`.
 */

const TAPS_TO_UNLOCK = 7;
const MIN_RADIUS = 48;

interface Palette {
  colors: string[];
  darkest: number;
}

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return (299 * r + 587 * g + 114 * b) / 1000;
}

function hsvHex(hue: number): string {
  const h = (((hue % 360) + 360) % 360) / 60;
  const i = Math.floor(h);
  const f = h - i;
  const q = 1 - f;
  const table: number[][] = [
    [1, f, 0],
    [q, 1, 0],
    [0, 1, f],
    [0, q, 1],
    [f, 0, 1],
    [1, 0, q],
  ];
  const [r, g, b] = table[i % 6] as [number, number, number];
  const to = (x: number) => Math.round(x * 255);
  return `#${[to(r), to(g), to(b)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

function randomizePalette(random: () => number): Palette {
  const slots = 2 + Math.floor(random() * 2);
  const hue0 = random() * 360;
  const colors: string[] = [];
  let darkest = 0;
  for (let i = 0; i < slots; i++) {
    const color = hsvHex(hue0 + (i * 360) / slots);
    colors.push(color);
    if (luminance(color) < luminance(colors[darkest])) darkest = i;
  }
  return { colors, darkest };
}

type Scene = 'platlogo' | 'paint';

export default function createPie(context: EggContext): Egg {
  let scene: Scene = 'platlogo';
  let palette = randomizePalette(context.random);
  let radius = Math.max(MIN_RADIUS, context.width / 6);
  let taps = 0;
  let paint: PaintApp | null = null;
  /** True once a gesture has seen more than one pointer (`maxPointers > 1`). */
  let pinched = false;
  let gestureActive = false;

  const onWheel = (event: WheelEvent) => {
    if (scene !== 'platlogo') return;
    event.preventDefault();
    radius = Math.max(MIN_RADIUS, radius - event.deltaY * 0.5);
  };
  context.canvas.addEventListener('wheel', onWheel, { passive: false });

  const launchPaint = (): void => {
    if (context.store.get<number>('p_egg_mode', 0) === 0) {
      context.store.set('p_egg_mode', Date.now());
    }
    scene = 'paint';
    paint = new PaintApp(context);
  };

  const offFrame = context.onFrame((_dt, t) => {
    const { ctx, width, height } = context;

    if (scene === 'paint') {
      const app = paint;
      if (app === null) return;
      app.update(t * 1000);
      ctx.clearRect(0, 0, width, height);
      app.render(ctx);
      return;
    }

    // `PlatLogoActivity` touch handling: every DOWN/MOVE with two pointers
    // sets the radius to half their distance; on the final UP a single-pointer
    // gesture counts as a tap (seventh launches PAINT.APK) while any
    // multi-touch gesture resets the count instead.
    const down = context.pointers.filter((p) => p.down);
    if (down.length >= 2) {
      pinched = true;
      const [a, b] = down;
      radius = Math.max(MIN_RADIUS, Math.hypot(a.x - b.x, a.y - b.y) / 2);
    }
    if (down.length > 0) {
      gestureActive = true;
    } else if (gestureActive) {
      gestureActive = false;
      if (pinched) {
        pinched = false;
        taps = 0;
      } else {
        taps++;
        if (taps >= TAPS_TO_UNLOCK) {
          launchPaint();
          return;
        }
        palette = randomizePalette(context.random);
      }
    }

    const offset = (t * 1000) / 60000;
    const inner = radius * 0.667;

    ctx.save();
    ctx.translate(width / 2, height / 2);

    let w = Math.max(width, height) * 1.414;
    let i = 0;
    while (w > radius * 2 + inner * 2) {
      ctx.fillStyle = palette.colors[i % palette.colors.length];
      ctx.beginPath();
      ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
      ctx.fill();
      w -= inner * (1.1 + Math.sin((i / 20 + offset) * Math.PI));
      i++;
      if (i > 4000) break;
    }

    // The innermost circle stays a constant colour to avoid rapid flashing.
    ctx.fillStyle = palette.colors[(palette.darkest + 1) % palette.colors.length];
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    const p = new Path2D();
    p.moveTo(-radius, height);
    p.lineTo(-radius, 0);
    p.arc(0, 0, radius, Math.PI, Math.PI * 2.5, false);
    p.lineTo(-radius + inner, radius);

    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = palette.colors[palette.darkest];
    ctx.lineWidth = inner * 2;
    ctx.stroke(p);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = inner;
    ctx.stroke(p);

    ctx.restore();
  });

  context.actions.add({
    id: 'paint',
    label: '打开 PAINT.APK',
    run: () => {
      if (scene === 'paint') return;
      launchPaint();
    },
  });

  return {
    hint: '连点 7 次换配色并进入 PAINT.APK；双指捏合（或滚轮）缩放 logo',
    destroy() {
      context.canvas.removeEventListener('wheel', onWheel);
      offFrame();
      paint?.destroy();
      paint = null;
    },
  };
}
