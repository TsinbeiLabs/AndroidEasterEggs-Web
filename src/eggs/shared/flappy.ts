import {
  drawCactus,
  drawCandyCaneStem,
  drawCloud,
  drawDroid,
  drawMoon,
  drawMountain,
  drawSparkle,
  drawSun,
} from './flappyArt';

/**
 * The LLand (Android 5.0) / MLand (Android 6.0) engine.
 *
 * Both upstream games share their physics verbatim: gravity is `dv += G` once
 * per frame rather than per second, so the simulation runs on a fixed 1/60 s
 * timestep; holding applies a constant -BOOST_DV instead of an impulse; the
 * world scrolls at TRANSLATION_PER_SEC; pipes spawn every OBSTACLE_PERIOD
 * seconds of game time. Everything that differs between the two (pop size, gap,
 * stem width, art, HUD, player count, scenes, splash, scoring) is config.
 */

export const STEP = 1 / 60;
const TRANSLATION_PER_SEC = 100;
const BOOST_DV = 550;
const G = 30;
const MAX_V = 1000;
const PLAYER_SIZE = 40;
const OBSTACLE_PERIOD = 3;
const FROZEN_MS = 250;
const SCENERY_COUNT = 20;

const HULL: ReadonlyArray<readonly [number, number]> = [
  [0.3, 0],
  [0.7, 0],
  [0.92, 0.33],
  [0.92, 0.75],
  [0.6, 1],
  [0.4, 1],
  [0.08, 0.75],
  [0.08, 0.33],
];

/** DAY / NIGHT / TWILIGHT / SUNSET, each `[bottom, top]`. */
const SKIES: ReadonlyArray<readonly [string, string]> = [
  ['#c0c0FF', '#a0a0FF'],
  ['#000010', '#000000'],
  ['#000040', '#000010'],
  ['#a08020', '#204080'],
];

const PLAYER_COLORS = ['#DB4437', '#3B78E7', '#F4B400', '#0F9D58', '#7B1880', '#9E9E9E'];

export type SceneKind = 'city' | 'tx' | 'zrh';

export interface PopVisual {
  /** Degrees per second; 0 for static art. */
  spin: number;
  mirrorX: boolean;
  mirrorY: boolean;
  render(ctx: CanvasRenderingContext2D, size: number): void;
}

export interface FlappyConfig {
  popSize: number;
  stemWidth: number;
  gap: number;
  obstacleMin: number;
  buildingWidthMin: number;
  /** Pop collision radius as a fraction of `popSize` (1/2 for L, 1/3 for M). */
  popHitFraction: number;
  hudRadius: number;
  hudTextSize: number;
  maxPlayers: number;
  scenes: ReadonlyArray<SceneKind>;
  stemColors: readonly [string, string];
  candyCaneStemChance: number;
  scoreByPipeId: boolean;
  showTouches: boolean;
  splash: boolean;
  vibrateOnDeath: boolean;
  /** MLand weights night/twilight double; LLand is uniform. */
  weightedSky: boolean;
  makePop(random: () => number, top: boolean): PopVisual;
}

interface Scenery {
  kind: 'building' | 'cactus' | 'mountain' | 'cloud' | 'star' | 'sun' | 'moon';
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  v: number;
  variant: number;
  color: string;
  alpha: number;
  mirror: boolean;
  rot: number;
  tint?: string;
}

interface Obstacle {
  kind: 'stem' | 'pop';
  pipeId: number;
  x: number;
  y: number;
  w: number;
  h: number;
  startY: number;
  delay: number;
  duration: number;
  elapsed: number;
  scale: number;
  rotation: number;
  candy: boolean;
  cleared: boolean;
  visual: PopVisual | null;
}

interface Player {
  index: number;
  x: number;
  y: number;
  dv: number;
  rotation: number;
  scale: number;
  boosting: boolean;
  alive: boolean;
  score: number;
  color: string;
  touchX: number;
  touchY: number;
}

export interface FlappyHost {
  readonly width: number;
  readonly height: number;
  random(): number;
  randomInt(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  toast(message: string, seconds?: number): void;
}

type Phase = 'attract' | 'splash' | 'countdown' | 'playing' | 'dead';

export class FlappyGame {
  private readonly host: FlappyHost;
  private readonly config: FlappyConfig;

