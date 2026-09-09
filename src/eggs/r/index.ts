import { cubicBezier } from '../../core/easing';
import { Tweens } from '../../core/tween';
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
 * level 9 three times unlocks it, and dropping back to 0 re-locks with the tries
 * reset. Unlocking opens Cat Controls, whose Neko collector is the shared one.
 */

const COLOR_GREEN = '#3ddc84';
const COLOR_NAVY = '#073042';
const COLOR_ORANGE = '#f86734';
const COLOR_LIGHTBLUE = '#d7effe';
const STEPS = 11;
const DIAL_STEPS = 10;
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
    subtitle: '设备控制磁贴版：食物碗点一下即 refill，5 分钟后来猫',
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

  const userLevel = () => Math.round(value * DIAL_STEPS - 0.25);

  const setEleven = (show: boolean, now: number): void => {
    tweens.add(
      {
        duration: show ? 300 : 500,
        ease: show ? ELEVEN_SHOW : ELEVEN_HIDE,
        from: elevenAnim,
        to: show ? 1 : 0,
        onUpdate: (v) => {
          elevenAnim = v;
        },
      },
      now,
    );
  };

  const setValue = (next: number): void => {
    const max = locked ? 0.9 : 1;
    value = Math.max(0, Math.min(max, next));
  };

  const unlock = (): void => {
    locked = false;
    tries = 0;
    context.store.set('r_egg_mode', Date.now());
    navigator.vibrate?.([0, 40, 60, 40]);
    context.toast('🐱 Cat Controls 已启用', 2.5);
    scene = 'neko';
    neko.mount();
  };

  const touchAngle = (x: number, y: number, now: number): void => {
    const { width, height } = context;
    const cx = width / 2;
    const cy = height / 2;
    const angle = toPositiveDegrees(Math.atan2(x - cx, y - cy));
    const next = angleToValue(angle);
    if (Math.abs(next - value) >= VALUE_CHANGE_MAX) return;

    const oldLevel = userLevel();
    setValue(next);
    const newLevel = userLevel();
    if (oldLevel === newLevel) return;

    navigator.vibrate?.(newLevel + 1 >= STEPS ? 30 : 8);

    if (locked && oldLevel !== 9 && newLevel === 9) {
      tries--;
      if (tries <= 0) {
        unlock();
        return;
      }
      context.toast(`再转到 11 点方向解锁（还剩 ${tries} 次）`, 1.6);
    } else if (!locked && newLevel === 0) {
      locked = true;
      tries = UNLOCK_TRIES;
    }

    if (!locked) setEleven(newLevel === DIAL_STEPS, now);
  };

  const offFrame = context.onFrame((_dt, t) => {
    const now = t * 1000;
    tweens.update(now);
    const { ctx, width, height, pointer } = context;

    ctx.fillStyle = night ? COLOR_NAVY : COLOR_LIGHTBLUE;
    ctx.fillRect(0, 0, width, height);
    if (scene === 'neko') return;

    if (pointer.down && !wasDown) {
      dragging = true;
      touchAngle(pointer.x, pointer.y, now);
    } else if (pointer.down && dragging) {
      touchAngle(pointer.x, pointer.y, now);
    } else if (!pointer.down && dragging) {
      dragging = false;
    }
    wasDown = pointer.down;

    const w = width;
    const h = height;
    const w2 = w / 2;
    const h2 = h / 2;
    const radius = w / 4;

    // Wedge shadow: rotated 45 degrees, clipped to a band through the centre.
    ctx.save();
    ctx.translate(w2, h2);
    ctx.rotate((45 * Math.PI) / 180);
    ctx.beginPath();
    ctx.rect(0, -radius, Math.max(w, h), radius * 2);
    ctx.clip();
    const gradient = ctx.createLinearGradient(0, 0, Math.max(w, h), 0);
    const shadow = night ? 'rgba(0, 0, 32, 0.376)' : 'rgba(7, 48, 66, 0.063)';
    gradient.addColorStop(0, shadow);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, -radius, Math.max(w, h), radius * 2);
    ctx.restore();

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
