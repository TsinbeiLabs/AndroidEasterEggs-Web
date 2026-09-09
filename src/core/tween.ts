import { linear } from './easing';

export interface TweenSpec {
  /** Delay before the tween starts, in milliseconds. */
  delay?: number;
  /** Duration in milliseconds. */
  duration: number;
  ease?: (t: number) => number;
  from?: number;
  to?: number;
  onUpdate(value: number, t: number): void;
  onComplete?(): void;
}

export interface TweenHandle {
  readonly finished: boolean;
  cancel(): void;
}

interface Active extends TweenSpec {
  readonly startAt: number;
  readonly easeFn: (t: number) => number;
  finished: boolean;
}

/**
 * Minimal tween scheduler. All eggs share one instance and pump it from their
 * frame callback with the host clock (elapsed seconds * 1000), which keeps
 * animations paused automatically when the tab is hidden.
 */
export class Tweens {
  private readonly items = new Set<Active>();

  add(spec: TweenSpec, now: number): TweenHandle {
    const active: Active = {
      ...spec,
      easeFn: spec.ease ?? linear,
      startAt: now + (spec.delay ?? 0),
      finished: false,
    };
    this.items.add(active);

    const handle: TweenHandle = {
      get finished() {
        return active.finished;
      },
      cancel: () => {
        this.items.delete(active);
        active.finished = true;
      },
    };
    return handle;
  }

  update(now: number): void {
    for (const item of Array.from(this.items)) {
      if (now < item.startAt) continue;

      const raw = item.duration <= 0 ? 1 : (now - item.startAt) / item.duration;
      const t = Math.min(1, Math.max(0, raw));
      const eased = item.easeFn(t);
      const value =
        item.from !== undefined && item.to !== undefined
          ? item.from + (item.to - item.from) * eased
          : eased;

      item.onUpdate(value, t);

      if (t >= 1) {
        this.items.delete(item);
        item.finished = true;
        item.onComplete?.();
      }
    }
  }

  cancelAll(): void {
    for (const item of this.items) item.finished = true;
    this.items.clear();
  }

  get pending(): number {
    return this.items.size;
  }
}
