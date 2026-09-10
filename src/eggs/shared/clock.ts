import { decelerate } from '../../core/easing';
import { Tweens, type TweenHandle } from '../../core/tween';
import type { EggContext } from '../../core/types';
import { loadSeedArgb, systemPalettes, toHex, toneOf } from './hct';

/**
 * The Android 12/13 PlatLogo: `SettableAnalogClock` over the `BubblesDrawable`
 * background (S/T `PlatLogoActivity.java`). The clock shows the real time until
 * it is touched; dragging then sets the minute hand from the touch angle
 * (`minutes = (75 - (int) (angle / 6)) % 60`, carrying the hour on jumps over
 * 45 minutes). Releasing exactly on the target hour — `hour % 12 == 0` (12:00)
 * for Snow Cone, `== 1` (13:00) for Tiramisu — runs `launchNextStage`:
 *
 * - the clock view animates alpha -> 0 and scale -> 0.5 (300 ms default
 *   ViewPropertyAnimator duration, AccelerateDecelerateInterpolator);
 * - concurrently the logo animates alpha 0 -> 1 and scale 0.5 -> 1 with an
 *   OvershootInterpolator (default tension 2);
 * - after 500 ms the bubble field `level` runs 0 -> 10000 in 300 ms with a
 *   DecelerateInterpolator(1f), growing every bubble from r = 0.
 *
 * The activity does not finish ("it's fun to frob the dial"), so the logo over
 * the grown bubble field is the final state; Tiramisu additionally swaps every
 * bubble for an emoji from one of the 14 upstream sets when the background is
 * long pressed (`BubblesDrawable.onLongClick` -> `chooseEmojiSet`, gated on
 * `level != 0`).
 *
 * The clock art is the exact `core/analog-clock` vectors (viewport 380): the
 * squircle `clock_dial` tinted `system_neutral1_200`, the hour hand
 * (`clock_hand_hour`, y 96..206, r=16 caps) tinted `system_accent1_700` and
 * the minute hand (y 60..206) tinted `system_accent2_500`. The logo discs are
 * `s_platlogo` (circle, `system_accent3_500`, white "12" strokes, width 4,
 * round caps) and `t_platlogo` (24-viewport flower, `system_accent1_400`, "13"
 * stroked twice: 2.22 in `system_accent3_800` then 0.56 in
 * `system_neutral1_100`). All of those system colours are derived from the
 * persisted seed colour exactly like the upstream `SystemTonalColors` fallback
 * (see hct.ts), so clock and Paint Chips always share one Material You theme.
 */

/** `BubblesDrawable.MAX_BUBBS` (S, and T when a COLR emoji font is present). */
const MAX_BUBBS = 2000;

/** Android's ViewConfiguration long press timeout, used for the emoji swap. */
const LONG_PRESS_MS = 500;

/** `ViewPropertyAnimator`/`ObjectAnimator` default duration. */
const ANIM_MS = 300;

/** `mLogo.postDelayed(..., 500)` before the level animator starts. */
const LEVEL_DELAY_MS = 500;

/** `animate().scaleX(1f).scaleY(1f).setDuration(150)` when minute hits 0. */
const POP_MS = 150;

/** `PlatLogoActivity.EMOJI_SETS`, all 14 sets verbatim. */
export const EMOJI_SETS: ReadonlyArray<readonly string[]> = [
  ['🍇', '🍈', '🍉', '🍊', '🍋', '🍌', '🍍', '🥭', '🍎', '🍏', '🍐', '🍑', '🍒', '🍓', '🫐', '🥝'],
  ['😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'],
  ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '🫠', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '☺️', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🫢', '🫣', '🤫', '🤔', '🫡', '🤐', '🤨', '😐', '😑', '😶', '🫥', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷'],
  ['🤩', '😍', '🥰', '😘', '🥳', '🥲', '🥹'],
  ['🫠'],
  ['💘', '💝', '💖', '💗', '💓', '💞', '💕', '❣', '💔', '❤', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍'],
  ['👽', '🛸', '✨', '🌟', '💫', '🚀', '🪐', '🌙', '⭐', '🌍'],
  ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'],
  ['🐙', '🪸', '🦑', '🦀', '🦐', '🐡', '🦞', '🐠', '🐟', '🐳', '🐋', '🐬', '🫧', '🌊', '🦈'],
  ['🙈', '🙉', '🙊', '🐵', '🐒'],
  ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'],
  ['🕛', '🕧', '🕐', '🕜', '🕑', '🕝', '🕒', '🕞', '🕓', '🕟', '🕔', '🕠', '🕕', '🕡', '🕖', '🕢', '🕗', '🕣', '🕘', '🕤', '🕙', '🕥', '🕚', '🕦'],
  ['🌺', '🌸', '💮', '🏵️', '🌼', '🌿'],
  ['🐢', '✨', '🌟', '👑'],
];

