/**
 * The PlatLogo starfield used by Android 14 through 17.
 *
 * Three upstream variants:
 * - U/V: 34 stars in 2 planes drifting at a constant velocity over the buffered
 *   screen rect (`mSpace = bounds inset by -mBuffer`), tails only while warping
 *   and stretched by `d * warp * 2 * plane`, off-screen sentinel -100.
 * - Baklava: 128 stars in 4 planes initialised uniformly in `[-mRadius, +mRadius]^2`
 *   (head == tail) and wrapped over that square (`(head + d*plane + 3R) % 2R - R`),
 *   the whole field rotated 45 degrees about the centre, per-plane brightness above
 *   1.0 (HDR) and a full-screen `frac^2` bloom at high warp. The tail loses the
 *   factor 2 that U/V had.
 * - Cinnamon Bun: 128 stars placed polar and expanded exponentially
 *   (`x += x * 0.05 * dt * warp * plane`), respawning within 10 % of the centre,
 *   with tails scaled by `1 / (1 + speed * warp)`.
 *
 * `centered` selects the Baklava/CB coordinate space (origin at the view centre,
 * wrapped or expanded over a disc of radius `hypot(w,h)/2 + mBuffer`) from the
 * U/V space (absolute screen coordinates). Getting this wrong puts the radial
 * expansion point off-screen.
 *
 * Web panels are SDR, so HDR plane values above 1.0 clamp to white.
 */

export interface StarfieldConfig {
  numStars: number;
  numPlanes: number;
  /** Degrees; Baklava and Cinnamon Bun rotate the field by 45. */
  rotation: number;
  maxWarp: number;
  /** Star stroke width in dp. */
  size: number;
  mode: 'linear' | 'radial';
  /** Cinnamon Bun starts at 0.1 instead of 1. */
  initialWarp: number;
  /** Baklava/CB work in centre-relative coordinates over a disc of radius mRadius. */
  centered: boolean;
  /** U/V stretch the tail by `d*warp*2*plane`; Baklava dropped the factor 2. */
  tailFactor: number;
  /** Full-screen HDR white bloom at `frac^2` (Baklava/CB only). */
  bloom: boolean;
}

interface Star {
  hx: number;
  hy: number;
  tx: number;
  ty: number;
  plane: number;
}

const OFFSCREEN = -10000;

export class Starfield {
  warp: number;
  private readonly config: StarfieldConfig;
  private readonly random: () => number;
  private stars: Star[] = [];
  private velocity = { x: 0, y: 0 };
  private width = 1;
  private height = 1;
  private radius = 1;
  private buffer = 1;

  constructor(config: StarfieldConfig, random: () => number) {
    this.config = config;
    this.random = random;
    this.warp = config.initialWarp;
  }

  resize(width: number, height: number): void {
    if (width === this.width && height === this.height && this.stars.length > 0) return;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);

    const { numStars, numPlanes, size, maxWarp, centered } = this.config;
    this.buffer = size * numPlanes * 2 * maxWarp;
    this.radius = Math.hypot(this.width, this.height) / 2 + this.buffer;