  private phase: Phase = 'attract';
  private t = 0;
  private accumulator = 0;
  private lastPipeTime = -OBSTACLE_PERIOD;
  private pipeId = 0;
  private frozenUntil = 0;
  private gameOver = false;
  private flipped = false;
  private timeOfDay = 0;
  private scene: SceneKind = 'city';
  private scenery: Scenery[] = [];
  private obstacles: Obstacle[] = [];
  private players: Player[] = [];
  private playerCount = 1;
  private countdown = 3;
  private countdownAt = 0;
  private taps = 0;
  private width = 0;
  private height = 0;

  /** Exposed so the egg can render a score readout outside the canvas. */
  onGameOver: ((scores: readonly number[]) => void) | null = null;

  constructor(host: FlappyHost, config: FlappyConfig) {
    this.host = host;
    this.config = config;
    this.playerCount = 1;
    this.resize();
    this.reset();
  }

  get scores(): readonly number[] {
    return this.players.map((p) => p.score);
  }

  get phaseName(): Phase {
    return this.phase;
  }

  resize(): void {
    const width = this.host.width;
    const height = this.host.height;
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.reset();
  }

  setPlayerCount(count: number): void {
    const next = Math.max(1, Math.min(this.config.maxPlayers, count));
    if (next === this.playerCount) return;
    this.playerCount = next;
    this.reset();
  }

  private rollSky(): void {
    if (!this.config.weightedSky) {
      this.timeOfDay = this.host.randomInt(0, SKIES.length - 1);
      return;
    }
    // irand(0,3) with Math.round: P(DAY)=P(SUNSET)=1/6, P(NIGHT)=P(TWILIGHT)=1/3.
    const r = this.host.random() * 3;
    this.timeOfDay = Math.min(SKIES.length - 1, Math.round(r));
  }

  private rollScene(): void {
    this.scene = this.host.pick(this.config.scenes);
  }

  reset(): void {
    const { width, height } = this;
    this.t = 0;
    this.accumulator = 0;
    this.lastPipeTime = -OBSTACLE_PERIOD;
    this.pipeId = 0;
    this.obstacles = [];
    this.gameOver = false;
    this.flipped = this.host.random() > 0.5;
    this.rollSky();
    this.rollScene();
    this.taps = 0;

    this.players = [];
    for (let i = 0; i < this.playerCount; i++) {
      this.players.push({
        index: i,
        x: width / 2,
        y: height / 2,
        dv: 0,
        rotation: 90,
        scale: 1,
        boosting: false,
        alive: true,
        score: 0,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
        touchX: -1,
        touchY: -1,
      });
    }
    this.realignPlayers();

    this.scenery = [];
    this.buildScenery();
    this.phase = this.config.splash ? 'splash' : 'attract';
  }

  private realignPlayers(): void {
    const n = this.players.length;
    let x = (this.width - (n - 1) * PLAYER_SIZE) / 2;
    for (const player of this.players) {
      player.x = x;
      x += PLAYER_SIZE;
    }
  }

