import type { EggContext } from '../../core/types';

/**
 * Landroid — the position-based-dynamics space sandbox shared by Android 14
 * (Upside Down Cake), 15 (Vanilla Ice Cream), 16 (Baklava) and 17 (Cinnamon Bun).
 *
 * Faithful to `landroid/Physics.kt`, `Universe.kt`, `Autopilot.kt`, `Namer.kt`
 * and `VisibleUniverse.kt`: a 200 000 unit universe with one non-colliding star
 * (mass 4/3*pi*r^3*0.5) and 1-10 Keplerian planets (period = sqrt(a^3/M)*50,
 * constrained back onto their orbit each postUpdate), a 10 mass / 12 radius ship
 * that thrusts at 1000 px/s^2 along its nose, gravity applied as
 * `v += G*m1*m2/d^2*dt` (deliberately not divided by the ship mass), landing when
 * the nose is within 45 degrees of the surface normal, an impact burst of ten
 * sparks otherwise, a 10 000 point track, and the Autopilot state machine
 * (SELECTING / CHASING / APPROACHING / LANDING / LAUNCHING / LANDED).
 *
 * Deviations: `kotlin.random.Random` is replaced by a mulberry32 PRNG, so seeds
 * are not interchangeable with Android, and the HDR/bloom effects are clamped to
 * SDR.
 */

const UNIVERSE_RANGE = 200000;
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
const LANDING_REMOVAL_TIME = 60 * 15;
const TRACK_LENGTH = 10000;
const STAR_POINTS = 31;

const MIN_CAMERA_ZOOM = 250 / UNIVERSE_RANGE;
const MAX_CAMERA_ZOOM = 5;

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

const SHIP_PATH = new Path2D(
  'M11.853 0 C11.853 -4.418 8.374 -8 4.083 -8 L-5.5 -8 C-6.328 -8 -7 -7.328 -7 -6.5 C-7 -5.672 -6.328 -5 -5.5 -5 L-2.917 -5 C-1.26 -5 0.083 -3.657 0.083 -2 L0.083 2 C0.083 3.657 -1.26 5 -2.917 5 L-5.5 5 C-6.328 5 -7 5.672 -7 6.5 C-7 7.328 -6.328 8 -5.5 8 L4.083 8 C8.374 8 11.853 4.418 11.853 0 Z',
);

const CHEVRON = new Path2D('M-7 -6.5 l-3.5,0 l-1,-2 l0,4 l1,-2 Z M-7 6.5 l-3.5,0 l-1,2 l0,-4 l1,2 Z');
const THRUST_PATH = new Path2D('M-5 0 L-8 -3 L-8 3 Z');

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

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `Bag<T>`: a shuffle bag, so no word repeats within a cycle. */
class Bag<T> {
  private items: T[];
  private next: number;

  constructor(items: readonly T[], private readonly rng: () => number) {
    this.items = items.slice();
    this.next = this.items.length;
  }

  pull(): T {
    if (this.next >= this.items.length) {
      for (let i = this.items.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [this.items[i], this.items[j]] = [this.items[j], this.items[i]];
      }
      this.next = 0;
    }
    return this.items[this.next++];
  }
}

class RandomTable<T> {
  private readonly total: number;

  constructor(
    private readonly entries: ReadonlyArray<readonly [number, T]>,
    private readonly rng: () => number,
  ) {
    this.total = entries.reduce((sum, [w]) => sum + w, 0);
  }

