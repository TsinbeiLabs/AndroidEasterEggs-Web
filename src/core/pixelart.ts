/**
 * Pixel-art helpers.
 *
 * Several early eggs ship their logo as pure pixel art: the AOSP Ice Cream
 * Sandwich `platlogo.png` is a 20 x 24 grid of 10 px blocks, and the Nyandroid
 * sprite is that same grid rotated 90 degrees clockwise. Keeping the grid as
 * text lets us redraw it crisply at any DPR without shipping a bitmap.
 */
export type PixelGrid = readonly string[];

export const ICS_PLATLOGO: PixelGrid = [
  '....##.######.##....',
  '....#G#GGGGGG#G#....',
  '....##GGGGGGGG##....',
  '....#GG##GG##GG#....',
  '....#GGW#GGW#GG#....',
  '...#GGGGGGGGGGGG#...',
  '...#GGGGGGGGGGGG#...',
  '.##################.',
  '#GG#BBBBBBBBBSSB#GG#',
  '#GG#BB#BBB#BBWWB#GG#',
  '#GG#BBBBBBBBBWWB#GG#',
  '#GG#BBBB#BBBBWWB#GG#',
  '#GG#BBBBBBBBBWWB#GG#',
  '#GG#BB#BBB#BBWWB#GG#',
  '#GG#BBBBBBBBBWWB#GG#',
  '.###BBBB#BBBBWWB###.',
  '...#BBBBBBBBBWWB#...',
  '...#BB#BBB#BBWWB#...',
  '...#BBBBBBBBBSSB#...',
  '....############....',
  '.....#GG#..#GG#.....',
  '.....#GG#..#GG#.....',
  '.....#GG#..#GG#.....',
  '......##....##......',
];

/** Palette used by the ICS vector logo (`#A4C639` green, `#CACACA` grey). */
export const PLATLOGO_PALETTE: Readonly<Record<string, string>> = {
  '#': '#000000',
  G: '#A4C639',
  B: '#492700',
  W: '#FFFFFF',
  S: '#CACACA',
};

/** Palette used by the Nyandroid flying-droid sprites. */
export const NYANDROID_PALETTE: Readonly<Record<string, string>> = {
  '#': '#000000',
  G: '#A4C639',
  B: '#5D3300',
  W: '#FFFFFF',
  S: '#CACACA',
};

/** Zombie-green variant used by the Gingerbread artwork. */
export const GINGERBREAD_PALETTE: Readonly<Record<string, string>> = {
  '#': '#1B2A10',
  G: '#72D02F',
  B: '#4A2A16',
  W: '#FFFFFF',
  S: '#B7E196',
};

export function gridWidth(grid: PixelGrid): number {
  return grid.length > 0 ? grid[0].length : 0;
}

export function gridHeight(grid: PixelGrid): number {
  return grid.length;
}

/** Rotate a grid 90 degrees clockwise: `out[y][x] = src[rows - 1 - x][y]`. */
export function rotateCw(grid: PixelGrid): string[] {
  const rows = grid.length;
  const cols = gridWidth(grid);
  const out: string[] = [];
  for (let y = 0; y < cols; y++) {
    let line = '';
    for (let x = 0; x < rows; x++) {
      line += grid[rows - 1 - x][y];
    }
    out.push(line);
  }
  return out;
}

/** Swap every occurrence of one palette key for another. */
export function remap(grid: PixelGrid, from: string, to: string): string[] {
  return grid.map((line) => line.replaceAll(from, to));
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  grid: PixelGrid,
  palette: Readonly<Record<string, string>>,
  cell: number,
  offsetX = 0,
  offsetY = 0,
): void {
  for (let y = 0; y < grid.length; y++) {
    const line = grid[y];
    for (let x = 0; x < line.length; x++) {
      const color = palette[line[x]];
      if (color === undefined) continue;
      ctx.fillStyle = color;
      ctx.fillRect(
        offsetX + Math.floor(x * cell),
        offsetY + Math.floor(y * cell),
        Math.ceil(cell),
        Math.ceil(cell),
      );
    }
  }
}

/** Bake a grid into an offscreen canvas so it can be blitted cheaply. */
export function bakeGrid(
  grid: PixelGrid,
  palette: Readonly<Record<string, string>>,
  cell: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(gridWidth(grid) * cell);
  canvas.height = Math.ceil(grid.length * cell);
  const ctx = canvas.getContext('2d');
  if (ctx !== null) {
    ctx.imageSmoothingEnabled = false;
    drawGrid(ctx, grid, palette, cell);
  }
  return canvas;
}

/** Centres a grid of `cols x rows` cells inside `w x h`, returning cell size and origin. */
export function fitGrid(
  grid: PixelGrid,
  w: number,
  h: number,
  fill = 0.8,
): { cell: number; x: number; y: number } {
  const cols = gridWidth(grid);
  const rows = gridHeight(grid);
  const cell = Math.max(1, Math.floor((Math.min(w / cols, h / rows)) * fill));
  return {
    cell,
    x: Math.round((w - cell * cols) / 2),
    y: Math.round((h - cell * rows) / 2),
  };
}
