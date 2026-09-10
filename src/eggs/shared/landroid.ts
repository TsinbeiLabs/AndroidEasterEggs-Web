import type { EggContext } from '../../core/types';
import {
  dailySeed,
  f32,
  kotlinRandom,
  KotlinRandom,
  PI2_F,
  PI_F,
} from './kotlinRandom';
import { planetTextures, planetTextureSize, spaceshipLegs, spaceshipPath } from './landroidAssets';

/**
 * Landroid — the position-based-dynamics space sandbox shared by Android 14
 * (Upside Down Cake), 15 (Vanilla Ice Cream), 16 (Baklava) and 17 (Cinnamon Bun).
 *
 * Faithful to `landroid/Physics.kt`, `Universe.kt`, `Autopilot.kt`, `Namer.kt`
 * and `VisibleUniverse.kt`: a 200 000 unit universe with one non-colliding star
 * and 1-10 Keplerian planets (period = sqrt(a^3/M)*50, constrained back onto their
 * orbit each postUpdate), a 10 mass / 12 radius ship that thrusts at 1000 px/s^2
 * along its nose, gravity applied as `v += G*m1*m2/d^2*dt` (deliberately not
 * divided by the ship mass), landing when the nose is within 45 degrees of the
 * surface normal, an impact burst of ten sparks otherwise, a 10 000 point track,
 * and the Autopilot state machine (SELECTING / CHASING / APPROACHING / LANDING /
 * LAUNCHING / LANDED).
 *
 * The universe is generated with a bit-exact `kotlin.random.Random` and, like
 * `MainActivity.kt`, defaults to `dailySeed()` — so the system on screen is the
 * same one every Android device gets today, names and orbits included. Note that
 * upstream computes the body masses as `4 / 3 * PIf * r^3 * density`, and Kotlin
 * evaluates `4 / 3` as *integer* division, so the real masses are `PIf * r^3 *
 * density`; that is reproduced here because it changes every orbital period.
 *
 * Deliberate deviations: the landing test normalises `ship.angle - a` (upstream
 * takes a raw absolute difference, which makes landing impossible once the angle
 * accumulates past pi or straddles it), and HDR is clamped to SDR.
 */


const UNIVERSE_RANGE = 200000;
const NUM_PLANETS_MIN = 1;
const NUM_PLANETS_MAX = 10;
const STAR_RADIUS_MIN = 1000;

const STAR_RADIUS_MAX = 8000;
const PLANET_RADIUS_MIN = 50;
const PLANET_RADIUS_MAX = 2000;
const ORBIT_MIN = STAR_RADIUS_MAX * 2;
const ORBIT_MAX = UNIVERSE_RANGE * 0.75;
const GRAVITATION = 1e-2;
const KEPLER_CONSTANT = 50;
const PLANETARY_DENSITY = 2.5;
const STELLAR_DENSITY = 0.5;
const SPACECRAFT_MASS = 10;
const SPACECRAFT_RADIUS = 12;
const CRAFT_SPEED_LIMIT = 5000;
const MAIN_ENGINE_ACCEL = 1000;
const LAUNCH_MECO = 2;
const SCALED_THRUST = true;
const LANDING_REMOVAL_TIME = 60 * 15;

const TRACK_LENGTH = 10000;
const STAR_POINTS = 31;

/** `VisibleUniverse.kt`: all three are `true` in every version. */
const DRAW_ORBITS = true;
const DRAW_GRAVITATIONAL_FIELDS = true;

/** `Namer.kt` probabilities. */
const SUFFIX_PROB = 0.75;
const LETTER_PROB = 0.3;
const NUMBER_PROB = 0.3;
const RARE_PROB = 0.05;


const MIN_CAMERA_ZOOM = 250 / UNIVERSE_RANGE;
const MAX_CAMERA_ZOOM = 5;
/** `MAX_VALID_DT` in `Physics.kt`: the sim pauses instead of taking a huge step. */
const MAX_VALID_DT = 1;


const EIGENGRAU = '#16161D';
const EIGENGRAU2 = '#292936';
const EIGENGRAU3 = '#3C3C4F';
const EIGENGRAU4 = '#A7A7CA';
const CONSOLE = '#B7B7FF';
const FLAG = '#C6FF00';
const TRACK_COLOR = '#34A853';
const AUTOPILOT_COLOR = '#4285F4';

const STAR_CLASSES: ReadonlyArray<readonly [string, string]> = [
  ['O', '#6666FF'],
  ['B', '#CCCCFF'],
  ['A', '#EEEEFF'],
  ['F', '#FFFFFF'],
  ['G', '#FFFF66'],
  ['K', '#FFCC33'],
  ['M', '#FF8800'],
];

// `spaceshipPath` and `spaceshipLegs` come straight from `Assets.kt`.
const SHIP_PATH = spaceshipPath;
const CHEVRON = spaceshipLegs;

/**
 * `createPolygon(-3f, 3)` translated by `(-4f, 0f)` in U and by `(-5f, 0f)` from V
 * on: a triangle pointing down -x, stroked with `cornerPathEffect(1f)`.
 */
const THRUST_PATH_LEGACY = new Path2D('M-7 0 L-2.5 -2.598076 L-2.5 2.598076 Z');
const THRUST_PATH = new Path2D('M-8 0 L-3.5 -2.598076 L-3.5 2.598076 Z');

/** The landing flag: `(0,0) -> (80,0) -> (70,20) -> (60,0) -> close`, stroked. */
const FLAG_PATH = new Path2D('M0 0 L80 0 L70 20 L60 0 Z');


interface Vec2 {
  x: number;
  y: number;
}

