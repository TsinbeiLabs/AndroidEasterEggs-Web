import { createRng, randomSeed, rangeInt, pick as pickItem } from './rng';
import { createStore } from './store';
import { hideToast, showToast } from './toast';
import type {
  ActionRegistry,
  Egg,
  EggAction,
  EggContext,
  EggMeta,
  EggModule,
  FrameCallback,
  PointerState,
} from './types';

export interface HostHandle {
  readonly egg: Egg;
  destroy(): void;
}

const MAX_DPR = 2;
const MAX_DT = 1 / 20;

interface Listener<T extends Event = Event> {
  target: EventTarget;
  type: string;
  handler: (event: T) => void;
  options: AddEventListenerOptions | undefined;
}

class ListenerBag {
  private readonly items: Listener[] = [];

  add<T extends Event>(
    target: EventTarget,
    type: string,
    handler: (event: T) => void,
    options?: AddEventListenerOptions,
  ): () => void {
    const entry: Listener<T> = { target, type, handler, options };
    target.addEventListener(type, handler as (event: Event) => void, options);
    this.items.push(entry as Listener);
    return () => {
      const i = this.items.indexOf(entry as Listener);
      if (i >= 0) this.items.splice(i, 1);
      target.removeEventListener(type, handler as (event: Event) => void, options);
    };
  }

  removeAll(): void {
    for (const item of this.items.splice(0)) {
      item.target.removeEventListener(item.type, item.handler, item.options);
    }
  }
}

function subscribe<T>(list: Set<T>, value: T): () => void {
  list.add(value);
  return () => {
    list.delete(value);
  };
}

/**
 * Creates the canvas runtime for one egg: DPR aware sizing, frame loop,
 * unified pointer + keyboard input, namespaced persistence and toasts.
 */