  private buildScenery(): void {
    const { width, height } = this;
    const mh = height / 6;
    const cloudless = this.host.random() < 0.25;
    const n = SCENERY_COUNT;

    const sunAllowed = this.timeOfDay === 0 || this.timeOfDay === 3;
    if (sunAllowed && this.host.random() > 0.25) {
      this.scenery.push({
        kind: 'sun',
        x: this.host.random() * (width - 90) + 45,
        y:
          this.timeOfDay === 0
            ? 45 + this.host.random() * (height * 0.66 - 45)
            : height * 0.66 + this.host.random() * (height - 45 - height * 0.66),
        w: 45,
        h: 45,
        z: 0,
        v: 0,
        variant: 0,
        color: '#FFFFFF',
        alpha: 1,
        mirror: false,
        rot: 0,
        ...(this.timeOfDay === 3 ? { tint: 'rgba(255,128,0,0.75)' } : {}),
      });
    } else {
      const dark = this.timeOfDay === 1 || this.timeOfDay === 2;
      const ff = this.host.random();
      if ((dark && ff < 0.75) || ff < 0.5) {
        this.scenery.push({
          kind: 'moon',
          x: this.host.random() * (width - 90) + 45,
          y: 45 + this.host.random() * (height - 90),
          w: 45,
          h: 45,
          z: 0,
          v: 0,
          variant: 0,
          color: '#F2F2FF',
          alpha: dark ? 1 : 0.5,
          mirror: this.host.random() < 0.5,
          rot: 5 + this.host.random() * 25,
        });
      }
    }

    for (let i = 0; i < n; i++) {
      const r1 = this.host.random();
      const z = i / n;

      if (r1 < 0.3 && this.timeOfDay !== 0) {
        const size = this.host.randomInt(3, 5);
        this.scenery.push({
          kind: 'star',
          x: this.host.random() * (width + size * 2) - size,
          y: r1 * r1 * height * 2.2,
          w: size,
          h: size,
          z: 0,
          v: 0,
          variant: 0,
          color: '#FFFFFF',
          alpha: 1,
          mirror: false,
          rot: 0,
        });
        continue;
      }

      if (r1 < 0.6 && !cloudless) {
        const size = this.host.randomInt(10, 100);
        this.scenery.push({
          kind: 'cloud',
          x: this.host.random() * (width + size * 2) - size,
          y: height / 2 + this.host.random() * (height / 2),
          w: size,
          h: size,
          z: 0,
          v: 0.15 + this.host.random() * 0.35,
          variant: this.host.random() < 0.01 ? 1 : 0,
          color: '#FFFFFF',
          alpha: 0.25,
          mirror: false,
          rot: 0,
        });
        continue;
      }

      const kind: Scenery['kind'] =
        this.scene === 'zrh' ? 'mountain' : this.scene === 'tx' ? 'cactus' : 'building';

      if (kind === 'building') {
        const w = this.host.randomInt(this.config.buildingWidthMin, 250);
        const h = this.host.randomInt(20, Math.max(21, mh));
        this.scenery.push({
          kind,
          x: this.host.random() * (width + w * 2) - w,
          y: height - h,
          w,
          h,
          z,
          v: 0.85 * z,
          variant: 0,
          color: this.config.scenes.length > 1 ? '#888888' : this.teal(z),
          alpha: 1,
          mirror: false,
          rot: 0,
        });
      } else {
        const span = kind === 'cactus' ? [62, 125] : [125, 250];
        const size = this.host.randomInt(span[0], span[1]);
        this.scenery.push({
          kind,
          x: this.host.random() * (width + size * 2) - size,
          y: height - size,
          w: size,
          h: size,
          z,
          v: 0.85 * z,
          variant: this.host.randomInt(0, 2),
          color: '#FFFFFF',
          alpha: 1,
          mirror: false,
          rot: 0,
        });
      }
    }
  }

  /** LLand buildings are `Color.HSVToColor({175, 0.25, z})`. */
  private teal(z: number): string {
    const h = 175 / 60;
    const s = 0.25;
    const v = Math.max(0, Math.min(1, z));
    const i = Math.floor(h);
    const f = h - i;
    const p = v * (1 - s);
    const q = v * (1 - s * f);
    const tt = v * (1 - s * (1 - f));
    let r = v;
    let g = tt;
    let b = p;
    if (i === 1) {
      r = q;
      g = v;
      b = p;
    } else if (i === 2) {
      r = p;
      g = v;
      b = tt;
    } else if (i === 3) {
      r = p;
      g = q;
      b = v;
    }
    const to = (x: number) => Math.round(x * 255);
    return `rgb(${to(r)}, ${to(g)}, ${to(b)})`;
  }

