import { describe, expect, it } from 'vitest';
import { Starfield, type StarfieldConfig } from '../src/eggs/shared/starfield';
import { asContext, StubContext } from './stubContext';

/**
 * Regression tests for the Android 14-17 warp starfield. The Android 17 field is
 * radial and its stars are stored *relative to the view centre*, so the renderer
 * must translate to `(w/2, h/2)` without the `-w/2, -h/2` that the U/V absolute
 * coordinate space needs — getting that wrong puts the expansion point off-screen.
 */

const W = 1000;
const H = 700;

const base = {
  size: 2,
  initialWarp: 1,
  bloom: false,
  centered: false,
  tailFactor: 2,
  mode: 'linear',
  rotation: 0,
} as const;

function make(overrides: Partial<StarfieldConfig>): Starfield {
  // mulberry32-style: `Math.imul` keeps the state in 32 bits so the draw stays in
  // [0, 1) (a naive `state * 1103515245` overflows Number.MAX_SAFE_INTEGER).
  let a = 12345;
  const random = (): number => {
    a = (Math.imul(a, 1103515245) + 12345) >>> 0;
    return (a >>> 8) / 16777216;
  };
  const field = new Starfield({ ...base, ...overrides } as StarfieldConfig, random);
  field.resize(W, H);
  return field;
}

/** Every recorded `rect(x, y, w, h)` centre. */
function dots(stub: StubContext): Array<[number, number, number]> {
  return stub.of('rect').map((call) => [
    (call[1] as number) + (call[3] as number) / 2,
    (call[2] as number) + (call[4] as number) / 2,
    call[3] as number,
  ]);
}

function radius(config: Partial<StarfieldConfig>): number {
  const size = config.size ?? base.size;
  const planes = config.numPlanes ?? 2;
  const maxWarp = config.maxWarp ?? 10;
  const buffer = size * planes * 2 * maxWarp;
  return Math.hypot(W, H) / 2 + buffer;
}

describe('radial starfield (Android 17 Cinnamon Bun)', () => {
  const cinnamon = {
    numStars: 128,
    numPlanes: 4,
    rotation: 45,
    maxWarp: 16,
    mode: 'radial',
    initialWarp: 0.1,
    centered: true,
    tailFactor: 1,
    bloom: true,
  } as const;

  it('centres the field on the view without the absolute-space offset', () => {
    const field = make(cinnamon);
    const stub = new StubContext();
    field.render(asContext(stub));

    const translates = stub.of('translate');
    expect(translates[0]).toEqual(['translate', W / 2, H / 2]);
    expect(stub.of('rotate')).toEqual([['rotate', (45 * Math.PI) / 180]]);
    // The U/V renderer additionally translates by (-w/2, -h/2); the centred one must not.
    expect(translates.some((call) => call[1] === -W / 2 || call[2] === -H / 2)).toBe(false);
  });

  it('keeps every star head inside mRadius, respawning near the centre', () => {
    const field = make(cinnamon);
    // warp 1 keeps `inWarp` false, so the only rects recorded are star heads.
    field.warp = 1;
    const limit = radius(cinnamon);
    const stub = new StubContext();
    for (let frame = 0; frame < 400; frame++) {
      stub.calls.length = 0;
      field.update(1 / 60);
      field.render(asContext(stub));
      const heads = dots(stub);
      expect(heads.length).toBe(cinnamon.numStars);
      for (const [x, y] of heads) {
        expect(Math.hypot(x, y)).toBeLessThanOrEqual(limit + 1e-6);
      }
    }
  });

  it('expands radially by `x += x * 0.05 * dt * warp * plane`', () => {
    const field = make({ ...cinnamon, numStars: 1, numPlanes: 1 });
    field.warp = 1;
    field.update(1 / 60);
    const before = new StubContext();
    field.render(asContext(before));
    const [x0, y0] = dots(before)[0];
    expect(Math.hypot(x0, y0)).toBeGreaterThan(0);

    const warp = 8;
    field.warp = warp;
    field.update(1 / 60);
    const after = new StubContext();
    field.render(asContext(after));
    // While warping both the head and the tail are squared off; the head is outer.
    const [x1, y1] = dots(after).reduce((a, b) =>
      Math.hypot(b[0], b[1]) > Math.hypot(a[0], a[1]) ? b : a,
    );

    const factor = 1 + 0.05 * (1 / 60) * warp * 1;
    expect(x1).toBeCloseTo(x0 * factor, 6);
    expect(y1).toBeCloseTo(y0 * factor, 6);
  });

  it('draws the random sequence in [0, 1)', () => {
    // Guards the fixture above: a draw >= 1 would place a star outside mRadius.
    const field = make(cinnamon);
    const stub = new StubContext();
    field.render(asContext(stub));
    const limit = radius(cinnamon);
    for (const [x, y] of dots(stub)) expect(Math.hypot(x, y)).toBeLessThanOrEqual(limit);
  });

  it('draws no tails until warp exceeds 1', () => {
    const field = make(cinnamon);
    field.warp = 0.1;
    field.update(1 / 60);
    const stub = new StubContext();
    field.render(asContext(stub));
    expect(stub.of('moveTo')).toHaveLength(0);
    expect(stub.of('lineTo')).toHaveLength(0);
  });

  it('stretches tails toward the centre while warping', () => {
    const field = make(cinnamon);
    field.warp = 8;
    for (let i = 0; i < 30; i++) field.update(1 / 60);
    const stub = new StubContext();
    field.render(asContext(stub));

    const moves = stub.of('moveTo');
    const lines = stub.of('lineTo');
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.length).toBe(lines.length);

    // Each streak is `moveTo(tail) -> lineTo(head)`, and
    // `tailScale = 1 / (1 + speed * warp)` is always < 1, so the tail sits strictly
    // between the centre and the head.
    moves.forEach((move, i) => {
      const line = lines[i];
      const tail = Math.hypot(move[1] as number, move[2] as number);
      const head = Math.hypot(line[1] as number, line[2] as number);
      expect(tail).toBeLessThanOrEqual(head + 1e-9);
    });
  });

  it('grows the star square with the plane, as drawPoints does', () => {
    const field = make(cinnamon);
    field.warp = 1;
    field.update(1 / 60);
    const stub = new StubContext();
    field.render(asContext(stub));

    const sizes = new Set(dots(stub).map(([, , size]) => size));
    // mStarPaint.setStrokeWidth(mSize * (p + 1)) -> 2, 4, 6, 8 dp.
    expect([...sizes].sort((a, b) => a - b)).toEqual([2, 4, 6, 8]);
  });

  it('blooms to full white at MAX_WARP', () => {
    const field = make(cinnamon);
    field.warp = 16;
    field.update(1 / 60);
    const stub = new StubContext();
    field.render(asContext(stub));

    // `drawColor(packHdrWhite(2.0f, frac^2))` with frac = 1; HDR 2.0 clamps to SDR.
    const fills = stub.of('fillRect');
    expect(fills).toHaveLength(2);
    expect(fills.at(-1)).toEqual(['fillRect', 0, 0, W, H]);
    expect(stub.state['fillStyle']).toBe('rgba(255, 255, 255, 1.0000)');
  });

  it('does not bloom before warp starts', () => {
    const field = make(cinnamon);
    field.warp = 1;
    field.update(1 / 60);
    const stub = new StubContext();
    field.render(asContext(stub));
    expect(stub.of('fillRect')).toHaveLength(1); // only the black background
  });
});

