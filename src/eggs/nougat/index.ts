import { PLATLOGO_EASE } from '../../core/easing';
import { Tweens } from '../../core/tween';
import type { Egg, EggContext } from '../../core/types';
import { catHue, catLook, defaultCatName, drawCatIcon } from './cat';
import { randomCatSeed, seedFromString, seedToString } from './javaRandom';

/**
 * Android 7.0 / 7.1 Nougat — Neko.
 *
 * PlatLogo is the "N" ribbon (five flat paths in a 48 unit viewport) with a white
 * ripple; five taps arm the long press that unlocks the collector.
 *
 * Neko: put food in the dish and a cat arrives after the food's interval, with
 * +/-25 % jitter — Bits 15 min (5 % new cat), Fish 30 min (35 %), Chicken 60 min
 * (65 %), Treat 120 min (90 %). The dish is emptied on every visit. Cats are
 * stored as `seed -> name` only; all 27 vector parts and their colours are
 * re-derived from the seed, exactly like `PrefState` + `Cat` do.
 *
 * Web deviations, both deliberate: a "喂猫" action resolves a visit immediately
 * (waiting 15 minutes in a browser tab is not reasonable), and elapsed visits are
 * settled on load since there is no JobScheduler to wake us.
 */

const N_PATHS: ReadonlyArray<readonly [string, string, number]> = [
  ['M32,12.5 L32,40.5 L44,35.5 L44,7.5 Z', '#C7D4B6', 1],
  ['M4,40.5 L16,35.5 L16,24.5 L4,12.5 Z', '#FBD3CB', 1],
  ['M44,35.5 L32,23.5 L32,19.5 Z', '#000000', 0.251],
  ['M4,12.5 L16,24.5 L16,28.5 Z', '#000000', 0.251],
  ['M32,23.5 L16,7.5 L4,12.5 L16,24.5 L32,40.5 L44,35.5 Z', '#E0E0D6', 1],
];

const RIPPLE_COLOR = 'rgba(255, 255, 255, 0.5)';
const LONG_PRESS_MS = 500;
const TAPS_TO_ARM = 5;
const PURR = [0, 40, 20, 40, 20, 40, 20, 40, 20, 40, 20, 40];

interface Food {
  name: string;
  minutes: number;
  newCatPercent: number;
}

const FOODS: readonly Food[] = [
  { name: 'Empty dish', minutes: 0, newCatPercent: 0 },
  { name: 'Bits', minutes: 15, newCatPercent: 5 },
  { name: 'Fish', minutes: 30, newCatPercent: 35 },
  { name: 'Chicken', minutes: 60, newCatPercent: 65 },
  { name: 'Treat', minutes: 120, newCatPercent: 90 },
];

interface Job {
  food: number;
  at: number;
}

type Cats = Record<string, string>;

type Scene = 'platlogo' | 'neko';