  private spawnObstacle(): void {
    const { width, height, config } = this;
    const min = config.obstacleMin;
    const range = height - 2 * min - config.gap;
    const obstacleY = Math.floor(this.host.random() * Math.max(1, range)) + min;
    const inset = (config.popSize - config.stemWidth) / 2;
    const yInset = config.popSize / 2;

    this.pipeId++;
    const pipeId = this.pipeId;
    const d1 = this.host.random() * 0.25;
    const d2 = this.host.random() * 0.25;

    const topStemH = Math.max(0, obstacleY - yInset);
    const bottomStemH = Math.max(0, height - obstacleY - config.gap - yInset);
    const candy = this.host.random() < config.candyCaneStemChance;

    const make = (
      kind: 'stem' | 'pop',
      x: number,
      y: number,
      w: number,
      h: number,
      startY: number,
      delay: number,
      duration: number,
      visual: PopVisual | null,
    ): Obstacle => ({
      kind,
      pipeId,
      x,
      y,
      w,
      h,
      startY,
      delay,
      duration,
      elapsed: 0,
      scale: visual !== null ? 0.25 : 1,
      rotation: 0,
      candy,
      cleared: false,
      visual,
    });

    this.obstacles.push(
      make('stem', width + inset, 0, config.stemWidth, topStemH, -topStemH - yInset, d1, 0.25, null),
      make(
        'pop',
        width,
        obstacleY - yInset - inset + inset,
        config.popSize,
        config.popSize,
        -config.popSize,
        d1,
        0.25,
        config.makePop(this.host.random.bind(this.host), true),
      ),
      make(
        'stem',
        width + inset,
        height - bottomStemH,
        config.stemWidth,
        bottomStemH,
        height + yInset,
        d2,
        0.4,
        null,
      ),
      make(
        'pop',
        width,
        obstacleY + config.gap,
        config.popSize,
        config.popSize,
        height,
        d2,
        0.4,
        config.makePop(this.host.random.bind(this.host), false),
      ),
    );
  }

  private hullCorners(player: Player): Array<[number, number]> {
    const cos = Math.cos((player.rotation * Math.PI) / 180);
    const sin = Math.sin((player.rotation * Math.PI) / 180);
    const s = player.scale;
    const cx = player.x + PLAYER_SIZE / 2;
    const cy = player.y + PLAYER_SIZE / 2;
    return HULL.map(([fx, fy]) => {
      const lx = (fx * PLAYER_SIZE - PLAYER_SIZE / 2) * s;
      const ly = (fy * PLAYER_SIZE - PLAYER_SIZE / 2) * s;
      return [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos] as [number, number];
    });
  }

  private obstacleY(obstacle: Obstacle): number {
    if (obstacle.elapsed < obstacle.delay) return obstacle.startY;
    const p = Math.min(1, (obstacle.elapsed - obstacle.delay) / obstacle.duration);
    const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return obstacle.startY + (obstacle.y - obstacle.startY) * eased;
  }

  private obstacleScale(obstacle: Obstacle): number {
    if (obstacle.visual === null) return 1;
    if (obstacle.elapsed < obstacle.delay) return 0.25;
    const p = Math.min(1, (obstacle.elapsed - obstacle.delay) / obstacle.duration);
    const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    const target = obstacle.visual.mirrorY ? -1 : 1;
    return 0.25 + (target - 0.25) * eased;
  }

