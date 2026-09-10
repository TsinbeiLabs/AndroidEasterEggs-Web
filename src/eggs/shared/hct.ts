import type { EggStore } from '../../core/types';

/**
 * Material You dynamic colour, hand-ported so the Paint Chips grid and the
 * Android 12/13 PlatLogo can show genuinely derived system colours.
 *
 * The upstream app resolves `system_neutral1_200`, `system_accent1_500`, ...
 * from the framework on API 31+, and on API 27-30 it falls back to
 * `core/system-colors/SystemTonalColors.kt` (materialkolor), which generates
 * the exact same five palettes from a wallpaper seed colour:
 *
 *   hue       = Hct.fromInt(source).hue
 *   accent1   = TonalPalette.fromHueAndChroma(hue, 36)      // PRIMARY_CHROMA
 *   accent2   = TonalPalette.fromHueAndChroma(hue, 16)      // SECONDARY_CHROMA
 *   accent3   = TonalPalette.fromHueAndChroma(hue + 60, 24) // TERTIARY_*
 *   neutral1  = TonalPalette.fromHueAndChroma(hue, 4)       // NEUTRAL_CHROMA
 *   neutral2  = TonalPalette.fromHueAndChroma(hue, 8)       // NEUTRAL_VARIANT_CHROMA
 *
 * and maps the framework shade numbers onto HCT tones (SHADE_TONES below,
 * note the 49.6 for shade 500). `TonalPalette.getHct(tone)` is
 * `Hct.from(hue, chroma, tone)` = the HCT gamut-mapping solver, with one
 * special case: tone 99 of a yellow hue (105 <= hue < 125) is the sRGB
 * average of tones 98 and 100.
 *
 * The colour science here is a compact port of material-color-utilities
 * (Apache-2.0, the same code materialkolor mirrors): sRGB <-> linear RGB,
 * L* <-> Y, the CAM16 forward transform under the default sRGB-like viewing
 * conditions (D65 white point, adapting luminance 200/pi * Y(50)/100 ~=
 * 11.725, background L* 50, surround 2) and `HctSolver.solveToInt`, which
 * Newton-iterates CAM16 J for the requested Y and, when the requested chroma
 * leaves the sRGB gamut, bisects the hue half-plane against the cube edges
 * (the 300-entry CRITICAL_PLANES table lists the linear-RGB edge coordinates
 * in gamut-boundary order).
 *
 * Colours are 0xRRGGBB numbers (alpha is always opaque).
 */

/** `PaintChipsWidget.kt`: `SHADE_NUMBERS`, the framework shade ladder. */
export const SHADES: readonly number[] = [0, 10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

/** `SystemTonalColors.kt`: `SHADE_TONES`, shade -> HCT tone (500 -> 49.6). */
const SHADE_TONES: readonly number[] = [100, 99, 95, 90, 80, 70, 60, 49.6, 40, 30, 20, 10, 0];

export type SystemGroup = 'neutral1' | 'neutral2' | 'accent1' | 'accent2' | 'accent3';

/** The five system palettes, each 13 colours indexed like `SHADES`. */
export interface SystemPalettes {
  readonly neutral1: readonly number[];
  readonly neutral2: readonly number[];
  readonly accent1: readonly number[];
  readonly accent2: readonly number[];
  readonly accent3: readonly number[];
}

// ---------------------------------------------------------------------------
// sRGB / L*a*b* primitives (material-color-utilities ColorUtils)
// ---------------------------------------------------------------------------

function linearized(rgbComponent: number): number {
  const normalized = rgbComponent / 255;
  if (normalized <= 0.040449936) return (normalized / 12.92) * 100;
  return Math.pow((normalized + 0.055) / 1.055, 2.4) * 100;
}

function delinearized(rgbComponent: number): number {
  const normalized = rgbComponent / 100;
  const delinearized =
    normalized <= 0.0031308
      ? normalized * 12.92
      : 1.055 * Math.pow(normalized, 1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, Math.round(delinearized * 255)));
}

function labInvf(ft: number): number {
  const e = 216 / 24389;
  const kappa = 24389 / 27;
  const ft3 = ft * ft * ft;
  return ft3 > e ? ft3 : (116 * ft - 16) / kappa;
}

/** L* (perceptual lightness, the "T" of HCT) to Y in XYZ. */
function yFromLstar(lstar: number): number {
  return 100 * labInvf((lstar + 16) / 116);
}

