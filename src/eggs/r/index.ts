import { cubicBezier } from '../../core/easing';
import { Tweens, type TweenHandle } from '../../core/tween';
import type { Egg, EggContext } from '../../core/types';
import { NekoPanel } from '../shared/neko';

/**
 * Android 11 Red Velvet Cake — "turn it up to 11".
 *
 * The PlatLogo is `BigDialDrawable`: a green #3ddc84 disc of radius w/4 on a
 * light blue #d7effe (or navy #073042 at night) field, ten ticks around
 * `cx = w*0.85` rotated by `valueToAngle(v) = (1 - v) * 315`, a white pointer
 * dimple and, once unlocked, an orange #f86734 "11" that animates in over 300 ms.
 * Dragging the dial only accepts moves of less than 1/11 of the range; hitting
 * level 9 three times unlocks it, and dropping back to 0 re-locks with the
 * tries reset. Like upstream, the unlock is only committed when the gesture
 * ends (`launchNextStage` runs on ACTION_UP) and the dial stays on screen —
 * "it's fun to frob the dial" — with Cat Controls (the shared Neko collector)
 * behind the action button.
 */

const COLOR_GREEN = '#3ddc84';
const COLOR_NAVY = '#073042';
const COLOR_ORANGE = '#f86734';
const COLOR_LIGHTBLUE = '#d7effe';
/** `BigDialDrawable.STEPS` (the view-level STEPS of 11 only feeds the dead CONFIRM branch). */
const DIAL_STEPS = 10;
/** `VALUE_CHANGE_MAX = 1f / STEPS` with the view-level STEPS = 11. */
const VALUE_CHANGE_MAX = 1 / 11;
const UNLOCK_TRIES = 3;

const ELEVEN_SHOW = cubicBezier(0.4, 0, 0.2, 1);
const ELEVEN_HIDE = cubicBezier(0.8, 0.2, 0.6, 1);

type Scene = 'dial' | 'neko';

function valueToAngle(value: number): number {
  return (1 - value) * (360 - 45);
}

function angleToValue(angle: number): number {
  return 1 - Math.max(0, Math.min(1, angle / (360 - 45)));
}

function toPositiveDegrees(radians: number): number {
  const degrees = (radians * 180) / Math.PI;
  return (((degrees + 360 - 90) % 360) + 360) % 360;
}