  private simulate(dt: number): void {
    const { width, height, config } = this;
    this.t += dt;

    for (const item of this.scenery) {
      item.x -= TRANSLATION_PER_SEC * dt * item.v;
      if (item.x + item.w < 0) item.x = width;
    }

    if (this.phase !== 'playing') {
      for (const player of this.players) {
        if (!player.alive) player.x -= TRANSLATION_PER_SEC * dt;
      }
      return;
    }

    for (const obstacle of this.obstacles) {
      obstacle.x -= TRANSLATION_PER_SEC * dt;
      obstacle.elapsed += dt;
      if (obstacle.visual !== null && obstacle.visual.spin !== 0) {
        obstacle.rotation += dt * obstacle.visual.spin;
      }
    }

    for (const player of this.players) {
      if (!player.alive) {
        player.x -= TRANSLATION_PER_SEC * dt;
        continue;
      }
      if (player.boosting) player.dv = -BOOST_DV;
      else player.dv += G;
      player.dv = Math.max(-MAX_V, Math.min(MAX_V, player.dv));
      player.y += player.dv * dt;
      if (player.y < 0) player.y = 0;
      const norm = (MAX_V - player.dv) / (2 * MAX_V);
      player.rotation = 180 - 180 * Math.max(0, Math.min(1, norm));
      player.scale += ((player.boosting ? 1.25 : 1) - player.scale) * Math.min(1, dt * 12);
    }

    let maxPipe = -1;
    let anyStemCleared = false;

    for (const obstacle of this.obstacles) {
      const y = this.obstacleY(obstacle);
      const isPop = obstacle.kind === 'pop';
      const hitRadius = config.popSize * config.popHitFraction;

      for (const player of this.players) {
        if (!player.alive) continue;
        const corners = this.hullCorners(player);

        let hit = false;
        for (const [cx, cy] of corners) {
          if (isPop) {
            const px = obstacle.x + obstacle.w / 2;
            const py = y + obstacle.h / 2;
            if (Math.hypot(cx - px, cy - py) <= hitRadius) {
              hit = true;
              break;
            }
          } else if (
            cx >= obstacle.x &&
            cx <= obstacle.x + obstacle.w &&
            cy >= y &&
            cy <= y + obstacle.h
          ) {
            hit = true;
            break;
          }
        }

        if (hit) {
          this.kill(player);
          continue;
        }

        if (!isPop && obstacle.x + obstacle.w < player.x) {
          if (config.scoreByPipeId) {
            maxPipe = Math.max(maxPipe, obstacle.pipeId);
          } else if (!obstacle.cleared) {
            obstacle.cleared = true;
            anyStemCleared = true;
          }
        }
      }
    }

    for (const player of this.players) {
      if (!player.alive) continue;
      if (this.hullCorners(player).some(([, cy]) => cy >= height)) this.kill(player);
    }

    if (config.scoreByPipeId) {
      for (const player of this.players) {
        if (player.alive && maxPipe > player.score) player.score = maxPipe;
      }
    } else if (anyStemCleared) {
      for (const player of this.players) {
        if (player.alive) player.score += 1;
      }
    }

    this.obstacles = this.obstacles.filter((obstacle) => obstacle.x + obstacle.w > -config.popSize);

    if (this.t - this.lastPipeTime > OBSTACLE_PERIOD) {
      this.lastPipeTime = this.t;
      this.spawnObstacle();
    }

    if (this.players.every((player) => !player.alive)) this.stop();
  }

  private kill(player: Player): void {
    if (!player.alive) return;
    player.alive = false;
    player.boosting = false;
    if (this.config.vibrateOnDeath) navigator.vibrate?.(80);
  }

  private stop(): void {
    if (this.phase === 'dead') return;
    this.phase = 'dead';
    this.gameOver = true;
    this.frozenUntil = performance.now() + FROZEN_MS;
    this.rollSky();
    this.rollScene();
    this.onGameOver?.(this.scores);
  }

  private startPlaying(): void {
    this.phase = 'playing';
    this.t = 0;
    this.lastPipeTime = -OBSTACLE_PERIOD;
    this.obstacles = [];
    this.realignPlayers();
    this.taps = 0;
    for (const player of this.players) {
      player.alive = true;
      player.score = 0;
      player.y = this.height / 2 + this.host.random() * PLAYER_SIZE - PLAYER_SIZE / 2;
      player.dv = -BOOST_DV;
      player.boosting = false;
    }
    this.realignPlayers();
  }

  poke(playerIndex: number, x: number, y: number): void {
    if (performance.now() < this.frozenUntil) return;

    if (this.phase === 'splash' || this.phase === 'countdown') return;

    if (this.phase === 'dead') {
      // Upstream restarts straight away after a death; the splash is only shown
      // when the activity resumes.
      this.reset();
      this.startPlaying();
    } else if (this.phase === 'attract') {
      this.reset();
      if (this.config.splash) {
        this.phase = 'splash';
        return;
      }
      this.startPlaying();
    }

    const player = this.players[playerIndex];
    if (player === undefined || !player.alive) return;
    player.boosting = true;
    player.dv = -BOOST_DV;
    player.touchX = x;
    player.touchY = y;
    this.taps++;
  }

  unpoke(playerIndex: number): void {
    const player = this.players[playerIndex];
    if (player === undefined) return;
    player.boosting = false;
    player.touchX = -1;
    player.touchY = -1;
  }

  pressPlay(): void {
    if (this.phase !== 'splash') return;
    this.phase = 'countdown';
    this.countdown = 3;
    this.countdownAt = performance.now();
  }