  roll(): T {
    let x = this.rng() * this.total;
    for (const [weight, value] of this.entries) {
      if (x < weight) return value;
      x -= weight;
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
  private readonly rng: () => number;
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

  constructor(rng: () => number) {
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
    if (this.rng() < 0.75) {
      name += this.delimiterTable.roll() + this.suffixTable.roll().pull();
      if (this.rng() < 0.05) name += ` ${this.rareSuffixes.pull()}`;
    }
    if (this.rng() < 0.3) {
      name += this.delimiterTable.roll() + String.fromCharCode(65 + Math.floor(this.rng() * 26));
      if (this.rng() < 0.05) name += this.delimiterTable.roll();
    }
    if (this.rng() < 0.3) {
      name += this.delimiterTable.roll() + String(2 + Math.floor(this.rng() * 5038));
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
  /** Android 14 marks a landing with a red X instead of a flag. */
  legacyLandingMarker: boolean;
  /** Planet colour source: Eigengrau4 (U) or a per-planet hue (CB). */
  hsvPlanets: boolean;
  defaultZoom: number;
  dynamicZoom: boolean;
}

export class Landroid {
  private readonly context: EggContext;
  private readonly config: LandroidConfig;
  private readonly rng: () => number;
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
  private autopilotEnabled = false;
  private autopilotTarget: Planet | null = null;
  private autopilotStrategy = 'SELECTING...';
  private autopilotDebug = '';
  private nextStrategyTime = 0;
  private brakingDistance = 0;
  private leadingPos: Vec2 = { x: 0, y: 0 };
  private landingAltitude = 0;

  private impact: Vec2 | null = null;
  private latestDiscovery: Planet | null = null;

  private buttons: Array<{ id: string; x: number; y: number; w: number; h: number; label: string }> = [];
  private wasDown = false;

  constructor(context: EggContext, config: LandroidConfig, seed?: number) {
    this.context = context;
    this.config = config;
    this.seed = seed ?? Math.floor(context.random() * 0xffffffff);
    this.rng = mulberry32(this.seed);
    this.zoom = config.defaultZoom;
    this.initRandom();
  }

  private initRandom(): void {
    const rng = this.rng;
    this.namer = new Namer(rng);
    this.systemName = this.namer.nameSystem();

    const cls = STAR_CLASSES[Math.floor(rng() * STAR_CLASSES.length)];
    const starRadius = STAR_RADIUS_MIN + rng() * (STAR_RADIUS_MAX - STAR_RADIUS_MIN);
    this.star = {
      kind: 'star',
      pos: { x: 0, y: 0 },
      opos: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      mass: (4 / 3) * Math.PI * starRadius ** 3 * STELLAR_DENSITY,
      radius: starRadius,
      angle: 0,
      collides: false,
      name: `${this.systemName} *`,
      cls: cls[0],
      color: cls[1],
      anim: 0,
    };

    const count = 1 + Math.floor(rng() * 10);
    this.planets = [];
    for (let i = 0; i < count; i++) {
      const radius = PLANET_RADIUS_MIN + rng() * (PLANET_RADIUS_MAX - PLANET_RADIUS_MIN);
      const orbitRadius = ORBIT_MIN + rng() * (ORBIT_MAX - ORBIT_MIN);
      const period = Math.sqrt(orbitRadius ** 3 / this.star.mass) * KEPLER_CONSTANT;
      const speed = (2 * Math.PI * orbitRadius) / period;
      const angle = rng() * Math.PI * 2;
      const pos = polar(angle, orbitRadius);
      this.planets.push({
        kind: 'planet',
        pos,
        opos: { ...pos },
        velocity: { x: 0, y: 0 },
        mass: (4 / 3) * Math.PI * radius ** 3 * PLANETARY_DENSITY,
        radius,
        angle: 0,
        collides: true,
        name: '',
        orbitRadius,
        orbitCenter: { x: 0, y: 0 },
        speed,
        color: this.config.hsvPlanets
          ? `hsl(${Math.floor(radius % 360)}, 75%, 60%)`
          : EIGENGRAU4,
        description: this.namer.describePlanet(),
        atmosphere: this.namer.describeAtmo(),
        flora: this.namer.describeLife(),
        fauna: this.namer.describeLife(),
        explored: false,
      });
    }

    this.planets.sort((a, b) => mag(a.pos) - mag(b.pos));
    this.planets.forEach((planet, i) => {
      planet.name = `${this.systemName} ${i + 1}`;
    });

    const shipPos = polar(rng() * Math.PI * 2, ORBIT_MIN + rng() * (ORBIT_MAX - ORBIT_MIN));
    this.ship = {
      kind: 'ship',
      pos: shipPos,
      opos: { ...shipPos },
      velocity: { x: 0, y: 0 },
      mass: SPACECRAFT_MASS,
      radius: SPACECRAFT_RADIUS,
      angle: rng() * Math.PI * 2,
      collides: true,
      name: 'Landroid',
      thrust: { x: 0, y: 0 },
      transit: false,
      landing: null,
      launchClock: 0,
      track: [],
    };

    this.sparks = [];
    this.landing = null;
    this.autopilotTarget = null;
    this.zoom = this.config.defaultZoom;
    this.panning = false;
  }

  reroll(): void {
    this.seed = Math.floor(this.context.random() * 0xffffffff);
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
    const dt = Math.min(dtSeconds, 1);
    this.now += dt;

    this.handleInput(dt);
    this.updateAll(dt);
    this.solveAll(dt);
    this.postUpdateAll(dt);
    if (this.config.autopilot) this.updateAutopilot(dt);
    this.updateCamera(dt);
  }

  private handleInput(dt: number): void {
    const { keys, pointer } = this.context;
    const { height } = this.context;
    const consoleTop = height - 34 - 20;

    const rotate = (keys.has('ArrowLeft') ? -1 : 0) + (keys.has('ArrowRight') ? 1 : 0);
    if (rotate !== 0) this.ship.angle += rotate * 2.4 * dt;

    if (pointer.down && !this.wasDown) {
      if (pointer.y < consoleTop && !this.overButton(pointer.x, pointer.y)) {
        this.pointerThrust = true;
      } else {
        this.hitButton(pointer.x, pointer.y);
      }
    }
    if (!pointer.down) this.pointerThrust = false;

    // Shift-drag pans the camera; otherwise the view follows the ship.
    if (pointer.down && keys.has('ShiftLeft') || keys.has('ShiftRight')) {
      if (this.lastPointer !== null) {
        this.panBy(pointer.x - this.lastPointer[0], pointer.y - this.lastPointer[1]);
      }
    }
    this.lastPointer = [pointer.x, pointer.y];

    const auto = this.autopilotEnabled && this.config.autopilot;
    const wantThrust = this.thrustLatch || this.pointerThrust || keys.has('Space');
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

  private updateAll(dt: number): void {
    this.star.anim += dt;

    for (const planet of this.planets) {
      const orbitAngle = angleOf(sub(planet.pos, planet.orbitCenter));
      planet.velocity = polar(orbitAngle + Math.PI / 2, planet.speed);
      planet.opos = planet.pos;
      planet.pos = add(planet.pos, mul(planet.velocity, dt));
    }

    const ship = this.ship;
    ship.transit = false;
    const bodies: Array<Planet | Star> = [...this.planets, this.star];
    for (const body of bodies) {
      const vector = sub(body.pos, ship.pos);
      const d = mag(vector);
      if (d < body.radius) {
        if (body.kind === 'star') ship.transit = true;
      } else if (this.now > ship.launchClock + LAUNCH_MECO) {
        const impulse = (GRAVITATION * (ship.mass * body.mass)) / (d * d);
        ship.velocity = add(ship.velocity, mul(polar(angleOf(vector), impulse), dt));
      }
    }

    const thrustMag = mag(ship.thrust);
    if (thrustMag > 0) {
      let deltaV = MAIN_ENGINE_ACCEL * dt * Math.min(1, Math.max(0, thrustMag));
      if (ship.landing !== null) {
        if (ship.launchClock === 0) ship.launchClock = this.now + 1;
        if (this.now > ship.launchClock) {
          ship.landing.ship = null;
          ship.landing = null;
          this.landing = null;
        } else {
          deltaV = 0;
        }
      }
      ship.velocity = add(ship.velocity, polar(ship.angle, deltaV));
    } else if (ship.launchClock !== 0) {
      ship.launchClock = 0;
    }

    const speed = mag(ship.velocity);
    if (speed > CRAFT_SPEED_LIMIT) ship.velocity = polar(angleOf(ship.velocity), CRAFT_SPEED_LIMIT);

    ship.opos = ship.pos;
    ship.pos = add(ship.pos, mul(ship.velocity, dt));

    for (const spark of this.sparks) {
      spark.opos = spark.pos;
      spark.pos = add(spark.pos, mul(spark.velocity, dt));
      spark.lifetime -= dt;
    }
    this.sparks = this.sparks.filter((spark) => spark.lifetime > 0);

    if (thrustMag > 0 && this.rng() < thrustMag) {
      const ttl = 0.5 + this.rng() * 0.5;
      this.sparks.push({
        kind: 'spark',
        pos: { ...ship.pos },
        opos: { ...ship.pos },
        velocity: add(
          ship.velocity,
          polar(ship.angle + (this.rng() * 0.4 - 0.2), -MAIN_ENGINE_ACCEL * thrustMag * 10 * dt),
        ),
        mass: 1,
        radius: 1,
        angle: 0,
        collides: true,
        name: 'Spark',
        style: 'RING',
        size: 1,
        color: 'rgba(255,255,255,0.25)',
        ttl,
        lifetime: ttl,
      });
    }
  }

  private solveAll(dt: number): void {
    const ship = this.ship;

    if (this.landing !== null) {
      const landing = this.landing;
      landing.lifetime -= dt;
      if (landing.lifetime <= 0 || landing.ship === null) {
        this.landing = null;
        ship.landing = null;
      } else {
        const desired = add(landing.planet.pos, polar(landing.angle, ship.radius + landing.planet.radius));
        ship.pos = add(mul(ship.pos, 0.5), mul(desired, 0.5));
        ship.angle = landing.angle;
        ship.velocity = landing.planet.velocity;
      }
    }

    // Ringfence.
    const d = mag(ship.pos);
    if (d + ship.radius > UNIVERSE_RANGE) {
      ship.pos = mul(unit(ship.pos), UNIVERSE_RANGE - ship.radius);
    }

    if (ship.landing !== null) return;

    const closest = this.closestPlanet();
    if (!closest.collides) return;
    const planet = closest as Planet;
    const vector = sub(ship.pos, planet.pos);
    const distance = mag(vector) - ship.radius - planet.radius;
    const a = angleOf(vector);

    if (distance >= 0) return;

    const aDiff = Math.abs(((ship.angle - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (aDiff < Math.PI / 4) {
      const landing: Landing = {
        ship,
        planet,
        angle: a,
        text: this.config.legacyLandingMarker ? '' : this.namer.describeActivity(planet),
        lifetime: LANDING_REMOVAL_TIME,
      };
      ship.thrust = { x: 0, y: 0 };
      ship.landing = landing;
      ship.velocity = planet.velocity;
      this.landing = landing;
      planet.explored = true;
      this.latestDiscovery = planet;
      navigator.vibrate?.(30);
      this.context.toast(`着陆：${planet.name}`, 2);
    } else {
      this.impact = add(planet.pos, polar(a, planet.radius));
      ship.pos = add(planet.pos, polar(a, planet.radius + ship.radius - distance));
      for (let i = 0; i < 10; i++) {
        const ttl = 0.5 + this.rng() * 1.5;
        const at = add(this.impact, polar(this.rng() * Math.PI * 2, 0.1 + this.rng() * 0.4));
        this.sparks.push({
          kind: 'spark',
          pos: at,
          opos: { ...at },
          velocity: add(
            mul(ship.velocity, 0.8),
            polar(this.rng() * Math.PI * 2, 0.1 + this.rng() * 0.4),
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

  private postUpdateAll(dt: number): void {
    for (const planet of this.planets) {
      const angle = angleOf(sub(planet.pos, planet.orbitCenter));
      planet.pos = add(planet.orbitCenter, polar(angle, planet.orbitRadius));
      planet.velocity = mul(sub(planet.pos, planet.opos), 1 / dt);
    }

    const ship = this.ship;
    ship.velocity = mul(sub(ship.pos, ship.opos), 1 / dt);
    ship.track.push([ship.pos.x, ship.pos.y, ship.angle]);
    if (ship.track.length > TRACK_LENGTH) ship.track.splice(0, ship.track.length - TRACK_LENGTH);

    for (const spark of this.sparks) {
      spark.velocity = mul(sub(spark.pos, spark.opos), 1 / dt);
    }
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
      target = sorted.find((planet) => !planet.explored) ?? sorted[Math.floor(this.rng() * sorted.length)] ?? null;
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

    this.drawGrid(ctx, zoom, width, height);
    this.drawRingfence(ctx, zoom);
    if (this.landing !== null) this.drawLanding(ctx, zoom);
    this.drawStar(ctx, zoom);
    for (const planet of this.planets) this.drawPlanet(ctx, zoom, planet);
    for (const spark of this.sparks) this.drawSpark(ctx, zoom, spark);
    if (this.config.autopilot && this.autopilotEnabled && this.autopilotTarget !== null) {
      this.drawAutopilot(ctx, zoom);
    }
    this.drawTrack(ctx, zoom);
    this.drawShip(ctx, zoom);
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

    ctx.strokeStyle = EIGENGRAU2;
    ctx.lineWidth = 1.5 / zoom;
    ctx.beginPath();
    for (let x = Math.floor(left / gridStep) * gridStep; x < right; x += gridStep) {
      ctx.lineWidth = (x % (gridStep * 10) === 0 ? 3 : 1.5) / zoom;
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    for (let y = Math.floor(top / gridStep) * gridStep; y < bottom; y += gridStep) {
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();
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

  private gravityField(ctx: CanvasRenderingContext2D, zoom: number, mass: number): void {
    for (let i = 0; i < 8; i++) {
      const force = 200 + (0.01 - 200) * (i / 8);
      const r = Math.sqrt((GRAVITATION * mass * SPACECRAFT_MASS) / force);
      ctx.strokeStyle = `rgba(255, 0, 0, ${(0.5 + (0.1 - 0.5) * (i / 8)).toFixed(3)})`;
      ctx.lineWidth = 2 / zoom;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawStar(ctx: CanvasRenderingContext2D, zoom: number): void {
    const star = this.star;
    ctx.save();
    ctx.translate(star.pos.x, star.pos.y);

    ctx.fillStyle = star.color;
    ctx.beginPath();
    ctx.arc(0, 0, star.radius, 0, Math.PI * 2);
    ctx.fill();

    this.gravityField(ctx, zoom, star.mass);

    ctx.strokeStyle = star.color;
    ctx.lineWidth = 3 / zoom;
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
    corona(star.radius + 80, star.radius + 250, STAR_POINTS, (star.anim / 23) * Math.PI * 2);
    corona(star.radius + 20, star.radius + 200, STAR_POINTS + 1, (star.anim / -19) * Math.PI * 2);
    ctx.restore();
  }

  private drawPlanet(ctx: CanvasRenderingContext2D, zoom: number, planet: Planet): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    ctx.arc(planet.orbitCenter.x, planet.orbitCenter.y, planet.orbitRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.translate(planet.pos.x, planet.pos.y);
    this.gravityField(ctx, zoom, planet.mass);
    ctx.fillStyle = EIGENGRAU;
    ctx.beginPath();
    ctx.arc(0, 0, planet.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = planet.color;
    ctx.lineWidth = 2 / zoom;
    ctx.stroke();

    if (planet.explored) {
      ctx.fillStyle = FLAG;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(2 / zoom, planet.radius * 0.08), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSpark(ctx: CanvasRenderingContext2D, zoom: number, spark: Spark): void {
    const life = 1 - spark.lifetime / spark.ttl;
    ctx.save();
    if (spark.style === 'RING') {
      const radius = Math.exp(spark.size + (3 * spark.size - spark.size) * life) - 1;
      ctx.globalAlpha = Math.max(0, 1 - life);
      ctx.strokeStyle = spark.color;
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.arc(spark.pos.x, spark.pos.y, radius, 0, Math.PI * 2);
      ctx.stroke();
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
    const at = add(landing.planet.pos, polar(landing.angle, landing.planet.radius));

    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(landing.angle);
    if (this.config.legacyLandingMarker) {
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 2 / zoom;
      ctx.beginPath();
      ctx.moveTo(-5, -5);
      ctx.lineTo(5, 5);
      ctx.moveTo(5, -5);
      ctx.lineTo(-5, 5);
      ctx.stroke();
    } else {
      ctx.strokeStyle = FLAG;
      ctx.fillStyle = FLAG;
      ctx.lineWidth = 2 / zoom;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -80);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -80);
      ctx.lineTo(80, -80);
      ctx.lineTo(70, -60);
      ctx.lineTo(60, -80);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawTrack(ctx: CanvasRenderingContext2D, zoom: number): void {
    const track = this.ship.track;
    if (track.length < 2) return;
    ctx.save();
    ctx.strokeStyle = TRACK_COLOR;
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    for (let i = 0; i < track.length - 1; i++) {
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

    if (mag(ship.thrust) > 0) {
      ctx.save();
      ctx.strokeStyle = '#FF8800';
      ctx.lineWidth = 2 / zoom;
      ctx.lineJoin = 'round';
      ctx.stroke(THRUST_PATH);
      ctx.restore();
    }

    ctx.fillStyle = EIGENGRAU;
    ctx.fill(SHIP_PATH);
    ctx.strokeStyle = ship.transit ? '#000000' : '#FFFFFF';
    ctx.lineWidth = 2 / zoom;
    ctx.stroke(SHIP_PATH);

    if (ship.landing !== null) {
      ctx.strokeStyle = '#CCCCCC';
      ctx.lineWidth = 2 / zoom;
      ctx.stroke(CHEVRON);
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
    const altitude = Math.max(0, mag(sub(this.ship.pos, closest.pos)) - closest.radius);
    const lines: string[] = [
      `DESIG: ${this.designation}`,
      `SYS:   ${this.systemName}`,
      `ALT:   ${altitude.toFixed(0)}u`,
      `VEL:   ${mag(this.ship.velocity).toFixed(0)}u/s`,
      `THR:   ${(mag(this.ship.thrust) * 100).toFixed(0)}%`,
    ];
    if (this.ship.landing !== null && this.landing !== null) {
      lines.push(`LND:   ${this.landing.planet.name}`);
      lines.push(`JOB:   ${this.landing.text || 'LANDED'}`);
    }
    if (this.config.autopilot && this.autopilotEnabled) {
      lines.push('---- AUTOPILOT ENGAGED ----');
      lines.push(`TGT:   ${this.autopilotTarget?.name ?? 'SELECTING...'}`);
      lines.push(`EXE:   ${this.autopilotStrategy} (${this.autopilotDebug})`);
    }
    if (this.latestDiscovery !== null && this.ship.landing === null) {
      lines.push(`NEW:   ${this.latestDiscovery.name} · ${this.latestDiscovery.description}`);
    }

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
