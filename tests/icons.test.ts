import { describe, expect, it } from 'vitest';
import { colOf, GRID, ICONS, rowOf, runs } from '../src/eggs/q/icons';
import { asContext, StubContext } from './stubContext';

/**
 * Android 10's Icon Quiz: upstream renders a framework drawable into a 16 x 16
 * ALPHA_8 bitmap and thresholds it with `f = a/255; f *= 1.25; round(min(f,1))`, so
 * alpha >= 0.4 (i.e. >= 102/255) becomes a filled cell. The framework drawables
 * cannot be shipped, so each icon here is drawn with canvas primitives in the same
 * box and pushed through the identical quantiser.
 */

describe('runs', () => {
  it('is "0" for an empty clue line', () => {
    expect(runs([])).toBe('0');
    expect(runs(new Array(GRID).fill(0))).toBe('0');
  });

  it('joins consecutive filled runs with a dash', () => {
    expect(runs([1, 1, 0, 1, 0, 1, 1, 1])).toBe('2-1-3');
    expect(runs([1, 1, 1, 1])).toBe('4');
    expect(runs([0, 1, 0])).toBe('1');
  });

  it('counts a run that ends the line', () => {
    expect(runs([0, 0, 1, 1, 1])).toBe('3');
    expect(runs([1, 0, 1])).toBe('1-1');
  });

  it('ignores values that are not exactly 1', () => {
    expect(runs([0, 2, 0, 1, 0])).toBe('1');
  });
});

describe('rowOf / colOf', () => {
  const data = Uint8Array.from({ length: GRID * GRID }, (_, i) => (i % 3 === 0 ? 1 : 0));

  it('reads a full row', () => {
    const row = rowOf(data, 0);
    expect(row).toHaveLength(GRID);
    expect(row).toEqual(Array.from({ length: GRID }, (_, c) => data[c]));
  });

  it('reads a full column', () => {
    const col = colOf(data, 5);
    expect(col).toHaveLength(GRID);
    expect(col).toEqual(Array.from({ length: GRID }, (_, r) => data[r * GRID + 5]));
  });

  it('covers every cell exactly once across all rows', () => {
    const seen: number[] = [];
    for (let r = 0; r < GRID; r++) seen.push(...rowOf(data, r));
    expect(seen).toEqual(Array.from(data));
  });

  it('covers every cell exactly once across all columns too', () => {
    const seen: number[] = [];
    for (let c = 0; c < GRID; c++) seen.push(...colOf(data, c));
    expect(seen.sort((a, b) => a - b)).toEqual(Array.from(data).sort((a, b) => a - b));
  });
});

describe('ICONS', () => {
  it('has a usable puzzle set with unique names', () => {
    expect(ICONS.length).toBeGreaterThanOrEqual(8);
    const names = new Set(ICONS.map((icon) => icon.name));
    expect(names.size).toBe(ICONS.length);
    for (const icon of ICONS) {
      expect(icon.name).toMatch(/^[a-z0-9_]+$/);
      expect(typeof icon.draw).toBe('function');
    }
  });

  it('every icon draws into the 16 x 16 box without throwing or escaping it', () => {
    for (const icon of ICONS) {
      const stub = new StubContext();
      expect(() => icon.draw(asContext(stub)), icon.name).not.toThrow();
      expect(stub.calls.length, icon.name).toBeGreaterThan(0);
      // Nothing may reach outside the grid, or the quantiser would clip silently.
      for (const call of stub.calls) {
        for (const arg of call.slice(1)) {
          if (typeof arg !== 'number') continue;
          if (call[0] === 'arc' || call[0] === 'roundRect') continue; // radii, not positions
          expect(arg, `${icon.name} ${call[0]}`).toBeGreaterThanOrEqual(-1);
          expect(arg, `${icon.name} ${call[0]}`).toBeLessThanOrEqual(GRID + 1);
        }
      }
    }
  });

  it('paints something for every icon', () => {
    const paintCalls = ['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText'];
    for (const icon of ICONS) {
      const stub = new StubContext();
      icon.draw(asContext(stub));
      // The canvas default fillStyle is opaque black, so an icon may legitimately
      // fill without setting one; it just has to paint.
      const painted = paintCalls.reduce((sum, name) => sum + stub.of(name).length, 0);
      expect(painted, icon.name).toBeGreaterThan(0);
    }
  });

  it('restores the composite operation after punching a hole', () => {
    // Several icons cut a counter out with `destination-out`; leaving that set
    // would erase the next icon's pixels in the shared quantiser canvas.
    for (const icon of ICONS) {
      const stub = new StubContext();
      icon.draw(asContext(stub));
      const context = asContext(stub) as CanvasRenderingContext2D & {
        globalCompositeOperation?: string;
      };
      expect(
        context.globalCompositeOperation === undefined ||
          context.globalCompositeOperation === 'source-over',
        icon.name,
      ).toBe(true);
    }
  });
});
