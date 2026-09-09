/**
 * Vector art shared by LLand (Android 5.0) and MLand (Android 6.0).
 *
 * Where the research notes captured the upstream `android:pathData` verbatim we
 * feed it straight to `Path2D` — Android vector path data is SVG path syntax, so
 * the sprites come out geometrically identical without shipping any bitmaps.
 * All art is drawn in its native viewport (48 or 100 units) and scaled by the
 * caller.
 */

const DROID_TORSO = new Path2D(
  'M12,36 c0,1.1 0.9,2 2,2 l2,0 l0,7 c0,1.7 1.3,3 3,3 c1.7,0 3,-1.3 3,-3 l0,-7 l4,0 l0,7 c0,1.7 1.3,3 3,3 c1.7,0 3,-1.3 3,-3 l0,-7 l2,0 c1.1,0 2,-0.9 2,-2 L36,16 L12,16 L12,36 z',
);
const DROID_ARM_LEFT = new Path2D(
  'M7,16 c-1.7,0 -3,1.3 -3,3 l0,14 c0,1.7 1.3,3 3,3 c1.7,0 3,-1.3 3,-3 L10,19 C10,17.3 8.7,16 7,16 z',
);
const DROID_ARM_RIGHT = new Path2D(
  'M41,16 c1.7,0 3,1.3 3,3 l0,14 c0,1.7 -1.3,3 -3,3 c-1.7,0 -3,-1.3 -3,-3 L38,19 C38,17.3 39.3,16 41,16 z',
);
const DROID_HEAD = new Path2D(
  'M31.1,4.3 l2.6,-2.6 c0.4,-0.4 0.4,-1 0,-1.4 c-0.4,-0.4 -1,-0.4 -1.4,0 l-3,3 C27.7,2.5 25.9,2 24,2 c-1.9,0 -3.7,0.5 -5.3,1.3 l-3,-3 c-0.4,-0.4 -1,-0.4 -1.4,0 c-0.4,0.4 -0.4,1 0,1.4 l2.6,2.6 C13.9,6.5 12,10 12,14 l24,0 C36,10 34.1,6.5 31.1,4.3 z',
);

const CLOUD = new Path2D(
  'M38.7,20.1 C37.3,13.2 31.3,8 24,8 c-5.8,0 -10.8,3.3 -13.3,8.1 C4.7,16.7 0,21.8 0,28 c0,6.6 5.4,12 12,12 l26,0 c5.5,0 10,-4.5 10,-10 C48,24.7 43.9,20.4 38.7,20.1 z',
);

const MM_HEAD = new Path2D(
  'M18.6,5.4 C18.1,5 16,4 12,4 S5.9,5 5.4,5.4 C5,5.9 4,8 4,12 s1,6.1 1.4,6.6 C5.9,19 8,20 12,20 s6.1,-1 6.6,-1.4 C19,18.1 20,16 20,12 S19,5.9 18.6,5.4 z',
);
const MM_MOUTH3 = new Path2D('M10.3,15.2 c0.1,0.9 0.7,1.7 1.7,1.7 s1.6,-0.8 1.7,-1.7 z');

