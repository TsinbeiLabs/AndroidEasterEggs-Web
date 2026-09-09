import type { EggContext } from '../../core/types';
import { catHue, catLook, defaultCatName, drawCatIcon } from '../nougat/cat';
import { randomCatSeed, seedFromString, seedToString } from '../nougat/javaRandom';

/**
 * The Neko cat collector, shared by Android 7.0 Nougat, 11 Red Velvet Cake,
 * 12 Snow Cone and 13 Tiramisu (upstream ships a byte-identical `Cat` and an
 * almost identical `NekoService` in each of those modules).
 *
 * Food types keep their upstream intervals and new-cat probabilities, and the
 * scheduled visit gets the same +/-25 % jitter. Only `seed -> name` is stored;
 * the 27 vector parts and every colour are re-derived from the seed.
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

const CONTROLS_MINUTES = 5;

interface Job {
  food: number;
  at: number;
}

type Cats = Record<string, string>;

export interface NekoOptions {
  heading: string;
  /** Extra line under the heading, e.g. which Android version this is. */
  subtitle: string;
  /** Android 11+ shows the device-control style "refill" bowl instead of the QS tile foods. */
  controls?: boolean;
  /** Message style notification text, as used from Android 11 on. */
  messages?: readonly string[];
}

const CAT_MESSAGES = ['😸', '😹', '😺', '😻', '😼', '😽', '😾', '😿', '🙀', '💩', '🐁'];
const RARE_CAT_MESSAGES = ['🍩', '🍭', '🍫', '🍨', '🔔', '🐝', '🍪', '🥧'];

const PANEL_CSS = `
.neko-panel { position: absolute; inset: 0; overflow-y: auto; padding: 16px;
  background: #12161b; color: #e6edf3; font: 14px/1.5 system-ui, sans-serif; }
.neko-panel h2 { margin: 0 0 4px; font-size: 18px; }
.neko-note { margin: 0 0 14px; color: #9aa7b2; font-size: 12px; }
.neko-dish { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.neko-food { border: 1px solid #2b343d; background: #1a2027; color: #e6edf3;
  border-radius: 10px; padding: 8px 12px; cursor: pointer; font-size: 13px; text-align: left; }
.neko-food[aria-pressed="true"] { border-color: #3ddc84; color: #3ddc84; }
.neko-food small { display: block; color: #9aa7b2; font-size: 11px; }
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

  constructor(context: EggContext, options: NekoOptions) {
    this.context = context;
    this.options = options;
  }

  private get store() {
    return this.context.store;
  }

  private foods(): readonly NekoFood[] {
    if (this.options.controls !== true) return NEKO_FOODS;
    return [
      NEKO_FOODS[0],
      { name: 'Food bowl · Refill', minutes: CONTROLS_MINUTES, newCatPercent: 65 },
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
      this.saveFood(food);
      this.schedule(food, Date.now());
    }
    this.render();
  }

  private schedule(food: number, now: number): void {
    const entry = this.foods()[food];
    if (entry === undefined || entry.minutes <= 0) return;
    const interval = entry.minutes * 60000;
    const jitter = 0.25 * interval;
    this.saveJob({ food, at: now + interval + (this.context.random() * 2 - 1) * jitter });
  }

  /** Resolves every visit that came due, as JobScheduler would have. */
  settle(): void {
    let guard = 0;
    let job = this.loadJob();
    while (job !== null && Date.now() >= job.at && guard < 24) {
      this.visit(job.food);
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
    const entry = this.foods()[food] ?? this.foods()[1];
    const cats = this.loadCats();
    const seeds = Object.keys(cats);

    this.saveFood(0);
    this.saveJob(null);

    const newCatProb = ((entry?.newCatPercent ?? 50) as number) / 100;
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
    this.context.toast(
      returning ? `${this.message()} ${name} 回来了` : `${this.message()} A cat is here. — ${name}`,
      3,
    );
    this.render();
  }

  private message(): string {
    const messages = this.options.messages ?? CAT_MESSAGES;
    if (messages.length === 0) return '🐱';
    const rare = this.options.messages !== undefined && this.context.random() < 0.1;
    const pool = rare ? RARE_CAT_MESSAGES : messages;
    const picked = pool[Math.floor(this.context.random() * pool.length)];
    // Upstream repeats the message three times half of the time.
    return this.context.random() < 0.5 ? `${picked}${picked}${picked}` : picked;
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
        small.textContent =
          this.options.controls === true
            ? `Refill · ${entry.minutes} 分钟后来猫`
            : `${entry.minutes} 分钟 · 新猫 ${entry.newCatPercent}%`;
        button.appendChild(small);
      }
      button.addEventListener('click', () => this.setFood(i));
      dish.appendChild(button);
    });

    const status = document.createElement('p');
    status.className = 'neko-status';
    if (job !== null) {
      const minutes = Math.max(0, Math.round((job.at - Date.now()) / 60000));
      status.textContent = `食盆：${foods[job.food]?.name ?? '?'} · 预计 ${minutes} 分钟后有猫来访（±25% 抖动）`;
    } else {
      status.textContent = food === 0 ? '食盆是空的，放点食物吧' : '已放好食物，等待猫咪…';
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
