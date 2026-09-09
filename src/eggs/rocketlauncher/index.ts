import type { Egg, EggContext } from '../../core/types';

/**
 * RocketLauncher — `com.android.launcher2.RocketLauncher`, the Android 2.x home
 * screen that the app ships as a screensaver easter egg. This is a homage rather
 * than a port: three swipeable pages of a 4 x 4 icon grid, a four slot dock, page
 * indicators and a search pill, with every icon drawn from primitives (the
 * upstream assets are bitmap/9-patch resources).
 */

const PAGES = 3;
const COLS = 4;
const ROWS = 4;

interface AppIcon {
  name: string;
  color: string;
  glyph: 'globe' | 'mail' | 'pin' | 'bag' | 'phone' | 'chat' | 'camera' | 'photo' | 'note' | 'gear' | 'calc' | 'clock' | 'people' | 'search' | 'mic' | 'wrench' | 'terminal';
}

const DOCK: readonly AppIcon[] = [
  { name: 'Phone', color: '#4CAF50', glyph: 'phone' },
  { name: 'Messaging', color: '#29B6F6', glyph: 'chat' },
  { name: 'Browser', color: '#FF7043', glyph: 'globe' },
  { name: 'Camera', color: '#78909C', glyph: 'camera' },
];

const APPS: readonly AppIcon[] = [
  { name: 'Gmail', color: '#E53935', glyph: 'mail' },
  { name: 'Maps', color: '#43A047', glyph: 'pin' },
  { name: 'Market', color: '#8E24AA', glyph: 'bag' },
  { name: 'Gallery', color: '#FB8C00', glyph: 'photo' },
  { name: 'Music', color: '#F06292', glyph: 'note' },
  { name: 'Settings', color: '#607D8B', glyph: 'gear' },
  { name: 'Calculator', color: '#26A69A', glyph: 'calc' },
  { name: 'Clock', color: '#5C6BC0', glyph: 'clock' },
  { name: 'Contacts', color: '#29B6F6', glyph: 'people' },
  { name: 'Email', color: '#7E57C2', glyph: 'mail' },
  { name: 'Search', color: '#42A5F5', glyph: 'search' },
  { name: 'Voice Search', color: '#66BB6A', glyph: 'mic' },
  { name: 'Spare Parts', color: '#8D6E63', glyph: 'wrench' },
  { name: 'Dev Tools', color: '#37474F', glyph: 'terminal' },
];

