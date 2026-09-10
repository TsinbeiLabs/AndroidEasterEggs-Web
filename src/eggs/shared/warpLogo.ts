import type { EggContext } from '../../core/types';
import { drawPatch, type PatchKind } from './patches';
import { Starfield, type StarfieldConfig } from './starfield';

/**
 * The press-and-hold warp PlatLogo shared by Android 14, 15, 16 and 17.
 *
 * Holding (pointer or SPACE) ramps `warp` from 1 to MAX_WARP over LAUNCH_TIME
 * (5 s) and launches the egg 1 s later; releasing cancels and snaps warp back to
 * 1. The logo jitters by `warpFrac * 5dp` and the device rumbles proportionally
 * to `warpFrac^3`, throttled to 50 ms like `RumblePack`.
 *
 * Cinnamon Bun gates the logo behind the heptadecagram minigame: connect all 17
 * dots without repeats and close the loop (or press SPACE to skip), then the
 * puzzle fades out over 500 ms, the logo fades in over 500 ms and warp eases
 * 0.1 -> 1 over 250 ms.
 */

const LAUNCH_TIME = 5000;
const LAUNCH_DELAY = 1000;
const RUMBLE_INTERVAL = 50;

const MAX_DOTS = 17;
const DOT_RADIUS = 4;
const HIT_RADIUS = 24;
const HEPTA_LINE = '#B31F7F';

export interface WarpLogoConfig {
  stars: number;
  planes: number;
  rotation: number;
  maxWarp: number;
  mode: 'linear' | 'radial';
  initialWarp: number;
  /** Baklava/CB work in centre-relative coordinates over the mRadius disc. */
  centered: boolean;
  /** U/V stretch the warp tail by a factor 2; Baklava dropped it. */
  tailFactor: number;
  /** Full-screen HDR bloom (Baklava/CB). */
  bloom: boolean;
  patch: PatchKind;
  /**
   * Android 14 rolls `randomPlatlogo()`: `mRandom.nextInt(100) >= 90` shows the
   * developer-preview art instead of the release art. Null for the other versions.
   */
  previewPatch: PatchKind | null;
  unlockKey: string;
  heptadecagram: boolean;
  onLaunch(): void;
}

export class WarpLogo {
  private readonly context: EggContext;
  private readonly config: WarpLogoConfig;
  private readonly field: Starfield;

  private warp: number;
  private readonly logoPatch: PatchKind;
  private holding = false;
  private holdStart = -1;
  private launched = false;
  private lastRumble = 0;
  private wasKey = false;
  private wasDown = false;

  private gateSolved: boolean;
  private gateFade = 0;
  private logoFade = 0;
  private path: number[] = [];
  private tracking = false;
  private pendingSwap = false;
  private touch: [number, number] | null = null;

  private readonly offs: Array<() => void> = [];

  constructor(context: EggContext, config: WarpLogoConfig) {
    this.context = context;
    this.config = config;
    this.warp = config.initialWarp;
    this.logoPatch =
      config.previewPatch !== null && Math.floor(context.random() * 100) >= 90
        ? config.previewPatch
        : config.patch;
    this.gateSolved = !config.heptadecagram;
    this.gateFade = config.heptadecagram ? 1 : 0;
    this.logoFade = config.heptadecagram ? 0 : 1;

    const fieldConfig: StarfieldConfig = {
      numStars: config.stars,
      numPlanes: config.planes,
      rotation: config.rotation,
      maxWarp: config.maxWarp,
      size: 2,
      mode: config.mode,
      initialWarp: config.initialWarp,
      centered: config.centered,
      tailFactor: config.tailFactor,
      bloom: config.bloom,
    };
    this.field = new Starfield(fieldConfig, () => context.random());
    this.field.warp = this.warp;
    if (config.mode === 'linear') {
      // `Starfield.setVelocity(200*(rnd-0.5), 200*(rnd-0.5))` — removed in CB,
      // which drives the field radially instead.
      this.field.setVelocity(
        200 * (context.random() - 0.5),
        200 * (context.random() - 0.5),
      );
    }

    this.offs.push(
      context.onResize(() => this.field.resize(context.width, context.height)),
    );
    this.field.resize(context.width, context.height);

    this.offs.push(
      context.onFrame((dt, t) => {
        this.step(dt, t * 1000);
        this.render();
      }),
    );
  }

