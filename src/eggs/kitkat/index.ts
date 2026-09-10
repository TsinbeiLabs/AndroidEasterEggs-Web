import { accelerate, anticipateOvershoot, decelerate } from '../../core/easing';
import { Tweens, type TweenHandle } from '../../core/tween';
import type { Egg, EggContext } from '../../core/types';
import {
  bakeDesserts,
  PASTRIES,
  RARE_PASTRIES,
  TILE_COLORS,
  XRARE_PASTRIES,
  XXRARE_PASTRIES,
  type BakedDesserts,
} from './desserts';

/**
 * Android 4.4 KitKat.
 *
 * PlatLogo: a giant white "K" over a 75 % black scrim. Each of the first five
 * taps spins it a full turn in 700 ms (decelerate, random direction, snapping to a
 * whole multiple of 360 deg and cancelling any spin still in flight); the sixth
 * tap — or a 500 ms long press — runs the reveal: the K shrinks and fades while
 * spinning (accelerate, 1000 ms), the KitKat red `#ED1D24` background expands
 * from scaleX 0.01 at +500 ms, the "Android" oval pops in over 500-1500 ms with
 * AnticipateOvershoot, and ANDROID 4.4 fades in from +1000 ms. A further long
 * press on the logo opens Dessert Case.
 *
 * DessertCase: a grid of 48 dp cells (192 dp * SCALE 0.25), each a random one of
 * 12 saturated colours, 70 % carrying a white dessert silhouette. Spans are
 * 1x1 67 %, 2x2 23 %, 3x3 9 %, 4x4 1 %, each rotated by a multiple of 90 deg.
 * After 1 s the grid fills with a 2 s pop-in; 5 s later, and every 2 s after
 * that, exactly one random tile relocates, squashing whatever it lands on, and the
 * holes pop back in over 500 ms. Tapping a tile moves it.
 */

const LONG_PRESS_MS = 500;
const SPIN_MS = 700;
const TAPS_TO_REVEAL = 6;
const KITKAT_RED = '#ED1D24';

const START_DELAY = 5000;
const JUGGLE_DELAY = 2000;
const DURATION = 500;
const CELL = 48;

/** `DessertCaseView.java:123-125`. */
const PROB_2X = 0.33;
const PROB_3X = 0.1;
const PROB_4X = 0.01;

/**
 * An evicted tile animates to `scaleX(0.5f)` / `scaleY(0.5f)` on a view whose layout
 * size is `mCellSize` (`DessertCaseView.java:415-417`), so it collapses to half a
 * cell no matter how large its span was.
 */
const SQUASH_SIZE = 0.5 * CELL;

/**
 * `AccelerateDecelerateInterpolator`, the default for `ViewPropertyAnimator` (and for
 * `ValueAnimator`), so it drives every reveal tween that does not name an
 * interpolator: the red background (`PlatLogoActivity.java:126`), the caption
 * (`:142`) and the DessertCase pop-in (`DessertCaseView.java:340`).
 */
function accelerateDecelerate(t: number): number {
  return Math.cos((t + 1) * Math.PI) / 2 + 0.5;
}

const LOGO_W = 920;
const LOGO_H = 546;

interface Tile {
  id: number;
  col: number;
  row: number;
  span: number;
  color: string;
  dessert: string | null;
  cx: number;
  cy: number;
  size: number;
  rot: number;
  alpha: number;
  alive: boolean;
  z: number;
}

type Scene = 'platlogo' | 'dessertcase';

