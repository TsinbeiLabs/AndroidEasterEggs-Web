import { describe, expect, it } from 'vitest';
import { dailySeed, f32, kotlinRandom, KotlinRandom, PI2_F, PI_F } from '../src/eggs/shared/kotlinRandom';

/**
 * A second, independent transcription of `XorWowRandom.kt` (JetBrains/kotlin,
 * Apache-2.0), written from the source rather than from the module under test:
 *
 * ```kotlin
 * internal constructor(seed1: Int, seed2: Int) :
 *     this(seed1, seed2, 0, 0, seed1.inv(), (seed1 shl 10) xor (seed2 ushr 4))
 * init { repeat(64) { nextInt() } }
 *
 * override fun nextInt(): Int {
 *     var t = x
 *     t = t xor (t ushr 2)
 *     x = y; y = z; z = w
 *     val v0 = v
 *     w = v0
 *     t = (t xor (t shl 1)) xor v0 xor (v0 shl 4)
 *     v = t
 *     addend += 362437
 *     return t + addend
 * }
 * ```
 *
 * No JVM is available to produce external vectors, so the two transcriptions have
 * to agree over a long stream, and the leading values are pinned as goldens so a
 * regression in either shows up.
 */
class RefXorWow {
  private readonly s: number[];

  constructor(seed1: number, seed2: number) {
    this.s = [seed1 | 0, seed2 | 0, 0, 0, ~seed1 | 0, (((seed1 | 0) << 10) ^ ((seed2 | 0) >>> 4)) | 0];
    for (let i = 0; i < 64; i++) this.nextInt();
  }

  nextInt(): number {
    const s = this.s;
    let t = s[0] ^ (s[0] >>> 2);
    s[0] = s[1];
    s[1] = s[2];
    s[2] = s[3];
    const v0 = s[4];
    s[3] = v0;
    t = (t ^ (t << 1)) ^ v0 ^ (v0 << 4);
    s[4] = t;
    s[5] = (s[5] + 362437) | 0;
    return (t + s[5]) | 0;
  }

  nextBits(bitCount: number): number {
    return ((this.nextInt() >>> (32 - bitCount)) & (bitCount === 0 ? 0 : -1)) | 0;
  }
}

/** `Random(seed: Long) = XorWowRandom(seed.toInt(), seed.shr(32).toInt())`. */
const SEEDS = [0, 1, 5038, 20260810, 123456789, -7, 2147483647];