function argbFromRgb(red: number, green: number, blue: number): number {
  return ((red & 255) << 16) | ((green & 255) << 8) | (blue & 255);
}

function argbFromLinrgb(linrgb: readonly number[]): number {
  return argbFromRgb(delinearized(linrgb[0]), delinearized(linrgb[1]), delinearized(linrgb[2]));
}

function argbFromLstar(lstar: number): number {
  const component = delinearized(yFromLstar(lstar));
  return argbFromRgb(component, component, component);
}

function signum(num: number): number {
  return num < 0 ? -1 : num === 0 ? 0 : 1;
}

function sanitizeDegreesDouble(degrees: number): number {
  const d = degrees % 360;
  return d < 0 ? d + 360 : d;
}

function matrixMultiply(row: readonly number[], matrix: ReadonlyArray<readonly number[]>): number[] {
  return [
    row[0] * matrix[0][0] + row[1] * matrix[0][1] + row[2] * matrix[0][2],
    row[0] * matrix[1][0] + row[1] * matrix[1][1] + row[2] * matrix[1][2],
    row[0] * matrix[2][0] + row[1] * matrix[2][1] + row[2] * matrix[2][2],
  ];
}

// ---------------------------------------------------------------------------
// CAM16 viewing conditions, precomputed for the sRGB-like default
// ---------------------------------------------------------------------------

const WHITE_POINT_D65 = [95.047, 100, 108.883];

/** `ViewingConditions.make()` with all of its defaults, evaluated once. */
const VC = (() => {
  const adaptingLuminance = ((200 / Math.PI) * yFromLstar(50)) / 100;
  const surround = 2;
  const [x, y, z] = WHITE_POINT_D65;
  const rW = x * 0.401288 + y * 0.650173 + z * -0.051461;
  const gW = x * -0.250268 + y * 1.204414 + z * 0.045854;
  const bW = x * -0.002079 + y * 0.048952 + z * 0.953127;
  const f = 0.8 + surround / 10;
  // surround 2 -> f = 1.0 -> c = lerp(0.59, 0.69, (f-0.9)*10) = 0.69
  const c = f >= 0.9 ? 0.59 + (0.69 - 0.59) * ((f - 0.9) * 10) : 0.525 + (0.59 - 0.525) * ((f - 0.8) * 10);
  let d = f * (1 - (1 / 3.6) * Math.exp((-adaptingLuminance - 42) / 92));
  d = Math.min(1, Math.max(0, d));
  const nc = f;
  const rgbD = [d * (100 / rW) + 1 - d, d * (100 / gW) + 1 - d, d * (100 / bW) + 1 - d];
  const k = 1 / (5 * adaptingLuminance + 1);
  const k4 = k * k * k * k;
  const k4F = 1 - k4;
  const fl = k4 * adaptingLuminance + 0.1 * k4F * k4F * Math.cbrt(5 * adaptingLuminance);
  const n = yFromLstar(50) / WHITE_POINT_D65[1];
  const zCoeff = 1.48 + Math.sqrt(n);
  const nbb = 0.725 / Math.pow(n, 0.2);
  const rgbAFactors = [
    Math.pow((fl * rgbD[0] * rW) / 100, 0.42),
    Math.pow((fl * rgbD[1] * gW) / 100, 0.42),
    Math.pow((fl * rgbD[2] * bW) / 100, 0.42),
  ];
  const rgbA = rgbAFactors.map((v) => (400 * v) / (v + 27.13));
  const aw = (2 * rgbA[0] + rgbA[1] + 0.05 * rgbA[2]) * nbb;
  return { n, aw, nbb, ncb: nbb, c, nc, rgbD, fl, z: zCoeff };
})();

/**
 * The CAM16 hue of an sRGB colour in default viewing conditions.
 * `Hct.fromInt(source).hue` upstream; only the hue is needed because
 * `SystemTonalColors.updateSourceColor` throws the rest away.
 */