export default function createKitKat(context: EggContext): Egg {
  const tweens = new Tweens();
  const baked: BakedDesserts = bakeDesserts(256);

  let scene: Scene = 'platlogo';
  let taps = 0;
  let revealed = false;
  let downAt = -1;
  let spinFrom = 0;
  let spinTo = 0;
  let letterAlpha = 1;
  let letterScale = 1;
  let redAlpha = 0;
  let redScaleX = 0.01;
  let logoAlpha = 0;
  let logoScale = 0.5;
  let captionAlpha = 0;

  const tiles: Tile[] = [];
  let occupancy: Int32Array = new Int32Array(0);
  let cols = 0;
  let rows = 0;
  let gridWidth = 0;
  let gridHeight = 0;
  let nextTileId = 1;
  let started = false;
  let startedAt = 0;
  let nextJuggleAt = 0;
  let pendingFillAt = -1;
  let letterRotation = 0;
  let lastElapsed = 0;
  /** `letter.animate().cancel()` — only one spin may own `letterRotation` at a time. */
  let spinTween: TweenHandle | null = null;

  const index = (col: number, row: number) => row * cols + col;

  const rebuildGrid = () => {
    gridWidth = context.width;
    gridHeight = context.height;
    cols = Math.max(1, Math.ceil(context.width / CELL));
    rows = Math.max(1, Math.ceil(context.height / CELL));
    occupancy = new Int32Array(cols * rows);
    occupancy.fill(0);
    tiles.length = 0;
    nextTileId = 1;
    started = false;
  };

  const cellCenter = (col: number, row: number, span: number): [number, number] => [
    (col + span / 2) * CELL,
    (row + span / 2) * CELL,
  ];

  const freeCells = (tile: Tile): void => {
    for (let r = tile.row; r < tile.row + tile.span && r < rows; r++) {
      for (let c = tile.col; c < tile.col + tile.span && c < cols; c++) {
        if (occupancy[index(c, r)] === tile.id) occupancy[index(c, r)] = 0;
      }
    }
  };

  const occupy = (tile: Tile): void => {
    for (let r = tile.row; r < tile.row + tile.span && r < rows; r++) {
      for (let c = tile.col; c < tile.col + tile.span && c < cols; c++) {
        occupancy[index(c, r)] = tile.id;
      }
    }
  };

  const pickDessert = (): string | null => {
    const which = context.random();
    if (which < 0.0005) return context.pick(XXRARE_PASTRIES);
    if (which < 0.005) return context.pick(XRARE_PASTRIES);
    if (which < 0.5) return context.pick(RARE_PASTRIES);
    if (which < 0.7) return context.pick(PASTRIES);
    return null;
  };

  /**
   * `DessertCaseView.java:379-392`. Upstream is an if / else-if chain, so a tile whose
   * draw lands in a big-span band but whose cell is too close to the edge is silently
   * downgraded all the way to 1x — it must not fall through into the next band.
   */
  const pickSpan = (col: number, row: number): number => {
    const rnd = context.random();
    if (rnd < PROB_4X) return col < cols - 3 && row < rows - 3 ? 4 : 1;
    if (rnd < PROB_3X) return col < cols - 2 && row < rows - 2 ? 3 : 1;
    if (rnd < PROB_2X) return col < cols - 1 && row < rows - 1 ? 2 : 1;
    return 1;
  };

  const evict = (tile: Tile, now: number): void => {
    tile.alive = false;
    freeCells(tile);
    tweens.add(
      {
        duration: DURATION,
        ease: accelerate,
        from: tile.size,
        to: SQUASH_SIZE,
        onUpdate: (v) => {
          tile.size = v;
        },
      },
      now,
    );
    tweens.add(
      {
        duration: DURATION,
        ease: accelerate,
        from: tile.alpha,
        to: 0,
        onUpdate: (v) => {
          tile.alpha = v;
        },
        onComplete: () => {
          const i = tiles.indexOf(tile);
          if (i >= 0) tiles.splice(i, 1);
        },
      },
      now,
    );
  };

  const place = (tile: Tile, animate: boolean, now: number, col?: number, row?: number): void => {
    freeCells(tile);

    const targetCol = col ?? context.randomInt(0, cols - 1);
    const targetRow = row ?? context.randomInt(0, rows - 1);
    const span = pickSpan(targetCol, targetRow);

    for (let r = targetRow; r < targetRow + span && r < rows; r++) {
      for (let c = targetCol; c < targetCol + span && c < cols; c++) {
        const occupantId = occupancy[index(c, r)];
        if (occupantId === 0 || occupantId === tile.id) continue;
        const squatter = tiles.find((t) => t.id === occupantId);
        if (squatter !== undefined && squatter.alive) evict(squatter, now);
      }
    }

    tile.col = targetCol;
    tile.row = targetRow;
    tile.span = span;
    tile.alive = true;
    occupy(tile);
    tile.z = now;

    const [cx, cy] = cellCenter(targetCol, targetRow, span);
    const targetSize = span * CELL;
    const targetRot = context.randomInt(0, 3) * 90;

    if (!animate) {
      tile.cx = cx;
      tile.cy = cy;
      tile.size = targetSize;
      tile.rot = targetRot;
      tile.alpha = 1;
      return;
    }

    tweens.add(
      {
        duration: DURATION,
        ease: anticipateOvershoot,
        from: tile.size,
        to: targetSize,
        onUpdate: (v) => {
          tile.size = v;
        },
      },
      now,
    );
    const fromCx = tile.cx;
    const fromCy = tile.cy;
    const fromRot = tile.rot;
    tweens.add(
      {
        duration: DURATION,
        ease: decelerate,
        onUpdate: (v) => {
          tile.cx = fromCx + (cx - fromCx) * v;
          tile.cy = fromCy + (cy - fromCy) * v;
          tile.rot = fromRot + (targetRot - fromRot) * v;
        },
      },
      now,
    );
  };

  const fillFreeList = (animationLen: number, now: number): void => {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (occupancy[index(col, row)] !== 0) continue;

        const tile: Tile = {
          id: nextTileId++,
          col,
          row,
          span: 1,
          color: context.pick(TILE_COLORS),
          dessert: pickDessert(),
          cx: 0,
          cy: 0,
          size: CELL,
          rot: 0,
          alpha: 1,
          alive: true,
          z: now,
        };
        tiles.push(tile);
        place(tile, false, now, col, row);

        if (animationLen > 0) {
          const targetSize = tile.size;
          tile.size = targetSize * 0.5;
          tile.alpha = 0;
          tweens.add(
            {
              duration: animationLen,
              ease: accelerateDecelerate,
              from: tile.size,
              to: targetSize,
              onUpdate: (v) => {
                tile.size = v;
              },
            },
            now,
          );
          tweens.add(
            {
              duration: animationLen,
              ease: accelerateDecelerate,
              from: 0,
              to: 1,
              onUpdate: (v) => {
                tile.alpha = v;
              },
            },
            now,
          );
        }
      }
    }
  };

  const enterDessertCase = (): void => {
    if (context.store.get<number>('k_egg_mode', 0) === 0) {
      context.store.set('k_egg_mode', Date.now());
    }
    scene = 'dessertcase';
    rebuildGrid();
    startedAt = -1;
  };

  const reveal = (now: number): void => {
    if (revealed) return;
    revealed = true;

    tweens.add(
      {
        duration: 1000,
        ease: accelerate,
        from: 1,
        to: 0,
        onUpdate: (v) => {
          letterAlpha = v;
        },
      },
      now,
    );
    tweens.add(
      {
        duration: 1000,
        ease: accelerate,
        from: 1,
        to: 0.5,
        onUpdate: (v) => {
          letterScale = v;
        },
      },
      now,
    );
    // `letter.animate().alpha(0f).scaleY(0.5f).scaleX(0.5f).rotationBy(360)` is one
    // ViewPropertyAnimator, so the extra full turn shares the 1000 ms accelerate with
    // the fade and the shrink. Starting it also cancels any tap spin still running.
    spinTween?.cancel();
    spinFrom = letterRotation;
    spinTo = spinFrom + 360;
    spinTween = tweens.add(
      {
        duration: 1000,
        ease: accelerate,
        from: spinFrom,
        to: spinTo,
        onUpdate: (v) => {
          letterRotation = v;
        },
      },
      now,
    );

    tweens.add(
      {
        delay: 500,
        duration: 300,
        ease: accelerateDecelerate,
        from: 0,
        to: 1,
        onUpdate: (v) => {
          redAlpha = v;
          redScaleX = 0.01 + v * 0.99;
        },
      },
      now,
    );
    tweens.add(
      {
        delay: 500,
        duration: 1000,
        ease: anticipateOvershoot,
        from: 0.5,
        to: 1,
        onUpdate: (v) => {
          logoScale = v;
        },
      },
      now,
    );
    tweens.add(
      {
        delay: 500,
        duration: 1000,
        // The same animator drives alpha, so it undershoots below 0 and overshoots
        // past 1 exactly like the scale does; `drawPlatLogo` clamps it the way
        // `View.setAlpha` would.
        ease: anticipateOvershoot,
        from: 0,
        to: 1,
        onUpdate: (v) => {
          logoAlpha = v;
        },
      },
      now,
    );
    tweens.add(
      {
        delay: 1000,
        duration: 1000,
        ease: accelerateDecelerate,
        from: 0,
        to: 1,
        onUpdate: (v) => {
          captionAlpha = v;
        },
      },
      now,
    );
  };

  const offDown = context.onPointerDown(() => {
    downAt = performance.now();
  });

  const offUp = context.onPointerUp((x, y) => {
    const held = downAt < 0 ? 0 : performance.now() - downAt;
    downAt = -1;
    const now = lastElapsed;

    if (scene === 'dessertcase') {
      const tile = tileAt(x, y);
      if (tile !== null) {
        place(tile, true, now);
        pendingFillAt = now + DURATION / 2;
      }
      return;
    }

    if (revealed) {
      if (held >= LONG_PRESS_MS) enterDessertCase();
      return;
    }

    if (held >= LONG_PRESS_MS) {
      reveal(now);
      return;
    }

    taps++;
    if (taps >= TAPS_TO_REVEAL) {
      reveal(now);
      return;
    }
    // `letter.animate().cancel()` (`PlatLogoActivity.java:112`): a tap interrupts the
    // spin already in flight from wherever the K currently is, rather than stacking a
    // second tween that fights it for `letterRotation`.
    spinTween?.cancel();
    spinFrom = letterRotation;
    const direction = context.random() > 0.5 ? 360 : -360;
    spinTo = spinFrom + direction - (Math.trunc(letterRotation) % 360);
    spinTween = tweens.add(
      {
        duration: SPIN_MS,
        ease: decelerate,
        from: spinFrom,
        to: spinTo,
        onUpdate: (v) => {
          letterRotation = v;
        },
      },
      now,
    );
  });

  /**
   * Android dispatches touch through the child's transform matrix
   * (`isTransformedTouchPointInView`), so the hit area is the rotated square. Tiles
   * come to rest on a multiple of 90 deg but sit at arbitrary angles mid-move, so the
   * point is inverse-rotated about the tile centre instead of inflating the box by
   * sqrt(2) — which over-selected neighbours by 42 %.
   */
  const tileAt = (px: number, py: number): Tile | null => {
    let best: Tile | null = null;
    for (const tile of tiles) {
      if (!tile.alive || tile.alpha <= 0.05) continue;
      const rad = (-tile.rot * Math.PI) / 180;
      const dx = px - tile.cx;
      const dy = py - tile.cy;
      const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
      const half = tile.size / 2;
      if (Math.abs(lx) <= half && Math.abs(ly) <= half) {
        if (best === null || tile.z > best.z) best = tile;
      }
    }
    return best;
  };

  const offFrame = context.onFrame((_dt, t) => {
    const now = t * 1000;
    lastElapsed = now;
    tweens.update(now);

    if (scene === 'platlogo') {
      if (downAt >= 0 && !revealed && performance.now() - downAt >= LONG_PRESS_MS) {
        downAt = -1;
        reveal(now);
      }
      drawPlatLogo();
      return;
    }

    if (!started) {
      if (startedAt < 0) startedAt = now + 1000;
      if (now >= startedAt) {
        started = true;
        fillFreeList(DURATION * 4, now);
        nextJuggleAt = now + START_DELAY;
      }
    } else {
      if (now >= nextJuggleAt) {
        const candidates = tiles.filter((tile) => tile.alive);
        if (candidates.length > 0) {
          place(context.pick(candidates), true, now);
        }
        fillFreeList(DURATION, now);
        nextJuggleAt = now + JUGGLE_DELAY;
      }
      if (pendingFillAt >= 0 && now >= pendingFillAt) {
        pendingFillAt = -1;
        fillFreeList(DURATION, now);
      }
    }

    drawDessertCase();
  });

  function drawPlatLogo(): void {
    const { ctx, width, height } = context;

    // `Theme.Wallpaper` lets the live wallpaper show through; `#0b0b0c` stands in for
    // it, and `mContent`'s own 0xC0000000 background sits on top of that permanently
    // rather than being replaced once the red arrives.
    ctx.fillStyle = '#0b0b0c';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, width, height);

    // `bg` is the first child added (`PlatLogoActivity.java:92`), so the red expands
    // underneath the letter, not over it.
    if (redAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, redAlpha);
      ctx.translate(width / 2, 0);
      ctx.scale(redScaleX, 1);
      ctx.fillStyle = KITKAT_RED;
      ctx.fillRect(-width / 2, 0, width, height);
      ctx.restore();
    }

    if (letterAlpha > 0.001) {
      const size = Math.min(width, height) * 0.62;
      ctx.save();
      ctx.globalAlpha = letterAlpha;
      ctx.translate(width / 2, height / 2);
      ctx.rotate((letterRotation * Math.PI) / 180);
      ctx.scale(letterScale, letterScale);
      ctx.font = `700 ${size}px system-ui, "Helvetica Neue", Arial, sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('K', 0, 0);
      ctx.restore();
    }

    // AnticipateOvershoot undershoots to -0.15 and overshoots to 1.15; `View.setAlpha`
    // clamps, and an out-of-range `globalAlpha` assignment is silently ignored, so the
    // clamp has to be explicit.
    if (logoAlpha > 0.001) drawLogo(Math.min(1, logoAlpha), logoScale);

    if (captionAlpha > 0.001) {
      ctx.save();
      ctx.globalAlpha = captionAlpha;
      ctx.font = `300 ${Math.max(14, Math.min(width, height) * 0.05)}px system-ui, sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.letterSpacing = '2px';
      ctx.fillText('ANDROID 4.4', width / 2, height - Math.max(28, height * 0.08));
      ctx.restore();
    }
  }

  function drawLogo(alpha: number, scale: number): void {
    const { ctx, width, height } = context;
    const fit = (Math.min(width * 0.82, height * 0.6) / LOGO_W) * scale;
    const offsetX = width / 2 - (LOGO_W / 2) * fit;
    const offsetY = height / 2 - (LOGO_H / 2) * fit;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(offsetX, offsetY);
    ctx.scale(fit, fit);
    // The AOSP oval is a horizontally sheared ellipse: x' = x - 0.347y.
    ctx.transform(1, 0, -0.347, 1, 0, 0);
    ctx.beginPath();
    ctx.ellipse(554.5, 272, 450, 273, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 46;
    ctx.strokeStyle = KITKAT_RED;
    ctx.stroke();

    ctx.translate(554.5, 272);
    ctx.rotate((-10.6 * Math.PI) / 180);
    ctx.font = '700 210px "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
    ctx.fillStyle = KITKAT_RED;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Android', 0, 6);
    ctx.restore();
  }

  function drawDessertCase(): void {
    const { ctx, width, height } = context;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    const ordered = tiles.slice().sort((a, b) => a.z - b.z);
    for (const tile of ordered) {
      if (tile.alpha <= 0.004 || tile.size <= 0.5) continue;
      ctx.save();
      ctx.globalAlpha = tile.alpha;
      ctx.translate(tile.cx, tile.cy);
      ctx.rotate((tile.rot * Math.PI) / 180);
      ctx.fillStyle = tile.color;
      const half = tile.size / 2;
      ctx.fillRect(-half, -half, tile.size, tile.size);
      if (tile.dessert !== null) {
        const sprite = baked.get(tile.dessert);
        if (sprite !== undefined) ctx.drawImage(sprite, -half, -half, tile.size, tile.size);
      }
      ctx.restore();
    }
  }

  rebuildGrid();

  /**
   * `DessertCaseView.onSizeChanged` (`:236-284`) stops the case, tears the grid down,
   * rebuilds `mCells` / `mFreeList` for the new dimensions and restarts it — without
   * the 1 s `onResume` delay, hence `startedAt = 0`.
   */
  const offResize = context.onResize((w, h) => {
    if (scene !== 'dessertcase') return;
    if (gridWidth === w && gridHeight === h) return;
    const wasStarted = started;
    // Every in-flight tween belongs to a tile that is about to be discarded.
    tweens.cancelAll();
    spinTween = null;
    rebuildGrid();
    pendingFillAt = -1;
    startedAt = wasStarted ? 0 : startedAt;
  });

  context.actions.add({
    id: 'case',
    label: '打开 Dessert Case',
    run: () => {
      if (scene === 'dessertcase') return;
      revealed = true;
      redAlpha = 1;
      redScaleX = 1;
      letterAlpha = 0;
      logoAlpha = 1;
      logoScale = 1;
      captionAlpha = 1;
      enterDessertCase();
    },
  });

  return {
    hint: '连点 6 次（或长按）揭示 logo，再长按进入 Dessert Case',
    destroy() {
      offDown();
      offUp();
      offFrame();
      offResize();
      tweens.cancelAll();
    },
  };
}
