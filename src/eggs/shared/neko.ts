import type { EggContext } from '../../core/types';
import { catFirstMessage, catHue, catLook, defaultCatName, drawCatIcon } from '../nougat/cat';
import { randomCatSeed, seedFromString, seedToString } from '../nougat/javaRandom';

/**
 * The Neko cat collector, shared by Android 7.0 Nougat, 11 Red Velvet Cake,
 * 12 Snow Cone and 13 Tiramisu (upstream ships a byte-identical `Cat` and an
 * almost identical `NekoService` in each of those modules).
 *
 * Nougat mode reproduces `NekoDialog`/`NekoService`: four foods keep their
 * upstream intervals and new-cat probabilities and the scheduled visit gets
 * the same +/-25 % jitter; the job is only (re)scheduled when the dish was
 * empty (`NekoDialog.onFoodSelected`). Android 11+ mode reproduces
 * `NekoControlsService`: a food bowl that refills to a 5 minute visit, a
 * water bubbler (0..200 mL) whose level IS the new-cat probability
 * (`waterLevel100 = water / 2`, percent), and a toy that summons a random
 * existing cat after 1-4 s. Only `seed -> name` is stored; the 27 vector
 * parts, every colour and (from R on) the cat's first message are re-derived
 * from the seed.
 */

const PURR = [0, 40, 20, 40, 20, 40, 20, 40, 20, 40, 20, 40];

export interface NekoFood {
  name: string;
  minutes: number;
  newCatPercent: number;
}

export const NEKO_FOODS: readonly NekoFood[] = [
  { name: 'Empty dish', minutes: 0, newCatPercent: 0 },
  { name: 'Bits', minutes: 15, newCatPercent: 5 },
  { name: 'Fish', minutes: 30, newCatPercent: 35 },
  { name: 'Chicken', minutes: 60, newCatPercent: 65 },
  { name: 'Treat', minutes: 120, newCatPercent: 90 },
];

/** `NekoControlsService.FOOD_SPAWN_CAT_DELAY_MINS`. */
const CONTROLS_MINUTES = 5;
/** `NekoControlsService.makeWaterBowlControl`: RangeTemplate(0, 200, step 10, "%.0f mL"). */
const WATER_MAX = 200;
const WATER_STEP = 10;
/** `NekoControlsService.P_TOY_ICONS`: mouse, fish, ball, laser (uniform weights). */
const TOY_ICONS = ['🐁', '🐟', '🏐', '🔦'] as const;

interface Job {
  food: number;
  at: number;
}

type Cats = Record<string, string>;

export interface NekoOptions {
  heading: string;
  /** Extra line under the heading, e.g. which Android version this is. */
  subtitle: string;
  /** Android 11+ shows the device-control style bowl/water/toy instead of the QS tile foods. */
  controls?: boolean;
  /** Message style notification text, as used from Android 11 on. */
  messages?: readonly string[];
}

/** `r_rare_cat_messages` — drawn at 10 % instead of the egg's normal pool. */
const RARE_CAT_MESSAGES = ['🍩', '🍭', '🍫', '🍨', '🔔', '🐝', '🍪', '🥧'];

const PANEL_CSS = `
.neko-panel { position: absolute; inset: 0; overflow-y: auto; padding: 16px;
  background: #12161b; color: #e6edf3; font: 14px/1.5 system-ui, sans-serif; }
.neko-panel h2 { margin: 0 0 4px; font-size: 18px; }
.neko-note { margin: 0 0 14px; color: #9aa7b2; font-size: 12px; }
.neko-dish { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; }
.neko-food { border: 1px solid #2b343d; background: #1a2027; color: #e6edf3;
  border-radius: 10px; padding: 8px 12px; cursor: pointer; font-size: 13px; text-align: left; }
.neko-food[aria-pressed="true"] { border-color: #3ddc84; color: #3ddc84; }
.neko-food small { display: block; color: #9aa7b2; font-size: 11px; }
.neko-water { display: flex; align-items: center; gap: 8px; border: 1px solid #2b343d;
  background: #1a2027; border-radius: 10px; padding: 6px 12px; font-size: 13px; }
.neko-water input { accent-color: #4285f4; }
.neko-water output { color: #9aa7b2; font-size: 11px; min-width: 52px; }
.neko-status { margin: 10px 0 16px; color: #9aa7b2; font-size: 12px; min-height: 18px; }
.neko-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 12px; }
.neko-cell { position: relative; display: flex; flex-direction: column; align-items: center;
  gap: 6px; padding: 10px 6px; border-radius: 12px; background: #1a2027; cursor: pointer; }
.neko-cell:hover { background: #212a33; }
.neko-cell canvas { width: 64px; height: 64px; display: block; }
.neko-name { font-size: 12px; text-align: center; word-break: break-all; }
.neko-del { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; border: none;
  border-radius: 50%; background: rgba(0,0,0,0.4); color: #fff; cursor: pointer; font-size: 12px;
  line-height: 1; opacity: 0; transition: opacity 250ms; }
.neko-cell:hover .neko-del { opacity: 1; }
.neko-empty { color: #9aa7b2; font-size: 13px; }
`;

