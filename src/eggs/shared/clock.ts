import { overshootEase } from '../../core/easing';
import { Tweens } from '../../core/tween';
import type { EggContext } from '../../core/types';

/**
 * The Android 12/13 PlatLogo: a settable analog clock over a packed bubble
 * field. Drag a hand to set the time; releasing exactly on the target hour
 * (12:00 for Snow Cone, 13:00 for Tiramisu) fades the clock out, pops the
 * version logo in with an overshoot and grows 2000 packed bubbles from r=0 as
 * `level` runs 0 -> 10000. Tiramisu additionally swaps every bubble for an emoji
 * from one of 14 sets when the background is long pressed.
 *
 * The system dynamic colours are not available on the web, so the palette uses
 * Material You fallbacks; `discColor` lets each version pin its own accent.
 */

const MAX_BUBBS = 2000;
const BUBBLE_COLORS = ['#598df7', '#3771df', '#2559bc', '#8a91a3', '#707687', '#585e6f'];

const DIAL_COLOR = '#E4E2E6';
const HOUR_COLOR = '#005AC1';
const MINUTE_COLOR = '#00A39A';

const LONG_PRESS_MS = 500;

export const EMOJI_SETS: ReadonlyArray<readonly string[]> = [
  ['🍇', '🍈', '🍉', '🍊', '🍋', '🍌', '🍍', '🥭', '🍎', '🍏', '🍐', '🍑', '🍒', '🍓', '🫐', '🥝'],
  ['😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'],
  ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '🫠', '😉', '😊', '😇', '🥰', '😍'],
  ['🤩', '😍', '🥰', '😘', '🥳', '🥲', '🥹'],
  ['🫠'],
  ['💘', '💝', '💖', '💗', '💓', '💞', '💕', '❣', '💔', '❤', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍'],
  ['👽', '🛸', '✨', '🌟', '💫', '🚀', '🪐', '🌙', '⭐', '🌍'],
  ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'],
  ['🐙', '🪸', '🦑', '🦀', '🦐', '🐡', '🦞', '🐠', '🐟', '🐳', '🐋', '🐬', '🫧', '🌊', '🦈'],
  ['🙈', '🙉', '🙊', '🐵', '🐒'],
  ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'],
  ['🕛', '🕧', '🕐', '🕜', '🕑', '🕝', '🕒', '🕞', '🕓', '🕟', '🕔', '🕠', '🕕', '🕡'],
  ['🌺', '🌸', '💮', '🏵️', '🌼', '🌿'],
  ['🐢', '✨', '🌟', '👑'],
];

export interface ClockConfig {
  /** `hour % 12` value that unlocks the next stage. */
  unlockHour: number;
  /** Which version logo to reveal. */
  logo: 'twelve' | 'thirteen';
  discColor: string;
  /** Tiramisu swaps bubbles for emoji on a background long press. */
  emojiBubbles: boolean;
  onUnlock(): void;
}

interface Bubble {
  x: number;
  y: number;
  r: number;
  color: string;
  emoji: string;
}

type Phase = 'clock' | 'reveal' | 'done';

const S_ONE = new Path2D('M32.5,34.15 a10,10 0 0 1 9.94,10 V93.85');
const S_TWO = new Path2D(
  'M95.5,93.85 H55.71 V83.9 A19.9,19.9 0 0 1 75.61,64 h10 a9.94,9.94 0 0 0 9.94,-10 a19.9,19.9 0 0 0 -38.69,-6.56 A20.77,20.77 0 0 0 56,50.73',
);
const T_ONE = new Path2D('M6.3,6.5 l3,0 l0,12.2');
const T_THREE = new Path2D(
  'M12.3,6.5 h4 l-2,4 c2.2,0.3 3.6,2.4 3.3,4.5 c-0.3,1.9 -1.9,3.3 -3.8,3.3 c-0.5,0 -1,-0.1 -1.4,-0.3',
);

