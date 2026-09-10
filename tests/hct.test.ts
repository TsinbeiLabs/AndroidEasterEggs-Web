import { describe, expect, it } from 'vitest';
import {
  cam16Hue,
  DEFAULT_SEED,
  loadSeedArgb,
  parseHexColor,
  randomSeedArgb,
  saveSeedArgb,
  SHADES,
  solveToInt,
  systemPalettes,
  toHex,
  toneOf,
} from '../src/eggs/shared/hct';
import type { EggStore } from '../src/core/types';

/**
 * Android 12/13's Paint Chips shows the *system* dynamic colours, which the
 * framework derives from the wallpaper through Material You: a source colour is
 * reduced to its HCT hue, five tonal palettes are generated at fixed chromas
 * (accent1 36, accent2 16, accent3 hue+60 at 24, neutral1 4, neutral2 8) and each
 * shade maps to a tone. These tests pin the invariants that make the derivation
 * real rather than a hue ramp.
 */

function lstarOf(argb: number): number {
  const channel = (shift: number): number => {
    const v = ((argb >> shift) & 0xff) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const y = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  const ke = 24389 / 27;
  return y <= 216 / 24389 ? y * ke : 116 * Math.cbrt(y) - 16;
}

describe('solveToInt', () => {
  it('returns black at tone 0 and white at tone 100 for any hue and chroma', () => {
    for (const hue of [0, 27.4, 90, 180, 275, 359]) {
      for (const chroma of [0, 4, 16, 24, 36, 100]) {
        expect(solveToInt(hue, chroma, 0) & 0xffffff).toBe(0x000000);
        expect(solveToInt(hue, chroma, 100) & 0xffffff).toBe(0xffffff);
      }
    }
  });

  it('hits the requested tone', () => {
    for (const tone of [10, 30, 49.6, 60, 80, 90]) {
      const argb = solveToInt(200, 16, tone);
      expect(lstarOf(argb)).toBeCloseTo(tone, 0);
    }
  });

  it('clips chroma to what sRGB can show instead of failing', () => {
    // Tone 50 cannot hold chroma 200 in sRGB; the solver must still return an
    // opaque, in-gamut colour at the requested tone.
    const argb = solveToInt(30, 200, 50);
    expect(lstarOf(argb)).toBeCloseTo(50, 0.5);
    for (const shift of [16, 8, 0]) {
      const channel = (argb >> shift) & 0xff;
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(255);
    }
  });

  it('is deterministic and returns a 24-bit colour', () => {
    expect(solveToInt(120, 24, 40)).toBe(solveToInt(120, 24, 40));
    expect(solveToInt(120, 24, 40) >>> 24).toBe(0);
  });
});

describe('systemPalettes', () => {
  const palettes = systemPalettes(DEFAULT_SEED);

  it('produces all five groups over the full shade ladder', () => {
    expect(SHADES).toEqual([0, 10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
    for (const group of ['neutral1', 'neutral2', 'accent1', 'accent2', 'accent3'] as const) {
      expect(palettes[group], group).toHaveLength(SHADES.length);
      for (const argb of palettes[group]) expect(argb >>> 24, group).toBe(0);
    }
  });

  it('ends every ramp at white (shade 0) and black (shade 1000)', () => {
    // Material shade numbers run opposite to HCT tone: system_*_0 is white.
    for (const group of ['neutral1', 'neutral2', 'accent1', 'accent2', 'accent3'] as const) {
      expect(toneOf(palettes[group], 0) & 0xffffff, group).toBe(0xffffff);
      expect(toneOf(palettes[group], 1000) & 0xffffff, group).toBe(0x000000);
    }
  });

  it('gets monotonically darker as the shade number rises', () => {
    for (const group of ['neutral1', 'neutral2', 'accent1', 'accent2', 'accent3'] as const) {
      let previous = Infinity;
      for (const shade of SHADES) {
        const lstar = lstarOf(toneOf(palettes[group], shade));
        expect(lstar, `${group} shade ${shade}`).toBeLessThanOrEqual(previous + 1e-6);
        previous = lstar;
      }
    }
  });

  it('keeps shade 500 at tone 49.6, not 50', () => {
    // `SystemTonalColors` maps shade 500 to tone 49.6f.
    for (const group of ['neutral1', 'accent1'] as const) {
      expect(lstarOf(toneOf(palettes[group], 500))).toBeCloseTo(49.6, 0);
    }
  });

  it('keeps the neutrals grey and gives accent1 real saturation', () => {
    const spread = (argb: number): number => {
      const r = (argb >> 16) & 0xff;
      const g = (argb >> 8) & 0xff;
      const b = argb & 0xff;
      return Math.max(r, g, b) - Math.min(r, g, b);
    };
    // neutral1 carries chroma 4, accent1 chroma 36.
    expect(spread(toneOf(palettes.neutral1, 500))).toBeLessThanOrEqual(16);
    expect(spread(toneOf(palettes.accent1, 500))).toBeGreaterThan(30);
    expect(spread(toneOf(palettes.neutral2, 500))).toBeLessThanOrEqual(24);
  });

  it('puts accent3 sixty degrees around from accent1', () => {
    const hue1 = cam16Hue(toneOf(palettes.accent1, 500));
    const hue3 = cam16Hue(toneOf(palettes.accent3, 500));
    const delta = (hue3 - hue1 + 360) % 360;
    expect(Math.abs(delta - 60)).toBeLessThan(8);
  });

  it('derives a different theme for a different source colour', () => {
    const other = systemPalettes(0xffff0000);
    expect(other.accent1).not.toEqual(palettes.accent1);
    expect(cam16Hue(toneOf(other.accent1, 500))).not.toBeCloseTo(
      cam16Hue(toneOf(palettes.accent1, 500)),
      0,
    );
  });

  it('throws for an unknown shade', () => {
    expect(() => toneOf(palettes.accent1, 450)).toThrow();
  });
});

describe('cam16Hue', () => {
  it('is in [0, 360) and stable', () => {
    for (const argb of [0xff000000, 0xffffffff, 0xffff0000, 0xff00ff00, 0xff0000ff, DEFAULT_SEED]) {
      const hue = cam16Hue(argb);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
      expect(cam16Hue(argb)).toBe(hue);
    }
  });

  it('separates the sRGB primaries by roughly 120 degrees of CAM16 hue', () => {
    const red = cam16Hue(0xffff0000);
    const green = cam16Hue(0xff00ff00);
    const blue = cam16Hue(0xff0000ff);
    const gap = (a: number, b: number): number => Math.min((b - a + 360) % 360, (a - b + 360) % 360);
    expect(gap(red, green)).toBeGreaterThan(60);
    expect(gap(green, blue)).toBeGreaterThan(60);
    expect(gap(red, blue)).toBeGreaterThan(60);
  });
});

describe('colour helpers', () => {
  it('toHex is #rrggbb without the alpha byte', () => {
    expect(toHex(0xff007fac)).toBe('#007fac');
    expect(toHex(0x00000000)).toBe('#000000');
    expect(toHex(0xffffffff)).toBe('#ffffff');
  });

  it('parseHexColor accepts what `<input type="color">` emits and rejects junk', () => {
    expect(parseHexColor('#007fac')).toBe(0x007fac);
    expect(parseHexColor('007fac')).toBe(0x007fac);
    expect(parseHexColor('#FFFFFF')).toBe(0xffffff);
    expect(parseHexColor('  #123456  ')).toBe(0x123456);
    // Only the 6-digit form is accepted.
    expect(parseHexColor('#fff')).toBeNull();
    expect(parseHexColor('')).toBeNull();
    expect(parseHexColor('#12345')).toBeNull();
    expect(parseHexColor('nope')).toBeNull();
  });

  it('round-trips through toHex', () => {
    for (const argb of [0x007fac, 0x123456, 0xabcdef]) {
      expect(parseHexColor(toHex(argb))).toBe(argb);
    }
  });

  it('randomSeedArgb stays a 24-bit opaque colour', () => {
    for (let i = 0; i < 200; i++) {
      const argb = randomSeedArgb(Math.random);
      expect(argb >>> 24).toBe(0);
      expect(argb & 0xffffff).toBeGreaterThanOrEqual(0);
      expect(argb & 0xffffff).toBeLessThanOrEqual(0xffffff);
    }
  });
});

describe('seed persistence', () => {
  function memoryStore(initial: Record<string, unknown> = {}): EggStore {
    const map = new Map<string, unknown>(Object.entries(initial));
    return {
      get: <T>(key: string, fallback: T): T => (map.has(key) ? (map.get(key) as T) : fallback),
      set: <T>(key: string, value: T): void => {
        map.set(key, value);
      },
      remove: (key: string): void => {
        map.delete(key);
      },
      clear: (): void => map.clear(),
    };
  }

  it('falls back to the Android 12 static accent when nothing is stored', () => {
    expect(loadSeedArgb(memoryStore())).toBe(DEFAULT_SEED);
    expect(toHex(DEFAULT_SEED)).toBe('#007fac');
  });

  it('round-trips a picked colour, dropping any alpha', () => {
    const store = memoryStore();
    saveSeedArgb(store, 0xffc0ffee);
    expect(loadSeedArgb(store)).toBe(0xc0ffee);
    expect(toHex(loadSeedArgb(store))).toBe('#c0ffee');
  });

  it('ignores a corrupt stored value', () => {
    const store = memoryStore({ seed_color: 'not a colour' });
    expect(loadSeedArgb(store)).toBe(DEFAULT_SEED);
  });
});
