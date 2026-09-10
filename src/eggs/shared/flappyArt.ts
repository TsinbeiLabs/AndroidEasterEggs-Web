/**
 * Vector art shared by LLand (Android 5.0) and MLand (Android 6.0).
 *
 * Android vector path data is SVG path syntax, so every sprite below is the
 * upstream `android:pathData` fed straight to `Path2D` and rendered with the
 * same non-zero winding rule VectorDrawable uses — counters (the droid's eyes,
 * the `o` in the sun's ray ring) come out as holes for free, without shipping
 * any bitmaps. All art is drawn in its native viewport (24, 48, 100 or 560
 * units) and scaled by the caller.
 */

/**
 * `PorterDuff.Mode.MULTIPLY` with `Color.rgb(c, c, c)`: scales every channel by
 * `k`. Used for MLand's depth shading, where `k = (int)(255 * z) / 255`.
 */
export function shadeColor(hex: string, k: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = Math.round(((value >> 16) & 0xff) * k);
  const g = Math.round(((value >> 8) & 0xff) * k);
  const b = Math.round((value & 0xff) * k);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * `l_android.xml` / `m_android.xml` (byte-identical), 48 unit viewport. The two
 * eye circles live inside the head path as counter-clockwise counters, so the
 * non-zero fill leaves them transparent and the sky shows through — exactly what
 * the runtime `setTintMode(SRC_ATOP)` tint does upstream.
 */
const DROID = new Path2D(
  // torso
  'M12,36 c0,1.1 0.9,2 2,2 l2,0 l0,7 c0,1.7 1.3,3 3,3 c1.7,0 3,-1.3 3,-3 l0,-7 l4,0 l0,7 ' +
    'c0,1.7 1.3,3 3,3 c1.7,0 3,-1.3 3,-3 l0,-7 l2,0 c1.1,0 2,-0.9 2,-2 L36,16 L12,16 L12,36 z' +
    // leftArm
    'M7,16 c-1.7,0 -3,1.3 -3,3 l0,14 c0,1.7 1.3,3 3,3 c1.7,0 3,-1.3 3,-3 L10,19 C10,17.3 8.7,16 7,16 z' +
    // rightArm
    'M41,16 c-1.7,0 -3,1.3 -3,3 l0,14 c0,1.7 1.3,3 3,3 c1.7,0 3,-1.3 3,-3 L44,19 C44,17.3 42.7,16 41,16 z' +
    // illFormTheHead, with the two r=1.31 eye counters at (19,9) and (29,9)
    'M31.1,4.3 l2.6,-2.6 c0.4,-0.4 0.4,-1 0,-1.4 c-0.4,-0.4 -1,-0.4 -1.4,0 l-3,3 ' +
    'C27.7,2.5 25.9,2 24,2 c-1.9,0 -3.7,0.5 -5.3,1.3 l-3,-3 c-0.4,-0.4 -1,-0.4 -1.4,0 ' +
    'c-0.4,0.4 -0.4,1 0,1.4 l2.6,2.6 C13.9,6.5 12,10 12,14 l24,0 C36,10 34.1,6.5 31.1,4.3 z' +
    'M20.31,9 c0,0.72 -0.59,1.31 -1.31,1.31 c-0.72,0 -1.31,-0.59 -1.31,-1.31 ' +
    'c0,-0.72 0.59,-1.31 1.31,-1.31 C19.72,7.69 20.31,8.28 20.31,9 z' +
    'M30.31,9 c0,0.72 -0.59,1.31 -1.31,1.31 c-0.73,0 -1.31,-0.59 -1.31,-1.31 ' +
    'c0,-0.72 0.59,-1.31 1.31,-1.31 C29.72,7.69 30.31,8.28 30.31,9 z',
);

const CLOUD = new Path2D(
  'M38.7,20.1 C37.3,13.2 31.3,8 24,8 c-5.8,0 -10.8,3.3 -13.3,8.1 C4.7,16.7 0,21.8 0,28 ' +
    'c0,6.6 5.4,12 12,12 l26,0 c5.5,0 10,-4.5 10,-10 C48,24.7 43.9,20.4 38.7,20.1 z',
);

/** `l_cloud_off.xml` / `m_cloud_off.xml`, the 1 % easter egg, 24 unit viewport. */
const CLOUD_OFF = new Path2D(
  'M19.4,10 c-0.7,-3.4 -3.7,-6 -7.4,-6 c-1.5,0 -2.9,0.4 -4,1.2 l1.5,1.5 C10.2,6.2 11.1,6 12,6 ' +
    'c3,0 5.5,2.5 5.5,5.5 L17.5,12 L19,12 c1.7,0 3,1.3 3,3 c0,1.1 -0.6,2.1 -1.6,2.6 l1.5,1.5 ' +
    'c1.3,-0.9 2.1,-2.4 2.1,-4.1 C24,12.4 21.9,10.2 19.4,10 z' +
    'M3,5.3 L5.8,8 C2.6,8.2 0,10.8 0,14 c0,3.3 2.7,6 6,6 l11.7,0 l2,2 l1.3,-1.3 L4.3,4 L3,5.3 z' +
    'M7.7,10 l8,8 L6,18 c-2.2,0 -4,-1.8 -4,-4 c0,-2.2 1.8,-4 4,-4 L7.7,10 z',
);

/** `l_moon.xml` / `m_moon.xml`, 48 unit viewport: horns left, lit limb right. */
const MOON = new Path2D(
  'M18,4 c-2.1,0 -4.1,0.3 -6,0.9 C20.1,7.5 26,15 26,24 s-5.9,16.5 -14,19.1 ' +
    'c1.9,0.6 3.9,0.9 6,0.9 c11,0 20,-9 20,-20 S29,4 18,4 z',
);

/** `m_mm_head.xml`: the squircle body plus its `#33000000` top-face shading. */
const MM_HEAD = new Path2D(
  'M18.6,5.4 C18.1,5 16,4 12,4 S5.9,5 5.4,5.4 C5,5.9 4,8 4,12 s1,6.1 1.4,6.6 C5.9,19 8,20 12,20 ' +
    's6.1,-1 6.6,-1.4 C19,18.1 20,16 20,12 S19,5.9 18.6,5.4 z',
);
/** `m_mm_eyes2.xml`: the two closed/happy eye squiggles. */
const MM_EYES2 = new Path2D(
  'M7.4,11.7 c-0.6,0 -0.7,0.7 -0.7,0.3 c0,-0.4 0.3,-0.7 0.7,-0.7 C7.7,11.3 8,11.6 8,12 ' +
    'C8,12.4 7.9,11.7 7.4,11.7 z' +
    'M16.6,11.7 c-0.6,0 -0.7,0.7 -0.7,0.3 c0,-0.4 0.3,-0.7 0.7,-0.7 s0.7,0.3 0.7,0.7 ' +
    'C17.3,12.4 17.2,11.7 16.6,11.7 z',
);
/** `m_mm_mouth1.xml` .. `m_mm_mouth3.xml`; mouth4 is a plain r=0.9 disc. */
const MM_MOUTH1 = new Path2D(
  'M6.5,15.5 c-0.6,0 -0.9,-0.1 -1.1,-0.2 c0,0 0,-0.1 0,-0.2 c0,0 0.1,0 0.2,0 c0.2,0.2 1.1,0.2 2.5,0.1 ' +
    'c1,-0.1 2.3,-0.1 4,-0.1 c1.6,0 2.9,0.1 4,0.1 c1.4,0.1 2.3,0.1 2.5,-0.1 c0,0 0.1,0 0.2,0 ' +
    'c0,0 0,0.1 0,0.2 c-0.3,0.3 -1.2,0.3 -2.7,0.2 c-1,-0.1 -2.3,-0.1 -4,-0.1 c-1.6,0 -2.9,0.1 -4,0.1 ' +
    'C7.4,15.5 6.9,15.5 6.5,15.5 z',
);
const MM_MOUTH2 = new Path2D(
  'M18.6,15.1 c0,0 -0.1,0 -0.2,0 c-0.3,0.3 -1.6,0.3 -3.1,0.3 c-0.4,0 -0.9,0 -1.4,0 c-0.6,0 -1.3,0 -2,0 ' +
    's-1.4,0 -2,0 c-0.5,0 -1,0 -1.4,0 c-1.5,0 -2.8,0 -3.1,-0.3 c0,0 -0.1,0 -0.2,0 c0,0 0,0.1 0,0.1 ' +
    's0,0.1 0,0.1 c0.6,0.6 3.1,1 6.6,1 s6.1,-0.4 6.6,-1 C18.7,15.2 18.7,15.2 18.6,15.1 ' +
    'C18.7,15.1 18.7,15.1 18.6,15.1 z',
);
const MM_MOUTH3 = new Path2D('M10.3,15.2 c0.1,0.9 0.7,1.7 1.7,1.7 s1.6,-0.8 1.7,-1.7 z');

/** Tinted `SRC_ATOP` with the player colour at runtime. */
export function drawDroid(ctx: CanvasRenderingContext2D, size: number, color: string): void {
  const k = size / 48;
  ctx.save();
  ctx.scale(k, k);
  ctx.fillStyle = color;
  ctx.fill(DROID);
  ctx.restore();
}

/** `l_star.xml`: a four point sparkle in a 48 unit box. */
export function drawSparkle(ctx: CanvasRenderingContext2D, size: number, color = '#FFFFFF'): void {
  const k = size / 48;
  ctx.save();
  ctx.scale(k, k);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(30.25, 17.75);
  ctx.lineTo(24, 4);
  ctx.lineTo(17.75, 17.75);
  ctx.lineTo(4, 24);
  ctx.lineTo(17.75, 30.25);
  ctx.lineTo(24, 44);
  ctx.lineTo(30.25, 30.25);
  ctx.lineTo(44, 24);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * `l_sun.xml`: the `#FFFFFFCC` disc is painted first, then the `#FFFFFF40` ray
 * ring with its r=12 counter-clockwise hole, so the ring brightens the disc
 * between r=12 and r=16.
 */
export function drawSun(ctx: CanvasRenderingContext2D, size: number, tint?: string): void {
  const k = size / 48;
  ctx.save();
  ctx.scale(k, k);

  ctx.fillStyle = tint ?? 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(24, 24, 16, 0, Math.PI * 2);
  ctx.fill();

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
  // The inner circle is a separate subpath in the same element: non-zero winding
  // punches the hole exactly like VectorDrawable does.
  ctx.arc(24, 24, 12, 0, Math.PI * 2, true);
  ctx.fill();
  ctx.restore();
}

/** `l_moon.xml`, randomly mirrored (`scaleX = -1`) and tilted by `scaleX * 5..30`. */
export function drawMoon(ctx: CanvasRenderingContext2D, size: number, mirror: boolean, rot: number): void {
  const k = size / 48;
  ctx.save();
  ctx.scale(k, k);
  ctx.translate(24, 24);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(mirror ? -1 : 1, 1);
  ctx.translate(-24, -24);
  ctx.fillStyle = '#F2F2FF';
  ctx.fill(MOON);
  ctx.restore();
}

/** `l_cloud.xml`, or `l_cloud_off.xml` when `off` (1 % of clouds). */
export function drawCloud(ctx: CanvasRenderingContext2D, size: number, alpha = 0.25, off = false): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.scale(size / (off ? 24 : 48), size / (off ? 24 : 48));
  ctx.fillStyle = '#FFFFFF';
  ctx.fill(off ? CLOUD_OFF : CLOUD);
  ctx.restore();
}

/** `m_cactus1..3`, 48 unit viewport, shaded by MLand's depth multiply. */
export function drawCactus(ctx: CanvasRenderingContext2D, size: number, variant: number, shade = 1): void {
  const k = size / 48;
  ctx.save();
  ctx.scale(k, k);

  const body = shadeColor('#0D904F', shade);
  const mid = shadeColor('#097138', shade);
  const dark = shadeColor('#055524', shade);

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
    ctx.fillStyle = shadeColor('#AB47BC', shade);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(38.3, 19);
      ctx.lineTo(38.3 + Math.cos(a) * 5.4, 19 + Math.sin(a) * 5.4);
      ctx.lineTo(38.3 + Math.cos(a + 0.4) * 2.4, 19 + Math.sin(a + 0.4) * 2.4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = shadeColor('#FFA726', shade);
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
export function drawMountain(ctx: CanvasRenderingContext2D, size: number, variant: number, shade = 1): void {
  const k = size / 48;
  ctx.save();
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.rect(0, 0, 48, 48);
  ctx.clip();

  const light = shadeColor('#4DB6AC', shade);
  const shadow = shadeColor('#00897B', shade);
  const snow = shadeColor('#FFFFFF', shade);
  const snowShade = shadeColor('#CCCCCC', shade);

  const peak = (
    left: number,
    apexX: number,
    apexY: number,
    right: number,
    base: number,
    shadeX: number,
    hasSnow: boolean,
  ) => {
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(left, base);
    ctx.lineTo(apexX, apexY);
    ctx.lineTo(right, base);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.moveTo(apexX, apexY);
    ctx.lineTo(shadeX, base);
    ctx.lineTo(right, base);
    ctx.closePath();
    ctx.fill();

    if (hasSnow) {
      ctx.fillStyle = snow;
      ctx.beginPath();
      ctx.moveTo(apexX, apexY);
      ctx.lineTo(apexX - (apexX - left) * 0.34, apexY + (base - apexY) * 0.34);
      ctx.lineTo(apexX - (apexX - left) * 0.18, apexY + (base - apexY) * 0.44);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = snowShade;
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

/** `LLand.POPS`, in resource order. */
export const LOLLIPOP_POPS: readonly LollipopPop[] = [
  'belt',
  'droid',
  'pizza',
  'stripes',
  'swirl',
  'vortex',
  'vortex2',
];

/** Pops whose `POPS[i + 1]` spinny flag is 1; they turn at 45 deg/s. */
export const SPINNY_POPS: ReadonlySet<LollipopPop> = new Set(['pizza', 'swirl', 'vortex', 'vortex2']);

/** `l_pop_swirl.xml`: twelve pinwheel blades, all meeting at the centre. */
const SWIRL_BLADES: ReadonlyArray<readonly [string, string]> = [
  [
    '#82B1FF',
    'M50,50 C86.898,27.835 79.244,11.688 76.177,7.399 c-7.24,-4.459 -15.703,-7.112 -24.77,-7.363 C56.247,2.253 70.815,12.456 50,50 z',
  ],
  [
    '#76FF03',
    'M50,50 c20.815,-37.544 6.247,-47.747 1.407,-49.964 C50.938,0.022 50.472,0 50,0 c-8.627,0 -16.744,2.186 -23.827,6.032 C31.392,5.514 49.252,6.903 50,50 z',
  ],
  [
    '#76FF03',
    'M50,50 c37.544,20.816 47.747,6.248 49.965,1.408 C99.978,50.938 100,50.473 100,50 c0,-8.627 -2.186,-16.744 -6.032,-23.827 C94.486,31.393 93.098,49.252 50,50 z',
  ],
  [
    '#303F9F',
    'M50,50 c43.098,-0.748 44.486,-18.607 43.968,-23.827 c-4.186,-7.708 -10.344,-14.188 -17.791,-18.773 C79.244,11.688 86.898,27.835 50,50 z',
  ],
  [
    '#FAFAFA',
    'M50,50 C27.834,13.103 11.687,20.757 7.398,23.824 C2.94,31.063 0.287,39.527 0.035,48.593 C2.253,43.753 12.456,29.185 50,50 z',
  ],
  [
    '#303F9F',
    'M50,50 C49.252,6.903 31.392,5.514 26.173,6.032 c-7.709,4.187 -14.188,10.344 -18.774,17.792 C11.687,20.757 27.834,13.103 50,50 z',
  ],
  [
    '#76FF03',
    'M50,50 C12.456,29.185 2.253,43.753 0.035,48.593 C0.022,49.062 0,49.528 0,50 c0,8.628 2.186,16.744 6.032,23.828 C5.514,68.609 6.902,50.749 50,50 z',
  ],
  [
    '#303F9F',
    'M50,50 c0.748,43.098 18.608,44.486 23.827,43.969 c7.709,-4.187 14.188,-10.344 18.774,-17.791 C88.313,79.244 72.166,86.898 50,50 z',
  ],
  [
    '#FAFAFA',
    'M50,50 c22.166,36.898 38.313,29.244 42.602,26.178 c4.458,-7.24 7.111,-15.703 7.363,-24.77 C97.747,56.248 87.544,70.816 50,50 z',
  ],
  [
    '#76FF03',
    'M50,50 c-20.815,37.545 -6.247,47.748 -1.407,49.965 C49.062,99.979 49.528,100 50,100 c8.627,0 16.744,-2.185 23.827,-6.031 C68.608,94.486 50.748,93.098 50,50 z',
  ],
  [
    '#82B1FF',
    'M50,50 C13.103,72.166 20.757,88.313 23.823,92.602 c7.24,4.459 15.703,7.112 24.77,7.363 C43.753,97.748 29.185,87.545 50,50 z',
  ],
  [
    '#303F9F',
    'M50,50 C6.902,50.749 5.514,68.609 6.032,73.828 c4.186,7.708 10.344,14.188 17.791,18.773 C20.757,88.313 13.103,72.166 50,50 z',
  ],
];

const VORTEX_BAND = new Path2D(
  'M58.658,89.648 c-19.33,0 -35,-15.67 -35,-35 c0,-13.531 10.969,-24.5 24.5,-24.5 c9.472,0 17.15,7.679 17.15,17.15 ' +
    'c0,6.631 -5.375,12.006 -12.006,12.006 c-3.798,0 -7.004,-2.522 -8.045,-5.982 c1.021,1.136 2.497,1.854 4.145,1.854 ' +
    'c2.644,0 4.853,-1.841 5.428,-4.31 c0.175,-0.558 0.271,-1.15 0.271,-1.766 c0,-4.642 -3.763,-8.404 -8.403,-8.404 ' +
    'c-6.631,0 -12.006,5.375 -12.006,12.006 c0,9.472 7.679,17.149 17.15,17.149 c13.531,0 24.5,-10.969 24.5,-24.5 ' +
    'c0,-19.33 -15.67,-35 -35,-35 c-12.963,0 -24.773,4.935 -33.657,13.025 C2.824,31.087 0,40.212 0,50 ' +
    'c0,27.615 22.386,50 50,50 c17.825,0 33.462,-9.335 42.314,-23.376 C83.431,84.715 71.621,89.648 58.658,89.648 z',
);

const VORTEX2_BAND = new Path2D(
  'M21.25,78.369 c-13.2,-16 -10.93,-39.671 5.07,-52.871 c12.799,-10.56 31.737,-8.743 42.295,4.057 ' +
    'c8.448,10.239 6.996,25.389 -3.244,33.837 c-8.191,6.759 -20.311,5.596 -27.068,-2.596 ' +
    'c-5.408,-6.554 -4.478,-16.249 2.076,-21.656 c5.242,-4.325 12.998,-3.581 17.324,1.661 ' +
    'c3.46,4.194 2.865,10.399 -1.33,13.859 c-3.354,2.769 -8.318,2.293 -11.087,-1.062 ' +
    'c-2.214,-2.685 -1.833,-6.655 0.851,-8.87 c2.147,-1.771 5.324,-1.468 7.096,0.681 ' +
    'c1.393,1.688 1.174,4.165 -0.464,5.596 c0.409,-0.564 0.657,-1.253 0.657,-2.004 ' +
    'c0,-1.021 -0.455,-1.928 -1.165,-2.556 c-0.067,-0.112 -0.134,-0.226 -0.22,-0.329 ' +
    'c-1.135,-1.373 -3.168,-1.568 -4.542,-0.435 c-1.719,1.417 -1.962,3.958 -0.544,5.677 ' +
    'c1.771,2.146 4.949,2.451 7.096,0.68 c2.684,-2.215 3.064,-6.186 0.851,-8.87 ' +
    'c-2.769,-3.356 -7.732,-3.831 -11.087,-1.063 c-4.195,3.46 -4.79,9.665 -1.33,13.859 ' +
    'c4.326,5.244 12.082,5.987 17.324,1.662 c6.554,-5.407 7.484,-15.102 2.076,-21.656 ' +
    'c-6.758,-8.191 -18.876,-9.354 -27.069,-2.596 c-10.239,8.448 -11.691,23.598 -3.244,33.837 ' +
    'c10.56,12.8 29.497,14.616 42.296,4.056 c16,-13.199 18.27,-36.87 5.07,-52.869 ' +
    'C68.397,5.62 52.517,-0.139 37.205,1.659 c-8.665,2.287 -16.411,6.836 -22.561,12.985 ' +
    'C5.597,23.693 0,36.193 0,50 c0,13.808 5.597,26.308 14.645,35.355 C23.693,94.404 36.193,100 50,100 ' +
    'c11.935,0 22.887,-4.187 31.482,-11.164 C61.909,100.523 36.203,96.495 21.25,78.369 z',
);

const SWIRL_PATHS = SWIRL_BLADES.map(([color, data]) => [color, new Path2D(data)] as const);

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
      // Base disc, then the upper-left half in the lighter pink, then the ribbon.
      // The ribbon is deliberately full-bleed: it overhangs the r=47.6 disc by
      // 2.4 units on each side, so it must not be clipped.
      disc(ctx, 47.6, '#D81B60');
      ctx.save();
      clipDisc(ctx, 47.6);
      ctx.fillStyle = '#F06292';
      ctx.beginPath();
      ctx.moveTo(16.28, 83.84);
      ctx.lineTo(83.72, 16.4);
      ctx.lineTo(100, 16.4);
      ctx.lineTo(100, 0);
      ctx.lineTo(0, 0);
      ctx.lineTo(0, 83.84);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#D81B60';
      ctx.fillRect(0, 41.573, 100, 17.09);
      ctx.fillStyle = '#F06292';
      ctx.beginPath();
      ctx.moveTo(0, 58.663);
      ctx.lineTo(0, 41.573);
      ctx.lineTo(100, 41.573);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'droid': {
      // l_pop_droid.xml paints the two white eyes *before* the #C0CA33 upper
      // half-disc, so upstream they end up completely covered: no visible eyes.
      disc(ctx, 50, '#9E9D24');
      ctx.save();
      clipDisc(ctx, 50);
      ctx.fillStyle = '#C0CA33';
      ctx.fillRect(0, 0, 100, 50);
      ctx.restore();
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
      for (const [color, path] of SWIRL_PATHS) {
        ctx.fillStyle = color;
        ctx.fill(path);
      }
      break;
    }
    case 'vortex':
    case 'vortex2': {
      disc(ctx, 50, art === 'vortex' ? '#FFF176' : '#D81B60');
      ctx.fillStyle = art === 'vortex' ? '#7BAAF7' : '#F06292';
      ctx.fill(art === 'vortex' ? VORTEX_BAND : VORTEX2_BAND);
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

/** `m_mm_antennae.xml` (0) and `m_mm_antennae2.xml` (1), 24 unit viewport. */
const MM_ANTENNAE = [
  new Path2D(
    'M15.6,5.3 c0,0 -0.1,0 -0.1,0 c-0.3,-0.1 -0.4,-0.3 -0.4,-0.6 L16,1.4 C16,1.1 16.3,0.9 16.6,1 ' +
      'c0.3,0.1 0.4,0.3 0.4,0.6 l-0.8,3.3 C16.1,5.1 15.9,5.3 15.6,5.3 z' +
      'M8.4,5.3 c-0.2,0 -0.4,-0.2 -0.5,-0.4 L7.1,1.6 C7,1.4 7.2,1.1 7.4,1 C7.7,0.9 8,1.1 8,1.4 ' +
      'l0.8,3.3 c0.1,0.3 -0.1,0.5 -0.4,0.6 C8.5,5.3 8.4,5.3 8.4,5.3 z',
  ),
  new Path2D(
    'M15.6,5.5 C15.5,5.5 15.5,5.5 15.6,5.5 c-0.3,-0.3 -0.3,-0.6 -0.1,-0.8 l2.4,-2.5 ' +
      'c0.2,-0.2 0.5,-0.2 0.7,0 c0.2,0.2 0.2,0.5 0,0.7 l-2.4,2.5 C16,5.6 15.8,5.7 15.6,5.5 z' +
      'M8.4,5.6 C8.2,5.7 8,5.6 7.8,5.5 L5.5,3 c-0.2,-0.2 -0.2,-0.5 0,-0.7 c0.2,-0.2 0.5,-0.2 0.7,0 ' +
      'l2.4,2.5 C8.7,5 8.7,5.3 8.4,5.6 C8.5,5.5 8.5,5.5 8.4,5.6 z',
  ),
];

/**
 * The `m_mm_*` marshmallow faces, 24 unit viewport, drawn in `MLand.Pop.onDraw`
 * order: head background, then antenna, eyes, mouth on top of it.
 */
export function drawMarshmallow(ctx: CanvasRenderingContext2D, size: number, look: MarshmallowLook): void {
  const k = size / 24;
  ctx.save();
  ctx.scale(k, k);

  ctx.fillStyle = '#FFFFFF';
  ctx.fill(MM_HEAD);
  // m_mm_head.xml's second path: the #33000000 top-face shading.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.beginPath();
  ctx.ellipse(12, 5.7, 6.6, 1.7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fill(MM_ANTENNAE[look.antenna]);

  ctx.fillStyle = '#000000';
  if (look.eyes === 0) {
    ctx.beginPath();
    ctx.arc(7.4, 12, 0.7, 0, Math.PI * 2);
    ctx.arc(16.6, 12, 0.7, 0, Math.PI * 2);
    ctx.fill();
  } else if (look.eyes === 1) {
    ctx.fill(MM_EYES2);
  }

  switch (look.mouth) {
    case 0:
      ctx.fill(MM_MOUTH1);
      break;
    case 1:
      ctx.fill(MM_MOUTH2);
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

/**
 * The 1 % candy-cane stem variant: a white -> #DDDDDD gradient under red
 * diagonal bands, repeated every `4 * w` down the stick.
 */
export function drawCandyCaneStem(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, '#FFFFFF');
  gradient.addColorStop(1, '#DDDDDD');
  ctx.fillStyle = gradient;
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