export async function mountEgg(
  stage: HTMLElement,
  actionsEl: HTMLElement,
  meta: EggMeta,
): Promise<HostHandle> {
  if (meta.load === undefined) {
    throw new Error(`egg "${meta.id}" has no loader`);
  }
  const module: EggModule = await meta.load();

  const bag = new ListenerBag();
  const frameCallbacks = new Set<FrameCallback>();
  const resizeCallbacks = new Set<(w: number, h: number) => void>();
  const downCallbacks = new Set<(x: number, y: number) => void>();
  const upCallbacks = new Set<(x: number, y: number) => void>();
  const keyCallbacks = new Set<(code: string) => void>();
  const actionDisposers: Array<() => void> = [];

  const canvas = document.createElement('canvas');
  canvas.className = 'egg-canvas';
  canvas.setAttribute('touch-action', 'none');
  stage.replaceChildren(canvas);

  const ctx = canvas.getContext('2d', { alpha: true });
  if (ctx === null) throw new Error('canvas 2d context unavailable');

  const pointer: PointerState = {
    id: -1,
    x: 0,
    y: 0,
    down: false,
    justPressed: false,
    justReleased: false,
    inside: false,
  };
  const pointersById = new Map<number, PointerState>();
  let pointerList: PointerState[] = [];
  const keys = new Set<string>();
  const random = createRng(randomSeed());

  let width = 0;
  let height = 0;
  let dpr = 1;

  const actions: ActionRegistry = {
    add(action: EggAction) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'stage-action';
      button.textContent = action.label;
      button.addEventListener('click', () => action.run());
      actionsEl.appendChild(button);
      const dispose = () => button.remove();
      actionDisposers.push(dispose);
      return () => {
        const i = actionDisposers.indexOf(dispose);
        if (i >= 0) actionDisposers.splice(i, 1);
        dispose();
      };
    },
  };

  const context: EggContext = {
    canvas,
    ctx,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    store: createStore(meta.id),
    pointer,
    get pointers() {
      return pointerList;
    },
    keys,
    actions,
    toast: showToast,
    random,
    randomInt: (min, max) => rangeInt(random, min, max),
    pick: <T>(items: readonly T[]) => pickItem(random, items),
    onFrame: (cb) => subscribe(frameCallbacks, cb),
    onResize: (cb) => subscribe(resizeCallbacks, cb),
    onPointerDown: (cb) => subscribe(downCallbacks, cb),
    onPointerUp: (cb) => subscribe(upCallbacks, cb),
    onKeyDown: (cb) => subscribe(keyCallbacks, cb),
  };

  const resize = () => {
    const rect = stage.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.floor(rect.width));
    const nextHeight = Math.max(1, Math.floor(rect.height));
    const nextDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const changed = nextWidth !== width || nextHeight !== height || nextDpr !== dpr;

    width = nextWidth;
    height = nextHeight;
    dpr = nextDpr;

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (changed) {
      for (const cb of resizeCallbacks) cb(width, height);
    }
  };

  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();

  const toLocal = (event: PointerEvent, target: PointerState) => {
    const rect = canvas.getBoundingClientRect();
    target.x = event.clientX - rect.left;
    target.y = event.clientY - rect.top;
    target.inside =
      target.x >= 0 && target.y >= 0 && target.x <= rect.width && target.y <= rect.height;
  };

  const track = (id: number): PointerState => {
    let entry = pointersById.get(id);
    if (entry === undefined) {
      entry = {
        id,
        x: 0,
        y: 0,
        down: false,
        justPressed: false,
        justReleased: false,
        inside: false,
      };
      pointersById.set(id, entry);
      pointerList = [...pointersById.values()];
    }
    return entry;
  };

  /** The primary mirrors the most recently active pointer. */
  const promote = (entry: PointerState) => {
    pointer.id = entry.id;
    pointer.x = entry.x;
    pointer.y = entry.y;
    pointer.inside = entry.inside;
  };

  bag.add<PointerEvent>(canvas, 'pointerdown', (event) => {
    canvas.setPointerCapture?.(event.pointerId);
    const entry = track(event.pointerId);
    toLocal(event, entry);
    entry.down = true;
    entry.justPressed = true;
    promote(entry);
    pointer.down = true;
    pointer.justPressed = true;
    for (const cb of downCallbacks) cb(pointer.x, pointer.y);
  });

  bag.add<PointerEvent>(canvas, 'pointermove', (event) => {
    const entry = pointersById.get(event.pointerId);
    if (entry === undefined) {
      toLocal(event, pointer);
      return;
    }
    toLocal(event, entry);
    if (entry.id === pointer.id || !pointer.down) promote(entry);
  });

  const release = (event: PointerEvent) => {
    const entry = pointersById.get(event.pointerId);
    if (entry === undefined) {
      toLocal(event, pointer);
      if (!pointer.down) return;
      pointer.down = false;
      pointer.justReleased = true;
      for (const cb of upCallbacks) cb(pointer.x, pointer.y);
      return;
    }

    toLocal(event, entry);
    entry.down = false;
    entry.justReleased = true;
    // A secondary finger lifting leaves the primary alone.
    if (entry.id !== pointer.id) return;

    promote(entry);
    const stillDown = pointerList.find((item) => item.down);
    if (stillDown !== undefined) {
      promote(stillDown);
      return;
    }
    pointer.down = false;
    pointer.justReleased = true;
    for (const cb of upCallbacks) cb(pointer.x, pointer.y);
  };

  bag.add<PointerEvent>(canvas, 'pointerup', release);
  bag.add<PointerEvent>(canvas, 'pointercancel', release);
  bag.add<PointerEvent>(canvas, 'pointerleave', (event) => {
    pointer.inside = false;
    const entry = pointersById.get(event.pointerId);
    if (entry !== undefined) entry.inside = false;
    release(event);
  });

  const NAVIGATION_KEYS = new Set([
    'Space',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Enter',
    'Tab',
  ]);

  bag.add<KeyboardEvent>(window, 'keydown', (event) => {
    if (event.repeat) {
      if (NAVIGATION_KEYS.has(event.code)) event.preventDefault();
      return;
    }
    keys.add(event.code);
    if (NAVIGATION_KEYS.has(event.code)) event.preventDefault();
    for (const cb of keyCallbacks) cb(event.code);
  });

  bag.add<KeyboardEvent>(window, 'keyup', (event) => {
    keys.delete(event.code);
  });

  bag.add(window, 'blur', () => {
    keys.clear();
    pointer.down = false;
    for (const entry of pointerList) entry.down = false;
  });

  const egg = await module.default(context);

  let raf = 0;
  let last = performance.now();
  let elapsed = 0;
  let destroyed = false;

  const frame = (now: number) => {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);

    const dt = Math.min((now - last) / 1000, MAX_DT);
    last = now;
    elapsed += dt;

    ctx.save();
    ctx.clearRect(0, 0, width, height);
    for (const cb of frameCallbacks) cb(dt, elapsed);
    ctx.restore();

    pointer.justPressed = false;
    pointer.justReleased = false;
    for (const entry of pointerList) {
      entry.justPressed = false;
      entry.justReleased = false;
    }
  };

  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (raf === 0 && !destroyed) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  bag.add(document, 'visibilitychange', onVisibility);

  if (!document.hidden) raf = requestAnimationFrame(frame);

  return {
    egg,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      bag.removeAll();
      frameCallbacks.clear();
      resizeCallbacks.clear();
      downCallbacks.clear();
      upCallbacks.clear();
      keyCallbacks.clear();
      for (const dispose of actionDisposers.splice(0)) dispose();
      egg.destroy?.();
      hideToast();
      stage.replaceChildren();
    },
  };
}
