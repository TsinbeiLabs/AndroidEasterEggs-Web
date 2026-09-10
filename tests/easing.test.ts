import { describe, expect, it } from 'vitest';
import {
  accelerate,
  anticipateOvershoot,
  cubicBezier,
  decelerate,
  FAST_OUT_SLOW_IN,
  LINEAR_OUT_SLOW_IN,
  linear,
  overshootEase,
  PLATLOGO_EASE,
} from '../src/core/easing';

/**
 * The interpolators have to reproduce `android.view.animation`'s closed forms,
 * including the tension constants: `OvershootInterpolator()` uses `mTension = 2f`
 * and `AnticipateOvershootInterpolator()` uses `2f * 1.5f = 3f` — not the CSS
 * easeOutBack constant 1.70158.
 */

const overshootForm = (t: number, s: number): number => {
  const u = t - 1;
  return u * u * ((s + 1) * u + s) + 1;
};

const anticipateForm = (t: number, s: number): number => {
  const a = (u: number): number => u * u * ((s + 1) * u - s);
  const o = (u: number): number => u * u * ((s + 1) * u + s);
  return t < 0.5 ? 0.5 * a(2 * t) : 0.5 * (o(2 * t - 2) + 2);
};

describe('easing endpoints', () => {
  const all = { linear, accelerate, decelerate, overshootEase, anticipateOvershoot };
  for (const [name, ease] of Object.entries(all)) {
    it(`${name} maps 0 -> 0 and 1 -> 1`, () => {
      expect(ease(0)).toBeCloseTo(0, 12);
      expect(ease(1)).toBeCloseTo(1, 12);
    });
  }
});

describe('accelerate / decelerate', () => {
  it('is t^2 and 1-(1-t)^2 with the default factor 1', () => {
    for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      expect(accelerate(t)).toBeCloseTo(t * t, 12);
      expect(decelerate(t)).toBeCloseTo(1 - (1 - t) * (1 - t), 12);
    }
  });
});

describe('overshootEase', () => {
  it('uses the Android default tension 2.0', () => {
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      expect(overshootEase(t)).toBeCloseTo(overshootForm(t, 2), 12);
    }
  });

  it('is not the CSS easeOutBack curve', () => {
    // 2 * 1.70158 is the s that `overshootEase` used to carry by mistake.
    const wrong = overshootForm(0.6, 2 * 1.70158);
    expect(Math.abs(overshootEase(0.6) - wrong)).toBeGreaterThan(1e-3);
  });

  it('overshoots past 1 before settling', () => {
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => overshootEase(i / 100)));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.2);
  });
});

describe('anticipateOvershoot', () => {
  it('uses tension 2 * 1.5 = 3', () => {
    for (const t of [0.1, 0.25, 0.5, 0.6, 0.75, 0.9]) {
      expect(anticipateOvershoot(t)).toBeCloseTo(anticipateForm(t, 3), 12);
    }
  });

  it('dips below 0 then overshoots above 1', () => {
    const samples = Array.from({ length: 101 }, (_, i) => anticipateOvershoot(i / 100));
    expect(Math.min(...samples)).toBeLessThan(0);
    expect(Math.max(...samples)).toBeGreaterThan(1);
  });

  it('is continuous at the 0.5 join', () => {
    expect(anticipateOvershoot(0.5)).toBeCloseTo(anticipateForm(0.5, 3), 12);
    expect(Math.abs(anticipateOvershoot(0.5) - anticipateOvershoot(0.499))).toBeLessThan(0.02);
  });
});

describe('cubicBezier', () => {
  it('hits the control-point endpoints', () => {
    const ease = cubicBezier(0.4, 0, 0.2, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it('reproduces a linear curve exactly', () => {
    const ease = cubicBezier(0, 0, 1, 1);
    for (const t of [0.1, 0.3, 0.5, 0.7, 0.9]) expect(ease(t)).toBeCloseTo(t, 6);
  });

  it('PLATLOGO_EASE is PathInterpolator(0, 0, 0.5, 1)', () => {
    const reference = cubicBezier(0, 0, 0.5, 1);
    for (const t of [0.2, 0.4, 0.6, 0.8]) {
      expect(PLATLOGO_EASE(t)).toBeCloseTo(reference(t), 9);
      // A (0,0,0.5,1) curve runs ahead of linear early on.
      expect(PLATLOGO_EASE(t)).toBeGreaterThan(t);
    }
  });

  it('material curves are monotonic', () => {
    for (const ease of [FAST_OUT_SLOW_IN, LINEAR_OUT_SLOW_IN]) {
      let previous = -Infinity;
      for (let i = 0; i <= 100; i++) {
        const value = ease(i / 100);
        expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = value;
      }
    }
  });
});