  playerIndexAt(x: number): number {
    const n = this.players.length;
    let index = Math.floor((n * x) / Math.max(1, this.width));
    index = Math.max(0, Math.min(n - 1, index));
    return this.flipped ? n - 1 - index : index;
  }

  update(dtSeconds: number): void {
    this.resize();

    if (this.phase === 'countdown') {
      const now = performance.now();
      if (now - this.countdownAt >= 500) {
        this.countdownAt = now;
        this.countdown--;
        if (this.countdown < 0) this.startPlaying();
      }
    }

    this.accumulator += Math.min(dtSeconds, 0.25);
    while (this.accumulator >= STEP) {
      this.simulate(STEP);
      this.accumulator -= STEP;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { width, height, config } = this;

    const [bottom, top] = SKIES[this.timeOfDay];
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, top);
    sky.addColorStop(1, bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    if (this.flipped) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    this.renderScenery(ctx);
    this.renderObstacles(ctx);
    this.renderPlayers(ctx);
    if (config.showTouches) this.renderTouches(ctx);

    ctx.restore();

    this.renderHud(ctx);

    if (this.phase === 'splash') this.renderSplash(ctx);
    else if (this.phase === 'countdown') this.renderCountdown(ctx);
  }

  private renderScenery(ctx: CanvasRenderingContext2D): void {
    for (const item of this.scenery) {
      ctx.save();
      ctx.globalAlpha = item.alpha;
      ctx.translate(item.x, item.y);
      switch (item.kind) {
        case 'star':
          drawSparkle(ctx, item.w);
          break;
        case 'sun':
          drawSun(ctx, item.w, item.tint);
          break;
        case 'moon':
          drawMoon(ctx, item.w, item.mirror, item.rot);
          break;
        case 'cloud':
          drawCloud(ctx, item.w, item.alpha);
          break;
        case 'building':
          ctx.fillStyle = item.color;
          ctx.fillRect(0, 0, item.w, item.h);
          break;
        case 'cactus':
          this.tinted(ctx, item, () => drawCactus(ctx, item.w, item.variant));
          break;
        case 'mountain':
          this.tinted(ctx, item, () => drawMountain(ctx, item.w, item.variant));
          break;
      }
      ctx.restore();
    }
  }

  /** Ground scenery gets a depth based brightness multiply (`z`). */
  private tinted(ctx: CanvasRenderingContext2D, item: Scenery, draw: () => void): void {
    ctx.save();
    ctx.filter = `brightness(${Math.max(0.08, item.z).toFixed(3)})`;
    draw();
    ctx.restore();
  }

  private renderObstacles(ctx: CanvasRenderingContext2D): void {
    const { config } = this;
    for (const obstacle of this.obstacles) {
      const y = this.obstacleY(obstacle);
      ctx.save();

      if (obstacle.kind === 'stem') {
        ctx.translate(obstacle.x, y);
        if (obstacle.candy) {
          drawCandyCaneStem(ctx, obstacle.w, obstacle.h);
        } else {
          const gradient = ctx.createLinearGradient(0, 0, obstacle.w, 0);
          gradient.addColorStop(0, config.stemColors[0]);
          gradient.addColorStop(1, config.stemColors[1]);
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, obstacle.w, obstacle.h);
          // The cast shadow of the pop, only on the bottom stem.
          if (obstacle.y > this.height / 2) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.13)';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(obstacle.w, 0);
            ctx.lineTo(obstacle.w, config.popSize * 0.4 + obstacle.w * 1.5);
            ctx.lineTo(0, config.popSize * 0.4);
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.restore();
        continue;
      }

      const scale = this.obstacleScale(obstacle);
      const visual = obstacle.visual;
      ctx.translate(obstacle.x + obstacle.w / 2, y + obstacle.h / 2);
      ctx.rotate((obstacle.rotation * Math.PI) / 180);
      ctx.scale(visual?.mirrorX === true ? -Math.abs(scale) : Math.abs(scale), scale);
      ctx.translate(-obstacle.w / 2, -obstacle.h / 2);
      visual?.render(ctx, obstacle.w);
      ctx.restore();
    }
  }

