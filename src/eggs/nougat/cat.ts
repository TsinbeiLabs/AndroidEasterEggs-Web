import { JavaRandom } from './javaRandom';

/**
 * Neko cat art and colour model (Android 7.0 Nougat, reused verbatim by
 * 11 Red Velvet Cake, 12 Snow Cone and 13 Tiramisu).
 *
 * Everything is a pure function of the cat's `long` seed: 27 vector parts in a
 * 48 unit viewport, drawn in `Cat.CatParts.getDrawingOrder()`, each tinted by a
 * weighted table consumed from `java.util.Random` in a fixed sequence. Only the
 * seed and the display name are ever persisted.
 */

type Part =
  | { kind: 'path'; d: string }
  | { kind: 'stroke'; width: number; d: string }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number };

const PART_NAMES = [
  'collar',
  'leftEar',
  'leftEarInside',
  'rightEar',
  'rightEarInside',
  'head',
  'faceSpot',
  'cap',
  'leftEye',
  'rightEye',
  'nose',
  'mouth',
  'tail',
  'tailCap',
  'tailShadow',
  'foot1',
  'leg1',
  'foot2',
  'leg2',
  'foot3',
  'leg3',
  'foot4',
  'leg4',
  'leg2Shadow',
  'body',
  'belly',
  'bowtie',
] as const;

export type PartName = (typeof PART_NAMES)[number];

const PARTS: Readonly<Record<PartName, Part>> = {
  collar: { kind: 'path', d: 'M9,18.4 h30 v1.7 h-30 z' },
  leftEar: { kind: 'path', d: 'M15.4,1 L20.5,6.3 L14.2,9.1 Z' },
  leftEarInside: { kind: 'path', d: 'M15.4,1 L18.9,7.2 L14.2,9.1 Z' },
  rightEar: { kind: 'path', d: 'M32.6,1 L27.5,6.3 L33.8,9.1 Z' },
  rightEarInside: { kind: 'path', d: 'M33.8,9.1 L29.1,7.2 L32.6,1 Z' },
  head: { kind: 'path', d: 'M9,18.5 C9,10.2 15.8,3.5 24,3.5 S39,10.2 39,18.5 H9 Z' },
  faceSpot: { kind: 'path', d: 'M19.5,15.2 a4.5,3.2 0 1,0 9,0 a4.5,3.2 0 1,0 -9,0 z' },
  cap: {
    kind: 'path',
    d: 'M27.2,3.8 C26.2,3.6 25.1,3.5 24,3.5 S21.9,3.6 20.8,3.8 C21,5.1 22.3,6 24,6 C25.6,6.1 26.9,5.1 27.2,3.8 Z',
  },
  leftEye: { kind: 'path', d: 'M20.5,11 C20.5,12.7 17.5,12.7 17.5,11 C17.5,9.3 20.5,9.3 20.5,11 Z' },
  rightEye: { kind: 'path', d: 'M30.5,11 C30.5,12.7 27.5,12.7 27.5,11 C27.5,9.3 30.5,9.3 30.5,11 Z' },
  nose: { kind: 'path', d: 'M25.2,13 C25.2,14.3 22.9,14.3 22.9,13 S25.2,11.7 25.2,13 Z' },
  mouth: {
    kind: 'stroke',
    width: 1.2,
    d: 'M29,14.3 C28.6,15.1 27.7,15.7 26.7,15.7 C25.3,15.7 24,14.4 24,13 M24,13 C24,14.5 22.8,15.7 21.3,15.7 C20.3,15.7 19.4,15.2 19,14.3',
  },
  tail: { kind: 'stroke', width: 5, d: 'M35,35.5 H40.9 C43,35.5 44.7,33.8 44.7,31.7 V25.5' },
  tailCap: { kind: 'path', d: 'M42.2,25.5 C42.2,24.1 43.3,23 44.7,23 S47.2,24.1 47.2,25.5 H42.2 Z' },
  tailShadow: { kind: 'path', d: 'M40,38 L40,33 L39,33 L39,38 Z' },
  foot1: { kind: 'circle', cx: 11.5, cy: 43, r: 2.5 },
  leg1: { kind: 'rect', x: 9, y: 37, w: 5, h: 6 },
  foot2: { kind: 'circle', cx: 18.5, cy: 43, r: 2.5 },
  leg2: { kind: 'rect', x: 16, y: 37, w: 5, h: 6 },
  foot3: { kind: 'circle', cx: 29.5, cy: 43, r: 2.5 },
  leg3: { kind: 'rect', x: 27, y: 37, w: 5, h: 6 },
  foot4: { kind: 'circle', cx: 36.5, cy: 43, r: 2.5 },
  leg4: { kind: 'rect', x: 34, y: 37, w: 5, h: 6 },
  leg2Shadow: { kind: 'rect', x: 16, y: 37, w: 5, h: 3 },
  body: { kind: 'rect', x: 9, y: 20, w: 30, h: 18 },
  belly: {
    kind: 'path',
    d: 'M20.5,25 C16.9,25 14,27.9 14,31.5 V38 H27 V31.5 C27,27.9 24.1,25 20.5,25 Z',
  },
  bowtie: { kind: 'path', d: 'M29,16.8 L19,21.8 L19,16.8 L29,21.8 Z' },
};