export function cam16Hue(argb: number): number {
  const redL = linearized((argb >> 16) & 255);
  const greenL = linearized((argb >> 8) & 255);
  const blueL = linearized(argb & 255);
  // sRGB (linear, 0..100) -> XYZ -> CAT16 cone response
  const x = 0.41233895 * redL + 0.35762064 * greenL + 0.18051042 * blueL;
  const y = 0.2126 * redL + 0.7152 * greenL + 0.0722 * blueL;
  const z = 0.01932141 * redL + 0.11916382 * greenL + 0.95034478 * blueL;
  const rC = 0.401288 * x + 0.650173 * y - 0.051461 * z;
  const gC = -0.250268 * x + 1.204414 * y + 0.045854 * z;
  const bC = -0.002079 * x + 0.048952 * y + 0.953127 * z;
  const rD = VC.rgbD[0] * rC;
  const gD = VC.rgbD[1] * gC;
  const bD = VC.rgbD[2] * bC;
  // Chromatic adaptation compression, then the red/green and yellow/blue
  // opponent channels whose atan2 is the CAM16 hue.
  const adapt = (component: number): number => {
    const af = Math.pow((VC.fl * Math.abs(component)) / 100, 0.42);
    return (signum(component) * 400 * af) / (af + 27.13);
  };
  const rA = adapt(rD);
  const gA = adapt(gD);
  const bA = adapt(bD);
  const a = (11 * rA - 12 * gA + bA) / 11;
  const b = (rA + gA - 2 * bA) / 9;
  return sanitizeDegreesDouble((Math.atan2(b, a) * 180) / Math.PI);
}

// ---------------------------------------------------------------------------
// The HCT gamut-mapping solver (material-color-utilities HctSolver)
// ---------------------------------------------------------------------------

const SCALED_DISCOUNT_FROM_LINRGB = [
  [0.001200833568784504, 0.002389694492170889, 0.0002795742885861124],
  [0.0005891086651375999, 0.0029785502573438758, 0.0003270666104008398],
  [0.00010146692491640572, 0.0005364214359186694, 0.0032979401770712076],
];

const LINRGB_FROM_SCALED_DISCOUNT = [
  [1373.2198709594231, -1100.4251190754821, -7.278681089101213],
  [-271.815969077903, 559.6580465940733, -32.46047482791194],
  [1.9622899599665666, -57.173814538844006, 308.7233197812385],
];

const Y_FROM_LINRGB = [0.2126, 0.7152, 0.0722];