export class NekoPanel {
  private readonly context: EggContext;
  private readonly options: NekoOptions;
  private panel: HTMLDivElement | null = null;
  private style: HTMLStyleElement | null = null;
  private timer: number | undefined;
  private toyTimer: number | undefined;
  private toyThrown = false;
  private toyIcon: string;

  constructor(context: EggContext, options: NekoOptions) {
    this.context = context;
    this.options = options;
    // `currentToyIcon()`: a random toy until the first toss re-rolls it.
    this.toyIcon = context.pick(TOY_ICONS);
  }

  private get store() {
    return this.context.store;
  }

  private get controls(): boolean {
    return this.options.controls === true;
  }

  private foods(): readonly NekoFood[] {
    if (!this.controls) return NEKO_FOODS;
    return [
      NEKO_FOODS[0],
      { name: 'Food bowl', minutes: CONTROLS_MINUTES, newCatPercent: 0 },
    ];
  }

  mount(): void {
    const parent = this.context.canvas.parentElement;
    if (parent === null || this.panel !== null) return;

    this.style = document.createElement('style');
    this.style.textContent = PANEL_CSS;
    this.panel = document.createElement('div');
    this.panel.className = 'neko-panel';
    parent.append(this.style, this.panel);

    this.settle();
    this.render();

    this.timer = window.setInterval(() => {
      this.settle();
      if (this.loadJob() !== null) this.render();
    }, 5000);
  }

  destroy(): void {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    if (this.toyTimer !== undefined) window.clearTimeout(this.toyTimer);
    this.toyTimer = undefined;
    this.panel?.remove();
    this.style?.remove();
    this.panel = null;
    this.style = null;
  }

  private loadCats(): Cats {
    return this.store.get<Cats>('cats', {});
  }

  private saveCats(cats: Cats): void {
    this.store.set('cats', cats);
  }

  private loadFood(): number {
    return this.store.get<number>('food', 0);
  }

  private saveFood(food: number): void {
    this.store.set('food', food);
  }

  /** `PrefState.getWaterState()`: 0..200 "mL". */
  private loadWater(): number {
    return this.store.get<number>('water', 0);
  }

  private saveWater(water: number): void {
    this.store.set('water', water);
  }

  private loadJob(): Job | null {
    return this.store.get<Job | null>('job', null);
  }

  private saveJob(job: Job | null): void {
    this.store.set('job', job);
  }

  get count(): number {
    return Object.keys(this.loadCats()).length;
  }

  setFood(food: number): void {
    const entry = this.foods()[food];
    if (entry === undefined || entry.minutes <= 0) {
      this.saveFood(0);
      this.saveJob(null);
    } else {
      const wasEmpty = this.loadFood() === 0;
      this.saveFood(food);
      // `NekoDialog.onFoodSelected` only registers the job when the dish was
      // empty; the R+ bowl control always re-registers on refill.
      if (wasEmpty || this.controls) this.schedule(food, Date.now());
    }
    this.render();
  }

  private schedule(food: number, now: number): void {
    const entry = this.foods()[food];
    if (entry === undefined || entry.minutes <= 0) return;
    // `NekoService.registerJob`: interval +/- INTERVAL_JITTER_FRAC (25 %).
    const interval = entry.minutes * 60000;
    const jitter = 0.25 * interval;
    this.saveJob({ food, at: now + interval + (this.context.random() * 2 - 1) * jitter });
  }

  /** Resolves every visit that came due, as JobScheduler would have. */
  settle(): void {
    let guard = 0;
    let job = this.loadJob();
    while (job !== null && Date.now() >= job.at && guard < 24) {
      // `NekoService.onStartJob` reads the CURRENT food state when it fires.
      this.visit(this.loadFood());
      job = this.loadJob();
      guard++;
    }
  }

