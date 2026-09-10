import { decelerate } from '../../core/easing';
import {
  drawCactus,
  drawCandyCaneStem,
  drawCloud,
  drawDroid,
  drawMoon,
  drawMountain,
  drawSparkle,
  drawSun,
  shadeColor,
} from './flappyArt';

/**
 * The LLand (Android 5.0) / MLand (Android 6.0) engine.
 *
 * Both upstream games share their physics verbatim, and both step it from a
 * `TimeAnimator`: gravity is `dv += G` once per *frame* rather than per second
 * (LLand.java:757, MLand.java:1174), so the whole simulation is pinned to a
 * fixed 1/60 s timestep here; holding applies a constant -BOOST_DV instead of an
 * impulse; the world scrolls at TRANSLATION_PER_SEC; pipes spawn every
 * OBSTACLE_PERIOD seconds of game time. Everything that differs between the two
 * (pop size, gap, stem width, art, HUD, player count, scenes, splash, scoring)
 * is config.
 */

export const STEP = 1 / 60;

/** `l_translation_per_sec` / `m_translation_per_sec`. */
const TRANSLATION_PER_SEC = 100;
/** `l_boost_dv` / `m_boost_dv`, applied as a velocity while the finger is down. */
const BOOST_DV = 550;
/** `l_G` / `m_G`, added to `dv` once per fixed step (not per second). */
const G = 30;
/** `l_max_v` / `m_max_v`. */
const MAX_V = 1000;
/** `l_player_size` / `m_player_size`. */
const PLAYER_SIZE = 40;
/** `l_player_hit_size` / `m_player_hit_size`; equal to PLAYER_SIZE so inset is 0. */
const PLAYER_HIT_SIZE = 40;
/** `(int)(OBSTACLE_SPACING / TRANSLATION_PER_SEC)` = 380/100 = 3 seconds. */
const OBSTACLE_PERIOD = 3;
/** `mG.postDelayed(..., 250)` input lock after a death. */
const FROZEN_MS = 250;
/** `final int N = 20` in both `reset()` scenery loops. */
const SCENERY_COUNT = 20;
/** `l_sun_size` / `m_sun_size`, also used for the moon. */
const SUN_SIZE = 45;
const STAR_SIZE_MIN = 3;
const STAR_SIZE_MAX = 5;
const CLOUD_SIZE_MIN = 10;
const CLOUD_SIZE_MAX = 100;
const BUILDING_WIDTH_MAX = 250;
const BUILDING_HEIGHT_MIN = 20;
/** `Player.boost()` snaps the view to 1.25 and `unboost()` eases back over 200 ms. */
const BOOST_SCALE = 1.25;
const UNBOOST_MS = 200;
/** `m_mland.xml` @id/play_button is 72dp with a centred 48dp @id/play_button_image. */
const PLAY_BUTTON_R = 36;
const SETUP_BUTTON = 48;
/** The self-reposting countdown runnable fires every 500 ms (MLand.java:553). */
const COUNTDOWN_STEP_MS = 500;

const DAY = 0;
const NIGHT = 1;
const TWILIGHT = 2;
const SUNSET = 3;

/** `Player.sHull`, identical in LLand and MLand: antennae, shoulders, hands, feet. */
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

/** DAY / NIGHT / TWILIGHT / SUNSET, each `[bottom, top]` (`GradientDrawable` BOTTOM_TOP). */
const SKIES: ReadonlyArray<readonly [string, string]> = [
  ['#c0c0FF', '#a0a0FF'],
  ['#000010', '#000000'],
  ['#000040', '#000010'],
  ['#a08020', '#204080'],
];

/** `Color.GRAY`, the base colour of MLand's city buildings. */
const GRAY = '#888888';

/**
 * `ViewPropertyAnimator`'s default interpolator, used by every obstacle drop-in
 * and by `Player.unboost()`.
 */
function accelerateDecelerate(t: number): number {
  return Math.cos((t + 1) * Math.PI) / 2 + 0.5;
}