export interface ClockConfig {
  /** `hour % 12` value that unlocks the next stage. */
  unlockHour: number;
  /** Which version logo to reveal. */
  logo: 'twelve' | 'thirteen';
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

/** `core/analog-clock/res/drawable/clock_dial.xml`, viewport 380. */
const DIAL_PATH = new Path2D(
  'M177.389,2.803C185.381,-0.934 194.619,-0.934 202.611,2.803L231.193,16.169C234.358,17.649 237.76,18.56 241.242,18.861L272.677,21.577C281.467,22.336 289.468,26.956 294.52,34.188L312.59,60.054C314.591,62.919 317.081,65.409 319.946,67.41L345.812,85.48C353.044,90.533 357.664,98.533 358.423,107.323L361.139,138.758C361.44,142.24 362.351,145.642 363.832,148.807L377.197,177.389C380.934,185.381 380.934,194.619 377.197,202.611L363.832,231.193C362.351,234.359 361.44,237.76 361.139,241.242L358.423,272.677C357.664,281.467 353.044,289.468 345.812,294.52L319.946,312.59C317.081,314.591 314.591,317.081 312.59,319.946L294.52,345.812C289.468,353.044 281.467,357.664 272.677,358.423L241.242,361.139C237.76,361.44 234.359,362.351 231.193,363.832L202.611,377.197C194.619,380.934 185.381,380.934 177.389,377.197L148.807,363.832C145.642,362.351 142.24,361.44 138.758,361.139L107.323,358.423C98.533,357.664 90.533,353.044 85.48,345.812L67.41,319.946C65.409,317.081 62.919,314.591 60.054,312.59L34.188,294.52C26.956,289.468 22.336,281.467 21.577,272.677L18.861,241.242C18.56,237.76 17.649,234.359 16.169,231.193L2.803,202.611C-0.934,194.619 -0.934,185.381 2.803,177.389L16.169,148.807C17.649,145.642 18.56,142.24 18.861,138.758L21.577,107.323C22.336,98.533 26.956,90.533 34.188,85.48L60.054,67.41C62.919,65.409 65.409,62.919 67.41,60.054L85.48,34.188C90.533,26.956 98.533,22.336 107.323,21.577L138.758,18.861C142.24,18.56 145.642,17.649 148.807,16.169L177.389,2.803Z',
);

/** `clock_hand_hour.xml`: rounded bar x 174..206, y 96..206, pivot (190,190). */
const HOUR_HAND_PATH = new Path2D(
  'M190,96L190,96A16,16 0,0 1,206 112L206,190A16,16 0,0 1,190 206L190,206A16,16 0,0 1,174 190L174,112A16,16 0,0 1,190 96z',
);

/** `clock_hand_minute.xml`: rounded bar x 174..206, y 60..206. */
const MINUTE_HAND_PATH = new Path2D(
  'M190,60L190,60A16,16 0,0 1,206 76L206,190A16,16 0,0 1,190 206L190,206A16,16 0,0 1,174 190L174,76A16,16 0,0 1,190,60z',
);

/** `s_platlogo.xml` strokes, viewport 128 (white, width 4, round caps). */
const S_ONE = new Path2D('M32.5,34.15 a10,10 0 0 1 9.94,10 V93.85');
const S_TWO = new Path2D(
  'M95.5,93.85 H55.71 V83.9 A19.9,19.9 0 0 1 75.61,64 h10 a9.94,9.94 0 0 0 9.94,-10 a19.9,19.9 0 0 0 -38.69,-6.56 A20.77,20.77 0 0 0 56,50.73',
);

/** `t_platlogo.xml` flower background and glyph strokes, viewport 24. */
const T_FLOWER_PATH = new Path2D(
  'M11,0.3c0.6,-0.3 1.4,-0.3 2,0l0.6,0.4c0.7,0.4 1.4,0.6 2.2,0.6l0.7,-0.1c0.7,0 1.4,0.3 1.8,0.9l0.3,0.6c0.4,0.7 1,1.2 1.7,1.5L21,4.5c0.7,0.3 1.1,0.9 1.2,1.7v0.7C22.2,7.7 22.5,8.4 23,9l0.4,0.5c0.4,0.6 0.5,1.3 0.2,2l-0.3,0.6c-0.3,0.7 -0.4,1.5 -0.3,2.3l0.1,0.7c0.1,0.7 -0.2,1.4 -0.7,1.9L22,17.5c-0.6,0.5 -1.1,1.1 -1.3,1.9L20.5,20c-0.2,0.7 -0.8,1.2 -1.5,1.4l-0.7,0.1c-0.8,0.2 -1.4,0.5 -2,1.1l-0.5,0.5c-0.5,0.5 -1.3,0.7 -2,0.5l-0.6,-0.2c-0.8,-0.2 -1.5,-0.2 -2.3,0l-0.6,0.2c-0.7,0.2 -1.5,0 -2,-0.5l-0.5,-0.5c-0.5,-0.5 -1.2,-0.9 -2,-1.1L5,21.4c-0.7,-0.2 -1.3,-0.7 -1.5,-1.4l-0.2,-0.7C3.1,18.6 2.6,18 2,17.5l-0.6,-0.4c-0.6,-0.5 -0.8,-1.2 -0.7,-1.9l0.1,-0.7c0.1,-0.8 0,-1.6 -0.3,-2.3l-0.3,-0.6c-0.3,-0.7 -0.2,-1.4 0.2,-2L1,9c0.5,-0.6 0.7,-1.4 0.8,-2.2V6.2C1.9,5.5 2.3,4.8 3,4.5l0.6,-0.3c0.7,-0.3 1.3,-0.9 1.7,-1.5l0.3,-0.6c0.4,-0.6 1.1,-1 1.8,-0.9l0.7,0.1c0.8,0 1.6,-0.2 2.2,-0.6L11,0.3z',
);
const T_ONE = new Path2D('M6.3,6.5 l3,0 l0,12.2');
const T_THREE = new Path2D(
  'M12.3,6.5 h4 l-2,4 c2.2,0.3 3.6,2.4 3.3,4.5 c-0.3,1.9 -1.9,3.3 -3.8,3.3 c-0.5,0 -1,-0.1 -1.4,-0.3',
);

/** Android's `AccelerateDecelerateInterpolator`: cos ease in/out. */
function accelerateDecelerate(t: number): number {
  return Math.cos((t + 1) * Math.PI) / 2 + 0.5;
}

/**
 * Android's `OvershootInterpolator` with the default tension 2:
 * `(t-1)^2 * ((tension+1)*(t-1) + tension) + 1`. (core/easing's `overshootEase`
 * uses the easeOutBack constant 2*1.70158 instead, so the platform curve is
 * reproduced here.)
 */
function overshoot(t: number): number {
  const u = t - 1;
  return u * u * (3 * u + 2) + 1;
}

export class PlatLogoClock {
  private readonly context: EggContext;
  private readonly config: ClockConfig;
  private readonly tweens = new Tweens();