const CRITICAL_PLANES = [
  0.015176349177441876, 0.045529047532325624, 0.07588174588720938, 0.10623444424209313,
  0.13658714259697685, 0.16693984095186062, 0.19729253930674434, 0.2276452376616281,
  0.2579979360165119, 0.28835063437139563, 0.3188300904430532, 0.350925934958123,
  0.3848314933096426, 0.42057480301049466, 0.458183274052838, 0.4976837250274023,
  0.5391024159806381, 0.5824650784040898, 0.6277969426914107, 0.6751227633498623,
  0.7244668422128921, 0.775853049866786, 0.829304845476233, 0.8848452951698498,
  0.942497089126609, 1.0022825574869039, 1.0642236851973577, 1.1283421258858297,
  1.1946592148522128, 1.2631959812511864, 1.3339731595349034, 1.407011200216447,
  1.4823302800086415, 1.5599503113873272, 1.6398909516233677, 1.7221716113234105,
  1.8068114625156377, 1.8938294463134073, 1.9832442801866852, 2.075074464868551,
  2.1693382909216234, 2.2660538449872063, 2.36523901573795, 2.4669114995532007,
  2.5710888059345764, 2.6777882626779785, 2.7870270208169257, 2.898822059350997,
  3.0131901897720907, 3.1301480604002863, 3.2497121605402226, 3.3718988244681087,
  3.4967242352587946, 3.624204428461639, 3.754355295633311, 3.887192587735158,
  4.022731918402185, 4.160988767090289, 4.301978482107941, 4.445716283538092,
  4.592217266055746, 4.741496401646282, 4.893568542229298, 5.048448422192488,
  5.20615066083972, 5.3666897647573375, 5.5300801301023865, 5.696336044816294,
  5.865471690767354, 6.037501145825082, 6.212438385869475, 6.390297286737924,
  6.571091626112461, 6.7548350853498045, 6.941541251256611, 7.131223617812143,
  7.323895587840543, 7.5195704746346665, 7.7182615035334345, 7.919981813454504,
  8.124744458384042, 8.332562408825165, 8.543448553206703, 8.757415699253682,
  8.974476575321063, 9.194643831691977, 9.417930041841839, 9.644347703669503,
  9.873909240696694, 10.106627003236781, 10.342513269534024, 10.58158024687427,
  10.8238400726681, 11.069304815507364, 11.317986476196008, 11.569896988756009,
  11.825048221409341, 12.083451977536606, 12.345119996613247, 12.610063955123938,
  12.878295467455942, 13.149826086772048, 13.42466730586372, 13.702830557985108,
  13.984327217668513, 14.269168601521828, 14.55736596900856, 14.848930523210871,
  15.143873411576273, 15.44220572664832, 15.743938506781891, 16.04908273684337,
  16.35764934889634, 16.66964922287304, 16.985093187232053, 17.30399201960269,
  17.62635644741625, 17.95219714852476, 18.281524751807332, 18.614349837764564,
  18.95068293910138, 19.290534541298456, 19.633915083172692, 19.98083495742689,
  20.331304511189067, 20.685334046541502, 21.042933821039977, 21.404114048223256,
  21.76888489811322, 22.137256497705877, 22.50923893145328, 22.884842241736916,
  23.264076429332462, 23.6469514538663, 24.033477234264016, 24.42366364919083,
  24.817520537484558, 25.21505769858089, 25.61628489293138, 26.021211842414342,
  26.429848230738664, 26.842203703840827, 27.258287870275353, 27.678110301598522,
  28.10168053274597, 28.529008062403893, 28.96010235337422, 29.39497283293396,
  29.83362889318845, 30.276079891419332, 30.722335150426627, 31.172403958865512,
  31.62629557157785, 32.08401920991837, 32.54558406207592, 33.010999283389665,
  33.4802739966603, 33.953417292456834, 34.430438229418264, 34.911345834551085,
  35.39614910352207, 35.88485700094671, 36.37747846067349, 36.87402238606382,
  37.37449765026789, 37.87891309649659, 38.38727753828926, 38.89959975977785,
  39.41588851594697, 39.93615253289054, 40.460400508064545, 40.98864111053629,
  41.520882981230194, 42.05713473317016, 42.597404951718396, 43.141702194811224,
  43.6900349931913, 44.24241185063697, 44.798841244188324, 45.35933162437017,
  45.92389141541209, 46.49252901546552, 47.065252796817916, 47.64207110610409,
  48.22299226451468, 48.808024568002054, 49.3971762874833, 49.9904556690408,
  50.587870934119984, 51.189430279724725, 51.79514187861014, 52.40501387947288,
  53.0190544071392, 53.637271562750364, 54.259673423945976, 54.88626804504493,
  55.517063457223934, 56.15206766869424, 56.79128866487574, 57.43473440856916,
  58.08241284012621, 58.734331877617365, 59.39049941699807, 60.05092333227251,
  60.715611475655585, 61.38457167773311, 62.057811747619894, 62.7353394731159,
  63.417162620860914, 64.10328893648692, 64.79372614476921, 65.48848194977529,
  66.18756403501224, 66.89098006357258, 67.59873767827808, 68.31084450182222,
  69.02730813691093, 69.74813616640164, 70.47333615344107, 71.20291564160104,
  71.93688215501312, 72.67524319850172, 73.41800625771542, 74.16517879925733,
  74.9167682708136, 75.67278210128072, 76.43322770089146, 77.1981124613393,
  77.96744375590167, 78.74122893956174, 79.51947534912904, 80.30219030335869,
  81.08938110306934, 81.88105503125999, 82.67721935322541, 83.4778813166706,
  84.28304815182372, 85.09272707154808, 85.90692527145302, 86.72564993000343,
  87.54890820862819, 88.3767072518277, 89.2090541872801, 90.04595612594655,
  90.88742016217518, 91.73345337380438, 92.58406282226491, 93.43925555268066,
  94.29903859396902, 95.16341895893969, 96.03240364439274, 96.9059996312159,
  97.78421388448044, 98.6670533535366, 99.55452497210776,
];

/** Coterminal angle in [0, 2pi) for a small deviation. */
function sanitizeRadians(angle: number): number {
  return (angle + Math.PI * 8) % (Math.PI * 2);
}

function trueDelinearized(rgbComponent: number): number {
  const normalized = rgbComponent / 100;
  const delinearized =
    normalized <= 0.0031308
      ? normalized * 12.92
      : 1.055 * Math.pow(normalized, 1 / 2.4) - 0.055;
  return delinearized * 255;
}

