/**
 * Android's standard interpolators, reimplemented as easing functions on t in
 * [0, 1]. Names follow the platform classes so the upstream constants read
 * directly (e.g. `AccelerateInterpolator` -> `accelerate`).
 */

export function linear(t: number): number {
  return t;
}

/** `AccelerateInterpolator` with the default factor 1: t^2. */
export function accelerate(t: number): number {
  return t * t;
}

/** `DecelerateInterpolator` with the default factor 1: 1 - (1 - t)^2. */
export function decelerate(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function anticipate(u: number, s: number): number {
  return u * u * ((s + 1) * u - s);
}

function overshoot(u: number, s: number): number {
  return u * u * ((s + 1) * u + s);
}

/**
 * `AnticipateOvershootInterpolator()` — the no-arg constructor uses
 * `mTension = 2.0f * 1.5f` and `mExtra = 0`, so s is 3, not the CSS
 * easeInOutBack constant 2 * 1.70158.
 */
export function anticipateOvershoot(t: number): number {
  const s = 3;
  return t < 0.5 ? 0.5 * anticipate(2 * t, s) : 0.5 * (overshoot(2 * t - 2, s) + 2);
}

/** `OvershootInterpolator()` — the no-arg constructor uses `mTension = 2.0f`. */
export function overshootEase(t: number): number {
  return overshoot(t - 1, 2) + 1;
}

/**
 * `PathInterpolator(x1, y1, x2, y2)` — a cubic Bezier from (0,0) to (1,1).
 * Solved for y given x with Newton-Raphson, falling back to bisection.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  const solveX = (x: number): number => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = sampleDx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    while (lo < hi) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      if (err > 0) hi = t;
      else lo = t;
      t = (lo + hi) / 2;
      if (hi - lo < 1e-7) break;
    }
    return t;
  };

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return sampleY(solveX(x));
  };
}

/** The `PathInterpolator(0f, 0f, 0.5f, 1f)` used by the L/M/N PlatLogo reveals. */
export const PLATLOGO_EASE = cubicBezier(0, 0, 0.5, 1);

/** Material standard easing. */
export const FAST_OUT_SLOW_IN = cubicBezier(0.4, 0, 0.2, 1);

/** Material emphasized decelerate. */
export const LINEAR_OUT_SLOW_IN = cubicBezier(0, 0, 0.2, 1);
