import { Tweens, type TweenHandle } from '../../core/tween';
import type { Egg, EggContext } from '../../core/types';
import { colOf, GRID, ICONS, quantize, rowOf, runs, type PuzzleIcon } from './icons';

/**
 * Android 10 Quince Tart — "Icon Quiz".
 *
 * PlatLogo is a drag-and-align puzzle over a scrolling backslash backdrop: the
 * "1" glyph has to be rotated to 315 degrees and docked onto the "0" at
 * (+0.2w, +0.3w) to become the tail of a Q. Double tapping a piece spins it
 * 3600 degrees over 10 s on AccelerateDecelerate (the "1" gets +315 for free);
 * like the upstream ObjectAnimator, the spin is cancelled on release, so it
 * only advances while the piece is held. Seven successful docks open the
 * nonogram.
 *
 * Quares renders a 16 x 16 grid with run-length clues; a clue turns `#3ddc84`
 * when its line is satisfied and the puzzle is won when every cell matches.
 * Cells follow the `q_pixel_bg` selector: white (`q_pixel_off`) by default,
 * black (`q_pixel_on`) when marked and `q_red` while pressed.
 */

const DOUBLE_TAP_MS = 350;
const SPIN_MS = 10000;
/** ViewPropertyAnimator default duration, used by the dock snap. */
const DOCK_MS = 300;
const CLICKS_TO_UNLOCK = 7;
const SNAP_DISTANCE = 0.2;
const SNAP_TOLERANCE_DEG = 15;
const BACKSLASH_SPEED = 0.25; // px per ms

const Q_GREEN = '#3ddc84';
const Q_NAVY = '#073042';
const Q_TAN = '#eff7cf';
/** `q_red` — the pressed-cell colour from the `q_pixel_bg` selector. */
const Q_RED = '#f8c734';
/** `q_pixel_on` / `q_pixel_off`: a marked cell is BLACK on a white board. */
const PIXEL_ON = '#000000';
const PIXEL_OFF = '#FFFFFF';

/** `AccelerateDecelerateInterpolator` — the default for ObjectAnimator/ViewPropertyAnimator. */
const ACCEL_DECEL = (t: number): number => 0.5 - Math.cos(Math.PI * t) / 2;

interface Piece {
  id: 'one' | 'zero' | 'text';
  x: number;
  y: number;
  size: number;
  rotation: number;
  scale: number;
}

interface Puzzle {
  icon: PuzzleIcon;
  data: Uint8Array;
  user: Uint8Array;
}

type Scene = 'platlogo' | 'quares';

function makeBackslashTile(): HTMLCanvasElement {
  const tile = document.createElement('canvas');
  tile.width = 50;
  tile.height = 50;
  const ctx = tile.getContext('2d');
  if (ctx === null) return tile;
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(25, 0);
  ctx.lineTo(50, 25);
  ctx.lineTo(50, 50);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 25);
  ctx.lineTo(25, 50);
  ctx.lineTo(0, 50);
  ctx.closePath();
  ctx.fill();
  return tile;
}