function chromaticAdaptation(component: number): number {
  const af = Math.pow(Math.abs(component), 0.42);
  return (signum(component) * 400 * af) / (af + 27.13);
}

/** The CAM16 hue (radians) of a linear-RGB point. */
function hueOf(linrgb: readonly number[]): number {
  const scaledDiscount = matrixMultiply(linrgb, SCALED_DISCOUNT_FROM_LINRGB);
  const rA = chromaticAdaptation(scaledDiscount[0]);
  const gA = chromaticAdaptation(scaledDiscount[1]);
  const bA = chromaticAdaptation(scaledDiscount[2]);
  const a = (11 * rA - 12 * gA + bA) / 11;
  const b = (rA + gA - 2 * bA) / 9;
  return Math.atan2(b, a);
}

function areInCyclicOrder(a: number, b: number, c: number): boolean {
  return sanitizeRadians(b - a) < sanitizeRadians(c - a);
}

/** t such that lerp(source, target, t) = mid. */
function intercept(source: number, mid: number, target: number): number {
  return (mid - source) / (target - source);
}

function lerpPoint(source: readonly number[], t: number, target: readonly number[]): number[] {
  return [
    source[0] + (target[0] - source[0]) * t,
    source[1] + (target[1] - source[1]) * t,
    source[2] + (target[2] - source[2]) * t,
  ];
}

/** Intersection of segment source->target with the plane axis = coordinate. */
function setCoordinate(
  source: readonly number[],
  coordinate: number,
  target: readonly number[],
  axis: number,
): number[] {
  return lerpPoint(source, intercept(source[axis], coordinate, target[axis]), target);
}

function isBounded(x: number): boolean {
  return x >= 0 && x <= 100;
}

/**
 * The nth candidate vertex of the polygon where the Y plane cuts the linear
 * RGB cube, or [-1,-1,-1] when it lies outside the cube.
 */
function nthVertex(y: number, n: number): number[] {
  const kR = Y_FROM_LINRGB[0];
  const kG = Y_FROM_LINRGB[1];
  const kB = Y_FROM_LINRGB[2];
  const coordA = n % 4 <= 1 ? 0 : 100;
  const coordB = n % 2 === 0 ? 0 : 100;
  if (n < 4) {
    const g = coordA;
    const b = coordB;
    const r = (y - g * kG - b * kB) / kR;
    return isBounded(r) ? [r, g, b] : [-1, -1, -1];
  } else if (n < 8) {
    const b = coordA;
    const r = coordB;
    const g = (y - r * kR - b * kB) / kG;
    return isBounded(g) ? [r, g, b] : [-1, -1, -1];
  } else {
    const r = coordA;
    const g = coordB;
    const b = (y - r * kR - g * kG) / kB;
    return isBounded(b) ? [r, g, b] : [-1, -1, -1];
  }
}

/** The two cube-edge points whose hues bracket the target on the Y plane. */
function bisectToSegment(y: number, targetHue: number): number[][] {
  let left = [-1, -1, -1];
  let right = left;
  let leftHue = 0;
  let rightHue = 0;
  let initialized = false;
  let uncut = true;
  for (let n = 0; n < 12; n++) {
    const mid = nthVertex(y, n);
    if (mid[0] < 0) continue;
    const midHue = hueOf(mid);
    if (!initialized) {
      left = mid;
      right = mid;
      leftHue = midHue;
      rightHue = midHue;
      initialized = true;
      continue;
    }
    if (uncut || areInCyclicOrder(leftHue, midHue, rightHue)) {
      uncut = false;
      if (areInCyclicOrder(leftHue, targetHue, midHue)) {
        right = mid;
        rightHue = midHue;
      } else {
        left = mid;
        leftHue = midHue;
      }
    }
  }
  return [left, right];
}

function midpoint(a: readonly number[], b: readonly number[]): number[] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function criticalPlaneBelow(x: number): number {
  return Math.floor(x - 0.5);
}

function criticalPlaneAbove(x: number): number {
  return Math.ceil(x - 0.5);
}

