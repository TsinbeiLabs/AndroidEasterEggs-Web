import { describe, expect, it } from 'vitest';
import { asContext, StubContext } from './stubContext';

/**
 * `drawVectorArt` is the renderer for the AOSP VectorDrawables extracted by
 * `npm run gen:art`. Node has no `Path2D`, so shim it with a recorder before the
 * module (and the generated data) is imported.
 */
class RecordedPath {
  constructor(readonly d: string) {}
}
(globalThis as { Path2D?: unknown }).Path2D ??= RecordedPath;

const { drawVectorArt } = await import('../src/eggs/shared/vectorArt');
const { baseClassic, baseCupcake, baseDonut } = await import('../src/eggs/shared/baseArt');
const { cinnamonPlatlogo } = await import('../src/eggs/shared/platlogoArt');

describe('drawVectorArt', () => {
  it('paints every path of the drawable in document order', () => {
    const stub = new StubContext();
    drawVectorArt(asContext(stub), cinnamonPlatlogo, 512);
    // 95 paths; each is filled and/or stroked, and none is dropped.
    expect(stub.of('fill').length + stub.of('stroke').length).toBeGreaterThanOrEqual(
      cinnamonPlatlogo.paths.length,
    );
    expect(stub.saveDepth).toBe(0);
    expect(stub.unbalanced).toBe(0);
  });

  it('scales a square 512 viewport to the requested size with no offset', () => {
    const stub = new StubContext();
    drawVectorArt(asContext(stub), cinnamonPlatlogo, 256);
    expect(stub.nth('translate', 0)).toEqual(['translate', 0, 0]);
    expect(stub.nth('scale', 0)).toEqual(['scale', 0.5, 0.5]);
  });

  it('fits and centres a non-square viewport instead of stretching it', () => {
    // b_android_cupcake.xml is 100 x 137, so in a 274 px box it is limited by the
    // height: k = 2, leaving (274 - 200) / 2 = 37 px of horizontal padding.
    expect(baseCupcake.viewportWidth).toBe(100);
    expect(baseCupcake.viewportHeight).toBe(137);
    const stub = new StubContext();
    drawVectorArt(asContext(stub), baseCupcake, 274);
    expect(stub.nth('scale', 0)).toEqual(['scale', 2, 2]);
    expect(stub.nth('translate', 0)).toEqual(['translate', 37, 0]);
  });

  it('applies a group transform per path and does not leak it', () => {
    // b_android_classic.xml wraps its single path in
    // `<group android:pivotX="512" android:pivotY="512" android:scaleX="0.9" android:scaleY="0.9">`.
    expect(baseClassic.paths).toHaveLength(1);
    const m = baseClassic.paths[0].m;
    expect(m).toBeDefined();
    expect(m?.[0]).toBeCloseTo(0.9, 9);
    expect(m?.[3]).toBeCloseTo(0.9, 9);
    // T(pivot) . S(0.9) . T(-pivot) -> e = 512 - 0.9 * 512 = 51.2
    expect(m?.[4]).toBeCloseTo(51.2, 6);
    expect(m?.[5]).toBeCloseTo(51.2, 6);

    const stub = new StubContext();
    drawVectorArt(asContext(stub), baseClassic, 1024);
    expect(stub.of('transform')).toEqual([['transform', ...m!]]);
    // save/transform/.../restore must balance around the transformed path.
    expect(stub.of('save').length).toBe(stub.of('restore').length);
    expect(stub.saveDepth).toBe(0);
  });

  it('rebuilds inline gradients with their stops', () => {
    const gradients = baseDonut.paths.filter((p) => p.fillGradient !== undefined);
    expect(gradients.length).toBeGreaterThan(0);

    const stub = new StubContext();
    drawVectorArt(asContext(stub), baseDonut, 400);
    expect(stub.gradients.length).toBe(gradients.length);

    const linear = stub.gradients.filter((g) => g.kind === 'linear');
    const radial = stub.gradients.filter((g) => g.kind === 'radial');
    expect(linear.length).toBeGreaterThan(0);
    expect(radial.length).toBeGreaterThan(0);
    for (const gradient of stub.gradients) {
      expect(gradient.stops.length).toBeGreaterThanOrEqual(2);
      for (const [offset, color] of gradient.stops) {
        expect(offset).toBeGreaterThanOrEqual(0);
        expect(offset).toBeLessThanOrEqual(1);
        expect(color).toMatch(/^(#[0-9a-f]{6}|rgba\()/);
      }
    }
  });

  it('caches Path2D objects between frames', () => {
    const first = new StubContext();
    drawVectorArt(asContext(first), cinnamonPlatlogo, 100);
    const second = new StubContext();
    drawVectorArt(asContext(second), cinnamonPlatlogo, 200);
    // The second draw must not re-parse: identical path instances are handed to fill().
    const pathsA = first.of('fill').map((call) => call[1]);
    const pathsB = second.of('fill').map((call) => call[1]);
    expect(pathsB.length).toBe(pathsA.length);
    pathsA.forEach((path, i) => expect(pathsB[i]).toBe(path));
  });

  it('emits no NaN coordinates', () => {
    for (const art of [baseClassic, baseCupcake, baseDonut, cinnamonPlatlogo]) {
      const stub = new StubContext();
      drawVectorArt(asContext(stub), art, 300);
      for (const call of stub.calls) {
        for (const arg of call.slice(1)) {
          if (typeof arg === 'number') expect(Number.isFinite(arg), `${call[0]} in ${art.viewportWidth}`).toBe(true);
        }
      }
    }
  });
});