export default function createQ(context: EggContext): Egg {
  const tweens = new Tweens();
  const tile = makeBackslashTile();
  const pattern = context.ctx.createPattern(tile, 'repeat');

  let scene: Scene = 'platlogo';
  let clicks = 0;
  let backslashOffset = 0;
  let backslashRunning = false;
  let dragging: Piece | null = null;
  let grabDx = 0;
  let grabDy = 0;
  let lastTapAt = -1;
  let lastTapPiece: Piece | null = null;
  let victoryButton: { x: number; y: number; w: number; h: number } | null = null;
  let victoryAt = -1;
  /** Host clock (ms since egg mount) of the current/last frame, for tweens. */
  let frameNow = 0;
  /** Cell index held down in the nonogram, or -1 (`q_pixel_bg` state_pressed). */
  let pressedCell = -1;
  /** `bringChildToFront`: the last grabbed piece draws on top. */
  let topPiece: Piece['id'] = 'zero';

  const spinTweens = new Map<Piece, TweenHandle>();

  const pieces: Record<Piece['id'], Piece> = {
    zero: { id: 'zero', x: 0, y: 0, size: 200, rotation: 0, scale: 1 },
    one: { id: 'one', x: 0, y: 0, size: 200, rotation: 0, scale: 1 },
    // The wordmark ImageView shares the plain `tl` listener: it can be dragged
    // and double-tap spun like the "0".
    text: { id: 'text', x: 0, y: 0, size: 200, rotation: 0, scale: 1 },
  };

  let puzzle: Puzzle | null = null;

  const layout = (): void => {
    const { width, height } = context;
    const unit = Math.min(width, height) / 720;
    const size = 200 * Math.max(0.4, unit);
    pieces.zero.size = size;
    pieces.one.size = size;
    pieces.text.size = size;

    // `q_platlogo_layout`: the pieces (200dp) hang below the 400dp logotype,
    // whose layout box reaches 80dp into them (marginBottom -80dp) — putting
    // their centres 0.82 * size below the translated text centre — with "1"
    // aligned to the text's left edge + 24dp and "0" to its right edge - 34dp.
    const cx = width / 2;
    const textY = height / 2 - 100 * unit;
    const rowY = textY + size * 0.82;
    pieces.zero.x = cx + size * 0.33;
    pieces.zero.y = rowY;
    pieces.one.x = cx - size * 0.38;
    pieces.one.y = rowY;
    pieces.text.x = cx;
    pieces.text.y = textY;
  };

  layout();
  const offResize = context.onResize(layout);

  const newPuzzle = (): void => {
    // `QuaresActivity.newPuzzle`: up to 4 tries, avoiding both a blank puzzle
    // (`isBlank`) and an immediate repeat of the previous one.
    const previous = puzzle?.icon;
    let icon = context.pick(ICONS);
    let data = quantize(icon);
    for (let tries = 0; tries < 3; tries++) {
      let sum = 0;
      for (const cell of data) sum += cell;
      if (sum !== 0 && icon !== previous) break;
      icon = context.pick(ICONS);
      data = quantize(icon);
    }
    puzzle = { icon, data, user: new Uint8Array(GRID * GRID) };
    victoryAt = -1;
  };

  const testOverlap = (): void => {
    const { one, zero } = pieces;
    const w = zero.size;
    const targetX = zero.x + w * SNAP_DISTANCE;
    const targetY = zero.y + w * 0.3;
    const rotation = ((one.rotation % 360) + 360) % 360;

    if (
      Math.hypot(targetX - one.x, targetY - one.y) < w * SNAP_DISTANCE &&
      Math.abs(rotation - 315) < SNAP_TOLERANCE_DEG
    ) {
      // `testOverlap`: the piece GLIDES to the dock over the ViewPropertyAnimator
      // default 300 ms — x/y to the target and rotation from `rotation % 360`
      // (applied immediately) to 315.
      const fromX = one.x;
      const fromY = one.y;
      one.rotation = rotation;
      tweens.add(
        {
          duration: DOCK_MS,
          ease: ACCEL_DECEL,
          onUpdate: (v) => {
            one.x = fromX + (targetX - fromX) * v;
            one.y = fromY + (targetY - fromY) * v;
            one.rotation = rotation + (315 - rotation) * v;
          },
        },
        frameNow,
      );
      navigator.vibrate?.(20);
      backslashRunning = true;
      clicks++;
      context.toast(`Q ${clicks}/${CLICKS_TO_UNLOCK}`, 1.2);
      if (clicks >= CLICKS_TO_UNLOCK) {
        if (context.store.get<number>('q_egg_mode', 0) === 0) {
          context.store.set('q_egg_mode', Date.now());
        }
        scene = 'quares';
        newPuzzle();
      }
    } else {
      backslashRunning = false;
    }
  };

  const spin = (piece: Piece): void => {
    // `OffsetRotationAnimatorTouchListener` / `tl`: ObjectAnimator ROTATION
    // from the current value to +3600 (the "1" listener adds its 315 offset),
    // 10 s on the default AccelerateDecelerateInterpolator — and cancelled on
    // every ACTION_UP, so the spin only advances while the piece is held.
    spinTweens.get(piece)?.cancel();
    const from = piece.rotation;
    const to = from + 3600 + (piece.id === 'one' ? 315 : 0);
    spinTweens.set(
      piece,
      tweens.add(
        {
          duration: SPIN_MS,
          ease: ACCEL_DECEL,
          from,
          to,
          onUpdate: (v) => {
            piece.rotation = v;
          },
        },
        frameNow,
      ),
    );
  };

  const pieceAt = (x: number, y: number): Piece | null => {
    for (const piece of [pieces.one, pieces.zero]) {
      const half = (piece.size / 2) * piece.scale;
      if (Math.abs(x - piece.x) <= half && Math.abs(y - piece.y) <= half) return piece;
    }
    // The logotype view: 400dp wide, adjustViewBounds -> 400 * 64/290 high.
    const text = pieces.text;
    const ts = (text.size / 200) * text.scale;
    if (Math.abs(x - text.x) <= 200 * ts && Math.abs(y - text.y) <= 44.14 * ts) return text;
    return null;
  };

  const offDown = context.onPointerDown((x, y) => {
    if (scene === 'quares') {
      // The PixelButton is a CompoundButton: it shows `q_red` while pressed
      // and only toggles when the click completes on release.
      pressedCell = cellIndexAt(x, y);
      return;
    }
    const piece = pieceAt(x, y);
    if (piece === null) return;
    dragging = piece;
    grabDx = x - piece.x;
    grabDy = y - piece.y;
    piece.scale = 1.1;
    topPiece = piece.id;

    const now = performance.now();
    if (lastTapPiece === piece && now - lastTapAt < DOUBLE_TAP_MS) {
      spin(piece);
      lastTapAt = -1;
      lastTapPiece = null;
    } else {
      lastTapAt = now;
      lastTapPiece = piece;
    }
  });

  const offUp = context.onPointerUp((x, y) => {
    if (scene === 'quares') {
      const released = cellIndexAt(x, y);
      if (pressedCell >= 0 && released === pressedCell) toggleCell(pressedCell);
      pressedCell = -1;
      if (victoryButton !== null) {
        const { x: bx, y: by, w, h } = victoryButton;
        if (x >= bx && x <= bx + w && y >= by && y <= by + h) newPuzzle();
      }
      return;
    }
    if (dragging === null) return;
    dragging.scale = 1;
    // ACTION_UP cancels the rotation animator: releasing freezes the spin.
    spinTweens.get(dragging)?.cancel();
    spinTweens.delete(dragging);
    // Every listener (both the "1" one and the shared zero/text `tl`) runs
    // testOverlap on release — dragging the "0" away therefore also stops the
    // backslash backdrop and can even re-dock the "1".
    testOverlap();
    dragging = null;
  });

  const cellMetrics = () => {
    const { width, height } = context;
    const clue = Math.max(40, Math.min(width, height) * 0.14);
    const cell = Math.max(
      4,
      Math.min((width - clue - 24) / (GRID + 0.5), (height - clue - 96) / (GRID + 0.5)),
    );
    const originX = (width - (clue + cell * GRID)) / 2 + clue;
    const originY = (height - (clue + cell * GRID)) / 2 + clue;
    return { clue, cell, originX, originY };
  };

  const cellIndexAt = (x: number, y: number): number => {
    const { cell, originX, originY } = cellMetrics();
    const col = Math.floor((x - originX) / cell);
    const row = Math.floor((y - originY) / cell);
    if (col < 0 || row < 0 || col >= GRID || row >= GRID) return -1;
    return row * GRID + col;
  };

  const toggleCell = (i: number): void => {
    if (puzzle === null || victoryAt >= 0) return;

    puzzle.user[i] = puzzle.user[i] === 1 ? 0 : 1;

    let solved = true;
    for (let k = 0; k < GRID * GRID; k++) {
      if (puzzle.user[k] !== puzzle.data[k]) {
        solved = false;
        break;
      }
    }
    if (solved) {
      victoryAt = frameNow;
      navigator.vibrate?.([0, 30, 40, 30]);
      context.toast(`解出来了：${puzzle.icon.name}`, 3);
    }
  };

  const offFrame = context.onFrame((dt, t) => {
    const now = t * 1000;
    frameNow = now;
    tweens.update(now);
    const { ctx, width, height } = context;

    ctx.fillStyle = '#f7f7f5';
    ctx.fillRect(0, 0, width, height);

    if (scene === 'quares') {
      drawQuares();
      return;
    }

    if (dragging !== null && context.pointer.down) {
      dragging.x = context.pointer.x - grabDx;
      dragging.y = context.pointer.y - grabDy;
    }
    if (backslashRunning) backslashOffset += BACKSLASH_SPEED * dt * 1000;

    if (pattern !== null) {
      ctx.save();
      ctx.globalAlpha = 0.125;
      ctx.translate(backslashOffset % 50, 0);
      ctx.fillStyle = pattern;
      ctx.fillRect(-50, 0, width + 100, height);
      ctx.restore();
    }

    // `bringChildToFront(v)` on touch: the last grabbed piece draws on top,
    // the others keep the XML order (text, one, zero).
    const drawPiece = (piece: Piece): void => {
      if (piece.id === 'text') drawText(piece);
      else if (piece.id === 'one') drawOne(piece);
      else drawZero(piece);
    };
    for (const piece of [pieces.text, pieces.one, pieces.zero]) {
      if (piece.id !== topPiece) drawPiece(piece);
    }
    drawPiece(pieces[topPiece]);

    ctx.save();
    ctx.fillStyle = 'rgba(7, 48, 66, 0.7)';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `把 “1” 双击转到 315°，拖到 “0” 的右下方拼成 Q（${clicks}/${CLICKS_TO_UNLOCK}）`,
      width / 2,
      height - 24,
    );
    ctx.restore();
  });

  function strokeGlyph(ctx: CanvasRenderingContext2D, piece: Piece, draw: () => void): void {
    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate((piece.rotation * Math.PI) / 180);
    ctx.scale(piece.scale, piece.scale);
    const k = piece.size / 24;
    ctx.scale(k, k);
    ctx.translate(-12, -12);
    ctx.strokeStyle = Q_NAVY;
    ctx.lineWidth = 4;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    draw();
    ctx.restore();
  }

  function drawZero(piece: Piece): void {
    strokeGlyph(context.ctx, piece, () => {
      context.ctx.beginPath();
      context.ctx.arc(12, 12, 10, 0, Math.PI * 2);
      context.ctx.stroke();
    });
  }

  function drawText(piece: Piece): void {
    const ctx = context.ctx;
    const s = piece.size / 200;
    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate((piece.rotation * Math.PI) / 180);
    ctx.scale(piece.scale, piece.scale);
    ctx.fillStyle = Q_NAVY;
    ctx.font = `500 ${Math.max(24, 400 * s * 0.28)}px system-ui, "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Android', 0, 0);
    ctx.restore();
  }

  function drawOne(piece: Piece): void {
    strokeGlyph(context.ctx, piece, () => {
      context.ctx.beginPath();
      context.ctx.moveTo(12, 21.83);
      context.ctx.lineTo(12, 2.16);
      context.ctx.lineTo(7, 2.16);
      context.ctx.stroke();
    });
  }

  function drawQuares(): void {
    const { ctx, width, height } = context;
    const current = puzzle;
    if (current === null) return;

    const { clue, cell, originX, originY } = cellMetrics();

    ctx.fillStyle = Q_NAVY;
    ctx.fillRect(0, 0, width, height);

    const fontSize = Math.max(8, Math.min(14, cell * 0.62));

    for (let row = 0; row < GRID; row++) {
      const line = rowOf(current.data, row);
      const satisfied = rowOf(current.user, row).every((v, i) => v === line[i]);
      const y = originY + row * cell;
      ctx.fillStyle = satisfied ? Q_GREEN : Q_TAN;
      ctx.fillRect(originX - clue - 4, y, clue, cell - 1);
      ctx.save();
      ctx.fillStyle = Q_NAVY;
      ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(runs(line), originX - clue / 2 - 4, y + cell / 2);
      ctx.restore();
    }

    for (let col = 0; col < GRID; col++) {
      const line = colOf(current.data, col);
      const satisfied = colOf(current.user, col).every((v, i) => v === line[i]);
      const x = originX + col * cell;
      ctx.fillStyle = satisfied ? Q_GREEN : Q_TAN;
      ctx.fillRect(x, originY - clue - 4, cell - 1, clue);
      ctx.save();
      ctx.translate(x + cell / 2, originY - clue / 2 - 4);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = Q_NAVY;
      ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(runs(line), 0, 0);
      ctx.restore();
    }

    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const x = originX + col * cell;
        const y = originY + row * cell;
        const i = row * GRID + col;
        // `q_pixel_bg` selector: pressed -> q_red, checked -> q_pixel_on
        // (black), default -> q_pixel_off (white).
        ctx.fillStyle = i === pressedCell ? Q_RED : current.user[i] === 1 ? PIXEL_ON : PIXEL_OFF;
        ctx.fillRect(x, y, cell - 1, cell - 1);
      }
    }

    if (victoryAt >= 0) {
      const label = current.icon.name.replace(/^.+\//, '');
      ctx.font = `700 ${Math.max(14, cell)}px system-ui, sans-serif`;
      const w = ctx.measureText(label).width + 48;
      const h = cell * 2.2;
      const x = width / 2 - w / 2;
      const y = originY + GRID * cell + 16;
      victoryButton = { x, y, w, h };
      ctx.fillStyle = Q_GREEN;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = Q_NAVY;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, width / 2, y + h / 2);
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillStyle = Q_TAN;
      ctx.fillText('点按钮换一题', width / 2, y + h + 16);
    } else {
      victoryButton = null;
    }
  }

  context.actions.add({
    id: 'quares',
    label: '打开 Icon Quiz',
    run: () => {
      if (scene === 'quares') {
        scene = 'platlogo';
        puzzle = null;
        return;
      }
      scene = 'quares';
      clicks = CLICKS_TO_UNLOCK;
      newPuzzle();
    },
  });

  return {
    hint: '双击 “1” 旋转，拖到 “0” 右下方拼成 Q；凑满 7 次进入数织',
    destroy() {
      offDown();
      offUp();
      offFrame();
      offResize();
      tweens.cancelAll();
    },
  };
}