/** The maximum-chroma colour with this Y and hue, on the cube boundary. */
function bisectToLimit(y: number, targetHue: number): number[] {
  const segment = bisectToSegment(y, targetHue);
  let left = segment[0];
  let leftHue = hueOf(left);
  let right = segment[1];
  for (let axis = 0; axis < 3; axis++) {
    if (left[axis] === right[axis]) continue;
    let lPlane = -1;
    let rPlane = 255;
    if (left[axis] < right[axis]) {
      lPlane = criticalPlaneBelow(trueDelinearized(left[axis]));
      rPlane = criticalPlaneAbove(trueDelinearized(right[axis]));
    } else {
      lPlane = criticalPlaneAbove(trueDelinearized(left[axis]));
      rPlane = criticalPlaneBelow(trueDelinearized(right[axis]));
    }
    for (let i = 0; i < 8; i++) {
      if (Math.abs(rPlane - lPlane) <= 1) break;
      const mPlane = Math.floor((lPlane + rPlane) / 2);
      const midPlaneCoordinate = CRITICAL_PLANES[mPlane];
      const mid = setCoordinate(left, midPlaneCoordinate, right, axis);
      const midHue = hueOf(mid);
      if (areInCyclicOrder(leftHue, targetHue, midHue)) {
        right = mid;
        rPlane = mPlane;
      } else {
        left = mid;
        leftHue = midHue;
        lPlane = mPlane;
      }
    }
  }
  return midpoint(left, right);
}

function inverseChromaticAdaptation(adapted: number): number {
  const adaptedAbs = Math.abs(adapted);
  const base = Math.max(0, (27.13 * adaptedAbs) / (400 - adaptedAbs));
  return signum(adapted) * Math.pow(base, 1 / 0.42);
}

/** Newton-iterate J for an exact (hue, chroma, Y) hit inside the gamut. */
function findResultByJ(hueRadians: number, chroma: number, y: number): number {
  let j = Math.sqrt(y) * 11;
  const tInnerCoeff = 1 / Math.pow(1.64 - Math.pow(0.29, VC.n), 0.73);
  const eHue = 0.25 * (Math.cos(hueRadians + 2) + 3.8);
  const p1 = eHue * (50000 / 13) * VC.nc * VC.nbb;
  const hSin = Math.sin(hueRadians);
  const hCos = Math.cos(hueRadians);
  for (let iterationRound = 0; iterationRound < 5; iterationRound++) {
    const jNormalized = j / 100;
    const alpha = chroma === 0 || j === 0 ? 0 : chroma / Math.sqrt(jNormalized);
    const t = Math.pow(alpha * tInnerCoeff, 1 / 0.9);
    const ac = VC.aw * Math.pow(jNormalized, 1 / VC.c / VC.z);
    const p2 = ac / VC.nbb;
    const gamma = (23 * (p2 + 0.305) * t) / (23 * p1 + 11 * t * hCos + 108 * t * hSin);
    const a = gamma * hCos;
    const b = gamma * hSin;
    const rA = (460 * p2 + 451 * a + 288 * b) / 1403;
    const gA = (460 * p2 - 891 * a - 261 * b) / 1403;
    const bA = (460 * p2 - 220 * a - 6300 * b) / 1403;
    const linrgb = matrixMultiply(
      [inverseChromaticAdaptation(rA), inverseChromaticAdaptation(gA), inverseChromaticAdaptation(bA)],
      LINRGB_FROM_SCALED_DISCOUNT,
    );
    if (linrgb[0] < 0 || linrgb[1] < 0 || linrgb[2] < 0) return 0;
    const fnj = Y_FROM_LINRGB[0] * linrgb[0] + Y_FROM_LINRGB[1] * linrgb[1] + Y_FROM_LINRGB[2] * linrgb[2];
    if (fnj <= 0) return 0;
    if (iterationRound === 4 || Math.abs(fnj - y) < 0.002) {
      if (linrgb[0] > 100.01 || linrgb[1] > 100.01 || linrgb[2] > 100.01) return 0;
      return argbFromLinrgb(linrgb);
    }
    // Newton step with 2*fn(j)/j as the approximation of fn'(j).
    j = j - ((fnj - y) * j) / (2 * fnj);
  }
  return 0;
}

/**
 * `HctSolver.solveToInt`: the sRGB colour closest to (hue, chroma, L*). When
 * the chroma is unreachable at that tone the hue and L* are kept exact and the
 * chroma is maximised against the gamut boundary.
 */
export function solveToInt(hueDegrees: number, chroma: number, lstar: number): number {
  if (chroma < 0.0001 || lstar < 0.0001 || lstar > 99.9999) {
    return argbFromLstar(lstar);
  }
  const hue = sanitizeDegreesDouble(hueDegrees);
  const hueRadians = (hue / 180) * Math.PI;
  const y = yFromLstar(lstar);
  const exactAnswer = findResultByJ(hueRadians, chroma, y);
  if (exactAnswer !== 0) return exactAnswer;
  return argbFromLinrgb(bisectToLimit(y, hueRadians));
}

