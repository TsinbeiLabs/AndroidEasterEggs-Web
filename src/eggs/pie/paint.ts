import type { EggContext } from '../../core/types';

/**
 * PAINT.APK (Android 9.0) — the drawing engine.
 *
 * The artwork lives on an offscreen bitmap exactly like upstream's `Painting`
 * view. `SpotFilter` smooths the input stream (10 sample buffer, position decay
 * 0.5, pressure decay 0.9, newest first) and `plot()` rasterises
 * `r = max(1, pressure^2 * brushWidth)` discs spaced at most `min(4, r+r')/2` px
 * apart, so strokes stay gapless at any speed. Zen mode fades the artwork toward
 * the paper colour by ZEN_FADE every 2 s, erasing a drawing in about 3 minutes.
 */

const ZEN_RATE = 2000;
const FADE_MINS = 180000;
const ZEN_FADE = Math.max(1, (ZEN_RATE / FADE_MINS) * 255);
const MAX_DPR = 2;

const BAR_HEIGHT = 50;
const ROW_HEIGHT = 48;

export const BRUSH_WIDTHS = [1, 3.75, 12, 25.75, 45, 69.75] as const;

interface Spot {
  x: number;
  y: number;
  pressure: number;
}

interface Button {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Exponentially weighted mean over the newest 10 samples. */
class SpotFilter {
  private readonly buffer: Spot[] = [];
  private readonly size: number;
  private readonly posDecay: number;
  private readonly pressureDecay: number;
  private readonly plot: (spot: Spot) => void;
  private precise = false;

  constructor(
    size: number,
    posDecay: number,
    pressureDecay: number,
    plot: (spot: Spot) => void,
  ) {
    this.size = size;
    this.posDecay = posDecay;
    this.pressureDecay = pressureDecay;
    this.plot = plot;
  }

  add(spot: Spot, precise = false): void {
    this.precise = precise;
    this.buffer.unshift(spot);
    if (this.buffer.length > this.size) this.buffer.pop();
    this.plot(this.filtered());
  }

  finish(): void {
    while (this.buffer.length > 1) {
      this.buffer.pop();
      this.plot(this.filtered());
    }
    this.buffer.length = 0;
  }

  reset(): void {
    this.buffer.length = 0;
  }