  private phase: Phase = 'clock';

  /** `SettableAnalogClock` override state: -1 until the first touch. */
  private override = false;
  private overrideHour = -1;
  private overrideMinute = -1;
  private dragging = false;
  private wasDown = false;

  /** Background long press state for the Tiramisu emoji swap. */
  private downAt = -1;
  private longPressFired = false;

  private clockAlpha = 1;
  private clockScale = 1;
  /** The 1.05 -> 1 scale pop fired when the minute hand passes 0. */
  private clockPop = 1;
  private popTween: TweenHandle | null = null;
  private logoAlpha = 0;
  private logoScale = 0.5;
  private level = 0;

  private bubbles: Bubble[] = [];
  private emojiSet: readonly string[] | null = null;
  private widgetSize = 0;

  private readonly dialColor: string;
  private readonly hourColor: string;
  private readonly minuteColor: string;
  private readonly discColor: string;
  private readonly glyphHeavyColor: string;
  private readonly glyphLightColor: string;
  private readonly bubbleColors: string[];

  private readonly offs: Array<() => void> = [];

  constructor(context: EggContext, config: ClockConfig) {
    this.context = context;
    this.config = config;

    // AnalogClock tints (system_neutral1_200 / accent1_700 / accent2_500) and
    // BubblesDrawable mColors (accent1_400/500/600 + accent2_400/500/600),
    // derived from the persisted seed like the upstream SystemTonalColors.
    const palettes = systemPalettes(loadSeedArgb(context.store));
    this.dialColor = toHex(toneOf(palettes.neutral1, 200));
    this.hourColor = toHex(toneOf(palettes.accent1, 700));
    this.minuteColor = toHex(toneOf(palettes.accent2, 500));
    this.discColor = toHex(
      config.logo === 'twelve' ? toneOf(palettes.accent3, 500) : toneOf(palettes.accent1, 400),
    );
    this.glyphHeavyColor = toHex(toneOf(palettes.accent3, 800));
    this.glyphLightColor = toHex(toneOf(palettes.neutral1, 100));
    this.bubbleColors = [
      toneOf(palettes.accent1, 400),
      toneOf(palettes.accent1, 500),
      toneOf(palettes.accent1, 600),
      toneOf(palettes.accent2, 400),
      toneOf(palettes.accent2, 500),
      toneOf(palettes.accent2, 600),
    ].map(toHex);

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

  /** `BubblesDrawable.randomize()` — the bubble packing runs on bounds change. */
  private pack(): void {
    const { width, height, random } = this.context;
    this.widgetSize = Math.min(width, height) * 0.75;
    const avoid = this.widgetSize / 2;
    const padding = 0.5; // mBg.padding = 0.5dp
    const minR = 1; // mBg.minR = 1dp
    const maxR = Math.min(width, height) / 3;

    const bubbles: Bubble[] = [];
    for (let i = 0; i < MAX_BUBBS; i++) {
      let placed = false;
      for (let attempt = 0; attempt < 5 && !placed; attempt++) {
        const x = random() * width;
        const y = random() * height;
        let r = Math.min(x, width - x, y, height - y);

        // bubble[0] is the invisible exclusion zone around the clock widget.
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
            color: this.bubbleColors[Math.floor(random() * this.bubbleColors.length)],
            emoji: '',
          });
          placed = true;
        }
      }
    }
    this.bubbles = bubbles;
    if (this.emojiSet !== null) this.applyEmoji(this.emojiSet);
  }

  /** `chooseEmojiSet()`: every bubble gets a random member of the set. */
  private applyEmoji(set: readonly string[]): void {
    this.emojiSet = set;
    for (const bubble of this.bubbles) {
      bubble.emoji = set[Math.floor(this.context.random() * set.length)];
    }
  }

  /**
   * `AnalogClock.onTimeChanged` + `SettableAnalogClock.now()`: real time until
   * the first touch, then the override with the seconds pinned to 0.
   */
  private hands(): { hourAngle: number; minuteAngle: number } {
    const real = new Date();
    let hour = real.getHours();
    let minute = real.getMinutes();
    let second = real.getSeconds();
    if (this.override) {
      if (this.overrideHour < 0) this.overrideHour = hour;
      hour = this.overrideHour;
      minute = this.overrideMinute;
      second = 0;
    }
    const minutes = minute + second / 60;
    const hours = hour + minutes / 60;
    return {
      hourAngle: (hours / 12) * Math.PI * 2,
      minuteAngle: (minutes / 60) * Math.PI * 2,
    };
  }

  private step(_dt: number, now: number): void {
    const { pointer, width, height } = this.context;
    const cx = width / 2;
    const cy = height / 2;
    const half = this.widgetSize / 2;

    if (this.phase === 'clock') {
      if (pointer.down && !this.wasDown) {
        // ACTION_DOWN lands on the clock view only; mOverride = true and the
        // event falls straight through into the MOVE handling.
        this.dragging = Math.abs(pointer.x - cx) <= half && Math.abs(pointer.y - cy) <= half;
        if (this.dragging) this.override = true;
      }
      if (this.dragging && pointer.down) {
        // ACTION_MOVE: angle from atan2(x-cx, y-cy) mapped to minutes.
        const angle =
          (Math.atan2(pointer.x - cx, pointer.y - cy) * (180 / Math.PI) + 360 - 90) % 360;
        const minutes = (75 - Math.floor(angle / 6)) % 60;
        const delta = minutes - this.overrideMinute;
        if (delta !== 0) {
          if (Math.abs(delta) > 45 && this.overrideHour >= 0) {
            this.overrideHour = (this.overrideHour + 24 + (delta < 0 ? 1 : -1)) % 24;
          }
          this.overrideMinute = minutes;
          if (this.overrideHour < 0) this.overrideHour = new Date().getHours();
          if (minutes === 0) {
            navigator.vibrate?.(30); // HapticFeedbackConstants.LONG_PRESS
            this.pop(now);
          } else {
            navigator.vibrate?.(8); // HapticFeedbackConstants.CLOCK_TICK
          }
        }
      }
      if (this.dragging && !pointer.down) {
        // ACTION_UP: "12:00 let's gooooo" (S) / "13:00" (T).
        this.dragging = false;
        if (this.overrideMinute === 0 && this.overrideHour % 12 === this.config.unlockHour) {
          navigator.vibrate?.(30);
          this.unlock(now);
        }
      }
    } else if (this.config.emojiBubbles) {
      // layout.setOnLongClickListener(mBg): a 500 ms hold on the grown bubble
      // field picks a new emoji set. onLongClick returns false while level==0.
      if (pointer.down && !this.wasDown) {
        this.downAt = now;
        this.longPressFired = false;
      }
      if (
        pointer.down &&
        !this.longPressFired &&
        this.level > 0 &&
        now - this.downAt >= LONG_PRESS_MS
      ) {
        this.longPressFired = true;
        this.applyEmoji(EMOJI_SETS[Math.floor(this.context.random() * EMOJI_SETS.length)]);
      }
    }

    this.wasDown = pointer.down;
  }

  /** `setScaleX/Y(1.05)` then `animate().scaleX(1f).setDuration(150)`. */
  private pop(now: number): void {
    if (this.popTween !== null) return; // upstream guard: only when scaleX == 1
    this.clockPop = 1.05;
    this.popTween = this.tweens.add(
      {
        duration: POP_MS,
        from: 1.05,
        to: 1,
        onUpdate: (v) => (this.clockPop = v),
        onComplete: () => {
          this.popTween = null;
        },
      },
      now,
    );
  }

  /** `launchNextStage(false)`, timings as annotated in the class doc. */
  private unlock(now: number): void {
    this.phase = 'reveal';

    // mClock.animate().alpha(0f).scaleX(0.5f).scaleY(0.5f)
    this.tweens.add(
      { duration: ANIM_MS, ease: accelerateDecelerate, from: 1, to: 0, onUpdate: (v) => (this.clockAlpha = v) },
      now,
    );
    this.tweens.add(
      { duration: ANIM_MS, ease: accelerateDecelerate, from: 1, to: 0.5, onUpdate: (v) => (this.clockScale = v) },
      now,
    );

    // mLogo.animate().alpha(1f).scaleX/Y(1f).setInterpolator(OvershootInterpolator())
    // — started concurrently, not after the clock fade. View clamps alpha to 1.
    this.tweens.add(
      {
        duration: ANIM_MS,
        ease: overshoot,
        from: 0,
        to: 1,
        onUpdate: (v) => (this.logoAlpha = Math.min(1, Math.max(0, v))),
      },
      now,
    );
    this.tweens.add(
      { duration: ANIM_MS, ease: overshoot, from: 0.5, to: 1, onUpdate: (v) => (this.logoScale = v) },
      now,
    );

    // mLogo.postDelayed(level 0 -> 10000, 500) with DecelerateInterpolator(1f).
    this.tweens.add(
      {
        delay: LEVEL_DELAY_MS,
        duration: ANIM_MS,
        ease: decelerate,
        from: 0,
        to: 10000,
        onUpdate: (v) => (this.level = v),
        onComplete: () => {
          this.phase = 'done';
        },
      },
      now,
    );

    // SpUtils.putLong(S/T_EGG_UNLOCK_SETTING, System.currentTimeMillis());
    // the activity itself stays open.
    this.config.onUnlock();
  }

  private render(): void {
    const { ctx, width, height } = this.context;
    const cx = width / 2;
    const cy = height / 2;

    ctx.fillStyle = '#12161b';
    ctx.fillRect(0, 0, width, height);

    // BubblesDrawable.draw: f = level / 10000, every bubble drawn at r * f.
    if (this.level > 0) {
      const f = this.level / 10000;
      for (const bubble of this.bubbles) {
        if (bubble.emoji !== '') {
          // COLR path: textSize = r * 1.75 (unscaled), baseline at y + r*f*0.6.
          ctx.font = `${(bubble.r * 1.75).toFixed(1)}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(bubble.emoji, bubble.x, bubble.y + bubble.r * f * 0.6);
        } else {
          const r = bubble.r * f;
          if (r <= 0.2) continue;
          ctx.fillStyle = bubble.color;
          ctx.beginPath();
          ctx.arc(bubble.x, bubble.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // AnalogClock.onDraw: dial, then the hour hand rotated mHour/12*360 and
    // the minute hand mMinutes/60*360 about the view centre (190,190).
    if (this.clockAlpha > 0.004) {
      const hands = this.hands();
      const k = (this.widgetSize * this.clockScale * this.clockPop) / 380;
      ctx.save();
      ctx.globalAlpha = this.clockAlpha;
      ctx.translate(cx, cy);
      ctx.scale(k, k);
      ctx.translate(-190, -190);

      ctx.fillStyle = this.dialColor;
      ctx.fill(DIAL_PATH);

      ctx.save();
      ctx.translate(190, 190);
      ctx.rotate(hands.hourAngle);
      ctx.translate(-190, -190);
      ctx.fillStyle = this.hourColor;
      ctx.fill(HOUR_HAND_PATH);
      ctx.restore();

      ctx.save();
      ctx.translate(190, 190);
      ctx.rotate(hands.minuteAngle);
      ctx.translate(-190, -190);
      ctx.fillStyle = this.minuteColor;
      ctx.fill(MINUTE_HAND_PATH);
      ctx.restore();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = this.clockAlpha * 0.85;
      ctx.fillStyle = '#9aa7b2';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
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
        // s_platlogo: accent3_500 oval + white width-4 round-cap strokes.
        ctx.fillStyle = this.discColor;
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
        // t_platlogo: accent1_400 flower + glyphs stroked twice, 2.22 in
        // accent3_800 then 0.56 in neutral1_100, butt caps.
        ctx.scale(size / 24, size / 24);
        ctx.fillStyle = this.discColor;
        ctx.fill(T_FLOWER_PATH);
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        ctx.strokeStyle = this.glyphHeavyColor;
        ctx.lineWidth = 2.22;
        ctx.stroke(T_ONE);
        ctx.stroke(T_THREE);
        ctx.strokeStyle = this.glyphLightColor;
        ctx.lineWidth = 0.56;
        ctx.stroke(T_ONE);
        ctx.stroke(T_THREE);
      }
      ctx.restore();
    }
  }
}