/** `l_android.xml` / `m_android.xml`, 48 unit viewport, tinted per player. */
export function drawDroid(ctx: CanvasRenderingContext2D, size: number, color: string): void {
  const k = size / 48;
  ctx.save();
  ctx.scale(k, k);
  ctx.fillStyle = color;
  ctx.fill(DROID_ARM_LEFT);
  ctx.fill(DROID_ARM_RIGHT);
  ctx.fill(DROID_TORSO);
  ctx.fill(DROID_HEAD);

  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(19, 9, 1.31, 0, Math.PI * 2);
  ctx.arc(29, 9, 1.31, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** `l_star.xml`: a four point sparkle in a 48 unit box. */
export function drawSparkle(ctx: CanvasRenderingContext2D, size: number, color = '#FFFFFF'): void {
  const k = size / 48;
  const pts: Array<[number, number]> = [
    [30.25, 17.75],
    [24, 4],
    [17.75, 17.75],
    [4, 24],
    [17.75, 30.25],
    [24, 44],
    [30.25, 30.25],
    [44, 24],
  ];
  ctx.save();
  ctx.scale(k, k);
  ctx.fillStyle = color;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** `l_sun.xml`: 80 % white disc plus a 25 % white ray ring with a round hole. */
export function drawSun(ctx: CanvasRenderingContext2D, size: number, tint?: string): void {
  const k = size / 48;
  ctx.save();
  ctx.scale(k, k);

  const rays: Array<[number, number]> = [
    [40, 30.6],
    [46.6, 24],
    [40, 17.4],
    [40, 8],
    [30.6, 8],
    [24, 1.4],
    [17.4, 8],
    [8, 8],
    [8, 17.4],
    [1.4, 24],
    [8, 30.6],
    [8, 40],
    [17.4, 40],
    [24, 46.6],
    [30.6, 40],
    [40, 40],
  ];
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  rays.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.arc(24, 24, 12, 0, Math.PI * 2, true);
  ctx.fill('evenodd');

  ctx.fillStyle = tint ?? 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(24, 24, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** `l_moon.xml`: crescent, lit limb on the right. */
export function drawMoon(ctx: CanvasRenderingContext2D, size: number, mirror: boolean, rot: number): void {
  const k = size / 48;
  ctx.save();
  ctx.scale(k, k);
  ctx.translate(24, 24);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(mirror ? -1 : 1, 1);
  ctx.translate(-24, -24);
  ctx.fillStyle = '#F2F2FF';
  ctx.beginPath();
  ctx.arc(18, 24, 20, -Math.PI / 2, Math.PI / 2);
  ctx.bezierCurveTo(26, 15, 20.1, 7.5, 12, 4.9);
  ctx.bezierCurveTo(6.1, 16.5, 6.1, 31.5, 12, 43.1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawCloud(ctx: CanvasRenderingContext2D, size: number, alpha = 0.25): void {
  const k = size / 48;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.scale(k, k);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill(CLOUD);
  ctx.restore();
}

/** `m_cactus1..3`, 48 unit viewport. */
export function drawCactus(ctx: CanvasRenderingContext2D, size: number, variant: number): void {
  const k = size / 48;
  ctx.save();
  ctx.scale(k, k);

  const body = '#0D904F';
  const mid = '#097138';
  const dark = '#055524';

  const arm = (x: number, y: number, w: number, h: number) => {
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h);
    ctx.lineTo(x + w / 2, y + w / 2);
    ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0, false);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
  };

  if (variant === 0) {
    ctx.fillStyle = body;
    ctx.fillRect(20, 9, 11, 42);
    arm(10, 22, 7.5, 20);
    arm(30, 16, 8, 26);
    ctx.fillStyle = mid;
    ctx.fillRect(24, 9, 3, 42);
    ctx.fillStyle = dark;
    ctx.fillRect(28, 9, 3, 42);
  } else if (variant === 1) {
    ctx.fillStyle = body;
    ctx.fillRect(19, 8, 12, 43);
    arm(8, 24, 9, 18);
    arm(31, 20, 9, 22);
    ctx.fillStyle = mid;
    ctx.fillRect(23, 8, 4, 43);
    ctx.fillStyle = '#AB47BC';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(38.3, 19);
      ctx.lineTo(38.3 + Math.cos(a) * 5.4, 19 + Math.sin(a) * 5.4);
      ctx.lineTo(38.3 + Math.cos(a + 0.4) * 2.4, 19 + Math.sin(a + 0.4) * 2.4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#FFA726';
    ctx.beginPath();
    ctx.arc(38.3, 19, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = body;
    ctx.fillRect(21, 16, 10, 35);
    arm(11, 28, 8, 15);
    arm(31, 24, 8, 19);
    ctx.fillStyle = mid;
    ctx.fillRect(25, 16, 3, 35);
    ctx.fillStyle = dark;
    ctx.fillRect(28, 16, 3, 35);
  }
  ctx.restore();
}

/** `m_mountain1..3`, 48 unit viewport (peaks may overflow and get clipped). */
export function drawMountain(ctx: CanvasRenderingContext2D, size: number, variant: number): void {
  const k = size / 48;
  ctx.save();
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.rect(0, 0, 48, 48);
  ctx.clip();

  const peak = (
    left: number,
    apexX: number,
    apexY: number,
    right: number,
    base: number,
    shadeX: number,
    snow: boolean,
  ) => {
    ctx.fillStyle = '#4DB6AC';
    ctx.beginPath();
    ctx.moveTo(left, base);
    ctx.lineTo(apexX, apexY);
    ctx.lineTo(right, base);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#00897B';
    ctx.beginPath();
    ctx.moveTo(apexX, apexY);
    ctx.lineTo(shadeX, base);
    ctx.lineTo(right, base);
    ctx.closePath();
    ctx.fill();

    if (snow) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(apexX, apexY);
      ctx.lineTo(apexX - (apexX - left) * 0.34, apexY + (base - apexY) * 0.34);
      ctx.lineTo(apexX - (apexX - left) * 0.18, apexY + (base - apexY) * 0.44);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#CCCCCC';
      ctx.beginPath();
      ctx.moveTo(apexX, apexY);
      ctx.lineTo(apexX + (right - apexX) * 0.32, apexY + (base - apexY) * 0.32);
      ctx.lineTo(apexX + (right - apexX) * 0.14, apexY + (base - apexY) * 0.2);
      ctx.closePath();
      ctx.fill();
    }
  };

  if (variant === 0) peak(0, 24, 12, 48, 48, 14.1, true);
  else if (variant === 1) peak(0, 24, 12, 48, 48, 10.8, false);
  else {
    peak(0.1, 21.1, 16.5, 42.1, 48, 13.6, true);
    peak(2.1, 27.6, 17.4, 53.2, 55.8, 18.6, true);
    peak(8.9, 28.8, 29.2, 48.8, 59.1, 21.8, true);
  }
  ctx.restore();
}

export type LollipopPop = 'belt' | 'droid' | 'pizza' | 'stripes' | 'swirl' | 'vortex' | 'vortex2';

export const LOLLIPOP_POPS: readonly LollipopPop[] = [
  'belt',
  'droid',
  'pizza',
  'stripes',
  'swirl',
  'vortex',
  'vortex2',
];

/** Pops that spin at 45 deg/s upstream. */
export const SPINNY_POPS: ReadonlySet<LollipopPop> = new Set(['pizza', 'swirl', 'vortex', 'vortex2']);

function disc(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(50, 50, r, 0, Math.PI * 2);
  ctx.fill();
}

function clipDisc(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.beginPath();
  ctx.arc(50, 50, r, 0, Math.PI * 2);
  ctx.clip();
}

/** The seven `l_pop_*` candies, 100 unit viewport centred on (50, 50). */
export function drawLollipopPop(ctx: CanvasRenderingContext2D, size: number, art: LollipopPop): void {
  const k = size / 100;
  ctx.save();
  ctx.scale(k, k);

  switch (art) {
    case 'belt': {
      disc(ctx, 47.6, '#F06292');
      ctx.save();
      clipDisc(ctx, 47.6);
      ctx.fillStyle = '#D81B60';
      ctx.beginPath();
      ctx.moveTo(16.28, 83.84);
      ctx.lineTo(83.72, 16.4);
      ctx.lineTo(100, 16.4);
      ctx.lineTo(100, 100);
      ctx.lineTo(0, 100);
      ctx.lineTo(0, 83.84);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(0, 41.573, 100, 17.09);
      ctx.fillStyle = '#F06292';
      ctx.beginPath();
      ctx.moveTo(0, 58.663);
      ctx.lineTo(0, 41.573);
      ctx.lineTo(100, 41.573);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'droid': {
      disc(ctx, 50, '#9E9D24');
      ctx.save();
      clipDisc(ctx, 50);
      ctx.fillStyle = '#C0CA33';
      ctx.fillRect(0, 0, 100, 50);
      ctx.restore();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(30.776, 24.528, 4.21, 0, Math.PI * 2);
      ctx.arc(69.227, 24.528, 4.21, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'pizza': {
      const colors = ['#7BAAF7', '#FFF176', '#F06292', '#D81B60'];
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = colors[i % 4];
        ctx.beginPath();
        ctx.moveTo(50, 50);
        ctx.arc(50, 50, 50, (i * Math.PI) / 4, ((i + 1) * Math.PI) / 4);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'stripes': {
      disc(ctx, 50, '#F57C00');
      ctx.save();
      clipDisc(ctx, 50);
      const bands: Array<[number, number, string]> = [
        [0, 15.308, '#FFA726'],
        [15.308, 31.631, '#FB8C00'],
        [31.631, 68.37, '#F57C00'],
        [68.37, 84.692, '#EF6C00'],
        [84.692, 100, '#E65100'],
      ];
      for (const [y0, y1, color] of bands) {
        ctx.fillStyle = color;
        ctx.fillRect(0, y0, 100, y1 - y0);
      }
      ctx.restore();
      break;
    }
    case 'swirl': {
      const colors = [
        '#82B1FF',
        '#76FF03',
        '#76FF03',
        '#303F9F',
        '#FAFAFA',
        '#303F9F',
        '#76FF03',
        '#303F9F',
        '#FAFAFA',
        '#76FF03',
        '#82B1FF',
        '#303F9F',
      ];
      disc(ctx, 50, '#303F9F');
      for (let i = 0; i < 12; i++) {
        const a0 = (i / 12) * Math.PI * 2;
        const a1 = ((i + 1) / 12) * Math.PI * 2;
        ctx.fillStyle = colors[i];
        ctx.beginPath();
        ctx.moveTo(50, 50);
        ctx.arc(50, 50, 50, a0, a1);
        ctx.quadraticCurveTo(
          50 + Math.cos(a1 - 0.18) * 26,
          50 + Math.sin(a1 - 0.18) * 26,
          50,
          50,
        );
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'vortex':
    case 'vortex2': {
      const base = art === 'vortex' ? '#FFF176' : '#D81B60';
      const band = art === 'vortex' ? '#7BAAF7' : '#F06292';
      disc(ctx, 50, base);
      ctx.save();
      clipDisc(ctx, 50);
      ctx.strokeStyle = band;
      ctx.lineCap = 'round';
      const turns = 2.6;
      const steps = 90;
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1.2) / steps;
        const r0 = 46 * (1 - t0) + 4;
        const r1 = 46 * (1 - t1) + 4;
        const a0 = t0 * turns * Math.PI * 2;
        const a1 = t1 * turns * Math.PI * 2;
        ctx.lineWidth = 4 + 15 * (1 - t0);
        ctx.beginPath();
        ctx.moveTo(50 + Math.cos(a0) * r0, 50 + Math.sin(a0) * r0);
        ctx.lineTo(50 + Math.cos(a1) * r1, 50 + Math.sin(a1) * r1);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
  }

  ctx.restore();
}

export interface MarshmallowLook {
  antenna: 0 | 1;
  /** -1 means no eyes at all (50 % of pops). */
  eyes: -1 | 0 | 1;
  /** -1 means no mouth (only 10 % of pops get one). */
  mouth: -1 | 0 | 1 | 2 | 3;
}

/** The `m_mm_*` marshmallow faces, 24 unit viewport. */
export function drawMarshmallow(ctx: CanvasRenderingContext2D, size: number, look: MarshmallowLook): void {
  const k = size / 24;
  ctx.save();
  ctx.scale(k, k);

  ctx.strokeStyle = '#FFFFFF';
  ctx.fillStyle = '#FFFFFF';
  ctx.lineCap = 'round';

  if (look.antenna === 0) {
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(16.1, 1.2);
    ctx.lineTo(15.7, 5.2);
    ctx.moveTo(7.7, 1.2);
    ctx.lineTo(8.3, 5.2);
    ctx.stroke();
  } else {
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(17.7, 2.3);
    ctx.lineTo(15.6, 5.4);
    ctx.moveTo(6.2, 2.3);
    ctx.lineTo(8.4, 5.4);
    ctx.stroke();
  }

  ctx.fill(MM_HEAD);

  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(12, 5.7, 6.6, 1.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#000000';
  if (look.eyes === 0) {
    ctx.beginPath();
    ctx.arc(7.4, 12, 0.7, 0, Math.PI * 2);
    ctx.arc(16.6, 12, 0.7, 0, Math.PI * 2);
    ctx.fill();
  } else if (look.eyes === 1) {
    ctx.lineWidth = 0.42;
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.arc(7.4, 12.4, 0.9, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(16.6, 12.4, 0.9, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }

  switch (look.mouth) {
    case 0:
      ctx.fillRect(5.4, 15.3, 13.2, 0.45);
      break;
    case 1:
      ctx.lineWidth = 0.5;
      ctx.strokeStyle = '#000000';
      ctx.beginPath();
      ctx.arc(12, 13.6, 6.4, Math.PI * 0.16, Math.PI * 0.84);
      ctx.stroke();
      break;
    case 2:
      ctx.fill(MM_MOUTH3);
      break;
    case 3:
      ctx.beginPath();
      ctx.arc(12, 16, 0.9, 0, Math.PI * 2);
      ctx.fill();
      break;
    default:
      break;
  }

  ctx.restore();
}

/** The 1 % candy-cane stem variant: white with red diagonal stripes. */
export function drawCandyCaneStem(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#FF0000';
  const period = w * 4;
  for (let y = -period; y < h + period; y += period) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y - w);
    ctx.lineTo(w, y - w + w * 2);
    ctx.lineTo(0, y + w * 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