export default function createR(context: EggContext): Egg {
  const tweens = new Tweens();
  const neko = new NekoPanel(context, {
    heading: 'Cat Controls · Android 11',
    subtitle: '设备控制磁贴版：补充食碗 5 分钟后来猫，水量决定新猫概率，玩具吸引已有的猫',
    controls: true,
    messages: ['😸', '😹', '😺', '😻', '😼', '😽', '😾', '😿', '🙀', '💩', '🐁'],
  });

  const night = window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;

  let scene: Scene = 'dial';
  let value = 0;
  let locked = context.store.get<number>('r_egg_mode', 0) === 0;
  let tries = locked ? UNLOCK_TRIES : 0;
  let elevenAnim = 0;
  let dragging = false;
  let wasDown = false;
  /** `mWasLocked`: the lock state when the current gesture started. */
  let wasLocked = locked;
  /** Host clock (ms since egg mount) of the current/last frame, for tweens. */
  let frameNow = 0;
  let elevenShow: TweenHandle | null = null;
  let elevenHide: TweenHandle | null = null;

  const userLevel = () => Math.round(value * DIAL_STEPS - 0.25);

  const setEleven = (show: boolean): void => {
    // The upstream ObjectAnimators have FIXED endpoints: show always runs
    // 0 -> 1 over 300 ms on PathInterpolator(0.4, 0, 0.2, 1), hide always
    // 1 -> 0 over 500 ms on (0.8, 0.2, 0.6, 1), each cancelling the other.
    if (show) {
      elevenHide?.cancel();
      elevenHide = null;
      elevenShow = tweens.add(
        {
          duration: 300,
          ease: ELEVEN_SHOW,
          from: 0,
          to: 1,
          onUpdate: (v) => {
            elevenAnim = v;
          },
          onComplete: () => {
            elevenShow = null;
          },
        },
        frameNow,
      );
    } else {
      elevenShow?.cancel();
      elevenShow = null;
      elevenHide = tweens.add(
        {
          duration: 500,
          ease: ELEVEN_HIDE,
          from: 1,
          to: 0,
          onUpdate: (v) => {
            elevenAnim = v;
          },
          onComplete: () => {
            elevenHide = null;
          },
        },
        frameNow,
      );
    }
  };

  const setValue = (next: number): void => {
    const max = locked ? 0.9 : 1;
    value = Math.max(0, Math.min(max, next));
  };

  /**
   * `launchNextStage(locked)`: persists (or clears) r_egg_mode and fires
   * NekoActivationActivity, whose web stand-in is the 🐱/🚫 toast. The dial
   * itself stays put — upstream no longer finishes on unlock ("it's fun to
   * frob the dial"); Cat Controls opens through the action button.
   */
  const launchNextStage = (stillLocked: boolean): void => {
    context.store.set('r_egg_mode', stillLocked ? 0 : Date.now());
    navigator.vibrate?.([0, 40, 60, 40]);
    context.toast(stillLocked ? '🚫 Cat Controls 已停用' : '🐱 Cat Controls 已启用', 2.5);
  };

  const touchAngle = (x: number, y: number): void => {
    const { width, height } = context;
    const cx = width / 2;
    const cy = height / 2;
    const angle = toPositiveDegrees(Math.atan2(x - cx, y - cy));
    const next = angleToValue(angle);
    if (Math.abs(next - value) >= VALUE_CHANGE_MAX) return;

    const oldLevel = userLevel();
    setValue(next);
    const newLevel = userLevel();

    // `BigDialDrawable.touchAngle`: unlock progress and re-lock happen even
    // when the rounded level did not change (setValue clamped to the max).
    if (locked && oldLevel !== DIAL_STEPS - 1 && newLevel === DIAL_STEPS - 1) {
      tries--;
      if (tries <= 0) {
        tries = 0;
        locked = false;
      } else {
        context.toast(`再转到 11 点方向解锁（还剩 ${tries} 次）`, 1.6);
      }
    } else if (!locked && newLevel === 0) {
      locked = true;
      tries = UNLOCK_TRIES;
    }

    if (oldLevel === newLevel) return;
    // CLOCK_TICK on every level change. Upstream's CONFIRM branch compares
    // against the VIEW's STEPS (11) while getUserLevel() tops out at 10, so
    // it can never fire.
    navigator.vibrate?.(8);

    if (!locked) {
      // Show/hide guards straight from `touchAngle`: only start when the
      // other animator is not already running and the value is at its end.
      if (newLevel === DIAL_STEPS && elevenAnim !== 1 && elevenShow === null) setEleven(true);
      else if (newLevel !== DIAL_STEPS && elevenAnim === 1 && elevenHide === null) setEleven(false);
    }
  };

  const offFrame = context.onFrame((_dt, t) => {
    const now = t * 1000;
    frameNow = now;
    tweens.update(now);
    const { ctx, width, height, pointer } = context;

    ctx.fillStyle = night ? COLOR_NAVY : COLOR_LIGHTBLUE;
    ctx.fillRect(0, 0, width, height);
    if (scene === 'neko') return;

    if (pointer.down && !wasDown) {
      dragging = true;
      wasLocked = locked; // ACTION_DOWN records `mWasLocked`
      touchAngle(pointer.x, pointer.y);
    } else if (pointer.down && dragging) {
      touchAngle(pointer.x, pointer.y);
    } else if (!pointer.down && dragging) {
      dragging = false;
      // ACTION_UP: `if (mWasLocked != mDialDrawable.isLocked()) launchNextStage(...)`
      if (wasLocked !== locked) launchNextStage(locked);
    }
    wasDown = pointer.down;

    const w = width;
    const h = height;
    const w2 = w / 2;
    const h2 = h / 2;
    const radius = w / 4;

    // Wedge shadow: rotated 45 degrees, clipped to `clipRect(w2, h2 - radius,
    // min(w, h), h2 + radius)` and shaded by a LinearGradient that ends at
    // min(w, h) — on a wide stage the wedge can be clipped away entirely.
    const wedge = Math.min(w, h) - w2;
    if (wedge > 0) {
      ctx.save();
      ctx.translate(w2, h2);
      ctx.rotate((45 * Math.PI) / 180);
      ctx.beginPath();
      ctx.rect(0, -radius, wedge, radius * 2);
      ctx.clip();
      const gradient = ctx.createLinearGradient(0, 0, wedge, 0);
      // 0x60000020 at night; (0x10FFFFFF & COLOR_NAVY) = 0x10073042 by day.
      const shadow = night ? 'rgba(0, 0, 32, 0.376)' : 'rgba(7, 48, 66, 0.063)';
      gradient.addColorStop(0, shadow);
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, -radius, wedge, radius * 2);
      ctx.restore();
    }

    ctx.fillStyle = COLOR_GREEN;
    ctx.beginPath();
    ctx.arc(w2, h2, radius, 0, Math.PI * 2);
    ctx.fill();

    const level = userLevel();
    const tickColor = night ? COLOR_LIGHTBLUE : COLOR_NAVY;
    const tickCx = w * 0.85;
    for (let i = 0; i < DIAL_STEPS; i++) {
      const angle = valueToAngle(i / DIAL_STEPS);
      ctx.save();
      ctx.translate(w2, h2);
      ctx.rotate((-angle * Math.PI) / 180);
      ctx.translate(-w2, -h2);
      ctx.fillStyle = tickColor;
      ctx.beginPath();
      ctx.arc(tickCx, h2, i <= level ? 20 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (elevenAnim > 0) {
      const size2 = (0.5 + 0.5 * elevenAnim) * (w / 14);
      const cx11 = tickCx + size2 / 4;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, elevenAnim * 2));
      ctx.fillStyle = COLOR_ORANGE;
      ctx.font = `700 ${size2 * 1.6}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('11', cx11, h2);
      ctx.restore();
    }

    const dimple = w2 / 12;
    ctx.save();
    ctx.translate(w2, h2);
    ctx.rotate((-valueToAngle(value) * Math.PI) / 180);
    ctx.translate(-w2, -h2);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(w - radius - dimple * 2, h2, dimple, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(7, 48, 66, 0.72)';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      locked
        ? `拖动旋钮，把它拧到 11 点方向解锁（剩余 ${tries} 次）`
        : '已解锁：拖到最大档位看 “11”，或点右上角进入 Cat Controls',
      w2,
      h - 24,
    );
  });

  context.actions.add({
    id: 'neko',
    label: 'Cat Controls / 返回旋钮',
    run: () => {
      if (scene === 'neko') {
        scene = 'dial';
        neko.destroy();
      } else {
        if (locked) {
          locked = false;
          tries = 0;
          context.store.set('r_egg_mode', Date.now());
        }
        scene = 'neko';
        neko.mount();
      }
    },
  });

  context.actions.add({
    id: 'feed',
    label: '喂猫（立即结算）',
    run: () => neko.visitNow(),
  });

  return {
    hint: '把音量旋钮拧到 11 点方向三次解锁',
    destroy() {
      offFrame();
      tweens.cancelAll();
      neko.destroy();
    },
  };
}
