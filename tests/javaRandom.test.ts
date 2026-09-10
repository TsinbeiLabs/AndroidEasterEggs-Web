import { describe, expect, it } from 'vitest';
import { JavaRandom, randomCatSeed, seedFromString, seedToString } from '../src/eggs/nougat/javaRandom';

/**
 * `java.util.Random` is a 48-bit LCG: `seed = (seed * 0x5DEECE66D + 0xB) & ((1<<48)-1)`
 * with `next(bits) = (int)(seed >>> (48 - bits))`, seeded as `(seed ^ 0x5DEECE66D) & mask`.
 * This reference is written straight from that specification so the module's derived
 * methods can be checked against the raw stream rather than against themselves.
 */
const MULT = 0x5deece66dn;
const MASK = (1n << 48n) - 1n;

class ReferenceLcg {
  private state: bigint;

  constructor(seed: bigint) {
    this.state = (seed ^ MULT) & MASK;
  }

  next(bits: number): bigint {
    this.state = (this.state * MULT + 0xbn) & MASK;
    return this.state >> BigInt(48 - bits);
  }
}

/**
 * `Random(seed).nextInt()` — the leading values of these two streams are the ones
 * quoted everywhere the JDK generator is discussed; the rest is covered by the
 * independent LCG cross-checks below rather than by recalled constants.
 */
const GOLDEN: ReadonlyArray<readonly [bigint, readonly number[]]> = [
  [0n, [-1155484576, -723955400, 1033096058, -1690734402]],
  [42n, [-1170105035, 234785527]],
];

describe('JavaRandom', () => {
  it.each(GOLDEN)('matches the published nextInt() stream for seed %s', (seed, expected) => {
    const random = new JavaRandom(seed);
    for (const value of expected) expect(random.nextInt()).toBe(value);
  });

  it('nextInt() is the raw next(32) reinterpreted as signed', () => {
    const random = new JavaRandom(1234567n);
    const reference = new ReferenceLcg(1234567n);
    for (let i = 0; i < 500; i++) {
      const bits = reference.next(32);
      expect(random.nextInt()).toBe(bits >= 1n << 31n ? Number(bits - (1n << 32n)) : Number(bits));
    }
  });

  it('nextFloat() is next(24) / 2^24', () => {
    const random = new JavaRandom(99n);
    const reference = new ReferenceLcg(99n);
    for (let i = 0; i < 500; i++) {
      const expected = Number(reference.next(24)) / 0x1000000;
      const actual = random.nextFloat();
      expect(actual).toBe(expected);
      expect(actual).toBeGreaterThanOrEqual(0);
      expect(actual).toBeLessThan(1);
    }
  });

  it('nextLong() is (next(32) << 32) + next(32), signed', () => {
    const random = new JavaRandom(7n);
    const reference = new ReferenceLcg(7n);
    for (let i = 0; i < 200; i++) {
      const hi = reference.next(32);
      const lo = reference.next(32);
      const raw = (hi << 32n) + lo;
      const expected = raw >= 1n << 63n ? raw - (1n << 64n) : raw;
      expect(random.nextLong()).toBe(expected);
    }
  });

  it('nextInt(bound) uses the power-of-two path when the bound is a power of two', () => {
    for (const bound of [2, 4, 8, 16, 1024]) {
      const random = new JavaRandom(2024n);
      const reference = new ReferenceLcg(2024n);
      for (let i = 0; i < 200; i++) {
        const expected = Number((BigInt(bound) * reference.next(31)) >> 31n);
        expect(random.nextInt(bound)).toBe(expected);
      }
    }
  });

  it('nextInt(bound) uses the JDK rejection loop otherwise', () => {
    for (const bound of [3, 7, 10, 1000, 2147483647]) {
      const random = new JavaRandom(31337n);
      const reference = new ReferenceLcg(31337n);
      for (let i = 0; i < 200; i++) {
        let bits = Number(reference.next(31));
        let value = bits % bound;
        while (bits - value + (bound - 1) < 0) {
          bits = Number(reference.next(31));
          value = bits % bound;
        }
        const actual = random.nextInt(bound);
        expect(actual).toBe(value);
        expect(actual).toBeGreaterThanOrEqual(0);
        expect(actual).toBeLessThan(bound);
      }
    }
  });

  it('rejects a non-positive bound', () => {
    expect(() => new JavaRandom(1n).nextInt(0)).toThrow(RangeError);
    expect(() => new JavaRandom(1n).nextInt(-5)).toThrow(RangeError);
  });

  it('round-trips seeds through strings and never yields a negative cat seed', () => {
    for (let i = 0; i < 200; i++) {
      const seed = randomCatSeed();
      expect(seed).toBeGreaterThanOrEqual(0n);
      expect(seed).toBeLessThan(1n << 63n);
      expect(seedFromString(seedToString(seed))).toBe(seed);
    }
    expect(seedFromString('  -12 ')).toBe(12n);
    expect(seedFromString('not a number')).toBeNull();
    expect(seedFromString('')).toBeNull();
  });
});
