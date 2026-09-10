/**
 * A recording stand-in for `CanvasRenderingContext2D`, so the drawing code can be
 * asserted on without a DOM. Every call is pushed onto `calls` as `[name, ...args]`
 * and property writes are kept on `state`.
 */

export type Call = readonly [string, ...readonly unknown[]];

export class StubGradient {
  readonly stops: Array<[number, string]> = [];

  constructor(
    readonly kind: 'linear' | 'radial',
    readonly args: readonly number[],
  ) {}

  addColorStop(offset: number, color: string): void {
    this.stops.push([offset, color]);
  }
}

export interface RecordedGradient {
  readonly kind: 'linear' | 'radial';
  readonly args: readonly number[];
  readonly stops: Array<[number, string]>;
}

export class StubContext {
  readonly calls: Call[] = [];
  readonly gradients: StubGradient[] = [];
  readonly state: Record<string, unknown> = {};
  saveDepth = 0;
  maxSaveDepth = 0;
  unbalanced = 0;

  constructor() {
    // Canvas state is written straight onto the context (`ctx.fillStyle = …`), so
    // the accessors live on the stub itself and mirror every write into `state`.
    for (const key of [
      'fillStyle',
      'strokeStyle',
      'lineWidth',
      'lineCap',
      'lineJoin',
      'globalAlpha',
      'font',
      'textAlign',
      'textBaseline',
      'filter',
    ]) {
      Object.defineProperty(this, key, {
        get: () => this.state[key],
        set: (value: unknown) => {
          this.state[key] = value;
          // Recorded so a test can assert the whole paint sequence, not just the
          // value that happened to be set last.
          this.calls.push([`set:${key}`, value]);
        },
        configurable: true,
      });
    }
  }

  private record(name: string, ...args: unknown[]): void {
    this.calls.push([name, ...args]);
  }

  /** Every call of `name`, in order. */
  of(name: string): Call[] {
    return this.calls.filter((call) => call[0] === name);
  }

  /** The `n`th recorded call of `name`. */
  nth(name: string, n: number): Call | undefined {
    return this.of(name)[n];
  }

  save(): void {
    this.saveDepth++;
    this.maxSaveDepth = Math.max(this.maxSaveDepth, this.saveDepth);
    this.record('save');
  }

  restore(): void {
    this.saveDepth--;
    if (this.saveDepth < 0) this.unbalanced++;
    this.record('restore');
  }

  translate(x: number, y: number): void {
    this.record('translate', x, y);
  }
  rotate(a: number): void {
    this.record('rotate', a);
  }
  scale(x: number, y: number): void {
    this.record('scale', x, y);
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.record('transform', a, b, c, d, e, f);
  }
  setTransform(...args: number[]): void {
    this.record('setTransform', ...args);
  }

  beginPath(): void {
    this.record('beginPath');
  }
  closePath(): void {
    this.record('closePath');
  }
  moveTo(x: number, y: number): void {
    this.record('moveTo', x, y);
  }
  lineTo(x: number, y: number): void {
    this.record('lineTo', x, y);
  }
  quadraticCurveTo(...args: number[]): void {
    this.record('quadraticCurveTo', ...args);
  }
  bezierCurveTo(...args: number[]): void {
    this.record('bezierCurveTo', ...args);
  }
  arcTo(...args: number[]): void {
    this.record('arcTo', ...args);
  }
  arc(...args: unknown[]): void {
    this.record('arc', ...args);
  }
  rect(...args: number[]): void {
    this.record('rect', ...args);
  }
  roundRect(...args: number[]): void {
    this.record('roundRect', ...args);
  }
  ellipse(...args: unknown[]): void {
    this.record('ellipse', ...args);
  }
  clip(...args: unknown[]): void {
    this.record('clip', ...args);
  }
  fill(...args: unknown[]): void {
    this.record('fill', ...args);
  }
  stroke(...args: unknown[]): void {
    this.record('stroke', ...args);
  }
  fillRect(...args: number[]): void {
    this.record('fillRect', ...args);
  }
  strokeRect(...args: number[]): void {
    this.record('strokeRect', ...args);
  }
  clearRect(...args: number[]): void {
    this.record('clearRect', ...args);
  }
  fillText(text: string, x: number, y: number): void {
    this.record('fillText', text, x, y);
  }
  strokeText(text: string, x: number, y: number): void {
    this.record('strokeText', text, x, y);
  }
  drawImage(...args: unknown[]): void {
    this.record('drawImage', ...args);
  }
  setLineDash(segments: number[]): void {
    this.record('setLineDash', ...segments);
  }
  measureText(text: string): { width: number } {
    this.record('measureText', text);
    return { width: text.length * 7 };
  }
  createLinearGradient(...args: number[]): StubGradient {
    const gradient = new StubGradient('linear', args);
    this.gradients.push(gradient);
    this.record('createLinearGradient', ...args);
    return gradient;
  }
  createRadialGradient(...args: number[]): StubGradient {
    const gradient = new StubGradient('radial', args);
    this.gradients.push(gradient);
    this.record('createRadialGradient', ...args);
    return gradient;
  }
}

export function asContext(stub: StubContext): CanvasRenderingContext2D {
  return stub as unknown as CanvasRenderingContext2D;
}