describe('KotlinRandom', () => {
  it('agrees with an independent transcription over 5000 draws per seed', () => {
    for (const seed of SEEDS) {
      const actual = kotlinRandom(seed);
      const expected = new RefXorWow(seed | 0, Math.trunc(Math.floor(seed / 4294967296)) | 0);
      for (let i = 0; i < 5000; i++) expect(actual.nextInt(), `seed ${seed} draw ${i}`).toBe(expected.nextInt());
    }
  });

  it('pins the leading values of the FIXED_RANDOM_SEED stream', () => {
    // `const val FIXED_RANDOM_SEED = 5038L` in MainActivity.kt. These are the
    // regression goldens for the transcription above.
    const random = kotlinRandom(5038);
    expect([random.nextInt(), random.nextInt(), random.nextInt(), random.nextInt()]).toEqual([
      2124427491, 2068392516, 1968473188, 489775551,
    ]);

    // And the daily seed the web port defaults to.
    const daily = kotlinRandom(20260810);
    expect([daily.nextInt(), daily.nextInt(), daily.nextInt(), daily.nextInt()]).toEqual([
      453046991, -345495192, -1660947712, -610469814,
    ]);
  });

  it('nextBits takes the upper bits with the (-bitCount).shr(31) mask', () => {
    const random = kotlinRandom(99);
    const reference = new RefXorWow(99, 0);
    for (const bits of [0, 1, 8, 24, 26, 27, 31, 32]) {
      expect(random.nextBits(bits), `nextBits(${bits})`).toBe(reference.nextBits(bits));
    }
    expect(kotlinRandom(5).nextBits(0)).toBe(0);
  });

  it('nextFloat is nextBits(24) / 2^24 and stays in [0, 1)', () => {
    const random = kotlinRandom(4242);
    const reference = new RefXorWow(4242, 0);
    for (let i = 0; i < 2000; i++) {
      const expected = reference.nextBits(24) / 16777216;
      const actual = random.nextFloat();
      expect(actual).toBe(expected);
      expect(actual).toBeGreaterThanOrEqual(0);
      expect(actual).toBeLessThan(1);
    }
  });

  it('nextDouble is doubleFromParts(nextBits(26), nextBits(27))', () => {
    const random = kotlinRandom(8);
    const reference = new RefXorWow(8, 0);
    for (let i = 0; i < 500; i++) {
      const hi = reference.nextBits(26);
      const lo = reference.nextBits(27);
      expect(random.nextDouble()).toBe((hi * 134217728 + lo) / 9007199254740992);
    }
  });

  it('nextIntFrom takes the power-of-two branch for exact powers of two', () => {
    for (const until of [2, 4, 8, 16, 1024]) {
      const random = kotlinRandom(2026);
      const reference = new RefXorWow(2026, 0);
      const bits = 31 - Math.clz32(until);
      for (let i = 0; i < 300; i++) {
        const value = random.nextIntFrom(0, until);
        expect(value).toBe(reference.nextBits(bits));
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(until);
      }
    }
  });

  it('nextIntFrom uses the overflow-aware rejection loop otherwise', () => {
    for (const [from, until] of [
      [1, 11],
      [0, 7],
      [2, 5039],
      [0, 26],
      [-5, 5],
      [0, 2147483647],
    ] as const) {
      const random = kotlinRandom(31337);
      const reference = new RefXorWow(31337, 0);
      for (let i = 0; i < 300; i++) {
        const n = (until - from) | 0;
        let value: number;
        if ((n & -n) === n) {
          value = from + reference.nextBits(31 - Math.clz32(n));
        } else {
          let v = 0;
          for (;;) {
            const bits = reference.nextInt() >>> 1;
            v = bits % n;
            if (((bits - v + (n - 1)) | 0) >= 0) break;
          }
          value = from + v;
        }
        const actual = random.nextIntFrom(from, until);
        expect(actual).toBe(value);
        expect(actual).toBeGreaterThanOrEqual(from);
        expect(actual).toBeLessThan(until);
      }
    }
  });

  it('rejects an empty range like checkRangeBounds', () => {
    expect(() => kotlinRandom(1).nextIntFrom(5, 5)).toThrow(/Random range is empty/);
    expect(() => kotlinRandom(1).nextIntFrom(9, 2)).toThrow(/Random range is empty/);
  });

  it('nextFloatInRange rounds through Float like Kotlin', () => {
    const random = kotlinRandom(777);
    const reference = new RefXorWow(777, 0);
    for (let i = 0; i < 500; i++) {
      const draw = reference.nextBits(24) / 16777216;
      const expected = f32(1000 + f32(f32(8000 - 1000) * draw));
      const actual = random.nextFloatInRange(1000, 8000);
      expect(actual).toBe(expected);
      // A Float result has at most 24 significant bits of mantissa.
      expect(f32(actual)).toBe(actual);
    }
  });

  it('shuffleInPlace is Kotlin downwards Fisher-Yates and stays a permutation', () => {
    const source = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    const items = source.slice();
    const random = kotlinRandom(20260810);
    const reference = new RefXorWow(20260810, 0);
    random.shuffleInPlace(items);

    const expected = source.slice();
    for (let i = expected.length - 1; i >= 1; i--) {
      const j = refNextIntUntil(reference, i + 1);
      const tmp = expected[i];
      expected[i] = expected[j];
      expected[j] = tmp;
    }
    expect(items).toEqual(expected);
    expect(items.slice().sort()).toEqual(source.slice().sort());
  });

  it('choose indexes with nextInt(size)', () => {
    const items = ['O', 'B', 'A', 'F', 'G', 'K', 'M'] as const;
    const random = kotlinRandom(11);
    const reference = new RefXorWow(11, 0);
    for (let i = 0; i < 200; i++) {
      expect(random.choose(items)).toBe(items[refNextIntUntil(reference, items.length)]);
    }
  });
});

/** `Random.nextInt(until)` against the reference stream. */
function refNextIntUntil(reference: RefXorWow, until: number): number {
  const n = until;
  if ((n & -n) === n) return reference.nextBits(31 - Math.clz32(n));
  for (;;) {
    const bits = reference.nextInt() >>> 1;
    const v = bits % n;
    if (((bits - v + (n - 1)) | 0) >= 0) return v;
  }
}

describe('dailySeed', () => {
  it('reproduces the Calendar-based seed, 0-based month included', () => {
    // `today.get(Calendar.MONTH)` is 0-based, so 10 September 2026 is month 8.
    expect(dailySeed(new Date(2026, 8, 10))).toBe(20260810);
    // January is month 0, which is the quirk that makes the seed look a year off.
    expect(dailySeed(new Date(2026, 0, 1))).toBe(20260001);
    expect(dailySeed(new Date(2025, 11, 31))).toBe(20251131);
  });

  it('builds a universe seed Android can reproduce', () => {
    const seed = dailySeed(new Date(2026, 8, 10));
    expect(() => kotlinRandom(seed).nextInt()).not.toThrow();
    expect(new KotlinRandom(seed | 0, 0).nextInt()).toBe(kotlinRandom(seed).nextInt());
  });
});

describe('float constants', () => {
  it('PIf and PI2f are the 32-bit floats Kotlin uses', () => {
    expect(PI_F).toBe(Math.fround(Math.PI));
    expect(PI2_F).toBe(Math.fround(Math.PI * 2));
    expect(PI_F).not.toBe(Math.PI);
  });
});
