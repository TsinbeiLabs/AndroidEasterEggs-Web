/**
 * The PlatLogo starfield used by Android 14 through 17.
 *
 * Three upstream variants:
 * - U/V: 34 stars in 2 planes drifting at a constant velocity, wrapping over the
 *   buffered space, tails only while warping.
 * - Baklava: 128 stars in 4 planes, the whole field rotated 45 degrees, wrapped
 *   over a disc of radius `hypot(w,h)/2 + buffer`, per-plane brightness above 1.0
 *   (HDR) and a full-screen `frac^2` bloom at high warp.
 * - Cinnamon Bun: 128 stars placed polar and expanded exponentially
 *   (`x += x * 0.05 * dt * warp * plane`), respawning near the centre, with tails
 *   scaled by `1 / (1 + speed * warp)`.
 *
 * Web panels are SDR, so the HDR plane values are clamped and expressed as alpha.
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

    const { numStars, numPlanes, size, maxWarp } = this.config;
    this.buffer = size * numPlanes * 2 * maxWarp;
    this.radius = Math.hypot(this.width, this.height) / 2 + this.buffer;

    this.velocity = {
      x: 200 * (this.random() - 0.5),
      y: 200 * (this.random() - 0.5),
    };

    this.stars = [];
    for (let i = 0; i < numStars; i++) {
      const plane = Math.floor((i / numStars) * numPlanes) + 1;
      if (this.config.mode === 'radial') {
        const angle = this.random() * Math.PI * 2;
        const dist = this.random() * this.radius;
        this.stars.push({
          hx: Math.cos(angle) * dist,
          hy: Math.sin(angle) * dist,
          tx: OFFSCREEN,
          ty: OFFSCREEN,
          plane,
        });
      } else {
        const x = this.random() * (this.width + this.buffer * 2) - this.buffer;
        const y = this.random() * (this.height + this.buffer * 2) - this.buffer;
        this.stars.push({ hx: x, hy: y, tx: OFFSCREEN, ty: OFFSCREEN, plane });
      }
    }
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
    const spanX = this.width + this.buffer * 2;
    const spanY = this.height + this.buffer * 2;

    for (const star of this.stars) {
      star.hx = ((star.hx + dx * star.plane + spanX) % spanX) - this.buffer;
      star.hy = ((star.hy + dy * star.plane + spanY) % spanY) - this.buffer;
      if (inWarp) {
        star.tx = star.hx - dx * warp * 2 * star.plane;
        star.ty = star.hy - dy * warp * 2 * star.plane;
      } else {
        star.tx = -100;
        star.ty = -100;
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { numPlanes, size, rotation, maxWarp } = this.config;
    const { width, height, warp } = this;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    if (rotation !== 0) ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(
      -width / 2 + (this.random() - 0.5) * (warp - 1),
      -height / 2 + (this.random() - 0.5) * (warp - 1),
    );

    const inWarp = warp > 1;
    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = '#FFFFFF';
    ctx.lineCap = 'round';

    for (let p = 0; p < numPlanes; p++) {
      const plane = p + 1;
      // Baklava drives per-plane brightness above 1.0 (HDR white); clamp to SDR.
      const brightness = numPlanes > 2 ? (p + 1) / (numPlanes - 1) : 1;
      ctx.globalAlpha = Math.min(1, brightness);
      ctx.lineWidth = size * plane;

      if (inWarp) {
        ctx.beginPath();
        for (const star of this.stars) {
          if (star.plane !== plane) continue;
          ctx.moveTo(star.tx, star.ty);
          ctx.lineTo(star.hx, star.hy);
        }
        ctx.stroke();
      }

      for (const star of this.stars) {
        if (star.plane !== plane) continue;
        ctx.fillRect(star.hx - size / 2, star.hy - size / 2, size, size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (inWarp && maxWarp > 10) {
      const frac = (warp - 1) / (maxWarp - 1);
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.9, frac * frac).toFixed(3)})`;
      ctx.fillRect(0, 0, width, height);
    }
  }
}
