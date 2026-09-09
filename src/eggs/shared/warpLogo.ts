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
  patch: PatchKind;
  unlockKey: string;
  heptadecagram: boolean;
  onLaunch(): void;
}

export class WarpLogo {
  private readonly context: EggContext;
  private readonly config: WarpLogoConfig;
  private readonly field: Starfield;

  private warp: number;
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
  private touch: [number, number] | null = null;

  private readonly offs: Array<() => void> = [];

  constructor(context: EggContext, config: WarpLogoConfig) {
    this.context = context;
    this.config = config;
    this.warp = config.initialWarp;
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
    };
    this.field = new Starfield(fieldConfig, () => context.random());
    this.field.warp = this.warp;

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

  private dotPosition(i: number): [number, number] {
    const { width, height } = this.context;
    const r = Math.min(width, height) * 0.45;
    const a = -Math.PI / 2 + (i / MAX_DOTS) * Math.PI * 2;
    return [width / 2 + Math.cos(a) * r, height / 2 + Math.sin(a) * r];
  }

  private checkDot(x: number, y: number): void {
    for (let i = 0; i < MAX_DOTS; i++) {
      const [dx, dy] = this.dotPosition(i);
      if (Math.hypot(x - dx, y - dy) > HIT_RADIUS) continue;

      const last = this.path[this.path.length - 1];
      const closesLoop = this.path.length === MAX_DOTS && this.path[0] === i;
      if (this.path.length === 0 || closesLoop || (!this.path.includes(i) && i !== last)) {
        this.path.push(i);
        navigator.vibrate?.(12);
        if (this.path.length > MAX_DOTS) this.solveGate();
      }
      return;
    }
  }

  private solveGate(): void {
    if (this.gateSolved) return;
    this.gateSolved = true;
    this.tracking = false;
  }

  private step(dt: number, now: number): void {
    const { pointer, keys } = this.context;
    const space = keys.has('Space');

    if (this.config.heptadecagram && !this.gateSolved) {
      if (space && !this.wasKey) this.solveGate();
      if (pointer.down && !this.wasDown) {
        this.path = [];
        this.tracking = true;
        this.touch = [pointer.x, pointer.y];
        this.checkDot(pointer.x, pointer.y);
      } else if (pointer.down && this.tracking) {
        this.touch = [pointer.x, pointer.y];
        this.checkDot(pointer.x, pointer.y);
      } else if (!pointer.down && this.tracking) {
        this.tracking = false;
        this.touch = null;
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
      const progress = Math.min(1, (now - this.holdStart) / LAUNCH_TIME);
      this.warp = 1 + (this.config.maxWarp - 1) * progress;

      const warpFrac = (this.warp - 1) / (this.config.maxWarp - 1);
      if (now - this.lastRumble > RUMBLE_INTERVAL && warpFrac > 0.02) {
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

    const widgetSize = Math.min(width, height) * 0.75;

    if (this.gateFade > 0 && this.config.heptadecagram) {
      ctx.save();
      ctx.globalAlpha = this.gateFade;
      const r = Math.min(width, height) * 0.45;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, r, 0, Math.PI * 2);
      ctx.fill();

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
      if (this.tracking && this.touch !== null) ctx.lineTo(this.touch[0], this.touch[1]);
      ctx.stroke();

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
        `一笔画连完 17 个点并回到起点（${Math.min(this.path.length, MAX_DOTS)}/${MAX_DOTS}），或按空格跳过`,
        width / 2,
        height - 24,
      );
      ctx.restore();
    }

    if (this.logoFade <= 0.004) return;

    const warpFrac = (this.warp - 1) / (this.config.maxWarp - 1);
    const jitterX = (this.context.random() - 0.5) * warpFrac * 5;
    const jitterY = (this.context.random() - 0.5) * warpFrac * 5;

    ctx.save();
    ctx.globalAlpha = this.logoFade;
    ctx.translate(
      width / 2 - widgetSize / 2 + jitterX,
      height / 2 - widgetSize / 2 + jitterY,
    );
    drawPatch(ctx, this.config.patch, widgetSize);
    ctx.restore();
  }
}