const PATH_CACHE = new Map<string, Path2D>();

function pathFor(part: Part): Path2D {
  const d = part.kind === 'stroke' ? part.d : part.kind === 'path' ? part.d : '';
  const cached = PATH_CACHE.get(d);
  if (cached !== undefined) return cached;
  const built = new Path2D(d);
  PATH_CACHE.set(d, built);
  return built;
}

/**
 * `Cat.P_BODY_COLORS`. The last entry is declared as weight 1 upstream, but
 * `chooseP` stops subtracting at `a.length - 2` and returns the final colour
 * for every remaining `pct` in [959, 1000) — an effective weight of 41, which
 * is what the random-HSV cat (`''`) has to use here to stay seed compatible.
 */
const BODY_TABLE: ReadonlyArray<readonly [number, string]> = [
  [180, '#212121'],
  [180, '#FFFFFF'],
  [140, '#616161'],
  [140, '#795548'],
  [100, '#90A4AE'],
  [100, '#FFF9C4'],
  [100, '#FF8F00'],
  [5, '#29B6F6'],
  [5, '#FFCDD2'],
  [5, '#CE93D8'],
  [4, '#43A047'],
  [41, ''],
];

const COLLAR_TABLE: ReadonlyArray<readonly [number, string]> = [
  [250, '#FFFFFF'],
  [250, '#000000'],
  [250, '#F44336'],
  [50, '#1976D2'],
  [50, '#FDD835'],
  [50, '#FB8C00'],
  [50, '#F48FB1'],
  [50, '#4CAF50'],
];

const BELLY_TABLE: ReadonlyArray<readonly [number, string]> = [
  [750, ''],
  [250, '#FFFFFF'],
];

const DARK_SPOT_TABLE: ReadonlyArray<readonly [number, string]> = [
  [700, ''],
  [250, '#212121'],
  [50, '#6D4C41'],
];

const LIGHT_SPOT_TABLE: ReadonlyArray<readonly [number, string]> = [
  [700, ''],
  [300, '#FFFFFF'],
];

const SHADOW_COLOR = 'rgba(0, 0, 0, 0.125)';
const EAR_INSIDE_DARK = '#EF9A9A';
const EAR_INSIDE_LIGHT = 'rgba(213, 0, 0, 0.125)';

function chooseP(rng: JavaRandom, table: ReadonlyArray<readonly [number, string]>): string {
  let pct = rng.nextInt(1000);
  for (const [weight, value] of table) {
    if (pct < weight) return value;
    pct -= weight;
  }
  return table[table.length - 1][1];
}

