/**
 * Icon Quiz puzzle source (Android 10).
 *
 * Upstream picks a random Android framework drawable, renders it into a 16 x 16
 * ALPHA_8 bitmap and thresholds it (`f = a/255; f *= 1.25; out = round(min(f,1))`,
 * i.e. alpha >= 0.4 becomes a filled cell). We cannot ship framework drawables, so
 * each puzzle icon here is drawn with canvas primitives in the same 16 x 16 box
 * and pushed through the identical quantiser.
 */

export interface PuzzleIcon {
  name: string;
  draw(ctx: CanvasRenderingContext2D): void;
}

const TAU = Math.PI * 2;

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, w: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.arc(x, y, Math.max(0.2, r - w), 0, TAU, true);
  ctx.fill('evenodd');
}

export const ICONS: readonly PuzzleIcon[] = [
  {
    name: 'ic_droid',
    draw(ctx) {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(5.4, 3.6);
      ctx.lineTo(4.2, 2);
      ctx.moveTo(10.6, 3.6);
      ctx.lineTo(11.8, 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(8, 7.4, 4.4, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      circle(ctx, 6.4, 5.8, 0.7);
      circle(ctx, 9.6, 5.8, 0.7);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillRect(4.2, 8.4, 7.6, 5.2);
    },
  },
  {
    name: 'ic_heart',
    draw(ctx) {
      ctx.beginPath();
      ctx.moveTo(8, 13.4);
      ctx.bezierCurveTo(2.4, 9.6, 2.2, 5.2, 4.9, 3.9);
      ctx.bezierCurveTo(6.6, 3.1, 8, 4.2, 8, 5.4);
      ctx.bezierCurveTo(8, 4.2, 9.4, 3.1, 11.1, 3.9);
      ctx.bezierCurveTo(13.8, 5.2, 13.6, 9.6, 8, 13.4);
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    name: 'ic_star',
    draw(ctx) {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 6.4 : 2.7;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const x = 8 + Math.cos(a) * r;
        const y = 8.4 + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    name: 'ic_neko',
    draw(ctx) {
      ctx.beginPath();
      ctx.moveTo(3, 6.6);
      ctx.lineTo(3.6, 2.4);
      ctx.lineTo(6.6, 4.8);
      ctx.lineTo(9.4, 4.8);
      ctx.lineTo(12.4, 2.4);
      ctx.lineTo(13, 6.6);
      ctx.arc(8, 8.4, 5, -0.5, Math.PI + 0.5, true);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(4.6, 12.2, 6.8, 2.2);
      ctx.globalCompositeOperation = 'destination-out';
      circle(ctx, 6.2, 8, 0.8);
      circle(ctx, 9.8, 8, 0.8);
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  {
    name: 'ic_cupcake',
    draw(ctx) {
      circle(ctx, 5.4, 5.6, 2.4);
      circle(ctx, 8, 4.6, 2.7);
      circle(ctx, 10.6, 5.6, 2.4);
      ctx.beginPath();
      ctx.moveTo(4, 7.8);
      ctx.lineTo(12, 7.8);
      ctx.lineTo(10.4, 14);
      ctx.lineTo(5.6, 14);
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    name: 'ic_donut',
    draw(ctx) {
      ring(ctx, 8, 8, 6.2, 3);
    },
  },
  {
    name: 'ic_wifi',
    draw(ctx) {
      ctx.strokeStyle = '#000';
      ctx.lineCap = 'round';
      for (const [r, w] of [
        [6.2, 1.5],
        [4.1, 1.5],
        [2, 1.5],
      ] as Array<[number, number]>) {
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(8, 12.4, r, Math.PI * 1.25, Math.PI * 1.75);
        ctx.stroke();
      }
      circle(ctx, 8, 12.4, 1);
    },
  },
  {
    name: 'ic_battery',
    draw(ctx) {
      ctx.fillRect(2, 5, 10.4, 6.4);
      ctx.fillRect(12.8, 7, 1.6, 2.4);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillRect(9.6, 6.4, 1.6, 3.6);
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  {
    name: 'ic_phone',
    draw(ctx) {
      ctx.fillRect(4.4, 1.6, 7.2, 12.8);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillRect(5.6, 3.4, 4.8, 8.2);
      ctx.globalCompositeOperation = 'source-over';
      circle(ctx, 8, 12.9, 0.8);
    },
  },
  {
    name: 'ic_rocket',
    draw(ctx) {
      ctx.beginPath();
      ctx.moveTo(8, 1.4);
      ctx.bezierCurveTo(10.6, 4, 11, 8, 9.8, 11);
      ctx.lineTo(6.2, 11);
      ctx.bezierCurveTo(5, 8, 5.4, 4, 8, 1.4);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(6.2, 8.6);
      ctx.lineTo(3.4, 11.6);
      ctx.lineTo(6.2, 11.4);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(9.8, 8.6);
      ctx.lineTo(12.6, 11.6);
      ctx.lineTo(9.8, 11.4);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(6.8, 11.8, 2.4, 2.6);
    },
  },
  {
    name: 'ic_key',
    draw(ctx) {
      ring(ctx, 5.4, 5.6, 3.2, 1.6);
      ctx.save();
      ctx.translate(7.4, 7.8);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(0, -0.9, 7.4, 1.8);
      ctx.fillRect(4.8, 0.9, 1.5, 2);
      ctx.fillRect(6.8, 0.9, 1.5, 2);
      ctx.restore();
    },
  },
  {
    name: 'ic_cloud',
    draw(ctx) {
      circle(ctx, 5.6, 8.4, 2.6);
      circle(ctx, 8.6, 7, 3.2);
      circle(ctx, 11.2, 8.6, 2.4);
      ctx.fillRect(4.4, 8.6, 8.4, 2.6);
    },
  },
  {
    name: 'ic_lock',
    draw(ctx) {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(8, 6.4, 2.8, Math.PI, 0);
      ctx.stroke();
      ctx.fillRect(4.2, 6.6, 7.6, 7);
      ctx.globalCompositeOperation = 'destination-out';
      circle(ctx, 8, 9.4, 1);
      ctx.fillRect(7.4, 9.8, 1.2, 2.4);
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  {
    name: 'ic_bell',
    draw(ctx) {
      ctx.beginPath();
      ctx.moveTo(3.6, 11);
      ctx.bezierCurveTo(3.6, 6, 5, 2.6, 8, 2.6);
      ctx.bezierCurveTo(11, 2.6, 12.4, 6, 12.4, 11);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(2.6, 11.2, 10.8, 1.6);
      circle(ctx, 8, 14, 1.3);
    },
  },
  {
    name: 'ic_lollipop',
    draw(ctx) {
      circle(ctx, 8, 6, 4.4);
      ctx.globalCompositeOperation = 'destination-out';
      circle(ctx, 8, 6, 2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillRect(7.2, 9.6, 1.6, 5.2);
    },
  },
  {
    name: 'ic_octopus',
    draw(ctx) {
      ctx.beginPath();
      ctx.ellipse(8, 6.4, 4.4, 5, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.3;
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const x = 4.4 + i * 2.4;
        ctx.beginPath();
        ctx.moveTo(x, 9.6);
        ctx.bezierCurveTo(x - 0.8, 12, x + 1.2, 12.6, x + 0.4, 14.6);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'destination-out';
      circle(ctx, 6.4, 5.6, 0.8);
      circle(ctx, 9.6, 5.6, 0.8);
      ctx.globalCompositeOperation = 'source-over';
    },
  },
];

export const GRID = 16;

/** Upstream's `Quare.loadAndQuantize`: alpha * 1.25, clamped, rounded. */
export function quantize(icon: PuzzleIcon): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const out = new Uint8Array(GRID * GRID);
  if (ctx === null) return out;

  ctx.clearRect(0, 0, GRID, GRID);
  ctx.fillStyle = '#000000';
  icon.draw(ctx);

  const data = ctx.getImageData(0, 0, GRID, GRID).data;
  for (let i = 0; i < GRID * GRID; i++) {
    const f = Math.min(1, (data[i * 4 + 3] / 255) * 1.25);
    out[i] = Math.round(f);
  }
  return out;
}

export function runs(line: readonly number[]): string {
  const out: number[] = [];
  let run = 0;
  for (const cell of line) {
    if (cell === 1) run++;
    else if (run > 0) {
      out.push(run);
      run = 0;
    }
  }
  if (run > 0) out.push(run);
  return out.length === 0 ? '0' : out.join('-');
}

export function rowOf(data: Uint8Array, row: number): number[] {
  const out: number[] = [];
  for (let col = 0; col < GRID; col++) out.push(data[row * GRID + col]);
  return out;
}

export function colOf(data: Uint8Array, col: number): number[] {
  const out: number[] = [];
  for (let row = 0; row < GRID; row++) out.push(data[row * GRID + col]);
  return out;
}