function clamp01(f: number): number {
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

export type SceneKind = 'city' | 'tx' | 'zrh';

export interface PopVisual {
  /** Degrees per second; 0 for static art (MLand never sets `mRotate`). */
  spin: number;
  /** MLand's top pop runs its Y scale 0.25 -> -1, so the marshmallow is flipped. */
  mirrorY: boolean;
  render(ctx: CanvasRenderingContext2D, size: number): void;
}

export interface HudStyle {
  /** `l_scorecard` 8dp, `m_scorecard` 4dp. */
  radius: number;
  /** 32sp for LLand, 22sp for MLand. */
  textSize: number;
  /** `m_mland_scorefield.xml` is `textStyle="bold"`, LLand's is not. */
  bold: boolean;
  /** LLand pads 16dp horizontally, MLand 12dp. */
  padX: number;
  /** LLand pins one chip top-left; MLand centres a row of per-player chips. */
  centered: boolean;
  top: number;
  left: number;
  /**
   * MLand's chips are `match_parent` inside the 64dp @id/scores bar minus its
   * 12dp padding = 40dp. LLand's are `wrap_content` around a 32sp line.
   */
  chipHeight: number;
  gap: number;
}

export interface FlappyConfig {
  popSize: number;
  stemWidth: number;
  gap: number;
  obstacleMin: number;
  buildingWidthMin: number;
  /** Pop collision radius as a fraction of `popSize` (1/2 for L, 1/3 for M). */
  popHitFraction: number;
  hud: HudStyle;
  maxPlayers: number;
  /** LLand: `['city']`. MLand: all three, picked once per run. */
  scenes: ReadonlyArray<SceneKind>;
  playerColors: readonly string[];
  stemColors: readonly [string, string];
  candyCaneStemChance: number;
  /** `Stem.onDraw`'s cast shadow: OBSTACLE_WIDTH/2 for L, *0.4 for M. */
  stemShadowDepth: number;
  /** Solid `#AAAAAA` in LLand, a `0x22000000` MULTIPLY filter (~13 %) in MLand. */
  stemShadowColor: string;
  scoreByPipeId: boolean;
  showTouches: boolean;
  splash: boolean;
  vibrateOnDeath: boolean;
  /** MLand weights night/twilight double; LLand is uniform. */
  weightedSky: boolean;
  /** MLand's `Player.reset()` jitters the start Y by up to PLAYER_SIZE; LLand's does not. */
  startYJitter: boolean;
  /**
   * `l_scenery_z` (6dp). MLand declares `m_scenery_z` but the `setTranslationZ`
   * call is commented out ("no more shadows for these things"), so it is 0 there
   * and the scenery keeps its plain child order.
   */
  sceneryZ: number;
  makePop(random: () => number, top: boolean): PopVisual;
}

interface Scenery {
  kind: 'building' | 'cactus' | 'mountain' | 'cloud' | 'star' | 'sun' | 'moon';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Depth, `i / N`; drives MLand's `Color.rgb(c,c,c)` MULTIPLY shading. */
  z: number;
  /** `translationZ`; Android draws children in ascending Z order. */
  layerZ: number;
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
  rotation: number;
  /** `Stem.mDrawShadow`: only the bottom stem carries the pop's cast shadow. */
  drawShadow: boolean;
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
  /** Start value and game-time of the running `unboost()` scale animation. */
  scaleFrom: number;
  scaleAt: number;
  boosting: boolean;
  alive: boolean;
  score: number;
  color: string;
  touchX: number;
  touchY: number;
}

interface Fade {
  from: number;
  to: number;
  start: number;
  duration: number;
}

export interface FlappyHost {
  readonly width: number;
  readonly height: number;
  /** Needed to measure HUD text, which the splash hit-test lays out around. */
  readonly ctx: CanvasRenderingContext2D;
  random(): number;
  randomInt(min: number, max: number): number;
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
  private timeOfDay = DAY;
  private scene: SceneKind = 'city';
  private scenery: Scenery[] = [];
  private obstacles: Obstacle[] = [];
  private players: Player[] = [];
  private numPlayers = 1;
  private countdown = 3;
  private countdownAt = 0;
  /** True until the countdown has been started at least once. */
  private countdownMode = false;
  private taps = 0;
  private width = 0;
  private height = 0;

  /** LLand parks its score chip at `translationY = -500` until the first start. */
  private hudParked = true;
  private hudSlideAt: number | null = null;

  private splashFade: Fade = { from: 0, to: 0, start: 0, duration: 0 };
  private playImageFade: Fade = { from: 1, to: 1, start: 0, duration: 0 };
  private playTextFade: Fade = { from: 0, to: 0, start: 0, duration: 0 };

  constructor(host: FlappyHost, config: FlappyConfig) {
    this.host = host;
    this.config = config;
    this.width = host.width;
    this.height = host.height;
    this.reset();
  }

  get playerCount(): number {
    return this.players.length;
  }

  resize(): void {
    const width = this.host.width;
    const height = this.host.height;
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    // `onSizeChanged`: stop(); reset(); if (AUTOSTART) start(false).
    this.reset();
  }

  /**
   * `MLand.addPlayer()` / `removePlayer()`: a droid and a score chip are added or
   * dropped and the group is re-centred. The world is *not* rebuilt.
   */
  setPlayerCount(count: number): void {
    const next = Math.max(1, Math.min(this.config.maxPlayers, count));
    if (next === this.numPlayers) return;
    this.numPlayers = next;
    while (this.players.length < next) this.players.push(this.makePlayer(this.players.length));
    // removePlayer() always drops the last one.
    while (this.players.length > next) this.players.pop();
    this.realignPlayers();
  }

  private makePlayer(index: number): Player {
    const colors = this.config.playerColors;
    return {
      index,
      x: this.width / 2,
      y: this.height / 2,
      dv: 0,
      rotation: 90,
      scale: 1,
      scaleFrom: 1,
      scaleAt: 0,
      boosting: false,
      // `Player.create()` leaves `mAlive` false; only `startPlaying()` revives.
      alive: false,
      score: 0,
      color: colors[index % colors.length],
      touchX: -1,
      touchY: -1,
    };
  }

  private rollSky(): void {
    if (!this.config.weightedSky) {
      // LLand: `irand(0, SKIES.length)` truncates, so all four are uniform.
      this.timeOfDay = this.host.randomInt(0, SKIES.length - 1);
      return;
    }
    // MLand: `irand(0, 3)` rounds, so P(DAY)=P(SUNSET)=1/6, P(NIGHT)=P(TWILIGHT)=1/3.
    this.timeOfDay = Math.min(SKIES.length - 1, Math.round(this.host.random() * 3));
  }

  private rollScene(): void {
    if (this.config.scenes.length === 1) {
      this.scene = this.config.scenes[0];
      return;
    }
    // `irand(0, SCENE_COUNT)` can return 3, which falls through to SCENE_CITY,
    // leaving city / Texas / Zurich at an even 1/3 each.
    const roll = Math.min(3, Math.round(this.host.random() * 3));
    this.scene = roll === 1 ? 'tx' : roll === 2 ? 'zrh' : 'city';
  }

  reset(): void {
    this.t = 0;
    this.accumulator = 0;
    this.lastPipeTime = -OBSTACLE_PERIOD;
    this.pipeId = 0;
    this.obstacles = [];
    this.gameOver = false;
    this.taps = 0;
    this.flipped = this.host.random() > 0.5;
    // stop() re-rolls the sky and scene "for next reset"; upstream only applies
    // them here, so the frozen death frame keeps the world it died in.
    this.rollSky();
    this.rollScene();

    this.players = [];
    for (let i = 0; i < this.numPlayers; i++) this.players.push(this.makePlayer(i));
    this.realignPlayers();

    this.scenery = [];
    this.buildScenery();

    this.phase = this.config.splash ? 'splash' : 'attract';
    if (this.config.splash) this.showSplash();
  }

  /** `realignPlayers()`: `x = (W - (N-1)*PLAYER_SIZE)/2`, then += PLAYER_SIZE. */
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
    const mh = Math.trunc(height / 6);
    const cloudless = this.host.random() < 0.25;

    // Sun and moon are both `Star` scenery, so v = 0 and they never scroll.
    const showingSun =
      (this.timeOfDay === DAY || this.timeOfDay === SUNSET) && this.host.random() > 0.25;
    if (showingSun) {
      const w = SUN_SIZE;
      this.scenery.push({
        kind: 'sun',
        x: w + this.host.random() * (width - 2 * w),
        y:
          this.timeOfDay === DAY
            ? w + this.host.random() * (height * 0.66 - w)
            : height * 0.66 + this.host.random() * (height - w - height * 0.66),
        w,
        h: w,
        z: 0,
        layerZ: 0,
        v: 0,
        variant: 0,
        color: '#FFFFFF',
        // DAY calls `getBackground().setTint(0)`: a SRC_IN tint with alpha 0
        // makes the whole drawable transparent, so the daytime sun is invisible.
        alpha: this.timeOfDay === DAY ? 0 : 1,
        mirror: false,
        rot: 0,
        ...(this.timeOfDay === SUNSET ? { tint: 'rgba(255, 128, 0, 0.75)' } : {}),
      });
    } else {
      const dark = this.timeOfDay === NIGHT || this.timeOfDay === TWILIGHT;
      const ff = this.host.random();
      if ((dark && ff < 0.75) || ff < 0.5) {
        const w = SUN_SIZE;
        const mirror = this.host.random() > 0.5;
        this.scenery.push({
          kind: 'moon',
          x: w + this.host.random() * (width - 2 * w),
          y: w + this.host.random() * (height - 2 * w),
          w,
          h: w,
          z: 0,
          layerZ: 0,
          v: 0,
          variant: 0,
          color: '#F2F2FF',
          alpha: dark ? 1 : 128 / 255,
          mirror,
          // `setRotation(getScaleX() * frand(5, 30))` — mirrored moons tilt the
          // other way.
          rot: (mirror ? -1 : 1) * (5 + this.host.random() * 25),
        });
      }
    }

    for (let i = 0; i < SCENERY_COUNT; i++) {
      const r1 = this.host.random();
      const z = i / SCENERY_COUNT;
      const spread = (size: number): number => -size + this.host.random() * (width + 2 * size);

      if (r1 < 0.3 && this.timeOfDay !== DAY) {
        // Star: gravity TOP with `topMargin = (int)(r * r * H)`, biased upwards.
        const r = this.host.random();
        const size = this.host.randomInt(STAR_SIZE_MIN, STAR_SIZE_MAX);
        this.scenery.push({
          kind: 'star',
          x: spread(size),
          y: Math.trunc(r * r * height),
          w: size,
          h: size,
          z: 0,
          layerZ: 0,
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
        // Cloud: `topMargin = (int)(1 - r*r*H/2) + H/2`. The stray `1 -` is an
        // upstream typo, but it is what keeps the clouds in the top half.
        const r = this.host.random();
        const size = this.host.randomInt(CLOUD_SIZE_MIN, CLOUD_SIZE_MAX);
        this.scenery.push({
          kind: 'cloud',
          x: spread(size),
          y: Math.trunc(1 - (r * r * height) / 2) + Math.trunc(height / 2),
          w: size,
          h: size,
          z: 0,
          layerZ: 0,
          v: 0.15 + this.host.random() * 0.35,
          variant: this.host.random() < 0.01 ? 1 : 0,
          color: '#FFFFFF',
          alpha: 0x40 / 255,
          mirror: false,
          rot: 0,
        });
        continue;
      }

      const kind: Scenery['kind'] =
        this.scene === 'zrh' ? 'mountain' : this.scene === 'tx' ? 'cactus' : 'building';

      if (kind === 'building') {
        const w = this.host.randomInt(this.config.buildingWidthMin, BUILDING_WIDTH_MAX);
        const h = this.host.randomInt(BUILDING_HEIGHT_MIN, Math.max(BUILDING_HEIGHT_MIN + 1, mh));
        this.scenery.push({
          kind,
          x: spread(w),
          y: height - h,
          w,
          h,
          z,
          layerZ: this.config.sceneryZ * (1 + z),
          v: 0.85 * z,
          variant: 0,
          // LLand: `Color.HSVToColor({175, 0.25, z})`, brightness already = z.
          // MLand: `Color.GRAY` multiplied by `Color.rgb(c,c,c)`, c = (int)(255*z).
          color:
            this.config.scenes.length > 1
              ? shadeColor(GRAY, Math.trunc(255 * z) / 255)
              : this.teal(z),
          alpha: 1,
          mirror: false,
          rot: 0,
        });
        continue;
      }

      // Cactus: `irand(BUILDING_WIDTH_MAX/4, /2)`; Mountain: `irand(/2, MAX)`.
      const size =
        kind === 'cactus'
          ? this.host.randomInt(BUILDING_WIDTH_MAX / 4, BUILDING_WIDTH_MAX / 2)
          : this.host.randomInt(BUILDING_WIDTH_MAX / 2, BUILDING_WIDTH_MAX);
      this.scenery.push({
        kind,
        x: spread(size),
        y: height - size,
        w: size,
        h: size,
        z,
        layerZ: this.config.sceneryZ * (1 + z),
        v: 0.85 * z,
        // `pick(CACTI/MOUNTAINS)` = list[irand(0, 2)], and MLand's irand rounds,
        // so the middle art is twice as likely as either end.
        variant: Math.min(2, Math.round(this.host.random() * 2)),
        color: '#FFFFFF',
        alpha: 1,
        mirror: false,
        rot: 0,
      });
    }

    // A ViewGroup draws its children in ascending translationZ order (stable for
    // ties), so LLand's raised buildings paint over the Z=0 stars and clouds.
    this.scenery.sort((a, b) => a.layerZ - b.layerZ);
  }

  /**
   * LLand buildings are `Color.HSVToColor({175, 0.25, z})`: hue 175 falls in
   * sector 2, so `(r, g, b) = (p, v, t)` with `v = z`.
   */
  private teal(z: number): string {
    const s = 0.25;
    const v = clamp01(z);
    const f = 175 / 60 - 2;
    const p = v * (1 - s);
    const t = v * (1 - s * (1 - f));
    const to = (x: number): number => Math.trunc(x * 255);
    return `rgb(${to(p)}, ${to(v)}, ${to(t)})`;
  }

  private spawnObstacle(): void {
    const { width, height, config } = this;
    const min = config.obstacleMin;
    const obstacleY =
      Math.trunc(this.host.random() * Math.max(1, height - 2 * min - config.gap)) + min;
    const inset = (config.popSize - config.stemWidth) / 2;
    const yInset = config.popSize / 2;

    this.pipeId++;
    const pipeId = this.pipeId;
    // `irand(0, 250)` milliseconds of start delay.
    const d1 = this.host.random() * 0.25;
    const d2 = this.host.random() * 0.25;
    // LLand has no OBSTACLE_MIN sanity clamp, so a pipe near either edge yields a
    // negative stem height. Upstream lays the view out with that negative height
    // (which Android clamps to nothing) while still using the raw value for the
    // drop-in animation and the pop's resting place, so keep both.
    const topStemH = obstacleY - yInset;
    const bottomStemH = height - obstacleY - config.gap - yInset;
    const topH = Math.max(0, topStemH);
    const bottomH = Math.max(0, bottomStemH);

    const make = (
      kind: 'stem' | 'pop',
      x: number,
      y: number,
      w: number,
      h: number,
      startY: number,
      delay: number,
      duration: number,
      drawShadow: boolean,
      candy: boolean,
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
      rotation: 0,
      drawShadow,
      candy,
      cleared: false,
      visual,
    });

    // `frand() < 0.01f` is rolled per Stem, so the two halves of one pipe can
    // disagree about being a candy cane.
    this.obstacles.push(
      make(
        'stem',
        width + inset,
        0,
        config.stemWidth,
        topH,
        -topStemH - yInset,
        d1,
        0.25,
        false,
        this.host.random() < config.candyCaneStemChance,
        null,
      ),
      make(
        'pop',
        width,
        // `translationY(s1.h - inset)`: the top pop comes to rest `yinset - inset`
        // below the stem's end, the upstream asymmetry that narrows the real gap.
        topStemH - inset,
        config.popSize,
        config.popSize,
        -config.popSize,
        d1,
        0.25,
        false,
        false,
        config.makePop(() => this.host.random(), true),
      ),
      make(
        'stem',
        width + inset,
        height - bottomStemH,
        config.stemWidth,
        bottomH,
        height + yInset,
        d2,
        0.4,
        true,
        this.host.random() < config.candyCaneStemChance,
        null,
      ),
      make(
        'pop',
        width,
        // `translationY(mHeight - s2.h - yinset)` == obstacleY + gap.
        obstacleY + config.gap,
        config.popSize,
        config.popSize,
        height,
        d2,
        0.4,
        false,
        false,
        config.makePop(() => this.host.random(), false),
      ),
    );
  }

  /**
   * `Player.prepareCheckIntersections()`: the hull is built in view space from
   * `PLAYER_HIT_SIZE * sHull + inset` and then pushed through `getMatrix()`, so
   * translation, rotation and the 1.25 boost scale all enlarge the hitbox.
   */
  private hullCorners(player: Player): Array<[number, number]> {
    const cos = Math.cos((player.rotation * Math.PI) / 180);
    const sin = Math.sin((player.rotation * Math.PI) / 180);
    const s = player.scale;
    const cx = player.x + PLAYER_SIZE / 2;
    const cy = player.y + PLAYER_SIZE / 2;
    const inset = (PLAYER_SIZE - PLAYER_HIT_SIZE) / 2;
    return HULL.map(([fx, fy]) => {
      const lx = (inset + PLAYER_HIT_SIZE * fx - PLAYER_SIZE / 2) * s;
      const ly = (inset + PLAYER_HIT_SIZE * fy - PLAYER_SIZE / 2) * s;
      return [cx + lx * cos - ly * sin, cy + lx * sin + ly * cos] as [number, number];
    });
  }

  private obstacleY(obstacle: Obstacle): number {
    if (obstacle.elapsed < obstacle.delay) return obstacle.startY;
    const p = clamp01((obstacle.elapsed - obstacle.delay) / obstacle.duration);
    return obstacle.startY + (obstacle.y - obstacle.startY) * accelerateDecelerate(p);
  }

  /**
   * Both pops scale 0.25 -> 1 on X; MLand's top pop scales -0.25 -> -1 on Y, so
   * the Y scale is always the X scale times the mirror sign.
   */
  private obstacleScale(obstacle: Obstacle): number {
    if (obstacle.visual === null) return 1;
    if (obstacle.elapsed < obstacle.delay) return 0.25;
    const p = clamp01((obstacle.elapsed - obstacle.delay) / obstacle.duration);
    return 0.25 + 0.75 * accelerateDecelerate(p);
  }

  private simulate(dt: number): void {
    // `stop()` cancels the TimeAnimator outright: after a death the scenery, the
    // pops and every rotation freeze exactly where they were.
    if (this.phase === 'dead') return;

    const { width, height, config } = this;
    this.t += dt;

    // 1. Move all objects (+ 4. recycle scenery that scrolled off the left).
    for (const item of this.scenery) {
      item.x -= TRANSLATION_PER_SEC * dt * item.v;
      if (item.x + item.w < 0) item.x = width;
    }

    const playing = this.phase === 'playing';
    if (playing) {
      for (const obstacle of this.obstacles) {
        obstacle.x -= TRANSLATION_PER_SEC * dt;
        obstacle.elapsed += dt;
        if (obstacle.visual !== null && obstacle.visual.spin !== 0) {
          obstacle.rotation += dt * obstacle.visual.spin;
        }
      }
    }

    let living = 0;
    for (const player of this.players) {
      // Not playing yet: LLand's droid is GONE and MLand's are INVISIBLE with
      // `mAlive == false`, so they just "float away with the garbage".
      if (!playing || !player.alive) {
        if (playing) player.x -= TRANSLATION_PER_SEC * dt;
        continue;
      }

      if (player.boosting) player.dv = -BOOST_DV;
      else player.dv += G;
      player.dv = Math.max(-MAX_V, Math.min(MAX_V, player.dv));
      player.y += player.dv * dt;
      if (player.y < 0) player.y = 0;
      // `90 + lerp(clamp(rlerp(dv, MAX_V, -MAX_V)), 90, -90)` == 180 - 180x.
      player.rotation = 180 - 180 * clamp01((MAX_V - player.dv) / (2 * MAX_V));
      if (!player.boosting) {
        const p = clamp01((this.t - player.scaleAt) / (UNBOOST_MS / 1000));
        player.scale = player.scaleFrom + (1 - player.scaleFrom) * accelerateDecelerate(p);
      }

      const corners = this.hullCorners(player);

      // 2. Check for altitude.
      if (corners.some(([, y]) => y >= height)) {
        this.kill(player);
      } else {
        // 3. Check for obstacles, and score.
        let maxPassedStem = 0;
        let passedBarrier = false;
        for (const obstacle of this.obstacles) {
          const y = this.obstacleY(obstacle);
          if (this.intersects(obstacle, y, corners)) {
            this.kill(player);
            continue;
          }
          if (obstacle.kind !== 'stem') continue;
          // `cleared()`: the whole hit rect is left of every hull corner.
          const right = obstacle.x + obstacle.w;
          if (corners.some(([cx]) => right >= cx)) continue;
          if (config.scoreByPipeId) {
            maxPassedStem = Math.max(maxPassedStem, obstacle.pipeId);
          } else if (!obstacle.cleared) {
            obstacle.cleared = true;
            passedBarrier = true;
          }
        }
        // MLand scores per player from the pipe ids; LLand adds one per cleared
        // stem. Both only ever add 1 per frame.
        if (config.scoreByPipeId) {
          if (maxPassedStem > player.score) player.score += 1;
        } else if (passedBarrier) {
          player.score += 1;
        }
      }

      if (player.alive) living++;
    }

    if (!playing) return;

    if (living === 0) {
      this.stop();
      return;
    }

    // 4. Obstacles leave the tree once `translationX + width < 0`.
    this.obstacles = this.obstacles.filter((obstacle) => obstacle.x + obstacle.w >= 0);

    // 5. Time for more obstacles!
    if (this.t - this.lastPipeTime > OBSTACLE_PERIOD) {
      this.lastPipeTime = this.t;
      this.spawnObstacle();
    }
  }

  /** `Obstacle.intersects` (AABB, `Rect.contains` is exclusive) / `Pop` (circle). */
  private intersects(
    obstacle: Obstacle,
    y: number,
    corners: ReadonlyArray<readonly [number, number]>,
  ): boolean {
    if (obstacle.kind === 'pop') {
      const cx = obstacle.x + obstacle.w / 2;
      const cy = y + obstacle.h / 2;
      // `r = getWidth()/2` in LLand, `getWidth()/3` in MLand — the pop's scale
      // animation never changes the collision radius.
      const r = obstacle.w * this.config.popHitFraction;
      return corners.some(([px, py]) => Math.hypot(px - cx, py - cy) <= r);
    }
    const right = obstacle.x + obstacle.w;
    const bottom = y + obstacle.h;
    return corners.some(
      ([px, py]) => px > obstacle.x && px < right && py > y && py < bottom,
    );
  }

  private kill(player: Player): void {
    if (!player.alive) return;
    player.alive = false;
    player.boosting = false;
    // `thump(i, 80)`.
    if (this.config.vibrateOnDeath) navigator.vibrate?.(80);
  }

  private stop(): void {
    if (this.phase === 'dead') return;
    this.phase = 'dead';
    this.gameOver = true;
    this.frozenUntil = performance.now() + FROZEN_MS;
    // `MLand.stop()` kills every survivor without another buzz.
    for (const player of this.players) {
      player.alive = false;
      player.boosting = false;
    }
  }

  private startPlaying(): void {
    this.phase = 'playing';
    this.t = 0;
    this.lastPipeTime = -OBSTACLE_PERIOD;
    this.obstacles = [];
    this.taps = 0;
    this.hideSplash();
    this.realignPlayers();
    if (this.hudParked) {
      this.hudParked = false;
      this.hudSlideAt = 0;
    }
    for (const player of this.players) {
      player.alive = true;
      player.score = 0;
      player.dv = 0;
      player.y = this.config.startYJitter
        ? this.height / 2 + Math.trunc(this.host.random() * PLAYER_SIZE) - PLAYER_SIZE / 2
        : this.height / 2;
      // `p.boost(-1, -1); p.unboost();` — "start you off flying! not forever though".
      this.boost(player, -1, -1);
      this.unboost(player);
    }
    this.realignPlayers();
  }

  private boost(player: Player, x: number, y: number): void {
    player.boosting = true;
    player.dv = -BOOST_DV;
    // `boost()` animates to 1.25 over 100 ms *and* calls setScaleX/Y(1.25) right
    // away, so the hull is 25 % bigger from the very first frame of the hold.
    player.scale = BOOST_SCALE;
    player.scaleFrom = BOOST_SCALE;
    player.scaleAt = this.t;
    // `onTouchEvent` hands MLand coordinates that are already in the view's
    // mirrored space, and `onDraw` paints the overlay back through that same
    // mirror, so the disc lands under the finger. Convert the canvas position the
    // same way; -1 stays the "no touch" sentinel that suppresses the overlay.
    player.touchX = x < 0 ? -1 : this.flipped ? this.width - x : x;
    player.touchY = y;
    this.taps++;
  }

  private unboost(player: Player): void {
    player.boosting = false;
    player.scaleFrom = player.scale;
    player.scaleAt = this.t;
    player.touchX = -1;
    player.touchY = -1;
  }

  poke(playerIndex: number, x: number, y: number): void {
    if (performance.now() < this.frozenUntil) return;
    // While the splash is up it is clickable and swallows the touch; during the
    // countdown `start(true)` finds `mCountdown > 0` and does nothing.
    if (this.phase === 'splash' || this.phase === 'countdown') return;

    if (this.phase !== 'playing') {
      // `poke()` only rebuilds the world when the animator was cancelled, i.e.
      // after a death. The very first tap just flips `mPlaying` on, so the
      // attract-mode sky and scenery carry straight into the game.
      const wasDead = this.phase === 'dead';
      if (wasDead) this.reset();
      if (this.config.splash) {
        // `MLand.start(true)` with `mCountdown <= 0` shows the splash again; after
        // a death the countdown restarts by itself, without pressing play.
        if (wasDead) this.pressPlay();
        return;
      }
      this.startPlaying();
    }

    const player = this.players[playerIndex];
    if (player === undefined || !player.alive) return;
    this.boost(player, x, y);
  }

  unpoke(playerIndex: number): void {
    if (performance.now() < this.frozenUntil) return;
    if (this.phase !== 'playing') return;
    const player = this.players[playerIndex];
    if (player === undefined) return;
    this.unboost(player);
  }

  /**
   * Key and gamepad input (`onKeyDown` -> `poke(player)`). Unlike a touch, this
   * is not swallowed by the splash overlay — MLand hands focus to the play
   * button, so a key press there is the same as pressing it.
   */
  pokeKey(playerIndex: number): void {
    if (this.phase === 'splash') {
      this.pressPlay();
      return;
    }
    this.poke(playerIndex, -1, -1);
  }

  private showSplash(): void {
    const now = performance.now();
    this.countdownMode = false;
    this.startFade(this.splashFade, 1, 1000, now);
    this.playImageFade = { from: 1, to: 1, start: now, duration: 0 };
    this.playTextFade = { from: 0, to: 0, start: now, duration: 0 };
  }

  private hideSplash(): void {
    this.startFade(this.splashFade, 0, 300, performance.now());
  }

  /** `startButtonPressed` -> `MLand.start(true)`: crossfade the play icon to "3". */
  pressPlay(): void {
    if (this.phase !== 'splash') return;
    const now = performance.now();
    this.phase = 'countdown';
    this.countdownMode = true;
    this.countdown = 3;
    this.countdownAt = now;
    this.startFade(this.playImageFade, 0, 300, now);
    this.startFade(this.playTextFade, 1, 300, now);
  }

  /**
   * `MLand.onTouchEvent`: the screen is split into N equal columns and the finger
   * decides which droid flaps. `mFlipped` mirrors the index because the world —
   * droids included — is drawn mirrored.
   */
  playerIndexAt(x: number): number {
    const n = this.players.length;
    const index = Math.max(0, Math.min(n - 1, Math.floor((n * x) / Math.max(1, this.width))));
    return this.flipped ? n - 1 - index : index;
  }

  update(dtSeconds: number): void {
    this.resize();

    if (this.phase === 'countdown') {
      const now = performance.now();
      let guard = 0;
      while (this.phase === 'countdown' && now - this.countdownAt >= COUNTDOWN_STEP_MS) {
        if (guard++ > 8) {
          this.countdownAt = now;
          break;
        }
        this.countdownAt += COUNTDOWN_STEP_MS;
        this.countdown--;
        // "0" is shown at the same instant startPlaying() fires, 1500 ms after
        // the play button was pressed.
        if (this.countdown <= 0) this.startPlaying();
      }
    }

    this.accumulator += Math.min(dtSeconds, 0.25);
    while (this.accumulator >= STEP) {
      this.simulate(STEP);
      this.accumulator -= STEP;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this;
    const now = performance.now();

    const [bottom, top] = SKIES[this.timeOfDay];
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, top);
    sky.addColorStop(1, bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // `setScaleX(mFlipped ? -1 : 1)` mirrors the whole world view.
    if (this.flipped) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    // `MLand.onDraw` runs before the children are dispatched, so the touch
    // overlay sits under the scenery, not on top of it.
    if (this.config.showTouches) this.renderTouches(ctx);
    this.renderScenery(ctx);
    // Stems are Z=13.5 and pops Z=18; a droid is Z=18 (20 while boosting) and is
    // an earlier child than any obstacle, so at equal Z the pops cover it.
    this.renderObstacles(ctx, 'stem');
    this.renderPlayers(ctx, false);
    this.renderObstacles(ctx, 'pop');
    this.renderPlayers(ctx, true);

    ctx.restore();

    // The @id/welcome overlay sits above the world but below @id/player_setup.
    this.renderSplash(ctx, now);
    this.renderHud(ctx);
  }

  private renderScenery(ctx: CanvasRenderingContext2D): void {
    for (const item of this.scenery) {
      if (item.alpha <= 0) continue;
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
          drawCloud(ctx, item.w, item.alpha, item.variant === 1);
          break;
        case 'building':
          ctx.fillStyle = item.color;
          ctx.fillRect(0, 0, item.w, item.h);
          break;
        case 'cactus':
          // `bg.setColorFilter(Color.rgb(c,c,c), MULTIPLY)`, c = (int)(255 * z).
          drawCactus(ctx, item.w, item.variant, Math.trunc(255 * item.z) / 255);
          break;
        case 'mountain':
          drawMountain(ctx, item.w, item.variant, Math.trunc(255 * item.z) / 255);
          break;
      }
      ctx.restore();
    }
  }

  private renderObstacles(ctx: CanvasRenderingContext2D, kind: 'stem' | 'pop'): void {
    const { config } = this;
    for (const obstacle of this.obstacles) {
      if (obstacle.kind !== kind) continue;
      const y = this.obstacleY(obstacle);
      ctx.save();

      if (obstacle.kind === 'stem') {
        ctx.translate(obstacle.x, y);
        // A child view's canvas is clipped to its bounds, so the cast shadow
        // never spills past the end of a short stem.
        ctx.beginPath();
        ctx.rect(0, 0, obstacle.w, obstacle.h);
        ctx.clip();
        if (obstacle.candy) {
          drawCandyCaneStem(ctx, obstacle.w, obstacle.h);
        } else {
          const gradient = ctx.createLinearGradient(0, 0, obstacle.w, 0);
          gradient.addColorStop(0, config.stemColors[0]);
          gradient.addColorStop(1, config.stemColors[1]);
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, obstacle.w, obstacle.h);
        }
        if (obstacle.drawShadow) {
          // `Stem.onDraw`'s cast shadow, measured from the top of the bottom stem.
          const depth = config.popSize * config.stemShadowDepth;
          ctx.fillStyle = config.stemShadowColor;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(obstacle.w, 0);
          ctx.lineTo(obstacle.w, depth + obstacle.w * 1.5);
          ctx.lineTo(0, depth);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        continue;
      }

      const scale = this.obstacleScale(obstacle);
      const visual = obstacle.visual;
      const sy = visual?.mirrorY === true ? -scale : scale;
      ctx.translate(obstacle.x + obstacle.w / 2, y + obstacle.h / 2);
      ctx.rotate((obstacle.rotation * Math.PI) / 180);
      ctx.scale(scale, sy);
      ctx.translate(-obstacle.w / 2, -obstacle.h / 2);
      visual?.render(ctx, obstacle.w);
      ctx.restore();
    }
  }

  private renderPlayers(ctx: CanvasRenderingContext2D, boosting: boolean): void {
    // Upstream keeps the droids GONE/INVISIBLE until play actually starts.
    if (this.phase !== 'playing' && this.phase !== 'dead') return;
    for (const player of this.players) {
      if (player.boosting !== boosting) continue;
      ctx.save();
      ctx.translate(player.x + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2);
      ctx.rotate((player.rotation * Math.PI) / 180);
      ctx.scale(player.scale, player.scale);
      ctx.translate(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2);
      drawDroid(ctx, PLAYER_SIZE, player.color);
      ctx.restore();
    }
  }

  /** `MLand.onDraw`'s `SHOW_TOUCHES` block: a 100 px disc plus a rim-to-droid trace. */
  private renderTouches(ctx: CanvasRenderingContext2D): void {
    for (const player of this.players) {
      if (player.touchX <= 0) continue;
      const cx = player.x + PLAYER_SIZE / 2;
      const cy = player.y + PLAYER_SIZE / 2;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = player.color;
      ctx.strokeStyle = player.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.touchX, player.touchY, 100, 0, Math.PI * 2);
      ctx.fill();

      const angle = Math.PI / 2 - Math.atan2(cx - player.touchX, cy - player.touchY);
      ctx.beginPath();
      ctx.moveTo(player.touchX + 100 * Math.cos(angle), player.touchY + 100 * Math.sin(angle));
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.restore();
    }
  }

  private renderHud(ctx: CanvasRenderingContext2D): void {
    const hud = this.config.hud;

    if (!hud.centered) {
      // LLand: one chip, parked at translationY = -500 (`setScoreField`) until
      // the first `start(true)` slides it down over 1500 ms, decelerating.
      if (this.hudParked) return;
      let offsetY = 0;
      if (this.hudSlideAt !== null) {
        offsetY = -500 * (1 - decelerate(clamp01((this.t - this.hudSlideAt) / 1.5)));
      }
      const player = this.players[0];
      if (player === undefined) return;
      const text = String(player.score);
      ctx.font = `400 ${hud.textSize}px system-ui, sans-serif`;
      const w = ctx.measureText(text).width + hud.padX * 2;
      const x = hud.left;
      const y = hud.top + offsetY;
      // `l_scorecard` white while playing, `l_scorecard_gameover` red once dead.
      this.chip(ctx, x, y, w, hud.chipHeight, this.gameOver ? '#FF0000' : '#FFFFFF');
      ctx.fillStyle = this.gameOver ? '#FFFFFF' : '#AAAAAA';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + w / 2, y + hud.chipHeight / 2);
      return;
    }

    const bar = this.scoreBar(ctx);
    let x = bar.chipsX;
    this.players.forEach((player, i) => {
      const w = bar.widths[i];
      // The chip background is colour-filtered SRC_ATOP with the player colour,
      // and the text is black only when that colour is bright enough.
      this.chip(ctx, x, bar.y, w, bar.h, player.color);
      ctx.fillStyle = luma(player.color) > 0.7 ? '#000000' : '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(player.score), x + w / 2, bar.y + bar.h / 2);
      x += w + hud.gap;
    });

    // The +/- buttons live in @id/player_setup and are hidden once play starts.
    if (this.phase === 'splash') {
      if (this.players.length > 1) this.drawSetupButton(ctx, bar.minusX, false);
      if (this.players.length < this.config.maxPlayers) {
        this.drawSetupButton(ctx, bar.plusX, true);
      }
    }
  }

  /** @id/player_setup: [- 48dp][@id/scores 12dp pad + chips][+ 48dp], top-centred. */
  private scoreBar(ctx: CanvasRenderingContext2D): {
    widths: number[];
    chipsX: number;
    minusX: number;
    plusX: number;
    y: number;
    h: number;
  } {
    const hud = this.config.hud;
    ctx.font = `${hud.bold ? 700 : 400} ${hud.textSize}px system-ui, sans-serif`;
    const widths = this.players.map((p) => ctx.measureText(String(p.score)).width + hud.padX * 2);
    const chipsWidth = widths.reduce((a, b) => a + b, 0) + hud.gap * Math.max(0, widths.length - 1);
    const scoresWidth = chipsWidth + 24;
    const barWidth = SETUP_BUTTON + scoresWidth + SETUP_BUTTON;
    const barX = (this.width - barWidth) / 2;
    return {
      widths,
      chipsX: barX + SETUP_BUTTON + 12,
      minusX: barX,
      plusX: barX + SETUP_BUTTON + scoresWidth,
      y: hud.top,
      h: hud.chipHeight,
    };
  }

  /** `m_plus.xml` / `m_minus.xml`: 48dp borderless buttons with 10dp padding. */
  private drawSetupButton(ctx: CanvasRenderingContext2D, x: number, plus: boolean): void {
    ctx.save();
    ctx.translate(x + SETUP_BUTTON / 2, (64 - SETUP_BUTTON) / 2 + SETUP_BUTTON / 2);
    ctx.scale(28 / 48, 28 / 48);
    ctx.translate(-24, -24);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(4, 20, 40, 8);
    if (plus) ctx.fillRect(20, 4, 8, 40);
    ctx.restore();
  }

  private chip(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
  ): void {
    const r = Math.min(this.config.hud.radius, w / 2, h / 2);
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

  private renderSplash(ctx: CanvasRenderingContext2D, now: number): void {
    if (!this.config.splash) return;
    const alpha = this.fade(this.splashFade, now);
    if (alpha <= 0.002) return;

    const { width, height } = this;
    const cx = width / 2;
    const cy = height / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    // @id/welcome: `#a0000000`.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.627)';
    ctx.fillRect(0, 0, width, height);

    // @id/play_button: 72dp, `m_ripplebg` unfocused = an #AAAAAA oval.
    ctx.fillStyle = '#AAAAAA';
    ctx.beginPath();
    ctx.arc(cx, cy, PLAY_BUTTON_R, 0, Math.PI * 2);
    ctx.fill();

    const imageAlpha = this.fade(this.playImageFade, now);
    if (imageAlpha > 0.002) {
      // @id/play_button_image: `m_play` tinted #000000, 48dp centred in the 72dp
      // button, drawn from its own 24 unit viewport.
      ctx.save();
      ctx.globalAlpha = alpha * imageAlpha;
      ctx.translate(cx - 24, cy - 24);
      ctx.scale(2, 2);
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.moveTo(8, 5);
      ctx.lineTo(8, 19);
      ctx.lineTo(19, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const textAlpha = this.fade(this.playTextFade, now);
    if (textAlpha > 0.002 && this.countdownMode) {
      // @id/play_button_text: 40dp black digits, faded in as the icon fades out.
      ctx.save();
      ctx.globalAlpha = alpha * textAlpha;
      ctx.font = '400 40px system-ui, sans-serif';
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.max(0, this.countdown)), cx, cy);
      ctx.restore();
    }

    ctx.restore();
  }

  private fade(fade: Fade, now: number): number {
    if (fade.duration <= 0) return fade.to;
    const p = clamp01((now - fade.start) / fade.duration);
    return fade.from + (fade.to - fade.from) * accelerateDecelerate(p);
  }

  private startFade(fade: Fade, to: number, duration: number, now: number): void {
    fade.from = this.fade(fade, now);
    fade.to = to;
    fade.start = now;
    fade.duration = duration;
  }

  /** Tap targets for the splash screen, in canvas coordinates. */
  splashHit(x: number, y: number): 'play' | 'minus' | 'plus' | null {
    if (this.phase !== 'splash') return null;
    if (Math.hypot(x - this.width / 2, y - this.height / 2) <= PLAY_BUTTON_R) return 'play';
    const bar = this.scoreBar(this.host.ctx);
    // INVISIBLE still occupies space, so only the enabled button is clickable.
    if (this.players.length > 1 && this.inSetupButton(x, y, bar.minusX)) return 'minus';
    if (this.players.length < this.config.maxPlayers && this.inSetupButton(x, y, bar.plusX)) {
      return 'plus';
    }
    return null;
  }

  private inSetupButton(x: number, y: number, left: number): boolean {
    const top = (64 - SETUP_BUTTON) / 2;
    return x >= left && x <= left + SETUP_BUTTON && y >= top && y <= top + SETUP_BUTTON;
  }
}

/** `MLand.luma()`, used to pick black or white score-chip text. */
function luma(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 0xff) / 255;
  const g = ((value >> 8) & 0xff) / 255;
  const b = (value & 0xff) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
