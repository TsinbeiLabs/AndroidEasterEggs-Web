import { Tweens } from '../../core/tween';
import type { Egg, EggContext } from '../../core/types';
import { colOf, GRID, ICONS, quantize, rowOf, runs, type PuzzleIcon } from './icons';

/**
 * Android 10 Quince Tart — "Icon Quiz".
 *
 * PlatLogo is a drag-and-align puzzle over a scrolling backslash backdrop: the
 * "1" glyph has to be rotated to 315 degrees and docked onto the "0" at
 * (+0.2w, +0.3w) to become the tail of a Q. Double tapping a piece spins it
 * 3600 degrees over 10 s (the "1" gets +315 for free). Seven successful docks
 * open the nonogram.
 *
 * Quares renders a 16 x 16 grid with run-length clues; a clue turns `#3ddc84`
 * when its line is satisfied and the puzzle is won when every cell matches.
 */

const DOUBLE_TAP_MS = 350;
const SPIN_MS = 10000;
const CLICKS_TO_UNLOCK = 7;
const SNAP_DISTANCE = 0.2;
const SNAP_TOLERANCE_DEG = 15;
const BACKSLASH_SPEED = 0.25; // px per ms

const Q_GREEN = '#3ddc84';
const Q_NAVY = '#073042';
const Q_TAN = '#eff7cf';

interface Piece {
  id: 'one' | 'zero';
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

  const pieces: Record<'one' | 'zero', Piece> = {
    zero: { id: 'zero', x: 0, y: 0, size: 200, rotation: 0, scale: 1 },
    one: { id: 'one', x: 0, y: 0, size: 200, rotation: 0, scale: 1 },
  };

  let puzzle: Puzzle | null = null;

  const layout = (): void => {
    const { width, height } = context;
    const unit = Math.min(width, height) / 720;
    const size = 200 * Math.max(0.4, unit);
    pieces.zero.size = size;
    pieces.one.size = size;

    const cx = width / 2;
    const textY = height / 2 - 100 * unit;
    const rowY = textY + size * 0.62;
    pieces.zero.x = cx + size * 0.28;
    pieces.zero.y = rowY;
    pieces.one.x = cx - size * 0.62;
    pieces.one.y = rowY;
  };

  layout();
  const offResize = context.onResize(layout);

  const newPuzzle = (): void => {
    const icon = context.pick(ICONS);
    const data = quantize(icon);
    let sum = 0;
    for (const cell of data) sum += cell;
    if (sum === 0) {
      newPuzzle();
      return;
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
      one.x = targetX;
      one.y = targetY;
      one.rotation = 315;
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
    const from = piece.rotation;
    const to = from + 3600 + (piece.id === 'one' ? 315 : 0);
    tweens.add(
      {
        duration: SPIN_MS,
        from,
        to,
        onUpdate: (v) => {
          piece.rotation = v;
        },
      },
      performance.now(),
    );
  };

  const pieceAt = (x: number, y: number): Piece | null => {
    for (const piece of [pieces.one, pieces.zero]) {
      const half = (piece.size / 2) * piece.scale;
      if (Math.abs(x - piece.x) <= half && Math.abs(y - piece.y) <= half) return piece;
    }
    return null;
  };

  const offDown = context.onPointerDown((x, y) => {
    if (scene === 'quares') {
      toggleCell(x, y);
      return;
    }
    const piece = pieceAt(x, y);
    if (piece === null) return;
    dragging = piece;
    grabDx = x - piece.x;
    grabDy = y - piece.y;
    piece.scale = 1.1;

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

  const offUp = context.onPointerUp(() => {
    if (dragging === null) return;
    dragging.scale = 1;
    if (dragging.id === 'one') testOverlap();
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

  const toggleCell = (x: number, y: number): void => {
    if (puzzle === null || victoryAt >= 0) return;
    const { cell, originX, originY } = cellMetrics();
    const col = Math.floor((x - originX) / cell);
    const row = Math.floor((y - originY) / cell);
    if (col < 0 || row < 0 || col >= GRID || row >= GRID) return;

    const i = row * GRID + col;
    puzzle.user[i] = puzzle.user[i] === 1 ? 0 : 1;

    let solved = true;
    for (let k = 0; k < GRID * GRID; k++) {
      if (puzzle.user[k] !== puzzle.data[k]) {
        solved = false;
        break;
      }
    }
    if (solved) {
      victoryAt = performance.now();
      navigator.vibrate?.([0, 30, 40, 30]);
      context.toast(`解出来了：${puzzle.icon.name}`, 3);
    }
  };

  const offFrame = context.onFrame((dt, t) => {
    const now = t * 1000;
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

    const unit = Math.min(width, height) / 720;
    ctx.save();
    ctx.fillStyle = Q_NAVY;
    ctx.font = `500 ${Math.max(24, 400 * unit * 0.28)}px system-ui, "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Android', width / 2, height / 2 - 100 * unit);
    ctx.restore();

    drawZero(pieces.zero);
    drawOne(pieces.one);

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
        const on = current.user[row * GRID + col] === 1;
        ctx.fillStyle = on ? '#FFFFFF' : '#0d1b26';
        ctx.fillRect(x, y, cell - 1, cell - 1);
        if (!on) {
          ctx.strokeStyle = 'rgba(239, 247, 207, 0.18)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, cell - 2, cell - 2);
        }
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

  const offDown2 = context.onPointerDown((x, y) => {
    if (scene !== 'quares' || victoryButton === null) return;
    const { x: bx, y: by, w, h } = victoryButton;
    if (x >= bx && x <= bx + w && y >= by && y <= by + h) newPuzzle();
  });

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
      offDown2();
      offUp();
      offFrame();
      offResize();
      tweens.cancelAll();
    },
  };
}
