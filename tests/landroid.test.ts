import { describe, expect, it } from 'vitest';
import type { EggContext, EggStore, PointerState } from '../src/core/types';
import { asContext, StubContext } from './stubContext';

/** `landroid.ts` builds `Path2D`s at module load, so shim it before importing. */
class RecordedPath {
  constructor(readonly d: string) {}
}
(globalThis as { Path2D?: unknown }).Path2D ??= RecordedPath;

const landroidModule = await import('../src/eggs/shared/landroid');
const Landroid = landroidModule.Landroid;
type LandroidConfig = import('../src/eggs/shared/landroid').LandroidConfig;
type LandroidGame = import('../src/eggs/shared/landroid').Landroid;

const EIGENGRAU2 = '#292936';
const EIGENGRAU3 = '#3C3C4F';
const EIGENGRAU4 = '#A7A7CA';
const ORBIT_LEGACY = 'rgba(0, 255, 255, 0.5)';

/** Android 17's config, as `eggs/cinnamonbun/index.ts` passes it. */
const CB: LandroidConfig = {
  dessertCode: 'CB',
  autopilot: true,
  autoButton: true,
  legacy: false,
  hsvPlanets: true,
  gravityRings: 10,
  gravityForceMax: 2000,
  gravityAlphaMax: 0.75,
  gravityAnimated: true,
  exploredPlanetArt: true,
  orbitColour: EIGENGRAU3,
  defaultZoom: 1,
  dynamicZoom: false,
};

/** Android 16's, which differs in the gravity field and the planet art. */
const BAKLAVA: LandroidConfig = { ...CB, dessertCode: 'BKL', gravityRings: 8, gravityForceMax: 200, gravityAlphaMax: 0.5, gravityAnimated: false, exploredPlanetArt: false, hsvPlanets: false, orbitColour: ORBIT_LEGACY };

/** Android 14's lean first cut. */
const UDC: LandroidConfig = {
  ...BAKLAVA,
  dessertCode: 'UDC',
  autopilot: false,
  autoButton: false,
  legacy: true,
  defaultZoom: 0.25,
};

function stubContext(width = 900, height = 640, keys: ReadonlySet<string> = new Set()): EggContext {
  const store = new Map<string, unknown>();
  const pointer: PointerState = {
    id: -1,
    x: 0,
    y: 0,
    down: false,
    justPressed: false,
    justReleased: false,
    inside: false,
  };
  const eggStore: EggStore = {
    get: <T>(key: string, fallback: T): T => (store.has(key) ? (store.get(key) as T) : fallback),
    set: <T>(key: string, value: T): void => {
      store.set(key, value);
    },
    remove: (key: string): void => {
      store.delete(key);
    },
    clear: (): void => store.clear(),
  };
  const noop = (): (() => void) => () => undefined;
  return {
    canvas: { addEventListener() {}, removeEventListener() {}, style: {} } as unknown as HTMLCanvasElement,
    ctx: asContext(new StubContext()),
    width,
    height,
    store: eggStore,
    pointer,
    pointers: [pointer],
    keys,
    actions: { add: () => () => undefined },
    toast: () => undefined,
    random: Math.random,
    randomInt: (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[0],
    onFrame: noop,
    onResize: noop,
    onPointerDown: noop,
    onPointerUp: noop,
    onKeyDown: noop,
  };
}

/** Every `arc(x, y, r, ...)` radius drawn in one render. */
function arcRadii(stub: StubContext): number[] {
  return stub.of('arc').map((call) => call[3] as number);
}

/**
 * Orbit circles are drawn at `|pos - orbitCenter|`, recomputed every frame from a
 * position that was itself snapped back onto the orbit, so the radius drifts in the
 * last bits — upstream does the same in Float32. Compare with a relative tolerance.
 */
function sameRadii(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, i) => Math.abs(value - b[i]) <= 1e-6 * Math.max(1, Math.abs(value)));
}

function render(game: LandroidGame): StubContext {
  const stub = new StubContext();
  game.render(asContext(stub));
  return stub;
}

/** A seed that reliably produces several planets. */
const SEED = 20260810;

describe('Landroid universe generation', () => {
  it('is deterministic for a seed, so Android and the web agree', () => {
    const a = new Landroid(stubContext(), CB, SEED);
    const b = new Landroid(stubContext(), CB, SEED);
    expect(a.designation).toBe(b.designation);
    expect(a.designation).toBe(`CB-${SEED % 100000}`);

    const textA = render(a).of('fillText').map((call) => call[1]);
    const textB = render(b).of('fillText').map((call) => call[1]);
    expect(textA).toEqual(textB);
    expect(textA.some((line) => String(line).startsWith('SYS:'))).toBe(true);
  });

  it('defaults to dailySeed(), the seed every device uses today', () => {
    const today = new Date();
    const expected = today.getFullYear() * 10000 + today.getMonth() * 100 + today.getDate();
    const game = new Landroid(stubContext(), CB);
    expect(game.seed).toBe(expected);
    expect(game.designation).toBe(`CB-${expected % 100000}`);
  });

  it('setSeed rebuilds the same universe twice', () => {
    const game = new Landroid(stubContext(), CB, 1);
    game.setSeed(5038);
    const first = render(game).of('fillText').map((call) => call[1]);
    game.setSeed(999);
    game.setSeed(5038);
    const second = render(game).of('fillText').map((call) => call[1]);
    expect(second).toEqual(first);
    expect(game.designation).toBe('CB-5038');
  });

  it('reroll picks a different universe', () => {
    const game = new Landroid(stubContext(), CB, SEED);
    const before = game.designation;
    for (let i = 0; i < 20 && game.designation === before; i++) game.reroll();
    expect(game.designation).not.toBe(before);
  });
});