const PANEL_CSS = `
.neko-panel { position: absolute; inset: 0; overflow-y: auto; padding: 16px;
  background: #12161b; color: #e6edf3; font: 14px/1.5 system-ui, sans-serif; }
.neko-panel h2 { margin: 0 0 4px; font-size: 18px; }
.neko-note { margin: 0 0 14px; color: #9aa7b2; font-size: 12px; }
.neko-dish { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.neko-food { border: 1px solid #2b343d; background: #1a2027; color: #e6edf3;
  border-radius: 10px; padding: 8px 12px; cursor: pointer; font-size: 13px; }
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

export default function createNougat(context: EggContext): Egg {
  const tweens = new Tweens();
  const paths = N_PATHS.map(([d]) => new Path2D(d));

  let scene: Scene = 'platlogo';
  let scale = 0.5;
  let alpha = 0;
  let taps = 0;
  let downAt = -1;
  let wasDown = false;
  const ripples: Array<{ x: number; y: number; born: number }> = [];

  let panel: HTMLDivElement | null = null;
  let style: HTMLStyleElement | null = null;
  let timer: number | undefined;

  const loadCats = (): Cats => context.store.get<Cats>('cats', {});
  const saveCats = (cats: Cats): void => context.store.set('cats', cats);
  const loadFood = (): number => context.store.get<number>('food', 0);
  const saveFood = (food: number): void => context.store.set('food', food);
  const loadJob = (): Job | null => context.store.get<Job | null>('job', null);
  const saveJob = (job: Job | null): void => context.store.set('job', job);

  const scheduleJob = (food: number, now: number): Job | null => {
    const entry = FOODS[food];
    if (entry === undefined || entry.minutes <= 0) return null;
    const interval = entry.minutes * 60000;
    const jitter = 0.25 * interval;
    const at = now + interval + (context.random() * 2 - 1) * jitter;
    const job: Job = { food, at };
    saveJob(job);
    return job;
  };

  const addCat = (seed: bigint, name: string): void => {
    const cats = loadCats();
    cats[seedToString(seed)] = name;
    saveCats(cats);
  };

  const visit = (food: number, now: number): void => {
    const entry = FOODS[food] ?? FOODS[1];
    const cats = loadCats();
    const seeds = Object.keys(cats);

    saveFood(0);
    saveJob(null);

    const newCatProb = (entry?.newCatPercent ?? 50) / 100;
    let seed: bigint;
    let name: string;
    let returning = false;

    if (seeds.length === 0 || context.random() <= newCatProb) {
      seed = randomCatSeed();
      name = defaultCatName(seed);
    } else {
      const picked = seeds[Math.floor(context.random() * seeds.length)];
      const parsed = seedFromString(picked);
      seed = parsed ?? randomCatSeed();
      name = cats[picked] ?? defaultCatName(seed);
      returning = true;
    }

    addCat(seed, name);
    navigator.vibrate?.(PURR);
    context.toast(returning ? `🐱 ${name} 回来了` : `🐱 A cat is here. — ${name}`, 3);
    void now;

    if (panel !== null) renderPanel();
  };

  const settleVisits = (): void => {
    const job = loadJob();
    if (job === null) return;
    let guard = 0;
    let current: Job | null = job;
    while (current !== null && Date.now() >= current.at && guard < 24) {
      visit(current.food, Date.now());
      current = loadJob();
      guard++;
    }
  };

  const renderPanel = (): void => {
    if (panel === null) return;
    const cats = loadCats();
    const food = loadFood();
    const job = loadJob();

    const entries = Object.entries(cats)
      .map(([seed, name]) => {
        const parsed = seedFromString(seed);
        const look = catLook(parsed ?? 0n);
        return { seed, name, look, hue: catHue(look) };
      })
      .sort((a, b) => a.hue - b.hue);

    const dish = document.createElement('div');
    dish.className = 'neko-dish';
    FOODS.forEach((entry, i) => {
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
      button.addEventListener('click', () => {
        if (i === 0) {
          saveFood(0);
          saveJob(null);
        } else {
          saveFood(i);
          scheduleJob(i, Date.now());
        }
        renderPanel();
      });
      dish.appendChild(button);
    });

    const status = document.createElement('p');
    status.className = 'neko-status';
    if (job !== null) {
      const minutes = Math.max(0, Math.round((job.at - Date.now()) / 60000));
      status.textContent = `食盆：${FOODS[job.food]?.name ?? '?'} · 预计 ${minutes} 分钟后有猫来访（±25% 抖动）`;
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
        const cats = loadCats();
        delete cats[entry.seed];
        saveCats(cats);
        renderPanel();
      });

      cell.addEventListener('click', () => {
        const next = window.prompt(`Forget… 不对，是给 ${entry.name} 改名：`, entry.name);
        if (next === null) return;
        const trimmed = next.trim();
        if (trimmed === '') return;
        const cats = loadCats();
        cats[entry.seed] = trimmed;
        saveCats(cats);
        renderPanel();
      });

      cell.append(badge, name, del);
      grid.appendChild(cell);
    }

    const heading = document.createElement('h2');
    heading.textContent = 'Neko · Android 7.0';
    const note = document.createElement('p');
    note.className = 'neko-note';
    note.textContent = `已收集 ${entries.length} 只猫。猫的外观完全由 seed 决定，本地只保存 seed 与名字。`;

    panel.replaceChildren(heading, note, dish, status, grid);
  };

  const buildPanel = (): void => {
    const parent = context.canvas.parentElement;
    if (parent === null) return;

    style = document.createElement('style');
    style.textContent = PANEL_CSS;
    panel = document.createElement('div');
    panel.className = 'neko-panel';
    parent.append(style, panel);
    renderPanel();

    timer = window.setInterval(() => {
      settleVisits();
      if (panel !== null && loadJob() !== null) renderPanel();
    }, 5000);
  };

  const enterNeko = (): void => {
    if (context.store.get<number>('n_egg_mode', 0) === 0) {
      context.store.set('n_egg_mode', Date.now());
    }
    scene = 'neko';
    settleVisits();
    buildPanel();
  };

  const offFrame = context.onFrame((_dt, t) => {
    const now = t * 1000;
    tweens.update(now);
    const { ctx, width, height } = context;

    ctx.fillStyle = '#12161b';
    ctx.fillRect(0, 0, width, height);

    if (scene === 'neko') return;

    if (context.pointer.down && !wasDown) {
      downAt = now;
      ripples.push({ x: context.pointer.x, y: context.pointer.y, born: now });
    }
    if (!context.pointer.down && wasDown) {
      const held = downAt < 0 ? 0 : now - downAt;
      downAt = -1;
      if (held >= LONG_PRESS_MS) {
        if (taps >= TAPS_TO_ARM) {
          wasDown = context.pointer.down;
          enterNeko();
          return;
        }
      } else {
        taps++;
      }
    }
    wasDown = context.pointer.down;

    const size = Math.max(40, Math.min(Math.min(width, height), 600) - 100) * scale;
    const cx = width / 2;
    const cy = height / 2;
    const k = size / 48;

    ctx.save();
    ctx.globalAlpha = alpha;

    for (let i = ripples.length - 1; i >= 0; i--) {
      const ripple = ripples[i];
      const age = (now - ripple.born) / 400;
      if (age >= 1) {
        ripples.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = alpha * (1 - age);
      ctx.fillStyle = RIPPLE_COLOR;
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, size * 0.6 * age, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.translate(-24, -24);
    N_PATHS.forEach(([, color, opacity], i) => {
      ctx.globalAlpha = alpha * opacity;
      ctx.fillStyle = color;
      ctx.fill(paths[i]);
    });
    ctx.restore();
  });

  tweens.add(
    { delay: 800, duration: 500, ease: PLATLOGO_EASE, from: 0.5, to: 1, onUpdate: (v) => (scale = v) },
    0,
  );
  tweens.add(
    { delay: 800, duration: 500, ease: PLATLOGO_EASE, from: 0, to: 1, onUpdate: (v) => (alpha = v) },
    0,
  );

  context.actions.add({
    id: 'neko',
    label: '打开 Neko',
    run: () => {
      if (scene === 'neko') return;
      scale = 1;
      alpha = 1;
      enterNeko();
    },
  });

  context.actions.add({
    id: 'feed',
    label: '喂猫（立即结算）',
    run: () => {
      const food = loadFood();
      visit(food === 0 ? 1 : food, Date.now());
    },
  });

  return {
    hint: '点 5 次以上再长按解锁 Neko；放食物等猫，或用“喂猫”立即结算',
    destroy() {
      offFrame();
      tweens.cancelAll();
      if (timer !== undefined) window.clearInterval(timer);
      panel?.remove();
      style?.remove();
      panel = null;
      style = null;
    },
  };
}