  destroy(): void {
    for (const off of this.offs.splice(0)) off();
  }

  /** `widgetSize = minSide * 0.75`, the LayoutParams shared by the logo and the puzzle. */
  private widgetSize(): number {
    return Math.min(this.context.width, this.context.height) * 0.75;
  }

  /** `mRadius = min(cx, cy) * 0.9` of the widgetSize view, i.e. `widgetSize * 0.45`. */
  private gateRadius(): number {
    return this.widgetSize() * 0.45;
  }

  private dotPosition(i: number): [number, number] {
    const { width, height } = this.context;
    const r = this.gateRadius();
    const a = -Math.PI / 2 + (i / MAX_DOTS) * Math.PI * 2;
    return [width / 2 + Math.cos(a) * r, height / 2 + Math.sin(a) * r];
  }

  /**
   * Accepts a dot if it is the first, or differs from the last and is unvisited,
   * or closes the loop (`mPathLength == 17 && mPath[0] == i`). `mPath` is an
   * `int[18]`, so 18 entries means the loop is closed. Upstream keeps scanning the
   * remaining dots after rejecting one, so a second dot in range can still win.
   */
  private checkDot(x: number, y: number): void {
    if (this.pendingSwap) return;
    for (let i = 0; i < MAX_DOTS; i++) {
      const [dx, dy] = this.dotPosition(i);
      if (Math.hypot(x - dx, y - dy) >= HIT_RADIUS) continue;

      const last = this.path[this.path.length - 1];
      if (this.path.length === 0) {
        this.path.push(i);
        navigator.vibrate?.(12);
        return;
      }
      if (last === i) continue;
      const closesLoop = this.path.length === MAX_DOTS && this.path[0] === i;
      if (!this.path.includes(i) || closesLoop) {
        this.path.push(i);
        navigator.vibrate?.(12);
        if (this.path.length > MAX_DOTS) this.pendingSwap = true;
        return;
      }
    }
  }

  /** `swapToPlatlogo()`: puzzle out over 500 ms, logo in over 500 ms, warp 0.1 -> 1 over 250 ms. */
  private solveGate(): void {
    if (this.gateSolved) return;
    this.gateSolved = true;
    this.tracking = false;
    this.pendingSwap = false;
  }