const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
const mag = (a: Vec2): number => Math.hypot(a.x, a.y);
const angleOf = (a: Vec2): number => Math.atan2(a.y, a.x);
const polar = (angle: number, r: number): Vec2 => ({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
const unit = (a: Vec2): Vec2 => {
  const m = mag(a) || 1;
  return { x: a.x / m, y: a.y / m };
};
const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

/**
 * `mass = 4 / 3 * PIf * radius.pow(3) * DENSITY`. Kotlin evaluates `4 / 3` with
 * integer operands, so the factor that actually ships is 1, not 4/3 — reproduced
 * here because it scales every gravity impulse and orbital period.
 */
function bodyMass(radius: number, density: number): number {
  return f32(f32(PI_F * f32(Math.pow(radius, 3))) * density);
}

/** `Vec2.makeWithAngleMag(a, m) = Vec2(m * cos(a), m * sin(a))` in Float. */
function angleMag(a: number, m: number): Vec2 {
  return { x: f32(m * f32(Math.cos(a))), y: f32(m * f32(Math.sin(a))) };
}

/** Wrap an angle difference into (-pi, pi]; see the class doc for why. */
function normaliseAngle(a: number): number {
  const wrapped = (a + Math.PI) % (Math.PI * 2);
  return (wrapped < 0 ? wrapped + Math.PI * 2 : wrapped) - Math.PI;
}


/**
 * `Bag<T>` — a shuffle bag: `remaining.shuffle(rng)` on the first pull and again
 * whenever it is exhausted, so no word repeats within a cycle.
 */
class Bag<T> {
  private readonly remaining: T[];
  private readonly rng: KotlinRandom;
  private next: number;

  constructor(items: readonly T[], rng: KotlinRandom) {
    this.remaining = items.slice();
    this.rng = rng;
    this.next = this.remaining.length; // will cause a shuffle on first pull()
  }

  pull(): T {
    if (this.next >= this.remaining.length) {
      this.rng.shuffleInPlace(this.remaining);
      this.next = 0;
    }
    return this.remaining[this.next++];
  }
}

/**
 * `RandomTable<T>` — a loot table; the weights need not sum to 1 and are
 * accumulated in Float, then `x -= weight; if (x < 0f) return result`.
 */
class RandomTable<T> {
  private readonly total: number;

  constructor(
    private readonly entries: ReadonlyArray<readonly [number, T]>,
    private readonly rng: KotlinRandom,
  ) {
    this.total = entries.reduce((sum, [weight]) => f32(sum + weight), 0);
  }

  roll(): T {
    let x = this.rng.nextFloatInRange(0, this.total);
    for (const [weight, value] of this.entries) {
      x = f32(x - weight);
      if (x < 0) return value;
    }
    return this.entries[this.entries.length - 1][1];
  }
}


const PLANET_DESCRIPTORS = [
  'earthy', 'swamp', 'frozen', 'grassy', 'arid', 'crowded', 'ancient', 'lively', 'homey', 'modern',
  'boring', 'compact', 'expensive', 'polluted', 'rusty', 'sandy', 'undulating', 'verdant',
  'tessellated', 'hollow', 'scalding', 'hemispherical', 'oblong', 'oblate', 'vacuum',
  'high-pressure', 'low-pressure', 'plastic', 'metallic', 'burned-out', 'bucolic',
];

const LIFE_DESCRIPTORS = [
  'aggressive', 'passive-aggressive', 'shy', 'timid', 'nasty', 'brutish', 'short', 'absent',
  'teen-aged', 'confused', 'transparent', 'cubic', 'quadratic', 'higher-order', 'huge', 'tall',
  'wary', 'loud', 'yodeling', 'purring', 'slender', 'cats', 'adorable', 'eclectic', 'electric',
  'microscopic', 'trunkless', 'myriad', 'cantankerous', 'gargantuan', 'contagious', 'fungal',
  'cattywampus', 'spatchcocked', 'rotisserie', 'farm-to-table', 'organic', 'synthetic', 'unfocused',
  'focused', 'capitalist', 'communal', 'bossy', 'malicious', 'compliant', 'psychic', 'oblivious',
  'passive', 'bonsai',
];

const ANY_DESCRIPTORS = [
  'silly', 'dangerous', 'vast', 'invisible', 'superfluous', 'superconducting', 'superior', 'alien',
  'phantom', 'friendly', 'peaceful', 'lonely', 'uncomfortable', 'charming', 'fractal', 'imaginary',
  'forgotten', 'tardy', 'gassy', 'fungible', 'bespoke', 'artisanal', 'exceptional', 'puffy', 'rusty',
  'fresh', 'crusty', 'glossy', 'lovely', 'processed', 'macabre', 'reticulated', 'shocking', 'void',
  'undefined', 'gothic', 'beige', 'mid', 'milquetoast', 'melancholy', 'unnerving', 'cheery',
  'vibrant', 'heliotrope', 'psychedelic', 'nondescript', 'indescribable', 'tubular', 'toroidal',
  'voxellated', 'low-poly', 'low-carb', '100% cotton', 'boot-cut', 'bell-bottom', 'bumpy', 'fluffy',
  'sous-vide', 'tepid', 'upcycled', 'bedazzled', 'ancient', 'inexplicable', 'sparkling', 'still',
  'lemon-scented', 'eccentric', 'tilted', 'pungent', 'pine-scented', 'corduroy', 'overengineered',
  'bioengineered', 'impossible',
];

const ATMO_DESCRIPTORS = [
  'toxic', 'breathable', 'radioactive', 'clear', 'calm', 'peaceful', 'vacuum', 'stormy', 'freezing',
  'burning', 'humid', 'tropical', 'cloudy', 'obscured', 'damp', 'dank', 'clammy', 'frozen',
  'contaminated', 'temperate', 'moist', 'minty', 'relaxed', 'skunky', 'breezy', 'soup',
];

const PLANET_TYPES = [
  'planet', 'planetoid', 'moon', 'moonlet', 'centaur', 'asteroid', 'space garbage', 'detritus',
  'satellite', 'core', 'giant', 'body', 'slab', 'rock', 'husk', 'planemo', 'object', 'planetesimal',
  'exoplanet', 'ploonet',
];

const CONSTELLATIONS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius',
  'Capricorn', 'Aquarius', 'Pisces', 'Andromeda', 'Cygnus', 'Draco', 'Alcor', 'Calamari', 'Cuckoo',
  'Neko', 'Monoceros', 'Norma', 'Abnorma', 'Morel', 'Redlands', 'Cupcake', 'Donut', 'Eclair',
  'Froyo', 'Gingerbread', 'Honeycomb', 'Icecreamsandwich', 'Jellybean', 'Kitkat', 'Lollipop',
  'Marshmallow', 'Nougat', 'Oreo', 'Pie', 'Quincetart', 'Redvelvetcake', 'Snowcone', 'Tiramisu',
  'Upsidedowncake', 'Vanillaicecream', 'Android', 'Binder', 'Campanile', 'Dread',
];

const CONSTELLATIONS_RARE = [
  'Jandycane', 'Zombiegingerbread', 'Astro', 'Bender', 'Flan', 'Untitled-1', 'Expedit', 'Petit Four',
  'Worcester', 'Xylophone', 'Yellowpeep', 'Zebraball', 'Hutton', 'Klang', 'Frogblast', 'Exo',
  'Keylimepie', 'Nat', 'Nrp',
];

const GREEK = [
  'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda',
  'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega',
];

const SUFFIXES = [
  ...GREEK, 'Prime', 'Secundo', 'Major', 'Minor', 'Diminished', 'Augmented', 'Ultima', 'Penultima',
  'Mid', 'Proxima', 'Novis', 'Plus',
];

const SUFFIXES_RARE = [
  'Serif', 'Sans', 'Oblique', 'Grotesque', 'Handtooled', 'III “Trey”', 'Alfredo', '2.0', '(Final)',
  '(Final (Final))', '(Draft)', 'Con Carne',
];

const DELIMITERS: ReadonlyArray<readonly [number, string]> = [
  [15, ' '],
  [3, '-'],
  [1, '_'],
  [1, '/'],
  [1, '.'],
  [1, '*'],
  [1, '^'],
  [1, '#'],
  [0.1, '(^*!%@##!!'],
];

const ACTIVITIES = [
  'REFUELING', 'SIGHTSEEING', 'VACATIONING', 'LUNCHEONING', 'RECHARGING', 'TAKING UP SPACE',
  'RETICULATING SPACE SPLINES', 'USING FACILITIES', 'SPELUNKING', 'REPAIRING', 'HERDING {fauna}',
  'TAMING {fauna}', 'BREEDING {fauna}', 'SINGING LULLABIES TO {fauna}', 'SINGING LULLABIES TO {flora}',
  'SINGING LULLABIES TO THE {planet}', 'GARDENING {flora}', 'COLLECTING {flora}',
  'SURVEYING THE {planet}', 'MAPPING THE {planet}', 'BREATHING {atmo}', 'REPROCESSING {atmo}',
  'BOTTLING {atmo}',
];

const FAUNA_PLURALS = ['fauna', 'animals', 'locals', 'creatures', 'critters', 'wildlife', 'specimens', 'life', 'cells'];
const FLORA_PLURALS = ['flora', 'plants', 'flowers', 'trees', 'mosses', 'specimens', 'life', 'cells'];
const ATMO_PLURALS = ['air', 'atmosphere', 'clouds', 'atmo', 'gases'];

class Namer {
  private readonly rng: KotlinRandom;

  private readonly planets: Bag<string>;
  private readonly any: Bag<string>;
  private readonly life: Bag<string>;
  private readonly atmo: Bag<string>;
  private readonly types: Bag<string>;
  private readonly constellations: Bag<string>;
  private readonly rareConstellations: Bag<string>;
  private readonly suffixes: Bag<string>;
  private readonly rareSuffixes: Bag<string>;
  private readonly activities: Bag<string>;
  private readonly fauna: Bag<string>;
  private readonly flora: Bag<string>;
  private readonly atmoPlurals: Bag<string>;

  private readonly planetTable: RandomTable<Bag<string>>;
  private readonly lifeTable: RandomTable<Bag<string>>;
  private readonly atmoTable: RandomTable<Bag<string>>;
  private readonly constellationTable: RandomTable<Bag<string>>;
  private readonly suffixTable: RandomTable<Bag<string>>;
  private readonly delimiterTable: RandomTable<string>;

  constructor(rng: KotlinRandom) {

    this.rng = rng;
    this.planets = new Bag(PLANET_DESCRIPTORS, rng);
    this.any = new Bag(ANY_DESCRIPTORS, rng);
    this.life = new Bag(LIFE_DESCRIPTORS, rng);
    this.atmo = new Bag(ATMO_DESCRIPTORS, rng);
    this.types = new Bag(PLANET_TYPES, rng);
    this.constellations = new Bag(CONSTELLATIONS, rng);
    this.rareConstellations = new Bag(CONSTELLATIONS_RARE, rng);
    this.suffixes = new Bag(SUFFIXES, rng);
    this.rareSuffixes = new Bag(SUFFIXES_RARE, rng);
    this.activities = new Bag(ACTIVITIES, rng);
    this.fauna = new Bag(FAUNA_PLURALS, rng);
    this.flora = new Bag(FLORA_PLURALS, rng);
    this.atmoPlurals = new Bag(ATMO_PLURALS, rng);

    this.planetTable = new RandomTable(
      [
        [0.75, this.planets],
        [0.25, this.any],
      ],
      rng,
    );
    this.lifeTable = new RandomTable(
      [
        [0.75, this.life],
        [0.25, this.any],
      ],
      rng,
    );
    this.atmoTable = new RandomTable(
      [
        [0.75, this.atmo],
        [0.25, this.any],
      ],
      rng,
    );
    this.constellationTable = new RandomTable(
      [
        [0.05, this.rareConstellations],
        [0.95, this.constellations],
      ],
      rng,
    );
    this.suffixTable = new RandomTable(
      [
        [0.05, this.rareSuffixes],
        [0.95, this.suffixes],
      ],
      rng,
    );
    this.delimiterTable = new RandomTable(DELIMITERS, rng);
  }

  describePlanet(): string {
    return `${this.planetTable.roll().pull()} ${this.types.pull()}`;
  }

  describeLife(): string {
    return this.lifeTable.roll().pull();
  }

  describeAtmo(): string {
    return this.atmoTable.roll().pull();
  }

  describeActivity(target: Planet | null): string {
    return this.activities
      .pull()
      .replace(/\{(flora|fauna|planet|atmo)\}/g, (_m, kind: string) => {
        switch (kind) {
          case 'flora':
            return `${target?.flora ?? 'SOME'} ${this.flora.pull()}`;
          case 'fauna':
            return `${target?.fauna ?? 'SOME'} ${this.fauna.pull()}`;
          case 'atmo':
            return `${target?.atmosphere ?? 'SOME'} ${this.atmoPlurals.pull()}`;
          default:
            return target?.description ?? 'SOME BODY';
        }
      });
  }

  nameSystem(): string {
    let name = this.constellationTable.roll().pull();
    // Every probability test upstream is `nextFloat() <= PROB`, not `<`.
    if (this.rng.nextFloat() <= SUFFIX_PROB) {
      name += this.delimiterTable.roll() + this.suffixTable.roll().pull();
      if (this.rng.nextFloat() <= RARE_PROB) name += ` ${this.rareSuffixes.pull()}`;
    }
    if (this.rng.nextFloat() <= LETTER_PROB) {
      name += this.delimiterTable.roll() + String.fromCharCode(65 + this.rng.nextIntFrom(0, 26));
      if (this.rng.nextFloat() <= RARE_PROB) name += this.delimiterTable.roll();
    }
    if (this.rng.nextFloat() <= NUMBER_PROB) {
      name += this.delimiterTable.roll() + String(this.rng.nextIntFrom(2, 5039));
    }
    return name;
  }

}

interface Body {
  pos: Vec2;
  opos: Vec2;
  velocity: Vec2;
  mass: number;
  radius: number;
  angle: number;
  collides: boolean;
  name: string;
}

interface Planet extends Body {
  kind: 'planet';
  orbitRadius: number;
  orbitCenter: Vec2;
  speed: number;
  color: string;
  description: string;
  atmosphere: string;
  flora: string;
  fauna: string;
  explored: boolean;
}

interface Star extends Body {
  kind: 'star';
  cls: string;
  color: string;
  anim: number;
}

interface Spark extends Body {
  kind: 'spark';
  style: 'DOT' | 'RING';
  size: number;
  color: string;
  ttl: number;
  lifetime: number;
}

interface Spacecraft extends Body {
  kind: 'ship';
  thrust: Vec2;
  transit: boolean;
  landing: Landing | null;
  launchClock: number;
  track: Array<[number, number, number]>;
}

interface Landing {
  ship: Spacecraft | null;
  planet: Planet;
  angle: number;
  text: string;
  lifetime: number;
}

export interface LandroidConfig {
  /** Dessert code used in the system designation, e.g. "UDC", "VIC", "BKL". */
  dessertCode: string;
  /** Autopilot exists from Android 15 on (only enabled in Baklava's UI). */
  autopilot: boolean;
  /** Baklava exposes an AUTO console button. */
  autoButton: boolean;
  /**
   * Android 14 is the lean first cut: no landing fuse, no legs, no flag (a red X
   * instead), a `Color.Green` track, `Spark(size = 3f)` drawn as a fixed ring, a
   * `-3f` thrust polygon at `(-4, 0)`, `ALT` measured from the planet centre and
   * `THR` only shown while thrusting.
   */
  legacy: boolean;
  /** Planet colour source: Eigengrau4 (U/V/Baklava) or `hsv(radius % 360, .75, 1)` (CB). */
  hsvPlanets: boolean;
  /**
   * Gravity field rings: 8 static ones from `lerp(200f, 0.01f, i/8)` at alpha
   * `lerp(0.5f, 0.1f, ...)` through Baklava; Android 17 switches to 10 rings from
   * `lerp(2000f, 0.01f, (i - now % 1f)/10)` at alpha `lerp(0.75f, 0.1f, ...)`, so
   * they visibly pulse outward once per simulated second.
   */
  gravityRings: number;
  gravityForceMax: number;
  gravityAlphaMax: number;
  gravityAnimated: boolean;
  /**
   * Android 17: "things get a little more interesting once you've discovered a
   * planet" — the rim stays Eigengrau4 until landed on, the orbit ring becomes
   * Eigengrau3, and an explored planet within 10 000 units at zoom > 0.05 gets a
   * texture from `Assets.kt` picked by its radius.
   */
  exploredPlanetArt: boolean;
  orbitColour: string;
  defaultZoom: number;
  dynamicZoom: boolean;
}

/** `Color.hsv(h, s, v)` -> CSS rgb, so Cinnamon Bun's planets match Android. */
function hsvToCss(h: number, s: number, v: number): string {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = v - c;
  const [r1, g1, b1] =
    hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  const to255 = (n: number): number => Math.round((n + m) * 255);
  return `rgb(${to255(r1)}, ${to255(g1)}, ${to255(b1)})`;
}


export class Landroid {
  private readonly context: EggContext;
  private readonly config: LandroidConfig;
  private rng: KotlinRandom;
  seed: number;


  private star!: Star;
  private planets: Planet[] = [];
  private ship!: Spacecraft;
  private sparks: Spark[] = [];
  private landing: Landing | null = null;
  private namer!: Namer;
  private systemName = '';

  private now = 0;
  private zoom: number;
  private center: Vec2 = { x: 0, y: 0 };
  private panning = false;
  private autoZoom = false;

  private thrusting = false;
  private thrustLatch = false;
  private pointerThrust = false;
  private lastPointer: [number, number] | null = null;
  private pinchDistance: number | null = null;
  private pinchMid: [number, number] | null = null;

  private autopilotEnabled = false;
  private autopilotTarget: Planet | null = null;
  private autopilotStrategy = 'SELECTING...';
  private autopilotDebug = '';
  private nextStrategyTime = 0;
  private brakingDistance = 0;
  private leadingPos: Vec2 = { x: 0, y: 0 };
  private landingAltitude = 0;

  private latestDiscovery: Planet | null = null;


  private buttons: Array<{ id: string; x: number; y: number; w: number; h: number; label: string }> = [];
  private wasDown = false;

  constructor(context: EggContext, config: LandroidConfig, seed?: number) {
    this.context = context;
    this.config = config;
    // `RANDOM_SEED_TYPE = Daily`: every Android device gets the same system today.
    this.seed = seed ?? dailySeed();
    this.rng = kotlinRandom(this.seed);
    this.zoom = config.defaultZoom;
    this.initRandom();
  }

  private initRandom(): void {
    const rng = this.rng;
    this.namer = new Namer(rng);
    const systemName = this.namer.nameSystem();
    this.systemName = systemName;

    const cls = rng.choose(STAR_CLASSES);
    const starRadius = rng.nextFloatInRange(STAR_RADIUS_MIN, STAR_RADIUS_MAX);
    const starMass = bodyMass(starRadius, STELLAR_DENSITY);
    this.star = {
      kind: 'star',
      pos: { x: 0, y: 0 },
      opos: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      mass: starMass,
      radius: starRadius,
      angle: 0,
      collides: false,
      // `star.name = systemName` — no suffix.
      name: systemName,
      cls: cls[0],
      color: cls[1],
      anim: 0,
    };

    const count = rng.nextIntFrom(NUM_PLANETS_MIN, NUM_PLANETS_MAX + 1);
    this.planets = [];
    for (let i = 0; i < count; i++) {
      const radius = rng.nextFloatInRange(PLANET_RADIUS_MIN, PLANET_RADIUS_MAX);
      // `lerp(PLANET_ORBIT_RANGE.start, .endInclusive, rng.nextFloat().pow(1f))`
      const orbitRadius = f32(ORBIT_MIN + f32(f32(ORBIT_MAX - ORBIT_MIN) * rng.nextFloat()));

      // Kepler's third law: `sqrt(orbitRadius.pow(3f) / star.mass) * KEPLER_CONSTANT`
      const period = f32(
        f32(Math.sqrt(f32(f32(Math.pow(orbitRadius, 3)) / starMass))) * KEPLER_CONSTANT,
      );
      const speed = f32(f32(f32(2 * PI_F) * orbitRadius) / period);

      const pos = angleMag(f32(rng.nextFloat() * PI2_F), orbitRadius);
      const hue = f32(radius % 360);
      this.planets.push({
        kind: 'planet',
        pos,
        opos: { ...pos },
        velocity: { x: 0, y: 0 },
        mass: bodyMass(radius, PLANETARY_DENSITY),
        radius,
        angle: 0,
        collides: true,
        name: '',
        orbitRadius,
        orbitCenter: { x: 0, y: 0 },
        speed,
        color: this.config.hsvPlanets ? hsvToCss(hue, 0.75, 1) : EIGENGRAU4,
        description: this.namer.describePlanet(),
        atmosphere: this.namer.describeAtmo(),
        flora: this.namer.describeLife(),
        fauna: this.namer.describeLife(),
        explored: false,
      });
    }

    this.planets.sort((a, b) => mag(a.pos) - mag(b.pos));
    this.planets.forEach((planet, i) => {
      planet.name = `${systemName} ${i + 1}`;
    });

    const shipPos = angleMag(
      f32(rng.nextFloat() * PI2_F),
      rng.nextFloatInRange(ORBIT_MIN, ORBIT_MAX),
    );
    this.ship = {
      kind: 'ship',
      pos: shipPos,
      opos: { ...shipPos },
      velocity: { x: 0, y: 0 },
      mass: SPACECRAFT_MASS,
      radius: SPACECRAFT_RADIUS,
      angle: f32(rng.nextFloat() * PI2_F),
      collides: true,
      name: 'Landroid',
      thrust: { x: 0, y: 0 },
      transit: false,
      landing: null,
      launchClock: 0,
      track: [],
    };

    this.now = 0;
    this.sparks = [];
    this.landing = null;
    this.latestDiscovery = null;
    this.autopilotTarget = null;
    this.autopilotStrategy = 'SELECTING...';
    this.autopilotDebug = '';
    this.nextStrategyTime = 0;
    this.brakingDistance = 0;
    this.zoom = this.config.defaultZoom;
    this.panning = false;
  }

  /** `RandomSeedType.Evergreen`: `Random.Default.nextLong().mod(10_000_000)`. */
  reroll(): void {
    this.setSeed(Math.floor(Math.random() * 10000000));
  }

  /** Rebuild the universe from an explicit seed — paste an Android one to match it. */
  setSeed(seed: number): void {
    this.seed = Math.abs(Math.trunc(seed));
    this.rng = kotlinRandom(this.seed);
    this.autopilotEnabled = false;
    this.autoZoom = false;
    this.initRandom();
  }


  get designation(): string {
    return `${this.config.dessertCode}-${this.seed % 100000}`;
  }

  closestPlanet(): Planet | Star {
    let best: Planet | Star = this.star;
    let bestD = mag(sub(this.ship.pos, this.star.pos));
    for (const planet of this.planets) {
      const d = mag(sub(this.ship.pos, planet.pos));
      if (d < bestD) {
        bestD = d;
        best = planet;
      }
    }
    return best;
  }

  setThrust(on: boolean): void {
    this.thrusting = on;
  }

  toggleAutopilot(): void {
    if (!this.config.autopilot) return;
    this.autopilotEnabled = !this.autopilotEnabled;
    this.autoZoom = this.autopilotEnabled;
    if (!this.autopilotEnabled) {
      this.ship.thrust = { x: 0, y: 0 };
      this.autopilotStrategy = '';
    }
  }

  zoomBy(factor: number): void {
    this.setZoom(this.zoom * factor);
  }

  setZoom(zoom: number): void {
    this.zoom = Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, zoom));
    this.autoZoom = false;
  }

  panBy(dx: number, dy: number): void {
    this.center.x -= dx / this.zoom;
    this.center.y -= dy / this.zoom;
    this.panning = true;
    this.autoZoom = false;
  }

  resetPan(): void {
    this.panning = false;
  }

  private expSmooth(current: number, target: number, dt: number, speed = 5): number {
    return current + (target - current) * (1 - Math.exp(-dt * speed));
  }

  update(dtSeconds: number): void {
    // `Simulator.step`: `if (firstFrame || dt > MAX_VALID_DT) return` — and every
    // `Body.update`/`postUpdate` bails on `dt <= 0`, which also keeps the
    // `velocity = (pos - opos) / dt` recomputation from dividing by zero on the
    // duplicate timestamps requestAnimationFrame can hand out.
    if (!(dtSeconds > 0) || dtSeconds > MAX_VALID_DT) return;
    const dt = dtSeconds;
    this.now += dt;

    this.handleInput(dt);
    // position-based dynamics approach:
    // 1. apply acceleration to velocity, save positions, apply velocity to position
    this.updateAll(dt);
    // 2. solve all constraints
    this.solveAll(dt);
    // 3. compute new velocities from updated positions and saved positions
    this.postUpdateAll(dt);
    this.updateCamera(dt);
  }


  private handleInput(dt: number): void {
    const { keys, pointer, pointers } = this.context;
    const consoleTop = this.context.height - 34 - 20;

    const rotate = (keys.has('ArrowLeft') ? -1 : 0) + (keys.has('ArrowRight') ? 1 : 0);
    if (rotate !== 0) this.ship.angle += rotate * 2.4 * dt;

    const down = pointers.filter((item) => item.down);
    // Two or more fingers drive the camera instead of the engine. Upstream only
    // enables `TOUCH_CAMERA_ZOOM`/`TOUCH_CAMERA_PAN` in U, but a page you cannot
    // pinch on a phone is worse than the difference.
    const gesturing = down.length >= 2;

    if (gesturing) {
      this.pointerThrust = false;
      const [a, b] = down;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const mid: [number, number] = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      if (this.pinchDistance !== null && this.pinchDistance > 1) {
        this.setZoom(this.zoom * (distance / this.pinchDistance));
      }
      if (this.pinchMid !== null) {
        this.panBy(mid[0] - this.pinchMid[0], mid[1] - this.pinchMid[1]);
      }
      this.pinchDistance = distance;
      this.pinchMid = mid;
    } else {
      this.pinchDistance = null;
      this.pinchMid = null;

      if (pointer.down && !this.wasDown) {
        if (pointer.y < consoleTop && !this.overButton(pointer.x, pointer.y)) {
          this.pointerThrust = true;
        } else {
          this.hitButton(pointer.x, pointer.y);
        }
      }
      if (!pointer.down) this.pointerThrust = false;

      // Shift-drag pans the camera; otherwise the view follows the ship.
      if (
        pointer.down &&
        (keys.has('ShiftLeft') || keys.has('ShiftRight')) &&
        this.lastPointer !== null
      ) {
        this.panBy(pointer.x - this.lastPointer[0], pointer.y - this.lastPointer[1]);
      }
    }
    this.lastPointer = [pointer.x, pointer.y];

    const auto = this.autopilotEnabled && this.config.autopilot;
    const wantThrust = !gesturing && (this.thrustLatch || this.pointerThrust || keys.has('Space'));
    this.thrusting = wantThrust;
    this.ship.thrust = auto ? this.ship.thrust : wantThrust ? polar(this.ship.angle, 1) : { x: 0, y: 0 };
    this.wasDown = pointer.down;
  }


  private overButton(x: number, y: number): boolean {
    return this.buttons.some(
      (button) => x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h,
    );
  }

  private hitButton(x: number, y: number): void {
    for (const button of this.buttons) {
      if (x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h) {
        switch (button.id) {
          case 'left':
            this.ship.angle -= 0.35;
            break;
          case 'right':
            this.ship.angle += 0.35;
            break;
          case 'thrust':
            this.thrustLatch = !this.thrustLatch;
            this.context.toast(this.thrustLatch ? '主引擎持续点火' : '主引擎关闭', 1.2);
            break;
          case 'auto':
            this.toggleAutopilot();
            this.context.toast(this.autopilotEnabled ? '---- AUTOPILOT ENGAGED ----' : '自动驾驶关闭', 1.6);
            break;
          case 'zoom-in':
            this.setZoom(this.zoom * 1.6);
            break;
          case 'zoom-out':
            this.setZoom(this.zoom / 1.6);
            break;
          case 'follow':
            this.resetPan();
            break;
          case 'reroll':
            this.reroll();
            break;
        }
        return;
      }
    }
  }

  /**
   * `Universe.updateAll`: gravity first (from last frame's body positions), then
   * the entities in insertion order — planets, star, ship, autopilot.
   */
  private updateAll(dt: number): void {
    const ship = this.ship;

    // check for passing in front of the sun
    ship.transit = false;
    for (const body of [...this.planets, this.star]) {
      const vector = sub(body.pos, ship.pos);
      const d = mag(vector);
      if (d < body.radius) {
        if (body.kind === 'star') ship.transit = true;
      } else if (this.now > ship.launchClock + LAUNCH_MECO) {
        // within MECO sec of launch, no gravity at all
        // $ f_g = G * m1 * m2 * 1/d^2 $ — note: never divided by the ship mass
        const impulse = (GRAVITATION * (ship.mass * body.mass)) / (d * d);
        ship.velocity = add(ship.velocity, mul(angleMag(angleOf(vector), impulse), dt));
      }
    }

    // Planet.update: constrained to a circle at constant linear speed.
    for (const planet of this.planets) {
      const orbitAngle = angleOf(sub(planet.pos, planet.orbitCenter));
      planet.velocity = polar(orbitAngle + Math.PI / 2, planet.speed);
      planet.opos = planet.pos;
      planet.pos = add(planet.pos, mul(planet.velocity, dt));
    }

    // Star.update: only drives the corona rotation.
    this.star.anim += dt;

    // Spacecraft.update
    const thrustMag = mag(ship.thrust);
    if (thrustMag > 0) {
      let deltaV = MAIN_ENGINE_ACCEL * dt;
      if (SCALED_THRUST) deltaV *= Math.min(1, Math.max(0, thrustMag));
      if (ship.landing !== null) {
        // launch clock is 1 second long
        if (ship.launchClock === 0) ship.launchClock = this.now + 1;
        if (this.now > ship.launchClock) {
          ship.landing.ship = null;
          ship.landing = null;
          this.landing = null;
        } else {
          deltaV = 0;
        }
      }
      // note that we always thrust in the forward direction
      ship.velocity = add(ship.velocity, angleMag(ship.angle, deltaV));
    } else if (ship.launchClock !== 0) {
      ship.launchClock = 0;
    }

    // apply global speed limit
    if (mag(ship.velocity) > CRAFT_SPEED_LIMIT) {
      ship.velocity = angleMag(angleOf(ship.velocity), CRAFT_SPEED_LIMIT);
    }

    ship.opos = ship.pos;
    ship.pos = add(ship.pos, mul(ship.velocity, dt));

    // Spark.update: integrate, then tick the fuse.
    for (const spark of this.sparks) {
      spark.opos = spark.pos;
      spark.pos = add(spark.pos, mul(spark.velocity, dt));
      spark.lifetime -= dt;
    }

    if (this.config.autopilot) this.updateAutopilot(dt);
  }

  private solveAll(dt: number): void {
    const ship = this.ship;

    if (ship.landing === null) {
      const closest = this.closestPlanet();
      if (closest.collides) {
        const planet = closest as Planet;
        const vector = sub(ship.pos, planet.pos);
        const d = mag(vector) - ship.radius - planet.radius;
        const a = angleOf(vector);

        if (d < 0) {
          // landing, or impact?
          // 1. relative speed (computed upstream but unused: the check is commented out)
          // 2. landing angle
          const aDiff = Math.abs(normaliseAngle(ship.angle - a));
          if (aDiff < Math.PI / 4) {
            const landing: Landing = {
              ship,
              planet,
              angle: a,
              text: this.config.legacy ? '' : this.namer.describeActivity(planet),
              lifetime: LANDING_REMOVAL_TIME,
            };
            if (mag(ship.thrust) !== 0) ship.thrust = { x: 0, y: 0 }; // kill the power
            ship.landing = landing;
            ship.velocity = planet.velocity;
            this.landing = landing;
            planet.explored = true;
            this.latestDiscovery = planet;
            navigator.vibrate?.(30);
            this.context.toast(`着陆：${planet.name}`, 2);
          } else {
            const impact = add(planet.pos, polar(a, planet.radius));
            ship.pos = add(planet.pos, polar(a, planet.radius + ship.radius - d));
            for (let i = 0; i < 10; i++) {
              const ttl = this.rng.nextFloatInRange(0.5, 2);
              const at = add(
                impact,
                angleMag(this.rng.nextFloatInRange(0, 2 * PI_F), this.rng.nextFloatInRange(0.1, 0.5)),
              );
              this.sparks.push({
                kind: 'spark',
                pos: at,
                opos: { ...at },
                velocity: add(
                  mul(ship.velocity, 0.8),
                  angleMag(
                    this.rng.nextFloatInRange(0, 2 * PI_F),
                    this.rng.nextFloatInRange(0.1, 0.5),
                  ),
                ),
                mass: 1,
                radius: 1,
                angle: 0,
                collides: true,
                name: 'Spark',
                style: 'DOT',
                size: 1,
                color: '#FFFFFF',
                ttl,
                lifetime: ttl,
              });
            }
            navigator.vibrate?.([0, 60, 40, 60]);
            this.context.toast(`撞击：${planet.name}`, 2);
          }
        }
      }
    }

    // `Container(UNIVERSE_RANGE)` — added before any Landing, so it solves first.
    const fence = mag(ship.pos) + ship.radius;
    if (fence > UNIVERSE_RANGE) {
      ship.pos = angleMag(angleOf(ship.pos), UNIVERSE_RANGE - ship.radius);
    }

    // `Landing.solve` — a soft 50 % projection (marked `@@@ FIXME` upstream).
    const landing = this.landing;
    if (landing !== null) {
      if (landing.ship !== null) {
        const desired = add(
          landing.planet.pos,
          angleMag(landing.angle, ship.radius + landing.planet.radius),
        );
        ship.pos = add(mul(ship.pos, 0.5), mul(desired, 0.5));
        ship.angle = landing.angle;
      }
      if (!this.config.legacy) {
        // `Fuse(LANDING_REMOVAL_TIME)` only exists from V on; U's landing never expires.
        landing.lifetime -= dt;
        if (landing.lifetime < 0 || landing.ship === null) {
          this.landing = null;
          ship.landing = null;
        }
      } else if (landing.ship === null) {
        this.landing = null;
        ship.landing = null;
      }
    }
  }

  private postUpdateAll(dt: number): void {
    // Planet.postUpdate: snap back onto the orbit circle.
    for (const planet of this.planets) {
      const angle = angleOf(sub(planet.pos, planet.orbitCenter));
      planet.pos = add(planet.orbitCenter, polar(angle, planet.orbitRadius));
      planet.velocity = mul(sub(planet.pos, planet.opos), 1 / dt);
    }

    const ship = this.ship;
    ship.velocity = mul(sub(ship.pos, ship.opos), 1 / dt);

    // Spacecraft.postUpdate — "special effects all need to be added after the
    // simulation step so they have the correct position of the ship".
    // `Track.add` drops two entries once it reaches TRACK_LENGTH - 1 (an upstream
    // off-by-one, so the deque never actually holds 10 000).
    if (ship.track.length >= TRACK_LENGTH - 1) ship.track.splice(0, 2);
    ship.track.push([ship.pos.x, ship.pos.y, ship.angle]);

    const thrustMag = mag(ship.thrust);
    if (this.rng.nextFloat() < thrustMag) {
      const ttl = this.rng.nextFloatInRange(0.5, 1);
      this.sparks.push({
        kind: 'spark',
        pos: { ...ship.pos },
        opos: { ...ship.pos },
        velocity: add(
          ship.velocity,
          angleMag(
            ship.angle + this.rng.nextFloatInRange(-0.2, 0.2),
            -MAIN_ENGINE_ACCEL * thrustMag * 10 * dt,
          ),
        ),
        mass: 1,
        radius: 1,
        angle: 0,
        collides: true,
        name: 'Spark',
        style: 'RING',
        size: this.config.legacy ? 3 : 1,
        color: 'rgba(255,255,255,0.25)',
        ttl,
        lifetime: ttl,
      });
    }

    for (const spark of this.sparks) {
      spark.velocity = mul(sub(spark.pos, spark.opos), 1 / dt);
    }
    this.sparks = this.sparks.filter((spark) => spark.lifetime >= 0);
  }


  private updateAutopilot(dt: number): void {
    if (!this.autopilotEnabled) return;
    const ship = this.ship;
    if (this.now < this.nextStrategyTime) return;

    if (ship.landing !== null) {
      if (this.autopilotTarget !== null) {
        this.autopilotStrategy = 'LANDED';
        this.autopilotTarget = null;
        this.landingAltitude = 0;
        this.nextStrategyTime = this.now + 15;
      } else {
        ship.thrust = polar(ship.angle, 1);
        this.autopilotStrategy = 'LAUNCHING';
        this.nextStrategyTime = this.now + 5;
      }
      return;
    }

    let target = this.autopilotTarget;
    if (target === null) {
      const sorted = this.planets.slice().sort((a, b) => mag(sub(a.pos, ship.pos)) - mag(sub(b.pos, ship.pos)));
      // `planets.random()` upstream goes through `Random.Default`, not the universe
      // rng, so this branch is deliberately not seed-deterministic either.
      target = sorted.find((planet) => !planet.explored) ?? sorted[Math.floor(Math.random() * sorted.length)] ?? null;

      this.autopilotTarget = target;
      this.brakingDistance = 0;
      this.autopilotStrategy = 'SELECTING...';
    }
    if (target === null) return;

    const targetVector = sub(target.pos, ship.pos);
    const altitude = mag(targetVector) - target.radius;
    this.landingAltitude = Math.min(target.radius, 100);

    const relativeV = sub(ship.velocity, target.velocity);
    const projection = dot(relativeV, unit(targetVector));
    const relativeSpeed = mag(relativeV) * Math.sign(projection || 1);
    const timeToTarget = relativeSpeed === 0 ? 1000 : altitude / relativeSpeed;

    const newBraking = 5 * (relativeSpeed > 0 ? relativeSpeed : MAIN_ENGINE_ACCEL);
    this.brakingDistance = this.expSmooth(this.brakingDistance, newBraking, dt, 5);

    this.leadingPos = add(
      target.pos,
      polar(angleOf(target.velocity), Math.min(altitude / 2, mag(target.velocity))),
    );
    const leadingVector = sub(this.leadingPos, ship.pos);

    const previous = this.autopilotStrategy;
    if (altitude < this.landingAltitude) {
      ship.angle = angleOf(sub(ship.pos, target.pos));
      ship.thrust = { x: 0, y: 0 };
      this.autopilotStrategy = 'LANDING';
    } else if (relativeSpeed < 0 || altitude > this.brakingDistance) {
      ship.angle = angleOf(leadingVector);
      ship.thrust = polar(ship.angle, 1);
      this.autopilotStrategy = 'CHASING';
    } else {
      ship.angle = angleOf(mul(ship.velocity, -1));
      const decel = relativeSpeed / timeToTarget;
      ship.thrust = polar(ship.angle, (decel / MAIN_ENGINE_ACCEL) * 0.9);
      this.autopilotStrategy = 'APPROACHING';
    }
    this.autopilotDebug = `DV=${relativeSpeed.toFixed(0)} D=${altitude.toFixed(0)} T${timeToTarget >= 0 ? '+' : ''}${timeToTarget.toFixed(1)}`;
    if (previous !== this.autopilotStrategy) this.nextStrategyTime = this.now + 0.5;
  }

  private updateCamera(dt: number): void {
    const closest = this.closestPlanet();
    const distToSurface = Math.max(0, mag(sub(this.ship.pos, closest.pos)) - closest.radius * 1.2);
    const targetZoom = this.autoZoom || this.config.dynamicZoom
      ? Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, 500 / Math.max(1, distToSurface)))
      : this.zoom;
    if (this.autoZoom || this.config.dynamicZoom) {
      this.zoom = this.expSmooth(this.zoom, targetZoom, dt, 1.5);
    }
    if (!this.panning) this.center = { ...this.ship.pos };
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.context;
    ctx.fillStyle = EIGENGRAU;
    ctx.fillRect(0, 0, width, height);

    const zoom = this.zoom;
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-this.center.x, -this.center.y);

    // `drawUniverse` order: constraints (Landing -> flag, Container -> ringfence),
    // star, then the other entities, autopilot, and finally the spacecraft — which
    // draws its own track last.
    this.drawGrid(ctx, zoom, width, height);
    if (this.landing !== null) this.drawLanding(ctx, zoom);
    this.drawRingfence(ctx, zoom);
    this.drawStar(ctx, zoom);
    for (const spark of this.sparks) this.drawSpark(ctx, zoom, spark);
    for (const planet of this.planets) this.drawPlanet(ctx, zoom, planet);
    if (this.config.autopilot && this.autopilotEnabled && this.autopilotTarget !== null) {
      this.drawAutopilot(ctx, zoom);
    }
    this.drawShip(ctx, zoom);
    this.drawTrack(ctx, zoom);
    ctx.restore();


    this.drawConsole(ctx);
    this.drawTelemetry(ctx);
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    zoom: number,
    width: number,
    height: number,
  ): void {
    let gridStep = 1000;
    while (gridStep * zoom < 32) gridStep *= 10;

    const left = this.center.x - width / 2 / zoom;
    const top = this.center.y - height / 2 / zoom;
    const right = left + width / zoom;
    const bottom = top + height / zoom;

    // Upstream strokes every grid line separately, `3f` wide on the decades and
    // `1.5f` elsewhere; one path per weight reproduces that on a canvas.
    ctx.strokeStyle = EIGENGRAU2;
    for (const major of [false, true]) {
      ctx.lineWidth = (major ? 3 : 1.5) / zoom;
      ctx.beginPath();
      for (let x = Math.floor(left / gridStep) * gridStep; x < right; x += gridStep) {
        if ((x % (gridStep * 10) === 0) !== major) continue;
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
      }
      for (let y = Math.floor(top / gridStep) * gridStep; y < bottom; y += gridStep) {
        if ((y % (gridStep * 10) === 0) !== major) continue;
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
      }
      ctx.stroke();
    }
  }


  private drawRingfence(ctx: CanvasRenderingContext2D, zoom: number): void {
    ctx.save();
    ctx.strokeStyle = '#800000';
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([8 / zoom, 8 / zoom]);
    ctx.beginPath();
    ctx.arc(0, 0, UNIVERSE_RANGE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * `drawGravitationalField(planet, now)`: ten (eight before Android 17) rings at
   * the distance where the pull on the ship equals `force` newtons. Android 17
   * offsets the index by `now % 1`, so the rings crawl outwards once a second.
   */
  private gravityField(ctx: CanvasRenderingContext2D, zoom: number, mass: number): void {
    const { gravityRings: rings, gravityForceMax, gravityAlphaMax, gravityAnimated } = this.config;
    const phase = gravityAnimated ? this.now % 1 : 0;
    ctx.lineWidth = 2 / zoom;
    for (let i = 0; i < rings; i++) {
      const force = gravityForceMax + (0.01 - gravityForceMax) * ((i - phase) / rings);
      if (force <= 0) continue;
      const r = Math.sqrt((GRAVITATION * mass * SPACECRAFT_MASS) / force);
      ctx.strokeStyle = `rgba(255, 0, 0, ${(gravityAlphaMax + (0.1 - gravityAlphaMax) * (i / rings)).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawStar(ctx: CanvasRenderingContext2D, zoom: number): void {
    const star = this.star;
    ctx.save();
    ctx.translate(star.pos.x, star.pos.y);

    this.gravityField(ctx, zoom, star.mass);

    ctx.fillStyle = star.color;
    ctx.beginPath();
    ctx.arc(0, 0, star.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = star.color;
    ctx.lineWidth = 3 / zoom;
    // `cornerPathEffect(200f)` rounds every spike; a round join is the cheap stand-in.
    ctx.lineJoin = 'round';
    const corona = (r1: number, r2: number, points: number, rotation: number) => {
      ctx.save();
      ctx.rotate(rotation);
      ctx.beginPath();
      const step = (Math.PI * 2) / points;
      ctx.moveTo(r1, 0);
      ctx.lineTo(Math.cos(step * 0.5) * r2, Math.sin(step * 0.5) * r2);
      for (let i = 1; i < points; i++) {
        ctx.lineTo(Math.cos(step * i) * r1, Math.sin(step * i) * r1);
        ctx.lineTo(Math.cos(step * (i + 0.5)) * r2, Math.sin(step * (i + 0.5)) * r2);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    };
    corona(star.radius + 80, star.radius + 250, STAR_POINTS, (star.anim / 23) * PI2_F);
    corona(star.radius + 20, star.radius + 200, STAR_POINTS + 1, (star.anim / -19) * PI2_F);
    ctx.restore();
  }

  private drawPlanet(ctx: CanvasRenderingContext2D, zoom: number, planet: Planet): void {
    // New in Android 17: an unexplored planet keeps the Eigengrau4 rim.
    const drawColour =
      this.config.exploredPlanetArt && !planet.explored ? EIGENGRAU4 : planet.color;

    ctx.save();
    if (DRAW_ORBITS) {
      ctx.strokeStyle = this.config.orbitColour;
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.arc(
        planet.orbitCenter.x,
        planet.orbitCenter.y,
        mag(sub(planet.pos, planet.orbitCenter)),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }

    ctx.translate(planet.pos.x, planet.pos.y);
    if (DRAW_GRAVITATIONAL_FIELDS) this.gravityField(ctx, zoom, planet.mass);

    ctx.fillStyle = EIGENGRAU;
    ctx.beginPath();
    ctx.arc(0, 0, planet.radius, 0, Math.PI * 2);
    ctx.fill();

    // "if you're close enough, you get to see the planet texture after you've
    // discovered it" — the art is chosen from the radius, not the RNG.
    if (
      this.config.exploredPlanetArt &&
      planet.explored &&
      zoom > 0.05 &&
      mag(sub(planet.pos, this.ship.pos)) < 10000
    ) {
      const textureScale = planet.radius / (planetTextureSize / 2);
      const textureRot = (PI2_F * (planet.radius % 100)) / 100;
      const art =
        planetTextures[Math.floor(((planet.radius % 17) / 17) * planetTextures.length)];
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, planet.radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.rotate(textureRot);
      ctx.translate(-planet.radius, -planet.radius);
      ctx.scale(textureScale, textureScale);
      ctx.strokeStyle = drawColour;
      ctx.lineWidth = 1 / zoom / textureScale;
      ctx.stroke(art);
      ctx.restore();
    }

    ctx.strokeStyle = drawColour;
    ctx.lineWidth = 2 / zoom;
    ctx.beginPath();
    ctx.arc(0, 0, planet.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawSpark(ctx: CanvasRenderingContext2D, zoom: number, spark: Spark): void {
    if (spark.lifetime < 0) return;
    const life = 1 - spark.lifetime / spark.ttl;
    ctx.save();
    if (spark.style === 'RING') {
      if (this.config.legacy) {
        // Android 14 draws the exhaust ring at a fixed radius with no fade.
        ctx.strokeStyle = spark.color;
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        ctx.arc(spark.pos.x, spark.pos.y, spark.size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.globalAlpha = Math.max(0, 1 - life);
        ctx.strokeStyle = spark.color;
        ctx.lineWidth = 1 / zoom;
        ctx.beginPath();
        ctx.arc(
          spark.pos.x,
          spark.pos.y,
          Math.exp(spark.size + (3 * spark.size - spark.size) * life) - 1,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = spark.color;
      ctx.beginPath();
      ctx.arc(spark.pos.x, spark.pos.y, spark.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawLanding(ctx: CanvasRenderingContext2D, zoom: number): void {
    const landing = this.landing;
    if (landing === null) return;
    const at = add(landing.planet.pos, angleMag(landing.angle, landing.planet.radius));

    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(landing.angle);
    ctx.lineWidth = 2 / zoom;
    if (this.config.legacy) {
      // Android 14 marks a landing with a red X instead of a flag.
      ctx.strokeStyle = '#FF0000';
      ctx.beginPath();
      ctx.moveTo(-5, -5);
      ctx.lineTo(5, 5);
      ctx.moveTo(5, -5);
      ctx.lineTo(-5, 5);
      ctx.stroke();
    } else {
      ctx.strokeStyle = FLAG;
      ctx.lineJoin = 'round';
      ctx.stroke(FLAG_PATH);
    }
    ctx.restore();
  }

  private drawTrack(ctx: CanvasRenderingContext2D, zoom: number): void {
    const track = this.ship.track;
    if (track.length < 2) return;
    ctx.save();
    ctx.strokeStyle = this.config.legacy ? '#00FF00' : TRACK_COLOR;
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    // `PointMode.Lines` consumes the deque in disjoint pairs, not as a polyline.
    for (let i = 0; i + 1 < track.length; i += 2) {
      ctx.moveTo(track[i][0], track[i][1]);
      ctx.lineTo(track[i + 1][0], track[i + 1][1]);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawShip(ctx: CanvasRenderingContext2D, zoom: number): void {
    const ship = this.ship;
    ctx.save();
    ctx.translate(ship.pos.x, ship.pos.y);
    ctx.rotate(ship.angle);
    ctx.lineWidth = 2 / zoom;

    // new in V: little landing legs, drawn under the hull
    if (ship.landing !== null && !this.config.legacy) {
      ctx.strokeStyle = '#CCCCCC';
      ctx.stroke(CHEVRON);
    }

    ctx.fillStyle = EIGENGRAU; // fauxpaque
    ctx.fill(SHIP_PATH);
    ctx.strokeStyle = ship.transit ? '#000000' : '#FFFFFF';
    ctx.stroke(SHIP_PATH);

    if (mag(ship.thrust) > 0) {
      ctx.strokeStyle = '#FF8800';
      ctx.lineJoin = 'round'; // cornerPathEffect(1f)
      ctx.stroke(this.config.legacy ? THRUST_PATH_LEGACY : THRUST_PATH);
    }
    ctx.restore();
  }


  private drawAutopilot(ctx: CanvasRenderingContext2D, zoom: number): void {
    const target = this.autopilotTarget;
    if (target === null) return;

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = AUTOPILOT_COLOR;
    ctx.lineWidth = 1 / zoom;

    ctx.save();
    ctx.translate(target.pos.x, target.pos.y);
    ctx.rotate((this.now * Math.PI * 2) / 10);
    ctx.beginPath();
    const sides = 15;
    const r = target.radius + this.brakingDistance;
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    ctx.globalAlpha = 0.25;
    ctx.lineWidth = Math.max(1 / zoom, this.landingAltitude);
    ctx.beginPath();
    ctx.arc(target.pos.x, target.pos.y, target.radius + this.landingAltitude / 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    ctx.moveTo(this.ship.pos.x, this.ship.pos.y);
    ctx.lineTo(this.leadingPos.x, this.leadingPos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(this.leadingPos.x, this.leadingPos.y, 5 / zoom, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawConsole(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.context;
    this.buttons = [];

    const labels: Array<[string, string]> = [
      ['left', '⟲'],
      ['right', '⟳'],
      ['thrust', this.thrusting ? '■ 引擎' : '▶ 引擎'],
      ['zoom-in', '＋'],
      ['zoom-out', '－'],
      ['follow', '跟随'],
      ['reroll', '新宇宙'],
    ];
    if (this.config.autoButton && this.config.autopilot) {
      labels.splice(3, 0, ['auto', this.autopilotEnabled ? 'AUTO ●' : 'AUTO']);
    }

    const bw = Math.min(96, width / (labels.length + 1));
    const bh = 34;
    const total = bw * labels.length;
    let x = (width - total) / 2;
    const y = height - bh - 12;

    for (const [id, label] of labels) {
      const active = (id === 'thrust' && this.thrusting) || (id === 'auto' && this.autopilotEnabled);
      ctx.fillStyle = active ? EIGENGRAU4 : 'rgba(22, 22, 29, 0.82)';
      ctx.fillRect(x, y, bw - 4, bh);
      ctx.strokeStyle = active ? FLAG : EIGENGRAU3;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, bw - 5, bh - 1);
      ctx.fillStyle = active ? '#16161D' : CONSOLE;
      ctx.font = '13px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + (bw - 4) / 2, y + bh / 2);
      this.buttons.push({ id, x, y, w: bw - 4, h: bh, label });
      x += bw;
    }
  }

  private drawTelemetry(ctx: CanvasRenderingContext2D): void {
    const { width } = this.context;
    const closest = this.closestPlanet();
    const distance = mag(sub(this.ship.pos, closest.pos));
    // Android 14 measures ALT from the body centre; V+ measures it from the surface.
    const altitude = this.config.legacy ? distance : Math.max(0, distance - closest.radius);
    const thrusting = mag(this.ship.thrust) > 0;
    const lines: string[] = [
      `DESIG: ${this.designation}`,
      `SYS:   ${this.systemName}`,
      `ALT:   ${altitude.toFixed(0)}u`,
      `VEL:   ${mag(this.ship.velocity).toFixed(0)}u/s`,
    ];
    // U only shows THR while the engine is lit.
    if (thrusting || !this.config.legacy) {
      lines.push(`THR:   ${(mag(this.ship.thrust) * 100).toFixed(0)}%`);
    }
    if (this.ship.landing !== null && this.landing !== null) {
      lines.push(`LND:   ${this.landing.planet.name}`);
      if (!this.config.legacy) lines.push(`JOB:   ${this.landing.text || 'LANDED'}`);
    }
    if (this.config.autopilot && this.autopilotEnabled) {
      lines.push('---- AUTOPILOT ENGAGED ----');
      lines.push(`TGT:   ${this.autopilotTarget?.name ?? 'SELECTING...'}`);
      lines.push(`EXE:   ${this.autopilotStrategy} (${this.autopilotDebug})`);
    }
    if (this.latestDiscovery !== null && this.ship.landing === null) {
      lines.push(`NEW:   ${this.latestDiscovery.name} · ${this.latestDiscovery.description}`);
    }
    lines.push(`ZOOM:  ${this.zoom.toFixed(4)}x`);

    ctx.save();
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = CONSOLE;
    lines.forEach((line, i) => {
      ctx.fillText(line, width - 12, 12 + i * 14);
    });
    ctx.restore();
  }
}