describe('Landroid rendering', () => {
  it('animates the gravity field on Android 17 only', () => {
    // CB: `lerp(2000f, 0.01f, (i - now % 1f) / 10)` — the rings crawl outward.
    const cb = new Landroid(stubContext(), CB, SEED);
    const before = arcRadii(render(cb));
    for (let i = 0; i < 30; i++) cb.update(1 / 60); // half a simulated second
    expect(sameRadii(arcRadii(render(cb)), before)).toBe(false);

    // Baklava: `lerp(200f, 0.01f, i / 8)` — static.
    const baklava = new Landroid(stubContext(), BAKLAVA, SEED);
    const staticBefore = arcRadii(render(baklava));
    for (let i = 0; i < 30; i++) baklava.update(1 / 60);
    expect(sameRadii(arcRadii(render(baklava)), staticBefore)).toBe(true);
  });

  it('draws ten gravity rings on Android 17 and eight before it', () => {
    const cb = new Landroid(stubContext(), CB, SEED);
    const baklava = new Landroid(stubContext(), BAKLAVA, SEED);
    // ringfence(1) + star(1 disc + R) + per planet(orbit + R + disc + rim)
    const diff = arcRadii(render(cb)).length - arcRadii(render(baklava)).length;
    expect(diff).toBeGreaterThan(0);
    expect(diff % 2).toBe(0);
  });

  it('uses Eigengrau3 orbits and Eigengrau4 rims on Android 17', () => {
    // "new in a17: things get a little more interesting once you've discovered a
    // planet" — an unexplored planet keeps the Eigengrau4 rim, and the orbit ring
    // moves from cyan to Eigengrau3.
    const strokes = render(new Landroid(stubContext(), CB, SEED))
      .of('set:strokeStyle')
      .map((call) => call[1]);
    expect(strokes).toContain(EIGENGRAU3);
    expect(strokes).toContain(EIGENGRAU4);
    expect(strokes).not.toContain(ORBIT_LEGACY);
  });

  it('uses cyan orbits and the Eigengrau2 grid before Android 17', () => {
    const stub = render(new Landroid(stubContext(), BAKLAVA, SEED));
    const strokes = stub.of('set:strokeStyle').map((call) => call[1]);
    expect(strokes).toContain(ORBIT_LEGACY);
    expect(strokes).toContain(EIGENGRAU2);
    // Eigengrau3 is also the console button border, so it appears in both configs.
    expect(strokes).toContain(EIGENGRAU3);
  });

  it('strokes the ringfence as a dashed 200 000 unit circle', () => {
    const stub = render(new Landroid(stubContext(), CB, SEED));
    const dashes = stub.of('setLineDash');
    expect(dashes.length).toBeGreaterThan(0);
    const fence = stub.of('arc').find((call) => call[3] === 200000);
    expect(fence).toBeDefined();
  });

  it('paints the ship with a fill and a stroke, and the track in disjoint pairs', () => {
    const game = new Landroid(stubContext(), CB, SEED);
    for (let i = 0; i < 120; i++) game.update(1 / 60);

    const stub = render(game);
    // The ship is a Path2D fill (fauxpaque) plus a Path2D stroke.
    expect(stub.of('fill').some((call) => call[1] instanceof RecordedPath)).toBe(true);
    expect(stub.of('stroke').some((call) => call[1] instanceof RecordedPath)).toBe(true);

    // `PointMode.Lines` consumes the track two points at a time, so two more
    // simulated frames add exactly one segment. A polyline would add two.
    const movesBefore = stub.of('moveTo').length;
    game.update(1 / 60);
    game.update(1 / 60);
    const movesAfter = render(game).of('moveTo').length;
    expect(movesAfter - movesBefore).toBe(1);
  });

  it('recomputes the grid step so lines stay at least 32px apart', () => {
    const game = new Landroid(stubContext(), CB, SEED);
    const wide = render(game);
    expect(wide.of('stroke').length).toBeGreaterThan(0);

    game.setZoom(0.00125); // MIN_CAMERA_ZOOM: the whole 200 000 unit universe
    const zoomed = render(game);
    // At the minimum zoom a 1000 unit grid would be 1.25px apart, so it must step up.
    expect(zoomed.of('stroke').length).toBeGreaterThan(0);
  });

  it('keeps every drawn coordinate finite', () => {
    const game = new Landroid(stubContext(), CB, SEED);
    for (let i = 0; i < 240; i++) game.update(1 / 60);
    const stub = render(game);
    for (const call of stub.calls) {
      for (const arg of call.slice(1)) {
        if (typeof arg === 'number') expect(Number.isFinite(arg), String(call[0])).toBe(true);
      }
    }
  });

  it('balances every save with a restore', () => {
    for (const config of [CB, BAKLAVA, UDC]) {
      const game = new Landroid(stubContext(), config, SEED);
      for (let i = 0; i < 60; i++) game.update(1 / 60);
      const stub = render(game);
      expect(stub.saveDepth, config.dessertCode).toBe(0);
      expect(stub.unbalanced, config.dessertCode).toBe(0);
    }
  });
});