  private filtered(): Spot {
    let sw = 0;
    let pw = 0;
    let x = 0;
    let y = 0;
    let pressure = 0;
    let wp = 1;
    let wpos = 1;
    for (const spot of this.buffer) {
      x += spot.x * wpos;
      y += spot.y * wpos;
      pressure += spot.pressure * wp;
      sw += wpos;
      pw += wp;
      wpos *= this.posDecay;
      wp *= this.pressureDecay;
      // `PRECISE_STYLUS_INPUT && tool == TOOL_TYPE_STYLUS`: just take the
      // newest one, no need to average.
      if (this.precise) break;
    }
    return { x: x / sw, y: y / sw, pressure: pressure / pw };
  }
}

function hsvColor(hue: number, s: number, v: number): string {
  const h = ((hue % 360) + 360) % 360 / 60;
  const i = Math.floor(h);
  const f = h - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const table: number[][] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ];
  const [r, g, b] = table[i % 6] as [number, number, number];
  const to = (x: number) => Math.round(x * 255);
  return `#${[to(r), to(g), to(b)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

export function makePalette(random: () => number): string[] {
  const hue0 = random() * 360;
  const colors = ['#000000', '#FFFFFF'];
  for (let i = 0; i < 6; i++) colors.push(hsvColor(hue0 + i * 60, 1, 1));
  return colors;
}

export class PaintApp {
  private readonly context: EggContext;
  private readonly artwork: HTMLCanvasElement;
  private readonly actx: CanvasRenderingContext2D;
  private ascale = 1;

  private paper = '#FFFFFF';
  private paintColor = '#000000';
  private colors: string[];
  private brushWidth = 100;
  private zenMode = true;

  private openRow: 'brush' | 'color' | null = null;
  private sampling = false;
  private sampleColor = '#000000';
  private sampleAt: [number, number] | null = null;
  private buttons: Button[] = [];

  private lastX = 0;
  private lastY = 0;
  private lastR = -1;
  private lastZen = 0;
  private drawing = false;
  /** The pointer that owns the current stroke (upstream plots pointer 0 only). */
  private drawingId: number | null = null;
  /** The pointer that owns the current colour-sampling gesture. */
  private sampleId: number | null = null;

  private readonly filter: SpotFilter;
  private readonly listeners: Array<() => void> = [];

  constructor(context: EggContext) {
    this.context = context;
    this.colors = makePalette(context.random);
    this.artwork = document.createElement('canvas');
    const actx = this.artwork.getContext('2d', { willReadFrequently: true });
    if (actx === null) throw new Error('paint needs a 2d context');
    this.actx = actx;
    this.filter = new SpotFilter(10, 0.5, 0.9, (spot) => this.plot(spot));

    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
    if (dark) {
      this.paper = '#000000';
      this.paintColor = '#FFFFFF';
    }

    this.resize();
    this.attach();
  }

  private attach(): void {
    const canvas = this.context.canvas;

    // Upstream fingers report full-scale pressure (r = brushWidth); only a
    // stylus provides a real 0..1 ramp — and a stylus is also the
    // `PRECISE_STYLUS_INPUT` tool that bypasses the smoothing filter.
    const pressureOf = (event: PointerEvent): number =>
      event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : 1;

    const toArt = (event: PointerEvent): Spot => ({
      x: event.offsetX * this.ascale,
      y: event.offsetY * this.ascale,
      pressure: pressureOf(event),
    });

    const inToolbar = (y: number) => y < BAR_HEIGHT + (this.openRow === null ? 0 : ROW_HEIGHT);

    const onDown = (event: PointerEvent) => {
      if (inToolbar(event.offsetY)) {
        this.hitButton(event.offsetX, event.offsetY, true);
        return;
      }
      if (this.sampling) {
        if (this.sampleId === null) this.sampleId = event.pointerId;
        if (event.pointerId !== this.sampleId) return;
        this.sampleColor = this.sampleAtPixel(event.offsetX, event.offsetY);
        this.sampleAt = [event.offsetX, event.offsetY];
        return;
      }
      // `Painting` only ever reads pointer 0 — a second finger is ignored.
      if (this.drawing) return;
      canvas.setPointerCapture?.(event.pointerId);
      this.drawing = true;
      this.drawingId = event.pointerId;
      this.lastR = -1;
      this.filter.reset();
      this.filter.add(toArt(event), event.pointerType === 'pen');
    };

    const onMove = (event: PointerEvent) => {
      if (this.sampling) {
        if (event.pointerId !== this.sampleId) return;
        this.sampleColor = this.sampleAtPixel(event.offsetX, event.offsetY);
        this.sampleAt = [event.offsetX, event.offsetY];
        return;
      }
      if (!this.drawing || event.pointerId !== this.drawingId) return;
      const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
      if (events.length > 0) {
        for (const coalesced of events) {
          this.filter.add(
            {
              x: coalesced.offsetX * this.ascale,
              y: coalesced.offsetY * this.ascale,
              pressure: pressureOf(coalesced),
            },
            coalesced.pointerType === 'pen',
          );
        }
        return;
      }
      this.filter.add(toArt(event), event.pointerType === 'pen');
    };

    const onUp = (event: PointerEvent) => {
      if (this.sampling) {
        if (event.pointerId !== this.sampleId) return;
        this.paintColor = this.sampleColor;
        this.sampling = false;
        this.sampleAt = null;
        this.sampleId = null;
        return;
      }
      if (!this.drawing || event.pointerId !== this.drawingId) return;
      this.drawing = false;
      this.drawingId = null;
      this.filter.add(toArt(event), event.pointerType === 'pen');
      this.filter.finish();
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    this.listeners.push(() => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    });
  }

  private hitButton(x: number, y: number, down: boolean): void {
    for (const button of this.buttons) {
      if (x < button.x || x > button.x + button.w || y < button.y || y > button.y + button.h) continue;
      if (!down) continue;
      switch (button.id) {
        case 'brush':
          this.openRow = this.openRow === 'brush' ? null : 'brush';
          break;
        case 'color':
          this.openRow = this.openRow === 'color' ? null : 'color';
          break;
        case 'dropper':
          this.sampling = true;
          this.openRow = null;
          break;
        case 'zen':
          this.zenMode = !this.zenMode;
          this.context.toast(this.zenMode ? 'Zen on：画作会在约 3 分钟后淡出' : 'Zen off', 2);
          break;
        case 'clear':
          this.clear();
          break;
        case 'invert':
          this.invertContents();
          break;
        default: {
          if (button.id.startsWith('brush:')) {
            const i = Number(button.id.slice(6));
            this.brushWidth = BRUSH_WIDTHS[i] * this.ascale;
            // `hideToolbar(brushes)` after picking a width.
            this.openRow = null;
          } else if (button.id.startsWith('color:')) {
            const i = Number(button.id.slice(6));
            const color = this.colors[i];
            if (color !== undefined) this.paintColor = color;
            // `hideToolbar(colors)` after picking a colour.
            this.openRow = null;
          } else if (button.id === 'reroll') {
            this.colors = makePalette(this.context.random);
          }
          break;
        }
      }
      return;
    }
  }

  resize(): void {
    const { width, height } = this.context;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.max(1, Math.floor(width * dpr));
    const h = Math.max(1, Math.floor(height * dpr));
    if (this.artwork.width === w && this.artwork.height === h) return;

    const previous = document.createElement('canvas');
    previous.width = this.artwork.width;
    previous.height = this.artwork.height;
    if (this.artwork.width > 0) previous.getContext('2d')?.drawImage(this.artwork, 0, 0);

    this.ascale = dpr;
    this.artwork.width = w;
    this.artwork.height = h;
    this.actx.fillStyle = this.paper;
    this.actx.fillRect(0, 0, w, h);
    if (previous.width > 0) this.actx.drawImage(previous, 0, 0, w, h);
  }

  private plot(spot: Spot): void {
    const newR = Math.max(1, Math.pow(spot.pressure, 2) * this.brushWidth);
    const ctx = this.actx;
    ctx.fillStyle = this.paintColor;

    if (this.lastR >= 0) {
      const d = Math.hypot(spot.x - this.lastX, spot.y - this.lastY);
      if (d > 1 && this.lastR + newR > 1) {
        const n = Math.max(1, Math.floor((2 * d) / Math.min(4, this.lastR + newR)));
        const stepX = (spot.x - this.lastX) / n;
        const stepY = (spot.y - this.lastY) / n;
        const stepR = (newR - this.lastR) / n;
        let x = this.lastX;
        let y = this.lastY;
        let r = this.lastR;
        for (let i = 0; i < n - 1; i++) {
          x += stepX;
          y += stepY;
          r += stepR;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.beginPath();
    ctx.arc(spot.x, spot.y, newR, 0, Math.PI * 2);
    ctx.fill();

    this.lastX = spot.x;
    this.lastY = spot.y;
    this.lastR = newR;
  }

  private sampleAtPixel(cssX: number, cssY: number): string {
    const x = Math.floor(cssX * this.ascale);
    const y = Math.floor(cssY * this.ascale);
    if (x < 0 || y < 0 || x >= this.artwork.width || y >= this.artwork.height) return '#000000';
    const data = this.actx.getImageData(x, y, 1, 1).data;
    const to = (v: number) => v.toString(16).padStart(2, '0');
    return `#${to(data[0])}${to(data[1])}${to(data[2])}`;
  }

  clear(): void {
    this.actx.fillStyle = this.paper;
    this.actx.fillRect(0, 0, this.artwork.width, this.artwork.height);
  }

  /**
   * `Painting.invertContents()` — INVERT_CF over the bitmap only. The paper
   * and paint colours are NOT flipped upstream: clear() restores the original
   * paper and the zen fade keeps heading toward it.
   */
  invertContents(): void {
    const { width, height } = this.artwork;
    const image = this.actx.getImageData(0, 0, width, height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
    this.actx.putImageData(image, 0, 0);
  }

  update(now: number): void {
    this.resize();
    if (!this.zenMode) {
      this.lastZen = now;
      return;
    }
    if (this.lastZen === 0) this.lastZen = now;
    if (now - this.lastZen < ZEN_RATE) return;
    this.lastZen = now;

    // FADE_TO_WHITE_CF / FADE_TO_BLACK_CF add a CONSTANT ZEN_FADE offset to
    // every channel (clamped), not a proportional blend — otherwise the
    // artwork would fade asymptotically and never vanish in FADE_MINS.
    // Upstream picks the direction from the paper's blue channel > 0x80.
    const delta = this.paper === '#FFFFFF' ? ZEN_FADE : -ZEN_FADE;
    const { width, height } = this.artwork;
    const image = this.actx.getImageData(0, 0, width, height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] += delta;
      data[i + 1] += delta;
      data[i + 2] += delta;
    }
    this.actx.putImageData(image, 0, 0);
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.context;
    ctx.drawImage(this.artwork, 0, 0, width, height);

    this.buttons = [];
    const dark = this.paper === '#000000';
    const barColor = dark ? '#333333' : '#DDDDDD';
    const iconColor = dark ? '#FFFFFF' : '#000000';

    ctx.fillStyle = barColor;
    ctx.fillRect(0, 0, width, BAR_HEIGHT);

    const ids = ['brush', 'color', 'dropper', 'zen', 'clear'];
    const bw = width / ids.length;
    ids.forEach((id, i) => {
      const x = i * bw;
      this.buttons.push({ id, x, y: 0, w: bw, h: BAR_HEIGHT });
      this.drawIcon(ctx, id, x + bw / 2, BAR_HEIGHT / 2, iconColor);
    });

    if (this.openRow !== null) {
      const y = BAR_HEIGHT;
      ctx.fillStyle = barColor;
      ctx.fillRect(0, y, width, ROW_HEIGHT);

      if (this.openRow === 'brush') {
        const sw = width / BRUSH_WIDTHS.length;
        BRUSH_WIDTHS.forEach((w, i) => {
          const cx = i * sw + sw / 2;
          this.buttons.push({ id: `brush:${i}`, x: i * sw, y, w: sw, h: ROW_HEIGHT });
          ctx.fillStyle = iconColor;
          ctx.beginPath();
          ctx.arc(cx, y + ROW_HEIGHT / 2, Math.max(1.5, (w / 69.75) * 16), 0, Math.PI * 2);
          ctx.fill();
        });
      } else {
        const sw = width / (this.colors.length + 1);
        this.colors.forEach((color, i) => {
          const cx = i * sw + sw / 2;
          this.buttons.push({ id: `color:${i}`, x: i * sw, y, w: sw, h: ROW_HEIGHT });
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(cx, y + ROW_HEIGHT / 2, 13, 0, Math.PI * 2);
          ctx.fill();
          if (color === this.paintColor) {
            ctx.strokeStyle = iconColor;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        });
        const rx = this.colors.length * sw;
        this.buttons.push({ id: 'reroll', x: rx, y, w: sw, h: ROW_HEIGHT });
        ctx.fillStyle = iconColor;
        ctx.font = '16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⟳', rx + sw / 2, y + ROW_HEIGHT / 2);
      }
    }

    this.buttons.push({ id: 'invert', x: width - 72, y: height - 40, w: 64, h: 32 });
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(width - 72, height - 40, 64, 32);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('反色', width - 40, height - 24);

    if (this.sampling) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, BAR_HEIGHT, width, 26);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`取色中：${this.sampleColor}（松手确认）`, width / 2, BAR_HEIGHT + 13);

      if (this.sampleAt !== null) {
        const [sx, sy] = this.sampleAt;
        ctx.save();
        ctx.beginPath();
        ctx.arc(sx, sy - 70, 44, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(
          this.artwork,
          (sx - 22) * this.ascale,
          (sy - 70 - 22) * this.ascale,
          44 * this.ascale,
          44 * this.ascale,
          sx - 44,
          sy - 114,
          88,
          88,
        );
        ctx.restore();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy - 70, 44, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private drawIcon(
    ctx: CanvasRenderingContext2D,
    id: string,
    cx: number,
    cy: number,
    color: string,
  ): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    switch (id) {
      case 'brush': {
        const r = 9;
        const scale = Math.min(1, this.brushWidth / (69.75 * this.ascale));
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1, (r - 2) * scale + 1), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'color': {
        ctx.beginPath();
        ctx.arc(cx, cy, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = this.paintColor;
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'dropper': {
        ctx.beginPath();
        ctx.moveTo(cx - 7, cy + 7);
        ctx.lineTo(cx + 5, cy - 5);
        ctx.lineTo(cx + 8, cy - 2);
        ctx.lineTo(cx - 4, cy + 10);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 8, cy + 10);
        ctx.lineTo(cx - 5, cy + 7);
        ctx.stroke();
        break;
      }
      case 'zen': {
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy - 8);
        ctx.lineTo(cx + 6, cy - 8);
        ctx.lineTo(cx + 6, cy - 4);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + 6, cy + 4);
        ctx.lineTo(cx + 6, cy + 8);
        ctx.lineTo(cx - 6, cy + 8);
        ctx.lineTo(cx - 6, cy + 4);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx - 6, cy - 4);
        ctx.closePath();
        ctx.stroke();
        if (this.zenMode) {
          ctx.globalAlpha = 0.35;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        break;
      }
      case 'clear': {
        ctx.beginPath();
        ctx.moveTo(cx - 7, cy - 7);
        ctx.lineTo(cx + 7, cy + 7);
        ctx.moveTo(cx + 7, cy - 7);
        ctx.lineTo(cx - 7, cy + 7);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  destroy(): void {
    for (const off of this.listeners.splice(0)) off();
  }
}