export function hsvToHex(h: number, s: number, v: number): string {
  const hue = (((h % 360) + 360) % 360) / 60;
  const i = Math.floor(hue);
  const f = hue - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const table: number[][] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ];
  const [r, g, b] = table[i % 6] as [number, number, number];
  const to = (x: number) =>
    Math.max(0, Math.min(255, Math.round(x * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function parseHex(color: string): [number, number, number] {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function isDark(color: string): boolean {
  if (color === '') return true;
  if (!color.startsWith('#')) return false;
  const [r, g, b] = parseHex(color);
  return r + g + b < 0x80;
}

function hueOf(color: string): number {
  if (!color.startsWith('#')) return 0;
  const [r, g, b] = parseHex(color).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}

/** Shifts HSV value by +/-0.25, as `Cat.createIcon` does for the badge circle. */
export function shiftValue(color: string): string {
  if (!color.startsWith('#')) return color;
  const [r, g, b] = parseHex(color).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max;
  const s = max === 0 ? 0 : (max - min) / max;
  const nextV = v > 0.5 ? v - 0.25 : v + 0.25;
  return hsvToHex(hueOf(color), s, Math.max(0, Math.min(1, nextV)));
}

export interface CatLook {
  body: string;
  collar: string;
  belly: string;
  faceSpot: string;
  cap: string;
  earInside: string;
  eye: string;
  mouth: string;
  tailCap: string;
  bowtie: string;
  whiteFeet: ReadonlySet<number>;
}

/**
 * Reproduces `Cat`'s constructor exactly, including the RNG draw order, and
 * leaves `rng` positioned right after the bow tie roll — where Android 11+
 * continues with the first-message draws.
 */
function consumeCatLook(rng: JavaRandom): CatLook {
  let body = chooseP(rng, BODY_TABLE);
  if (body === '') {
    const h = rng.nextFloat() * 360;
    const s = 0.5 + rng.nextFloat() * 0.5;
    const v = 0.5 + rng.nextFloat() * 0.5;
    body = hsvToHex(h, s, v);
  }

  const belly = chooseP(rng, BELLY_TABLE);
  chooseP(rng, BELLY_TABLE); // `back` is tinted but never drawn upstream
  const faceSpot = chooseP(rng, BELLY_TABLE);

  const whiteFeet = new Set<number>();
  if (rng.nextFloat() < 0.25) {
    whiteFeet.add(1).add(2).add(3).add(4);
  } else if (rng.nextFloat() < 0.25) {
    whiteFeet.add(1).add(3);
  } else if (rng.nextFloat() < 0.25) {
    whiteFeet.add(2).add(4);
  } else if (rng.nextFloat() < 0.1) {
    whiteFeet.add(rng.nextInt(4) + 1);
  }

  // `Cat.java`: `nsr.nextFloat() < 0.333f`, not < 1/3 — the two thresholds
  // disagree for nextFloat() results in [0.333, 1/3), i.e. per-seed output.
  const tailCapWhite = rng.nextFloat() < 0.333;
  const cap = isDark(body) ? chooseP(rng, LIGHT_SPOT_TABLE) : chooseP(rng, DARK_SPOT_TABLE);
  const collar = chooseP(rng, COLLAR_TABLE);
  const bowtie = rng.nextFloat() < 0.1 ? collar : '';

  const dark = isDark(body);
  const eye = dark ? '#FFFFFF' : '#000000';
  let mouth = eye;
  // `Cat.java`: the black mouth/nose re-tint keys off the FACE SPOT colour
  // (`if (!isDark(faceColor)) tint(0xFF000000, D.mouth, D.nose)`), not belly.
  // An absent face spot is colour 0, which `isDark` reports as dark.
  if (faceSpot !== '' && !isDark(faceSpot)) mouth = '#000000';

  return {
    body,
    collar,
    belly,
    faceSpot,
    cap,
    earInside: dark ? EAR_INSIDE_DARK : EAR_INSIDE_LIGHT,
    eye,
    mouth,
    tailCap: tailCapWhite ? '#FFFFFF' : body,
    bowtie,
    whiteFeet,
  };
}

/** Reproduces `Cat`'s constructor exactly, including the RNG draw order. */
export function catLook(seed: bigint): CatLook {
  return consumeCatLook(new JavaRandom(seed));
}

/**
 * Android 11+ `Cat` constructor tail: `mFirstMessage` is drawn from the same
 * seeded stream right after the bow tie — 10 % rare pool, one entry via
 * `choose` (nextInt), then a 50 % chance of repeating it three times. The
 * message is a pure function of the seed, exactly like the colours.
 */
export function catFirstMessage(
  seed: bigint,
  messages: readonly string[],
  rareMessages: readonly string[],
): string {
  const rng = new JavaRandom(seed);
  consumeCatLook(rng);
  const pool = rng.nextFloat() < 0.1 ? rareMessages : messages;
  if (pool.length === 0) return '';
  const picked = pool[rng.nextInt(pool.length)] ?? '';
  return rng.nextFloat() < 0.5 ? `${picked}${picked}${picked}` : picked;
}

function colorFor(part: PartName, look: CatLook): string {
  switch (part) {
    case 'collar':
      return look.collar;
    case 'leftEarInside':
    case 'rightEarInside':
      return look.earInside;
    case 'faceSpot':
      return look.faceSpot === '' ? look.body : look.faceSpot;
    case 'cap':
      return look.cap;
    case 'leftEye':
    case 'rightEye':
      return look.eye;
    case 'nose':
    case 'mouth':
      return look.mouth;
    case 'tailCap':
      return look.tailCap;
    case 'tailShadow':
    case 'leg2Shadow':
      return SHADOW_COLOR;
    case 'belly':
      return look.belly === '' ? look.body : look.belly;
    case 'bowtie':
      return look.bowtie;
    case 'foot1':
      return look.whiteFeet.has(1) ? '#FFFFFF' : look.body;
    case 'foot2':
      return look.whiteFeet.has(2) ? '#FFFFFF' : look.body;
    case 'foot3':
      return look.whiteFeet.has(3) ? '#FFFFFF' : look.body;
    case 'foot4':
      return look.whiteFeet.has(4) ? '#FFFFFF' : look.body;
    default:
      return look.body;
  }
}

/** Draws the cat into a `size` x `size` box at the current origin. */
export function drawCat(ctx: CanvasRenderingContext2D, look: CatLook, size: number): void {
  const k = size / 48;
  ctx.save();
  ctx.scale(k, k);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const name of PART_NAMES) {
    const color = colorFor(name, look);
    if (color === '') continue;
    const part = PARTS[name];
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    switch (part.kind) {
      case 'path':
        ctx.fill(pathFor(part));
        break;
      case 'stroke':
        ctx.lineWidth = part.width;
        ctx.stroke(pathFor(part));
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(part.cx, part.cy, part.r, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'rect':
        ctx.fillRect(part.x, part.y, part.w, part.h);
        break;
    }
  }
  ctx.restore();
}

/** `Cat.createIcon`: a value-shifted body-colour disc with the cat inset by 10 %. */
export function drawCatIcon(ctx: CanvasRenderingContext2D, look: CatLook, size: number): void {
  ctx.save();
  ctx.fillStyle = shiftValue(look.body);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  const margin = size / 10;
  ctx.translate(margin, margin);
  drawCat(ctx, look, size - margin * 2);
  ctx.restore();
}

export function catHue(look: CatLook): number {
  return hueOf(look.body);
}

export function defaultCatName(seed: bigint): string {
  return `Cat #${seed % 1000n}`;
}