describe('Landroid simulation', () => {
  it('thrusts along the nose and respects the speed limit', () => {
    const game = new Landroid(stubContext(900, 640, new Set(['Space'])), CB, SEED);
    for (let i = 0; i < 600; i++) game.update(1 / 60);
    const telemetry = render(game)
      .of('fillText')
      .map((call) => String(call[1]));
    const velocity = telemetry.find((line) => line.startsWith('VEL:'));
    expect(velocity).toBeDefined();
    const speed = Number(/VEL:\s+(-?[\d.]+)/.exec(velocity ?? '')?.[1]);
    expect(speed).toBeGreaterThan(0);
    // `CRAFT_SPEED_LIMIT = 5_000f`, re-clamped every step.
    expect(speed).toBeLessThanOrEqual(5000 + 1e-6);
    const thrust = telemetry.find((line) => line.startsWith('THR:'));
    expect(thrust).toBe('THR:   100%');
  });

  it('does not move while paused on the first frame', () => {
    const game = new Landroid(stubContext(), CB, SEED);
    const before = render(game).of('fillText').map((call) => String(call[1]));
    game.update(0);
    const after = render(game).of('fillText').map((call) => String(call[1]));
    expect(after).toEqual(before);
  });

  it('clamps a huge dt instead of teleporting the ship', () => {
    const game = new Landroid(stubContext(), CB, SEED);
    expect(() => game.update(60)).not.toThrow();
    const stub = render(game);
    for (const call of stub.calls) {
      for (const arg of call.slice(1)) {
        if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
      }
    }
  });

  it('reports the designation, system and altitude lines', () => {
    const game = new Landroid(stubContext(), UDC, SEED);
    const lines = render(game)
      .of('fillText')
      .map((call) => String(call[1]));
    expect(lines.some((line) => line.startsWith(`DESIG: UDC-${SEED % 100000}`))).toBe(true);
    expect(lines.some((line) => line.startsWith('SYS:'))).toBe(true);
    expect(lines.some((line) => line.startsWith('ALT:'))).toBe(true);
    // Android 14 only shows THR while the engine is lit.
    expect(lines.some((line) => line.startsWith('THR:'))).toBe(false);
  });

  it('always shows THR from Android 15 on', () => {
    const lines = render(new Landroid(stubContext(), BAKLAVA, SEED))
      .of('fillText')
      .map((call) => String(call[1]));
    expect(lines.some((line) => line.startsWith('THR:'))).toBe(true);
  });

  it('draws no autopilot block until AUTO is engaged', () => {
    const game = new Landroid(stubContext(), CB, SEED);
    for (let i = 0; i < 60; i++) game.update(1 / 60);
    const off = render(game)
      .of('fillText')
      .map((call) => String(call[1]));
    expect(off.some((line) => line.includes('AUTOPILOT ENGAGED'))).toBe(false);

    game.toggleAutopilot();
    for (let i = 0; i < 120; i++) game.update(1 / 60);
    const on = render(game)
      .of('fillText')
      .map((call) => String(call[1]));
    expect(on.some((line) => line.includes('AUTOPILOT ENGAGED'))).toBe(true);
    expect(on.some((line) => line.startsWith('TGT:'))).toBe(true);
    expect(on.some((line) => line.startsWith('EXE:'))).toBe(true);

    // Turning AUTO off zeroes the thrust, as the Baklava console button does.
    game.toggleAutopilot();
    game.update(1 / 60);
    const after = render(game)
      .of('fillText')
      .map((call) => String(call[1]));
    expect(after.some((line) => line.includes('AUTOPILOT ENGAGED'))).toBe(false);
    expect(after.find((line) => line.startsWith('THR:'))).toBe('THR:   0%');
  });

  it('holds still for a zero or oversized dt', () => {
    const game = new Landroid(stubContext(), CB, SEED);
    const before = render(game)
      .of('fillText')
      .map((call) => String(call[1]));
    game.update(0);
    game.update(-1);
    game.update(60); // above MAX_VALID_DT: the sim pauses instead of jumping
    expect(
      render(game)
        .of('fillText')
        .map((call) => String(call[1])),
    ).toEqual(before);
  });
});