/** The Material You 12 lobed dial, generated instead of traced. */
function dialPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const lobes = 12;
  ctx.beginPath();
  for (let i = 0; i <= lobes * 8; i++) {
    const a = (i / (lobes * 8)) * Math.PI * 2;
    const rr = r * (1 + 0.055 * Math.cos(a * lobes));
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export class PlatLogoClock {
  private readonly context: EggContext;
  private readonly config: ClockConfig;
  private readonly tweens = new Tweens();

  private phase: Phase = 'clock';
  private hour = 12;
  private minute = 0;
  private dragging = false;
  private lastMinute = 0;
  private downAt = -1;
  private wasDown = false;

  private clockAlpha = 1;
  private clockScale = 1;
  private logoAlpha = 0;
  private logoScale = 0.5;
  private level = 0;

  private bubbles: Bubble[] = [];
  private emojiSet: readonly string[] | null = null;
  private widgetSize = 0;

  private readonly offs: Array<() => void> = [];

  constructor(context: EggContext, config: ClockConfig) {
    this.context = context;
    this.config = config;
    this.pack();

    this.offs.push(context.onResize(() => this.pack()));
    this.offs.push(
      context.onFrame((dt, t) => {
        this.tweens.update(t * 1000);
        this.step(dt, t * 1000);
        this.render();
      }),
    );
  }

  destroy(): void {
    for (const off of this.offs.splice(0)) off();
    this.tweens.cancelAll();
  }

  private pack(): void {
    const { width, height, random } = this.context;
    this.widgetSize = Math.min(width, height) * 0.75;
    const avoid = this.widgetSize / 2;
    const padding = 0.5;
    const minR = 1;
    const maxR = Math.min(width, height) / 3;

    const bubbles: Bubble[] = [];
    for (let i = 0; i < MAX_BUBBS; i++) {
      let placed = false;
      for (let attempt = 0; attempt < 5 && !placed; attempt++) {
        const x = random() * width;
        const y = random() * height;
        let r = Math.min(x, width - x, y, height - y);

        const dx = x - width / 2;
        const dy = y - height / 2;
        r = Math.min(r, Math.hypot(dx, dy) - avoid - padding);
        for (const other of bubbles) {
          r = Math.min(r, Math.hypot(x - other.x, y - other.y) - other.r - padding);
          if (r < minR) break;
        }
        if (r >= minR) {
          bubbles.push({
            x,
            y,
            r: Math.min(maxR, r),
            color: BUBBLE_COLORS[Math.floor(random() * BUBBLE_COLORS.length)],
            emoji: '',
          });
          placed = true;
        }
      }
    }
    this.bubbles = bubbles;
    if (this.emojiSet !== null) this.applyEmoji(this.emojiSet);
  }

  private applyEmoji(set: readonly string[]): void {
    this.emojiSet = set;
    for (const bubble of this.bubbles) {
      bubble.emoji = set[Math.floor(this.context.random() * set.length)];
    }
  }

  private step(_dt: number, now: number): void {
    const { pointer } = this.context;
    const { width, height } = this.context;
    const cx = width / 2;
    const cy = height / 2;

    if (pointer.down && !this.wasDown) this.downAt = now;

    if (this.phase === 'clock') {
      if (pointer.down) {
        this.dragging = true;
        const angle =
          (Math.atan2(pointer.x - cx, pointer.y - cy) * (180 / Math.PI) + 360 - 90 + 360) % 360;
        const minute = (75 - Math.floor(angle / 6)) % 60;
        if (minute !== this.minute) {
          const delta = minute - this.lastMinute;
          if (Math.abs(delta) > 45) {
            this.hour = (this.hour + (delta > 0 ? -1 : 1) + 24) % 24;
          }
          this.lastMinute = minute;
          this.minute = minute;
          navigator.vibrate?.(minute === 0 ? 30 : 8);
        }
      } else if (this.dragging) {
        this.dragging = false;
        if (this.minute === 0 && this.hour % 12 === this.config.unlockHour) {
          navigator.vibrate?.(30);
          this.unlock(now);
        }
      }
    } else if (this.config.emojiBubbles) {
      if (pointer.down && !this.wasDown && now - this.downAt >= LONG_PRESS_MS) {
        this.applyEmoji(EMOJI_SETS[Math.floor(this.context.random() * EMOJI_SETS.length)]);
        this.downAt = -1;
      }
    }

    this.wasDown = pointer.down;
  }

  private unlock(now: number): void {
    this.phase = 'reveal';

    this.tweens.add(
      { duration: 400, from: 1, to: 0, onUpdate: (v) => (this.clockAlpha = v) },
      now,
    );
    this.tweens.add(
      { duration: 400, from: 1, to: 0.5, onUpdate: (v) => (this.clockScale = v) },
      now,
    );
    this.tweens.add(
      { delay: 400, duration: 500, ease: overshootEase, from: 0.5, to: 1, onUpdate: (v) => (this.logoScale = v) },
      now,
    );
    this.tweens.add(
      { delay: 400, duration: 500, from: 0, to: 1, onUpdate: (v) => (this.logoAlpha = v) },
      now,
    );
    this.tweens.add(
      { delay: 900, duration: 300, from: 0, to: 10000, onUpdate: (v) => (this.level = v) },
      now,
    );

    window.setTimeout(() => {
      this.phase = 'done';
      this.config.onUnlock();
    }, 1400);
  }

  private render(): void {
    const { ctx, width, height } = this.context;
    const cx = width / 2;
    const cy = height / 2;

    ctx.fillStyle = '#12161b';
    ctx.fillRect(0, 0, width, height);

    if (this.level > 0) {
      const f = this.level / 10000;
      for (const bubble of this.bubbles) {
        const r = bubble.r * f;
        if (r <= 0.2) continue;
        if (bubble.emoji !== '') {
          ctx.font = `${(r * 1.75).toFixed(1)}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(bubble.emoji, bubble.x, bubble.y + r * 0.6);
        } else {
          ctx.fillStyle = bubble.color;
          ctx.beginPath();
          ctx.arc(bubble.x, bubble.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (this.clockAlpha > 0.004) {
      const r = (this.widgetSize / 2) * this.clockScale;
      ctx.save();
      ctx.globalAlpha = this.clockAlpha;

      ctx.fillStyle = DIAL_COLOR;
      dialPath(ctx, cx, cy, r);
      ctx.fill();

      const hand = (angle: number, length: number, widthPx: number, color: string) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.fillStyle = color;
        const w = widthPx;
        const top = -length;
        ctx.beginPath();
        ctx.moveTo(-w / 2, 0);
        ctx.lineTo(-w / 2, top + w / 2);
        ctx.arc(0, top + w / 2, w / 2, Math.PI, 0);
        ctx.lineTo(w / 2, 0);
        ctx.arc(0, 0, w / 2, 0, Math.PI);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };

      const unit = r / 190;
      hand(((this.hour % 12) / 12) * Math.PI * 2, 94 * unit, 32 * unit, HOUR_COLOR);
      hand((this.minute / 60) * Math.PI * 2, 130 * unit, 32 * unit, MINUTE_COLOR);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = this.clockAlpha * 0.85;
      ctx.fillStyle = '#9aa7b2';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        `拖动指针，停在 ${this.config.unlockHour === 0 ? '12:00' : '13:00'} 松手`,
        cx,
        cy + this.widgetSize / 2 + 28,
      );
      ctx.restore();
    }

    if (this.logoAlpha > 0.004) {
      ctx.save();
      ctx.globalAlpha = this.logoAlpha;
      const size = this.widgetSize * this.logoScale;
      ctx.translate(cx - size / 2, cy - size / 2);

      if (this.config.logo === 'twelve') {
        ctx.fillStyle = this.config.discColor;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.scale(size / 128, size / 128);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(S_ONE);
        ctx.stroke(S_TWO);
      } else {
        ctx.fillStyle = this.config.discColor;
        dialPath(ctx, size / 2, size / 2, size / 2);
        ctx.fill();
        ctx.scale(size / 24, size / 24);
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.strokeStyle = '#42581A';
        ctx.lineWidth = 2.22;
        ctx.stroke(T_ONE);
        ctx.stroke(T_THREE);
        ctx.strokeStyle = '#FCFCFF';
        ctx.lineWidth = 0.56;
        ctx.stroke(T_ONE);
        ctx.stroke(T_THREE);
      }
      ctx.restore();
    }
  }
}