describe('linear starfield (Android 14/15 and 16)', () => {
  it('wraps U/V over the buffered screen rect', () => {
    const field = make({ numStars: 34, numPlanes: 2, maxWarp: 10 });
    const buffer = 2 * 2 * 2 * 10;
    field.setVelocity(100, -60);
    // warp 1: no streaks, so every recorded rect is a star head.
    field.warp = 1;
    const stub = new StubContext();
    for (let i = 0; i < 300; i++) {
      field.update(1 / 60);
      stub.calls.length = 0;
      field.render(asContext(stub));
      for (const [x, y] of dots(stub)) {
        expect(x).toBeGreaterThanOrEqual(-buffer - 1e-6);
        expect(x).toBeLessThanOrEqual(W + buffer + 1e-6);
        expect(y).toBeGreaterThanOrEqual(-buffer - 1e-6);
        expect(y).toBeLessThanOrEqual(H + buffer + 1e-6);
      }
    }
  });

  it('does not translate to the centre in absolute coordinate space', () => {
    const field = make({ numStars: 34, numPlanes: 2, maxWarp: 10 });
    const stub = new StubContext();
    field.render(asContext(stub));
    const translates = stub.of('translate');
    expect(translates.every((call) => Math.abs(call[1] as number) <= 1 && Math.abs(call[2] as number) <= 1)).toBe(
      true,
    );
  });

  it('wraps Baklava over the mRadius square and halves the tail', () => {
    const baklava = {
      numStars: 128,
      numPlanes: 4,
      rotation: 45,
      maxWarp: 16,
      centered: true,
      tailFactor: 1,
      bloom: true,
    } as const;
    const field = make(baklava);
    field.setVelocity(120, -80);
    field.warp = 1;
    const limit = radius(baklava);

    const stub = new StubContext();
    for (let i = 0; i < 300; i++) {
      field.update(1 / 60);
      stub.calls.length = 0;
      field.render(asContext(stub));
      for (const [x, y] of dots(stub)) {
        expect(Math.abs(x)).toBeLessThanOrEqual(limit + 1e-6);
        expect(Math.abs(y)).toBeLessThanOrEqual(limit + 1e-6);
      }
    }
    expect(stub.of('translate')[0]).toEqual(['translate', W / 2, H / 2]);
  });

  it('sends tails off-screen when not warping', () => {
    const field = make({ numStars: 34, numPlanes: 2, maxWarp: 10 });
    field.setVelocity(100, 100);
    field.warp = 1;
    field.update(1 / 60);
    const stub = new StubContext();
    field.render(asContext(stub));
    expect(stub.of('moveTo')).toHaveLength(0);
  });
});