  private renderPlayers(ctx: CanvasRenderingContext2D): void {
    // Upstream keeps the droids hidden until play actually starts.
    if (this.phase === 'attract' || this.phase === 'splash' || this.phase === 'countdown') return;
    for (const player of this.players) {
      ctx.save();
      ctx.translate(player.x + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2);
      ctx.rotate((player.rotation * Math.PI) / 180);
      ctx.scale(player.scale, player.scale);
      ctx.translate(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2);
      drawDroid(ctx, PLAYER_SIZE, player.color);
      ctx.restore();
    }
  }

  private renderTouches(ctx: CanvasRenderingContext2D): void {
    for (const player of this.players) {
      if (player.touchX < 0) continue;
      const cx = player.x + PLAYER_SIZE / 2;
      const cy = player.y + PLAYER_SIZE / 2;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(player.touchX, player.touchY, 100, 0, Math.PI * 2);
      ctx.fill();

      const angle = Math.PI / 2 - Math.atan2(cx - player.touchX, cy - player.touchY);
      ctx.strokeStyle = player.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(player.touchX + 100 * Math.cos(angle), player.touchY + 100 * Math.sin(angle));
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.restore();
    }
  }

  private renderHud(ctx: CanvasRenderingContext2D): void {
    const { config } = this;
    if (this.phase === 'attract' || this.phase === 'splash') return;

    const padX = 12;
    const padY = config.hudTextSize * 0.3;

    if (!config.scoreByPipeId && this.players.length === 1) {
      const player = this.players[0];
      if (player === undefined) return;
      const text = String(player.score);
      ctx.font = `400 ${config.hudTextSize}px system-ui, sans-serif`;
      const w = ctx.measureText(text).width + padX * 2;
      const h = config.hudTextSize + padY * 2;
      const x = 16;
      const y = 32;
      this.chip(ctx, x, y, w, h, this.gameOver ? '#FF0000' : '#FFFFFF');
      ctx.fillStyle = this.gameOver ? '#FFFFFF' : '#AAAAAA';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + w / 2, y + h / 2);
      return;
    }

    const labels = this.players.map((p) => String(p.score));
    ctx.font = `700 ${config.hudTextSize}px system-ui, sans-serif`;
    const widths = labels.map((label) => ctx.measureText(label).width + padX * 2);
    const h = config.hudTextSize + padY * 2;
    const total = widths.reduce((a, b) => a + b, 0) + 8 * (labels.length - 1);
    let x = (this.width - total) / 2;
    const y = 24;
    this.players.forEach((player, i) => {
      const w = widths[i];
      this.chip(ctx, x, y, w, h, player.color);
      ctx.fillStyle = luma(player.color) > 0.7 ? '#000000' : '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[i], x + w / 2, y + h / 2);
      x += w + 8;
    });
  }

  private chip(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
  ): void {
    const r = this.config.hudRadius;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private renderSplash(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.63)';
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    ctx.fillStyle = '#AAAAAA';
    ctx.beginPath();
    ctx.arc(cx, cy, 36, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy - 14);
    ctx.lineTo(cx - 10, cy + 14);
    ctx.lineTo(cx + 15, cy);
    ctx.closePath();
    ctx.fill();

    if (this.config.maxPlayers > 1) {
      ctx.font = '400 18px system-ui, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`−   ${this.playerCount}P   +`, cx, cy - 84);
    }
  }

  private renderCountdown(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, width, height);
    ctx.font = '400 72px system-ui, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.max(0, this.countdown)), width / 2, height / 2);
  }

  /** Tap targets for the splash screen, in canvas coordinates. */
  splashHit(x: number, y: number): 'play' | 'minus' | 'plus' | null {
    if (this.phase !== 'splash') return null;
    const cx = this.width / 2;
    const cy = this.height / 2;
    if (Math.hypot(x - cx, y - cy) <= 40) return 'play';
    if (this.config.maxPlayers > 1 && Math.abs(y - (cy - 84)) < 24) {
      if (x < cx - 40) return 'minus';
      if (x > cx + 40) return 'plus';
    }
    return null;
  }
}

function luma(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 0xff) / 255;
  const g = ((value >> 8) & 0xff) / 255;
  const b = (value & 0xff) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