// ---------------------------------------------------------------------------
// Tonal palettes (materialkolor TonalPalette + SystemTonalColors.kt)
// ---------------------------------------------------------------------------

/** `Hct.isYellow`: hue in [105, 125). Checked on the raw (unsanitised) hue. */
function isYellowHue(hue: number): boolean {
  return hue >= 105 && hue < 125;
}

function averageArgb(argb1: number, argb2: number): number {
  const red = Math.round((((argb1 >> 16) & 255) + ((argb2 >> 16) & 255)) / 2);
  const green = Math.round((((argb1 >> 8) & 255) + ((argb2 >> 8) & 255)) / 2);
  const blue = Math.round(((argb1 & 255) + (argb2 & 255)) / 2);
  return argbFromRgb(red, green, blue);
}

/** `TonalPalette.getHct(tone).toInt()`, including the yellow tone-99 rule. */
function paletteTone(hue: number, chroma: number, tone: number): number {
  if (tone === 99 && isYellowHue(hue)) {
    return averageArgb(solveToInt(hue, chroma, 98), solveToInt(hue, chroma, 100));
  }
  return solveToInt(hue, chroma, tone);
}

const paletteCache = new Map<number, SystemPalettes>();

/**
 * The five `system_*` tonal palettes for a wallpaper seed colour, exactly as
 * `SystemTonalColors.updateSourceColor` generates them. Each ramp holds the
 * 13 framework shades of `SHADES`, darkest last.
 */
export function systemPalettes(sourceArgb: number): SystemPalettes {
  const cached = paletteCache.get(sourceArgb);
  if (cached !== undefined) return cached;
  const hue = cam16Hue(sourceArgb);
  const ramp = (paletteHue: number, chroma: number): number[] =>
    SHADE_TONES.map((tone) => paletteTone(paletteHue, chroma, tone));
  const palettes: SystemPalettes = {
    neutral1: ramp(hue, 4), // NEUTRAL_CHROMA
    neutral2: ramp(hue, 8), // NEUTRAL_VARIANT_CHROMA
    accent1: ramp(hue, 36), // PRIMARY_CHROMA
    accent2: ramp(hue, 16), // SECONDARY_CHROMA
    accent3: ramp(hue + 60, 24), // TERTIARY_HUE_OFFSET / TERTIARY_CHROMA
  };
  paletteCache.set(sourceArgb, palettes);
  return palettes;
}

/** The colour of one framework shade, e.g. `toneOf(p.accent1, 500)`. */
export function toneOf(ramp: readonly number[], shade: number): number {
  const index = (SHADES as readonly number[]).indexOf(shade);
  if (index < 0) throw new RangeError(`unknown shade ${shade}`);
  return ramp[index];
}

export function toHex(argb: number): string {
  return `#${(argb & 0xffffff).toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------
// The seed colour: the web has no wallpaper, so it is picked/randomised and
// persisted per egg, mirroring how a device's wallpaper seeds the theme.
// ---------------------------------------------------------------------------

const SEED_KEY = 'seed_color';

/**
 * `system_accent1_500` of the static Android 12 fallback palette
 * (`core/system-colors/res/values/colors.xml`), so a fresh install shows the
 * classic A12 blue theme until the seed is changed.
 */
export const DEFAULT_SEED = 0x007fac;

export function loadSeedArgb(store: EggStore): number {
  const value = store.get<number>(SEED_KEY, DEFAULT_SEED);
  return Number.isFinite(value) ? Math.round(value) & 0xffffff : DEFAULT_SEED;
}

export function saveSeedArgb(store: EggStore, argb: number): void {
  store.set(SEED_KEY, argb & 0xffffff);
}

/** A vivid random seed: random hue, chroma 30..70, tone 35..70. */
export function randomSeedArgb(random: () => number): number {
  return solveToInt(random() * 360, 30 + random() * 40, 35 + random() * 35);
}

/** '#rrggbb' (as produced by `<input type="color">`) to 0xRRGGBB. */
export function parseHexColor(hex: string): number | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  return match === null ? null : parseInt(match[1], 16);
}
