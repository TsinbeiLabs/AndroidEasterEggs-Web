export type FrameCallback = (dt: number, elapsed: number) => void;

export interface PointerState {
  x: number;
  y: number;
  down: boolean;
  /** True only on the frame the pointer went down. */
  justPressed: boolean;
  /** True only on the frame the pointer went up. */
  justReleased: boolean;
  inside: boolean;
}

export interface EggStore {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  clear(): void;
}

export interface EggContext {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Stage size in CSS pixels. */
  readonly width: number;
  readonly height: number;
  readonly store: EggStore;
  readonly pointer: PointerState;
  readonly keys: ReadonlySet<string>;
  readonly actions: ActionRegistry;
  toast(message: string, seconds?: number): void;
  random(): number;
  randomInt(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  onFrame(callback: FrameCallback): () => void;
  onResize(callback: (width: number, height: number) => void): () => void;
  onPointerDown(callback: (x: number, y: number) => void): () => void;
  onPointerUp(callback: (x: number, y: number) => void): () => void;
  onKeyDown(callback: (code: string) => void): () => void;
}

export interface EggAction {
  id: string;
  label: string;
  run(): void;
}

export interface ActionRegistry {
  add(action: EggAction): () => void;
}

export interface Egg {
  /** Optional per-egg hint shown under the stage title. */
  readonly hint?: string;
  destroy?(): void;
}

export type EggFactory = (context: EggContext) => Egg | Promise<Egg>;

export interface EggModule {
  default: EggFactory;
}

export type EggStatus = 'ready' | 'wip' | 'planned';

export interface EggMeta {
  /** Stable id used in the URL hash and localStorage namespace. */
  id: string;
  /** Android API level, used for ascending ordering. */
  api: number;
  /** Marketing version, e.g. "5.0" or "4.1 – 4.3". */
  version: string;
  /** Codename, e.g. "Lollipop". */
  codename: string;
  /** Name of the egg itself, e.g. "FlappyAndroid". */
  title: string;
  status: EggStatus;
  load?: () => Promise<EggModule>;
}
