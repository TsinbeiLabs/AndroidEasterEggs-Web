/**
 * A literal port of `kotlin.random.Random`, i.e. Marsaglia's xorwow as shipped in
 * the Kotlin stdlib (`XorWowRandom.kt` + the `Random.kt` base class), so that a
 * Landroid universe generated here is the same one Android generates for the same
 * seed.
 *
 * Android's Landroid does `Universe(randomSeed = dailySeed())` where
 *
 * ```kotlin
 * fun dailySeed(): Long {
 *     val today = GregorianCalendar()
 *     return today.get(Calendar.YEAR) * 10_000L +
 *         today.get(Calendar.MONTH) * 100L +      // NB: Calendar.MONTH is 0-based
 *         today.get(Calendar.DAY_OF_MONTH)
 * }
 * ```
 *
 * so every device sees the same system on a given day — `dailySeed()` below
 * reproduces it, 0-based month quirk included.
 *
 * `Random(seed: Long) = XorWowRandom(seed.toInt(), seed.shr(32).toInt())` and
 *
 * ```kotlin
 * internal constructor(seed1: Int, seed2: Int) :
 *     this(seed1, seed2, 0, 0, seed1.inv(), (seed1 shl 10) xor (seed2 ushr 4))
 * init { repeat(64) { nextInt() } }   // discard the first 64
 * ```
 *
 * Derived values go through `Math.fround` because Kotlin computes the universe in
 * 32-bit floats (`nextFloatInRange`, `lerp`, `sqrt`, `pow`), and the seed only
 * reproduces Android's planet positions if the rounding matches too.
 */

/** Kotlin's `Float` arithmetic. */
export const f32 = Math.fround;

/** `PIf` / `PI2f` from `Vec2.kt`. */
export const PI_F = Math.fround(Math.PI);
export const PI2_F = Math.fround(Math.PI * 2);

export class KotlinRandom {
  private x: number;
  private y: number;
  private z: number;
  private w: number;
  private v: number;
  private addend: number;

  constructor(seed1: number, seed2: number) {
    // `require((x or y or z or w or v) != 0)` always holds: v is `seed1.inv()`, so
    // `seed1 or v` is -1 for every seed.
    this.x = seed1 | 0;
    this.y = seed2 | 0;
    this.z = 0;
    this.w = 0;
    this.v = ~seed1 | 0;
    this.addend = (((seed1 | 0) << 10) ^ ((seed2 | 0) >>> 4)) | 0;

    // "some trivial seeds can produce several values with zeroes in upper bits,
    // so we discard first 64"
    for (let i = 0; i < 64; i++) this.nextInt();
  }

  nextInt(): number {
    let t = this.x;
    t = (t ^ (t >>> 2)) | 0;
    this.x = this.y;
    this.y = this.z;
    this.z = this.w;
    const v0 = this.v;
    this.w = v0;
    t = ((t ^ (t << 1)) ^ v0 ^ (v0 << 4)) | 0;
    this.v = t;
    this.addend = (this.addend + 362437) | 0;
    return (t + this.addend) | 0;
  }

  /** `nextInt().takeUpperBits(bitCount)` = `ushr(32 - bitCount) and (-bitCount).shr(31)`. */
  nextBits(bitCount: number): number {
    const mask = bitCount === 0 ? 0 : -1;
    return ((this.nextInt() >>> (32 - bitCount)) & mask) | 0;
  }

  /** `nextBits(24) / (1 shl 24).toFloat()` — exact in a double too. */
  nextFloat(): number {
    return this.nextBits(24) / 16777216;
  }

  /** `doubleFromParts(nextBits(26), nextBits(27))`. */
  nextDouble(): number {
    const hi = this.nextBits(26);
    const lo = this.nextBits(27);
    return (hi * 134217728 + lo) / 9007199254740992;
  }

  nextBoolean(): boolean {
    return this.nextBits(1) !== 0;
  }

  /** `fastLog2(value) = 31 - value.countLeadingZeroBits()`. */
  private static fastLog2(value: number): number {
    let n = value | 0;
    let bits = 0;
    if (n < 0) return 31;
    while (n !== 0) {
      bits++;
      n >>>= 1;
    }
    return bits - 1;
  }

  nextIntFrom(from: number, until: number): number {
    if (until <= from) throw new Error(`Random range is empty: [$from, $until).`);
    const n = (until - from) | 0;
    let rnd: number;
    if (n > 0 || n === -2147483648) {
      if ((n & -n) === n) {
        rnd = this.nextBits(KotlinRandom.fastLog2(n));
      } else {
        let v = 0;
        for (;;) {
          const bits = this.nextInt() >>> 1;
          v = bits % n;
          if (((bits - v + (n - 1)) | 0) >= 0) break;
        }
        rnd = v;
      }
      return (from + rnd) | 0;
    }
    // Range wider than Int: fall back to a Long-sized rejection loop.
    const range = until - from;
    for (;;) {
      const candidate = Math.floor(this.nextDouble() * range);
      if (candidate < range) return from + candidate;
    }
  }

  nextIntUntil(until: number): number {
    return this.nextIntFrom(0, until);
  }

  /** `Random.nextFloatInRange(from, until) = from + (until - from) * nextFloat()`. */
  nextFloatInRange(from: number, until: number): number {
    return f32(from + f32(f32(until - from) * this.nextFloat()));
  }

  /** `Random.choose(array) = array[nextInt(array.size)]`. */
  choose<T>(items: readonly T[]): T {
    return items[this.nextIntUntil(items.length)];
  }

  /** `MutableList.shuffle(random)`: Fisher-Yates downwards with `nextInt(i + 1)`. */
  shuffleInPlace<T>(items: T[]): void {
    for (let i = items.length - 1; i >= 1; i--) {
      const j = this.nextIntUntil(i + 1);
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
  }
}

/** `kotlin.random.Random(seed: Long)`. */
export function kotlinRandom(seed: number): KotlinRandom {
  const truncated = Math.trunc(seed);
  const low = truncated | 0;
  const high = Math.trunc(Math.floor(truncated / 4294967296)) | 0;
  return new KotlinRandom(low, high);
}

/**
 * `dailySeed()`, the seed every Android device uses for Landroid today.
 * `Calendar.MONTH` is 0-based upstream, and so it is here.
 */
export function dailySeed(date: Date = new Date()): number {
  return date.getFullYear() * 10000 + date.getMonth() * 100 + date.getDate();
}