  /** Web-only convenience: resolve a visit right now instead of waiting. */
  visitNow(): void {
    const food = this.loadFood();
    this.visit(food === 0 ? 1 : food);
  }

  private visit(food: number): void {
    const cats = this.loadCats();
    const seeds = Object.keys(cats);

    this.saveFood(0);
    this.saveJob(null);
    if (food === 0) return; // the job fired on an already empty dish: nothing to nom

    // R+ `NekoService`: food index 11 is past the prob table, so the new-cat
    // chance is the water level (water / 2 percent). Nougat uses the table
    // entry, or 50 % for unknown foods.
    const newCatProb = this.controls
      ? this.loadWater() / WATER_MAX
      : (this.foods()[food]?.newCatPercent ?? 50) / 100;

    let seed: bigint;
    let name: string;
    let returning = false;

    if (seeds.length === 0 || this.context.random() <= newCatProb) {
      seed = randomCatSeed();
      name = defaultCatName(seed);
    } else {
      const picked = seeds[Math.floor(this.context.random() * seeds.length)];
      seed = seedFromString(picked) ?? randomCatSeed();
      name = cats[picked] ?? defaultCatName(seed);
      returning = true;
    }

    cats[seedToString(seed)] = name;
    this.saveCats(cats);

    navigator.vibrate?.(PURR);
    this.context.toast(this.visitMessage(seed, name, returning), 3);
    this.render();
  }

  /**
   * From Android 11 on the notification is a message from the cat, derived
   * from its seed exactly like its colours (`Cat`'s `mFirstMessage`). Nougat
   * notifications carry no message, only "A cat is here." and the name.
   */
  private visitMessage(seed: bigint, name: string, returning: boolean): string {
    const messages = this.options.messages;
    const first =
      messages === undefined || messages.length === 0
        ? ''
        : `${catFirstMessage(seed, messages, RARE_CAT_MESSAGES)} `;
    return returning ? `${first}${name} 回来了` : `${first}A cat is here. — ${name}`;
  }

  /** `NekoControlsService` CONTROL_ID_TOY: tossed, then a cat reacts 1-4 s later. */
  private throwToy(): void {
    if (this.toyTimer !== undefined) return;
    this.toyThrown = true;
    this.render();
    const delay = (1 + Math.floor(this.context.random() * 4)) * 1000;
    this.toyTimer = window.setTimeout(() => {
      this.toyTimer = undefined;
      this.toyThrown = false;
      this.toyIcon = this.context.pick(TOY_ICONS);

      const cats = this.loadCats();
      const seeds = Object.keys(cats);
      if (seeds.length > 0) {
        const picked = seeds[Math.floor(this.context.random() * seeds.length)];
        const seed = seedFromString(picked) ?? 0n;
        const name = cats[picked] ?? defaultCatName(seed);
        navigator.vibrate?.(PURR);
        this.context.toast(this.visitMessage(seed, name, true), 3);
      }
      this.render();
    }, delay);
  }

  rename(seedKey: string, name: string): void {
    const cats = this.loadCats();
    if (cats[seedKey] === undefined) return;
    cats[seedKey] = name;
    this.saveCats(cats);
    this.render();
  }

  forget(seedKey: string): void {
    const cats = this.loadCats();
    delete cats[seedKey];
    this.saveCats(cats);
    this.render();
  }