  private step(dt: number, now: number): void {
    const { pointer, keys } = this.context;
    const space = keys.has('Space');

    if (this.config.heptadecagram && !this.gateSolved) {
      // SPACE while the logo is hidden skips the minigame entirely.
      if (space && !this.wasKey) this.solveGate();
      if (pointer.down && !this.wasDown) {
        this.path = [];
        this.pendingSwap = false;
        this.tracking = true;
        this.touch = [pointer.x, pointer.y];
        this.checkDot(pointer.x, pointer.y);
      } else if (pointer.down && this.tracking) {
        this.touch = [pointer.x, pointer.y];
        this.checkDot(pointer.x, pointer.y);
      } else if (!pointer.down && this.tracking) {
        this.tracking = false;
        this.touch = null;
        // Completion is only committed on the next ACTION_UP.
        if (this.pendingSwap) this.solveGate();
      }
      this.wasDown = pointer.down;
      this.wasKey = space;
      this.field.warp = this.warp;
      this.field.update(dt);
      return;
    }

    if (this.gateSolved && this.gateFade > 0) {
      this.gateFade = Math.max(0, this.gateFade - dt / 0.5);
      this.logoFade = Math.min(1, this.logoFade + dt / 0.5);
      if (this.config.heptadecagram) {
        this.warp = Math.min(1, this.warp + dt / 0.25);
      }
    }

    const held = pointer.down || space;
    if (held && !this.holding) {
      this.holding = true;
      this.holdStart = now;
      this.launched = false;
    } else if (!held && this.holding) {
      this.holding = false;
      this.holdStart = -1;
      this.warp = 1;
      this.launched = false;
    }

    if (this.holding && this.holdStart >= 0) {
      const t = Math.min(1, (now - this.holdStart) / LAUNCH_TIME);
      // `ObjectAnimator` defaults to AccelerateDecelerateInterpolator.
      const eased = Math.cos((t + 1) * Math.PI) / 2 + 0.5;
      this.warp = 1 + (this.config.maxWarp - 1) * eased;

      const warpFrac = (this.warp - 1) / (this.config.maxWarp - 1);
      if (warpFrac > 0 && now - this.lastRumble > RUMBLE_INTERVAL) {
        this.lastRumble = now;
        navigator.vibrate?.(Math.round(warpFrac ** 3 * 40));
      }

      if (!this.launched && now - this.holdStart >= LAUNCH_TIME + LAUNCH_DELAY) {
        this.launched = true;
        if (this.context.store.get<number>(this.config.unlockKey, 0) === 0) {
          this.context.store.set(this.config.unlockKey, Date.now());
        }
        this.config.onLaunch();
      }
    }

    this.wasDown = pointer.down;
    this.wasKey = space;
    this.field.warp = this.warp;
    this.field.update(dt);
  }

  private render(): void {
    const { ctx, width, height } = this.context;
    this.field.render(ctx);

    const widgetSize = this.widgetSize();

    if (this.gateFade > 0 && this.config.heptadecagram) {
      ctx.save();
      ctx.globalAlpha = this.gateFade;
      // `mBgPaint = BLACK`, a filled circle of radius mRadius.
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, this.gateRadius(), 0, Math.PI * 2);
      ctx.fill();

      // `mLinePaint` = STROKE #B31F7F, 4dp, Join.ROUND, Cap.ROUND.
      ctx.strokeStyle = HEPTA_LINE;
      ctx.lineWidth = DOT_RADIUS;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      this.path.forEach((index, i) => {
        const [x, y] = this.dotPosition(index);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      if (this.tracking && this.touch !== null && this.path.length <= MAX_DOTS) {
        ctx.lineTo(this.touch[0], this.touch[1]);
      }
      ctx.stroke();

      // `mDotPaint` = packHdrWhite(1.5, 1.0) -> SDR white; a 45 degree rotated square.
      ctx.fillStyle = '#FFFFFF';
      for (let i = 0; i < MAX_DOTS; i++) {
        const [x, y] = this.dotPosition(i);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-DOT_RADIUS, -DOT_RADIUS, DOT_RADIUS * 2, DOT_RADIUS * 2);
        ctx.restore();
      }

      ctx.fillStyle = '#B7B7FF';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        this.pendingSwap
          ? '闭合完成，松开以解锁 logo'
          : `一笔画连完 17 个点并回到起点（${Math.min(this.path.length, MAX_DOTS)}/${MAX_DOTS}），或按空格跳过`,
        width / 2,
        height - 24,
      );
      ctx.restore();
    }

    if (this.logoFade <= 0.004) return;

    // `mLogo.setTranslationX/Y(mRandom.nextFloat() * warpFrac * 5 * mDp)` — one-sided.
    const warpFrac = (this.warp - 1) / (this.config.maxWarp - 1);
    const jitterX = this.context.random() * warpFrac * 5;
    const jitterY = this.context.random() * warpFrac * 5;

    ctx.save();
    ctx.globalAlpha = this.logoFade;
    ctx.translate(
      width / 2 - widgetSize / 2 + jitterX,
      height / 2 - widgetSize / 2 + jitterY,
    );
    drawPatch(ctx, this.logoPatch, widgetSize);
    ctx.restore();
  }
}
