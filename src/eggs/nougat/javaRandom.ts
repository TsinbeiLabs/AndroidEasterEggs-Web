/**
 * A faithful `java.util.Random` (48 bit LCG).
 *
 * Neko cats are pure functions of their `long` seed: `Cat` re-derives every
 * colour and pattern from `new Random().setSeed(seed)`. To keep the same cat
 * from a stored seed — and to stay compatible with seeds generated on Android —
 * the draw sequence and the LCG itself have to match exactly.
 */

const MULTIPLIER = 0x5deece66dn;
const ADDEND = 0xbn;
const MASK = (1n << 48n) - 1n;

export class JavaRandom {
  private seed: bigint;

  constructor(seed: bigint) {
    this.seed = (seed ^ MULTIPLIER) & MASK;
  }

  private next(bits: number): number {
    this.seed = (this.seed * MULTIPLIER + ADDEND) & MASK;
    return Number(this.seed >> BigInt(48 - bits));
  }

  nextInt(bound?: number): number {
    if (bound === undefined) return this.next(32) | 0;
    if (bound <= 0) throw new RangeError('bound must be positive');

    if ((bound & -bound) === bound) {
      return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    }

    let bits = this.next(31);
    let value = bits % bound;
    while (bits - value + (bound - 1) < 0) {
      bits = this.next(31);
      value = bits % bound;
    }
    return value;
  }

  nextFloat(): number {
    return this.next(24) / 0x1000000;
  }

  nextLong(): bigint {
    return (BigInt(this.next(32)) << 32n) + BigInt(this.next(32));
  }
}

/** `CatRandom.nextSeed()`: a uniformly random non-negative 64 bit long. */
export function randomCatSeed(): bigint {
  const high = BigInt(Math.floor(Math.random() * 0x100000000)) << 32n;
  const low = BigInt(Math.floor(Math.random() * 0x100000000));
  const value = (high | low) & ((1n << 63n) - 1n);
  return value;
}

export function seedToString(seed: bigint): string {
  return seed.toString(10);
}

export function seedFromString(value: string): bigint | null {
  try {
    const parsed = BigInt(value);
    return parsed < 0n ? -parsed : parsed;
  } catch {
    return null;
  }
}