  render(): void {
    const panel = this.panel;
    if (panel === null) return;

    const cats = this.loadCats();
    const food = this.loadFood();
    const job = this.loadJob();
    const foods = this.foods();

    const entries = Object.entries(cats)
      .map(([seedKey, name]) => {
        const look = catLook(seedFromString(seedKey) ?? 0n);
        return { seedKey, name, look, hue: catHue(look) };
      })
      .sort((a, b) => a.hue - b.hue);

    const heading = document.createElement('h2');
    heading.textContent = this.options.heading;

    const note = document.createElement('p');
    note.className = 'neko-note';
    note.textContent = `${this.options.subtitle} · 已收集 ${entries.length} 只猫，外观完全由 seed 决定，本地只保存 seed 与名字。`;

    const dish = document.createElement('div');
    dish.className = 'neko-dish';
    if (this.controls) {
      const bowl = document.createElement('button');
      bowl.type = 'button';
      bowl.className = 'neko-food';
      bowl.setAttribute('aria-pressed', String(food !== 0));
      const bowlLabel = document.createElement('span');
      bowlLabel.textContent = food !== 0 ? '🍚 Food bowl · Full' : '🥣 Food bowl · Empty';
      bowl.appendChild(bowlLabel);
      const bowlSmall = document.createElement('small');
      bowlSmall.textContent = food !== 0 ? 'Tap to refill' : `Refill · ${CONTROLS_MINUTES} 分钟后来猫`;
      bowl.appendChild(bowlSmall);
      bowl.addEventListener('click', () => this.setFood(1));
      dish.appendChild(bowl);

      const water = this.loadWater();
      const waterBox = document.createElement('label');
      waterBox.className = 'neko-water';
      const waterTitle = document.createElement('span');
      waterTitle.textContent = '💧 Water bubbler';
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = String(WATER_MAX);
      slider.step = String(WATER_STEP);
      slider.value = String(water);
      slider.setAttribute('aria-label', 'Water level');
      const out = document.createElement('output');
      out.textContent = `${water} mL`;
      slider.addEventListener('input', () => {
        const value = Number(slider.value);
        this.saveWater(value);
        out.textContent = `${value} mL`;
      });
      waterBox.append(waterTitle, slider, out);
      dish.appendChild(waterBox);

      const toy = document.createElement('button');
      toy.type = 'button';
      toy.className = 'neko-food';
      const toyLabel = document.createElement('span');
      toyLabel.textContent = `${this.toyIcon} Toy`;
      toy.appendChild(toyLabel);
      const toySmall = document.createElement('small');
      toySmall.textContent = this.toyThrown ? 'Cat attracted!' : 'Tap to use';
      toy.appendChild(toySmall);
      toy.addEventListener('click', () => this.throwToy());
      dish.appendChild(toy);
    } else {
      foods.forEach((entry, i) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'neko-food';
        button.setAttribute('aria-pressed', String(food === i));
        const label = document.createElement('span');
        label.textContent = entry.name;
        button.appendChild(label);
        if (entry.minutes > 0) {
          const small = document.createElement('small');
          small.textContent = `${entry.minutes} 分钟 · 新猫 ${entry.newCatPercent}%`;
          button.appendChild(small);
        }
        button.addEventListener('click', () => this.setFood(i));
        dish.appendChild(button);
      });
    }

    const status = document.createElement('p');
    status.className = 'neko-status';
    if (job !== null) {
      const minutes = Math.max(0, Math.round((job.at - Date.now()) / 60000));
      const chance = this.controls
        ? `新猫概率 = 水量 ${this.loadWater()}/${WATER_MAX}`
        : `新猫 ${foods[this.loadFood()]?.newCatPercent ?? 50}%`;
      status.textContent = `食盆：${foods[this.loadFood()]?.name ?? '?'} · 预计 ${minutes} 分钟后有猫来访（±25% 抖动，${chance}）`;
    } else {
      status.textContent =
        food === 0
          ? this.controls
            ? '食盆是空的，点 Food bowl 补充；加水能提高新猫概率'
            : '食盆是空的，放点食物吧'
          : '已放好食物，等待猫咪…';
    }

    const grid = document.createElement('div');
    grid.className = 'neko-grid';
    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'neko-empty';
      empty.textContent = '还没有猫。放好食物后等待来访，或用右上角“喂猫”立即结算一次。';
      grid.appendChild(empty);
    }

    for (const entry of entries) {
      const cell = document.createElement('div');
      cell.className = 'neko-cell';

      const badge = document.createElement('canvas');
      badge.width = 128;
      badge.height = 128;
      const bctx = badge.getContext('2d');
      if (bctx !== null) drawCatIcon(bctx, entry.look, 128);

      const name = document.createElement('div');
      name.className = 'neko-name';
      name.textContent = entry.name;

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'neko-del';
      del.textContent = '✕';
      del.title = `Forget ${entry.name}?`;
      del.addEventListener('click', (event) => {
        event.stopPropagation();
        this.forget(entry.seedKey);
      });

      cell.addEventListener('click', () => {
        const next = window.prompt(`给 ${entry.name} 改名：`, entry.name);
        if (next === null) return;
        const trimmed = next.trim();
        if (trimmed === '') return;
        this.rename(entry.seedKey, trimmed);
      });

      cell.append(badge, name, del);
      grid.appendChild(cell);
    }

    panel.replaceChildren(heading, note, dish, status, grid);
  }
}