export default function createRocketLauncher(context: EggContext): Egg {
  let page = 0;
  let dragStartX = 0;
  let dragOffset = 0;
  let dragging = false;
  let velocity = 0;
  let lastX = 0;

  const pages: AppIcon[][] = [[], [], []];
  APPS.forEach((app, i) => {
    pages[i % PAGES].push(app);
  });

  const iconSize = () => Math.min(64, Math.max(36, context.width / 9));

  const gridMetrics = () => {
    const { width, height } = context;
    const size = iconSize();
    const gapX = (width - COLS * size) / (COLS + 1);
    const top = height * 0.16;
    const dockH = size * 1.5;
    const gridH = height - top - dockH - 40;
    const gapY = (gridH - ROWS * size) / (ROWS + 1);
    return { size, gapX, gapY, top, gridH, dockH };
  };

  const iconRect = (index: number, pageIndex: number) => {
    const { size, gapX, gapY, top } = gridMetrics();
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    const x = gapX + col * (size + gapX) + pageIndex * context.width;
    const y = top + gapY + row * (size + gapY);
    return { x, y, w: size, h: size };
  };

  const dockRect = (index: number) => {
    const { width, height } = context;
    const size = iconSize();
    const gapX = (width - COLS * size) / (COLS + 1);
    const y = height - size - 24;
    return { x: gapX + index * (size + gapX), y, w: size, h: size };
  };

  const hitTest = (px: number, py: number): AppIcon | null => {
    const offset = page * context.width - dragOffset;
    for (let p = 0; p < PAGES; p++) {
      const list = pages[p];
      for (let i = 0; i < list.length; i++) {
        const rect = iconRect(i, p);
        const x = rect.x - offset;
        if (px >= x && px <= x + rect.w && py >= rect.y && py <= rect.y + rect.h + 18) {
          return list[i];
        }
      }
    }
    for (let i = 0; i < DOCK.length; i++) {
      const rect = dockRect(i);
      if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h + 18) {
        return DOCK[i];
      }
    }
    return null;
  };

  const offDown = context.onPointerDown((x) => {
    dragging = true;
    dragStartX = x;
    lastX = x;
    velocity = 0;
  });

  const offUp = context.onPointerUp((x, y) => {
    if (!dragging) return;
    dragging = false;
    const moved = x - dragStartX;
    dragOffset = 0;

    if (Math.abs(moved) < 8) {
      const app = hitTest(x, y);
      if (app !== null) context.toast(`正在启动 ${app.name}…`, 1.6);
      return;
    }

    const flick = velocity < -0.35 ? 1 : velocity > 0.35 ? -1 : 0;
    const dragged = moved < -context.width * 0.25 ? 1 : moved > context.width * 0.25 ? -1 : 0;
    page = Math.max(0, Math.min(PAGES - 1, page + (dragged !== 0 ? dragged : flick)));
  });

  const drawGlyph = (
    ctx: CanvasRenderingContext2D,
    glyph: AppIcon['glyph'],
    x: number,
    y: number,
    size: number,
  ): void => {
    const cx = x + size / 2;
    const cy = y + size / 2;
    const u = size / 24;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = Math.max(1.2, 1.6 * u);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (glyph) {
      case 'globe':
        ctx.beginPath();
        ctx.arc(cx, cy, 8 * u, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(cx, cy, 3.4 * u, 8 * u, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 8 * u, cy);
        ctx.lineTo(cx + 8 * u, cy);
        ctx.stroke();
        break;
      case 'mail':
        ctx.strokeRect(cx - 8 * u, cy - 5.5 * u, 16 * u, 11 * u);
        ctx.beginPath();
        ctx.moveTo(cx - 8 * u, cy - 5.5 * u);
        ctx.lineTo(cx, cy + 1.5 * u);
        ctx.lineTo(cx + 8 * u, cy - 5.5 * u);
        ctx.stroke();
        break;
      case 'pin':
        ctx.beginPath();
        ctx.arc(cx, cy - 2 * u, 5 * u, Math.PI, 0);
        ctx.lineTo(cx, cy + 8 * u);
        ctx.closePath();
        ctx.stroke();
        break;
      case 'bag':
        ctx.strokeRect(cx - 7 * u, cy - 4 * u, 14 * u, 11 * u);
        ctx.beginPath();
        ctx.arc(cx, cy - 4 * u, 3.6 * u, Math.PI, 0);
        ctx.stroke();
        break;
      case 'phone':
        ctx.beginPath();
        ctx.moveTo(cx - 6 * u, cy - 7 * u);
        ctx.lineTo(cx - 2 * u, cy - 7 * u);
        ctx.lineTo(cx - 1 * u, cy - 2 * u);
        ctx.lineTo(cx - 3.5 * u, cy);
        ctx.bezierCurveTo(cx - 1 * u, cy + 4 * u, cx + 2 * u, cy + 5 * u, cx + 4 * u, cy + 5 * u);
        ctx.lineTo(cx + 6 * u, cy + 2 * u);
        ctx.lineTo(cx + 8 * u, cy + 5 * u);
        ctx.lineTo(cx + 6 * u, cy + 8 * u);
        ctx.bezierCurveTo(cx - 2 * u, cy + 8 * u, cx - 8 * u, cy + 1 * u, cx - 6 * u, cy - 7 * u);
        ctx.closePath();
        ctx.fill();
        break;
      case 'chat':
        ctx.beginPath();
        ctx.roundRect(cx - 8 * u, cy - 6 * u, 16 * u, 11 * u, 3 * u);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - 3 * u, cy + 5 * u);
        ctx.lineTo(cx - 3 * u, cy + 9 * u);
        ctx.lineTo(cx + 2 * u, cy + 5 * u);
        ctx.closePath();
        ctx.fill();
        break;
      case 'camera':
        ctx.beginPath();
        ctx.roundRect(cx - 8 * u, cy - 5 * u, 16 * u, 11 * u, 2 * u);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy + 0.5 * u, 3.4 * u, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillRect(cx - 3 * u, cy - 7.5 * u, 6 * u, 2.5 * u);
        break;
      case 'photo':
        ctx.strokeRect(cx - 8 * u, cy - 6 * u, 16 * u, 12 * u);
        ctx.beginPath();
        ctx.arc(cx - 3.5 * u, cy - 2 * u, 1.6 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx - 8 * u, cy + 6 * u);
        ctx.lineTo(cx - 2 * u, cy);
        ctx.lineTo(cx + 3 * u, cy + 4 * u);
        ctx.lineTo(cx + 6 * u, cy + 1 * u);
        ctx.lineTo(cx + 8 * u, cy + 6 * u);
        ctx.closePath();
        ctx.fill();
        break;
      case 'note':
        ctx.beginPath();
        ctx.arc(cx - 3 * u, cy + 4 * u, 2.6 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx - 0.6 * u, cy + 4 * u);
        ctx.lineTo(cx - 0.6 * u, cy - 7 * u);
        ctx.lineTo(cx + 6 * u, cy - 8.5 * u);
        ctx.stroke();
        break;
      case 'gear':
        ctx.beginPath();
        ctx.arc(cx, cy, 4 * u, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * 5.6 * u, cy + Math.sin(a) * 5.6 * u);
          ctx.lineTo(cx + Math.cos(a) * 8.4 * u, cy + Math.sin(a) * 8.4 * u);
          ctx.stroke();
        }
        break;
      case 'calc':
        ctx.strokeRect(cx - 7 * u, cy - 8 * u, 14 * u, 16 * u);
        ctx.fillRect(cx - 5 * u, cy - 6 * u, 10 * u, 3.4 * u);
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < 3; c++) {
            ctx.beginPath();
            ctx.arc(cx - 4 * u + c * 4 * u, cy + 1 * u + r * 4.4 * u, 1.1 * u, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      case 'clock':
        ctx.beginPath();
        ctx.arc(cx, cy, 8 * u, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, cy - 5 * u);
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + 4 * u, cy + 1.5 * u);
        ctx.stroke();
        break;
      case 'people':
        ctx.beginPath();
        ctx.arc(cx - 3.4 * u, cy - 3 * u, 2.8 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 4 * u, cy - 3.4 * u, 2.3 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx - 3.4 * u, cy + 7 * u, 6 * u, Math.PI, 0);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 4.4 * u, cy + 7 * u, 5 * u, Math.PI, 0);
        ctx.fill();
        break;
      case 'search':
        ctx.beginPath();
        ctx.arc(cx - 1.6 * u, cy - 1.6 * u, 5.6 * u, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 2.6 * u, cy + 2.6 * u);
        ctx.lineTo(cx + 7.4 * u, cy + 7.4 * u);
        ctx.stroke();
        break;
      case 'mic':
        ctx.beginPath();
        ctx.roundRect(cx - 2.6 * u, cy - 8 * u, 5.2 * u, 11 * u, 2.6 * u);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy + 1 * u, 5.6 * u, 0, Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy + 6.6 * u);
        ctx.lineTo(cx, cy + 9 * u);
        ctx.stroke();
        break;
      case 'wrench':
        ctx.beginPath();
        ctx.moveTo(cx - 6 * u, cy + 6 * u);
        ctx.lineTo(cx + 3 * u, cy - 3 * u);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + 5 * u, cy - 5 * u, 3.6 * u, 0.6, Math.PI * 1.9);
        ctx.stroke();
        break;
      case 'terminal':
        ctx.strokeRect(cx - 8 * u, cy - 6 * u, 16 * u, 12 * u);
        ctx.beginPath();
        ctx.moveTo(cx - 5 * u, cy - 2 * u);
        ctx.lineTo(cx - 2 * u, cy + 0.5 * u);
        ctx.lineTo(cx - 5 * u, cy + 3 * u);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy + 3 * u);
        ctx.lineTo(cx + 5 * u, cy + 3 * u);
        ctx.stroke();
        break;
    }
    ctx.restore();
  };

  const drawIcon = (
    ctx: CanvasRenderingContext2D,
    app: AppIcon,
    x: number,
    y: number,
    size: number,
  ): void => {
    ctx.save();
    ctx.fillStyle = app.color;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, size * 0.22);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.roundRect(x, y, size, size * 0.42, size * 0.22);
    ctx.fill();
    drawGlyph(ctx, app.glyph, x, y, size);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `${Math.max(9, size * 0.19)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 3;
    ctx.fillText(app.name, x + size / 2, y + size + 4, size * 1.6);
    ctx.restore();
  };

  const offFrame = context.onFrame((dt) => {
    const { ctx, width, height, pointer } = context;

    if (pointer.down && dragging) {
      dragOffset = pointer.x - dragStartX;
      velocity = (pointer.x - lastX) / Math.max(dt, 1 / 240);
      velocity = velocity / Math.max(1, width);
      lastX = pointer.x;
    }
    if (!pointer.down) dragging = false;

    const wallpaper = ctx.createLinearGradient(0, 0, width * 0.3, height);
    wallpaper.addColorStop(0, '#16324f');
    wallpaper.addColorStop(0.55, '#0d1f33');
    wallpaper.addColorStop(1, '#060d16');
    ctx.fillStyle = wallpaper;
    ctx.fillRect(0, 0, width, height);

    const offset = page * width - dragOffset;

    ctx.save();
    ctx.translate(-offset, 0);
    for (let p = 0; p < PAGES; p++) {
      const list = pages[p];
      list.forEach((app, i) => {
        const rect = iconRect(i, p);
        drawIcon(ctx, app, rect.x, rect.y, rect.w);
      });
    }
    ctx.restore();

    // Dock and search pill stay pinned.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.fillRect(0, height - iconSize() - 40, width, iconSize() + 40);
    DOCK.forEach((app, i) => {
      const rect = dockRect(i);
      drawIcon(ctx, app, rect.x, rect.y, rect.w);
    });

    if (page === 0) {
      const pillW = Math.min(360, width - 64);
      const pillX = (width - pillW) / 2;
      const pillY = height * 0.05;
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, 34, 17);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔍  搜索（致敬 launcher2）', pillX + 16, pillY + 17);
    }

    const dotY = height - iconSize() - 56;
    for (let p = 0; p < PAGES; p++) {
      ctx.fillStyle = p === page ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(width / 2 + (p - 1) * 16, dotY, p === page ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  return {
    hint: '左右滑动翻页，点图标“启动”应用',
    destroy() {
      offDown();
      offUp();
      offFrame();
    },
  };
}