    this.stars = [];
    for (let i = 0; i < numStars; i++) {
      const plane = Math.floor((i / numStars) * numPlanes) + 1;
      let hx: number;
      let hy: number;
      if (this.config.mode === 'radial') {
        const angle = this.random() * Math.PI * 2;
        const dist = this.random() * this.radius;
        hx = Math.cos(angle) * dist;
        hy = Math.sin(angle) * dist;
      } else if (centered) {
        // Baklava: uniform over the square [-mRadius, +mRadius]^2, head == tail.
        hx = (this.random() * 2 - 1) * this.radius;
        hy = (this.random() * 2 - 1) * this.radius;
      } else {
        // U/V: uniform over the screen rect inset by -mBuffer.
        hx = this.random() * (this.width + this.buffer * 2) - this.buffer;
        hy = this.random() * (this.height + this.buffer * 2) - this.buffer;
      }
      this.stars.push({ hx, hy, tx: OFFSCREEN, ty: OFFSCREEN, plane });
    }
  }

  /** `setVelocity` is gone from Baklava on; kept for U/V. */
  setVelocity(x: number, y: number): void {
    this.velocity = { x, y };
  }

  update(dt: number): void {
    const { warp } = this;
    const inWarp = warp > 1;

    if (this.config.mode === 'radial') {
      const speedBase = 0.05 * dt * warp;
      for (const star of this.stars) {
        const speed = speedBase * star.plane;
        star.hx += star.hx * speed;
        star.hy += star.hy * speed;
        if (star.hx * star.hx + star.hy * star.hy >= this.radius * this.radius) {
          const angle = this.random() * Math.PI * 2;
          const dist = this.random() * 0.1 * this.radius;
          star.hx = Math.cos(angle) * dist;
          star.hy = Math.sin(angle) * dist;
        }
        if (inWarp) {
          const tailScale = 1 / (1 + speed * warp);
          star.tx = star.hx * tailScale;
          star.ty = star.hy * tailScale;
        } else {
          star.tx = OFFSCREEN;
          star.ty = OFFSCREEN;
        }
      }
      return;
    }

    const dx = this.velocity.x * dt * warp;
    const dy = this.velocity.y * dt * warp;
    const tail = warp * this.config.tailFactor;

    if (this.config.centered) {
      const span = this.radius * 2;
      for (const star of this.stars) {
        star.hx = ((star.hx + dx * star.plane + this.radius * 3) % span) - this.radius;
        star.hy = ((star.hy + dy * star.plane + this.radius * 3) % span) - this.radius;
        if (inWarp) {
          star.tx = star.hx - dx * tail * star.plane;
          star.ty = star.hy - dy * tail * star.plane;
        } else {
          star.tx = OFFSCREEN;
          star.ty = OFFSCREEN;
        }
      }
      return;
    }

    const spanX = this.width + this.buffer * 2;
    const spanY = this.height + this.buffer * 2;
    for (const star of this.stars) {
      star.hx = ((star.hx + dx * star.plane + spanX) % spanX) - this.buffer;
      star.hy = ((star.hy + dy * star.plane + spanY) % spanY) - this.buffer;
      if (inWarp) {
        star.tx = star.hx - dx * tail * star.plane;
        star.ty = star.hy - dy * tail * star.plane;
      } else {
        star.tx = -100;
        star.ty = -100;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { numPlanes, size, rotation, maxWarp, centered, bloom } = this.config;
    const { width, height, warp } = this;
    const inWarp = warp > 1;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    if (centered) {
      ctx.translate(width / 2, height / 2);
      if (rotation !== 0) ctx.rotate((rotation * Math.PI) / 180);
    }
    // `translate(rnd*(warp-1), rnd*(warp-1))` — the shake is one-sided upstream.
    ctx.translate(this.random() * (warp - 1), this.random() * (warp - 1));

    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = '#FFFFFF';
    ctx.lineCap = 'butt';

    for (let p = 0; p < numPlanes; p++) {
      const plane = p + 1;
      // Baklava drives per-plane brightness above 1.0 (HDR white); clamp to SDR.
      const brightness = numPlanes > 2 ? (p + 1) / (numPlanes - 1) : 1;
      ctx.globalAlpha = Math.min(1, brightness);
      // `mStarPaint.setStrokeWidth(mSize * (p + 1))` — 2, 4, 6, 8 dp.
      const stroke = size * plane;
      ctx.lineWidth = stroke;

      if (inWarp) {
        ctx.beginPath();
        for (const star of this.stars) {
          if (star.plane !== plane) continue;
          ctx.moveTo(star.tx, star.ty);
          ctx.lineTo(star.hx, star.hy);
        }
        ctx.stroke();
      }

      // `drawPoints` walks the same [tail, head] pairs, so it squares off both ends
      // of every streak at the plane's stroke width.
      ctx.beginPath();
      for (const star of this.stars) {
        if (star.plane !== plane) continue;
        ctx.rect(star.hx - stroke / 2, star.hy - stroke / 2, stroke, stroke);
        if (inWarp) ctx.rect(star.tx - stroke / 2, star.ty - stroke / 2, stroke, stroke);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (inWarp && bloom) {
      // `drawColor(packHdrWhite(2.0, frac^2))` — HDR white 2.0 clamps to full SDR.
      const frac = (warp - 1) / (maxWarp - 1);
      ctx.fillStyle = `rgba(255, 255, 255, ${(frac * frac).toFixed(4)})`;
      ctx.fillRect(0, 0, width, height);
    }
  }
}
