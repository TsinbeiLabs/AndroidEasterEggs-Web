/**
 * Dessert Case silhouettes (Android 4.4 KitKat).
 *
 * Upstream draws every dessert bitmap as pure white with a per-pixel alpha
 * taken from the sprite's RED channel, over a random solid tile colour. We bake
 * the same thing once per dessert into an offscreen alpha mask: white shapes at
 * varying alpha, with `destination-out` punches for the counters and holes so
 * the tile colour shows through.
 *
 * Rarity tiers and the in-source credits mirror `DessertCaseView.java`.
 * The trademarked KitKat bar sprite (`dessert_kitkat`, "used with permission"
 * upstream) is replaced here by a generic four-finger wafer silhouette.
 */

export const DESSERT_SIZE = 512;

export type DessertPainter = (ctx: CanvasRenderingContext2D) => void;

function capsule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

function punch(ctx: CanvasRenderingContext2D, alpha: number, draw: () => void): void {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000000';
  draw();
  ctx.restore();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function bugdroid(ctx: CanvasRenderingContext2D): void {
  const cx = 256;
  ctx.fillStyle = '#ffffff';

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 18;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 52, 84);
  ctx.lineTo(cx - 88, 40);
  ctx.moveTo(cx + 52, 84);
  ctx.lineTo(cx + 88, 40);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, 172, 112, Math.PI, 0);
  ctx.closePath();
  ctx.fill();

  capsule(ctx, cx - 112, 196, 224, 176, 26);
  capsule(ctx, cx - 172, 196, 44, 146, 22);
  capsule(ctx, cx + 128, 196, 44, 146, 22);
  capsule(ctx, cx - 76, 360, 44, 118, 22);
  capsule(ctx, cx + 32, 360, 44, 118, 22);

  punch(ctx, 1, () => {
    circle(ctx, cx - 48, 134, 15);
    circle(ctx, cx + 48, 134, 15);
  });
}

const wafer: DessertPainter = (ctx) => {
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 4; i++) {
    const x = 61 + i * 100;
    ctx.beginPath();
    ctx.moveTo(x, 70);
    ctx.lineTo(x + 80, 70);
    ctx.lineTo(x + 80, 430);
    ctx.lineTo(x + 56, 455);
    ctx.lineTo(x, 455);
    ctx.closePath();
    ctx.fill();
  }
  punch(ctx, 0.45, () => {
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(61 + i * 100 + 56, 70, 24, 385);
    }
  });
};

const cupcake: DessertPainter = (ctx) => {
  ctx.fillStyle = '#ffffff';
  circle(ctx, 172, 176, 74);
  circle(ctx, 256, 140, 84);
  circle(ctx, 340, 176, 74);
  ctx.beginPath();
  ctx.moveTo(104, 214);
  ctx.lineTo(408, 214);
  ctx.lineTo(398, 246);
  ctx.lineTo(114, 246);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(116, 246);
  ctx.lineTo(396, 246);
  ctx.lineTo(338, 444);
  ctx.lineTo(174, 444);
  ctx.closePath();
  ctx.fill();

  punch(ctx, 0.4, () => {
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const topX = 132 + t * 248;
      const bottomX = 184 + t * 144;
      ctx.beginPath();
      ctx.moveTo(topX, 254);
      ctx.lineTo(topX + 12, 254);
      ctx.lineTo(bottomX + 8, 436);
      ctx.lineTo(bottomX, 436);
      ctx.closePath();
      ctx.fill();
    }
  });
};

const donut: DessertPainter = (ctx) => {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(256, 256, 212, 0, Math.PI * 2);
  ctx.fill();

  punch(ctx, 1, () => circle(ctx, 256, 256, 48));

  punch(ctx, 0.6, () => {
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2 + (i % 3) * 0.4;
      const r = 78 + ((i * 37) % 110);
      const x = 256 + Math.cos(a) * r;
      const y = 256 + Math.sin(a) * r;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a * 2.3);
      capsule(ctx, -16, -5, 32, 10, 5);
      ctx.restore();
    }
  });
};

const eclair: DessertPainter = (ctx) => {
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#ffffff';
  capsule(ctx, 40, 168, 432, 150, 75);
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.9;
  capsule(ctx, 62, 176, 388, 52, 26);
  ctx.globalAlpha = 1;

  punch(ctx, 0.5, () => {
    for (let i = 0; i < 16; i++) {
      circle(ctx, 84 + i * 24, 268 + (i % 3) * 12, 5);
    }
  });
};

const froyo: DessertPainter = (ctx) => {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(140, 330);
  ctx.bezierCurveTo(120, 250, 200, 250, 190, 196);
  ctx.bezierCurveTo(184, 150, 250, 150, 256, 96);
  ctx.bezierCurveTo(268, 152, 330, 152, 322, 198);
  ctx.bezierCurveTo(312, 252, 392, 252, 372, 330);
  ctx.closePath();
  ctx.fill();

  capsule(ctx, 150, 330, 212, 130, 12);

  punch(ctx, 0.45, () => {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(158 + i * 68, 336);
      ctx.lineTo(186 + i * 68, 336);
      ctx.lineTo(176 + i * 62, 452);
      ctx.lineTo(156 + i * 62, 452);
      ctx.closePath();
      ctx.fill();
    }
  });
};

function gingerbreadMan(ctx: CanvasRenderingContext2D, ragged: boolean): void {
  const body = () => {
    circle(ctx, 256, 128, 66);
    capsule(ctx, 196, 186, 120, 150, 34);
    ctx.save();
    ctx.translate(256, 214);
    ctx.rotate(-0.42);
    capsule(ctx, -190, -22, 190, 44, 22);
    ctx.restore();
    ctx.save();
    ctx.translate(256, 214);
    ctx.rotate(0.42);
    capsule(ctx, 0, -22, 190, 44, 22);
    ctx.restore();
    capsule(ctx, 206, 322, 44, 140, 22);
    capsule(ctx, 262, 322, 44, 140, 22);
  };

  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#ffffff';
  body();
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 16;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.arc(256, 128, 66, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 0.95;
  capsule(ctx, 196, 186, 120, 150, 34);
  ctx.globalAlpha = 1;

  if (ragged) {
    ctx.save();
    ctx.translate(256, 214);
    ctx.rotate(0.42);
    capsule(ctx, 20, -22, 170, 44, 22);
    ctx.restore();
    capsule(ctx, 262, 322, 44, 88, 22);

    punch(ctx, 1, () => {
      ctx.save();
      ctx.translate(256, 214);
      ctx.rotate(-0.42);
      capsule(ctx, -190, -30, 150, 60, 26);
      ctx.restore();
      circle(ctx, 232, 300, 30);
      circle(ctx, 288, 356, 24);
      capsule(ctx, 206, 420, 44, 60, 20);
    });

    ctx.save();
    ctx.translate(120, 176);
    ctx.rotate(-0.9);
    capsule(ctx, 0, -22, 150, 44, 22);
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(256, 214);
    ctx.rotate(-0.42);
    capsule(ctx, -190, -22, 190, 44, 22);
    ctx.restore();
    capsule(ctx, 206, 322, 44, 140, 22);
    capsule(ctx, 262, 322, 44, 140, 22);

    punch(ctx, 0.85, () => {
      circle(ctx, 234, 116, 9);
      circle(ctx, 278, 116, 9);
      capsule(ctx, 240, 150, 32, 10, 5);
      capsule(ctx, 196, 232, 120, 10, 5);
      capsule(ctx, 196, 262, 120, 10, 5);
      capsule(ctx, 206, 430, 44, 10, 5);
      capsule(ctx, 262, 430, 44, 10, 5);
    });
  }
}

const honeycombBee: DessertPainter = (ctx) => {
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(214, 128);
  ctx.lineTo(208, 86);
  ctx.moveTo(298, 128);
  ctx.lineTo(304, 86);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(256, 190, 78, Math.PI, 0);
  ctx.closePath();
  ctx.fill();

  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.ellipse(256, 258, 190, 34, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(256, 316, 132, 26, 0, 0, Math.PI * 2);
  ctx.stroke();

  for (const y of [236, 296, 356]) {
    capsule(ctx, 190, y, 132, 42, 8);
  }

  ctx.beginPath();
  ctx.moveTo(238, 398);
  ctx.lineTo(274, 398);
  ctx.lineTo(256, 462);
  ctx.closePath();
  ctx.fill();

  punch(ctx, 1, () => {
    circle(ctx, 226, 168, 12);
    circle(ctx, 286, 168, 12);
  });
};

const ics: DessertPainter = (ctx) => {
  ctx.save();
  ctx.translate(256, 256);
  ctx.rotate(-0.14);

  ctx.fillStyle = '#ffffff';
  capsule(ctx, -120, -200, 240, 400, 34);

  punch(ctx, 0.72, () => {
    capsule(ctx, -92, -172, 184, 344, 22);
  });

  ctx.globalAlpha = 0.95;
  ctx.fillStyle = '#ffffff';
  capsule(ctx, -120, -200, 240, 34, 16);
  capsule(ctx, -120, 166, 240, 34, 16);
  ctx.globalAlpha = 1;

  punch(ctx, 1, () => {
    circle(ctx, -40, -70, 18);
    circle(ctx, 46, 10, 20);
    circle(ctx, -22, 96, 16);
    circle(ctx, 58, -120, 14);
  });
  ctx.restore();
};

const jellybean: DessertPainter = (ctx) => {
  ctx.fillStyle = '#ffffff';
  ctx.save();
  ctx.translate(238, 250);
  ctx.rotate(-0.36);
  ctx.beginPath();
  ctx.ellipse(0, 0, 210, 128, 0, 0, Math.PI * 2);
  ctx.fill();
  punch(ctx, 0.35, () => {
    ctx.beginPath();
    ctx.ellipse(-40, -34, 96, 40, -0.4, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  ctx.save();
  ctx.translate(418, 128);
  ctx.rotate(0.7);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(0, 0, 62, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const petitfour: DessertPainter = (ctx) => {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(256, 14);
  ctx.lineTo(428, 250);
  ctx.lineTo(256, 486);
  ctx.lineTo(84, 250);
  ctx.closePath();
  ctx.fill();

  punch(ctx, 0.55, () => {
    ctx.lineWidth = 16;
    ctx.strokeStyle = '#000000';
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(256 + i * 52, 40);
      ctx.lineTo(256 + i * 52 - 200, 460);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(256 + i * 52, 40);
      ctx.lineTo(256 + i * 52 + 200, 460);
      ctx.stroke();
    }
  });
};

const donutburger: DessertPainter = (ctx) => {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(20, 210);
  ctx.bezierCurveTo(20, 90, 140, 62, 256, 62);
  ctx.bezierCurveTo(372, 62, 492, 90, 492, 210);
  ctx.closePath();
  ctx.fill();

  capsule(ctx, 24, 226, 464, 78, 20);
  capsule(ctx, 40, 320, 432, 118, 46);

  punch(ctx, 0.7, () => {
    for (let i = 0; i < 9; i++) {
      const x = 78 + i * 44;
      const y = 150 + (i % 3) * 26;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(0.4);
      capsule(ctx, -13, -6, 26, 12, 6);
      ctx.restore();
    }
  });
};

const flan: DessertPainter = (ctx) => {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(140, 220);
  ctx.bezierCurveTo(140, 140, 200, 132, 256, 132);
  ctx.bezierCurveTo(312, 132, 372, 140, 372, 220);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(150, 220);
  ctx.lineTo(362, 220);
  ctx.lineTo(376, 400);
  ctx.lineTo(136, 400);
  ctx.closePath();
  ctx.fill();

  punch(ctx, 0.5, () => {
    for (let i = 0; i < 5; i++) {
      const x = 162 + i * 46;
      ctx.beginPath();
      ctx.moveTo(x, 220);
      ctx.quadraticCurveTo(x + 12, 262, x + 4, 292);
      ctx.lineTo(x + 26, 292);
      ctx.quadraticCurveTo(x + 30, 250, x + 24, 220);
      ctx.closePath();
      ctx.fill();
    }
  });
};

const keylimepie: DessertPainter = (ctx) => {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(110, 120);
  ctx.lineTo(400, 120);
  ctx.lineTo(268, 466);
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < 7; i++) {
    circle(ctx, 124 + i * 44, 108, 30);
  }
  capsule(ctx, 106, 96, 296, 40, 18);

  punch(ctx, 0.55, () => {
    for (let i = 0; i < 5; i++) {
      circle(ctx, 156 + i * 50, 168 + (i % 2) * 18, 22);
    }
    ctx.beginPath();
    ctx.moveTo(196, 250);
    ctx.lineTo(316, 250);
    ctx.lineTo(268, 400);
    ctx.closePath();
    ctx.fill();
  });
};

const dandroid: DessertPainter = (ctx) => {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(256, 250, 150, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  capsule(ctx, 106, 250, 300, 130, 30);
  capsule(ctx, 62, 300, 44, 120, 22);
  capsule(ctx, 406, 300, 44, 120, 22);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(206, 130);
  ctx.lineTo(176, 84);
  ctx.moveTo(306, 130);
  ctx.lineTo(336, 84);
  ctx.stroke();

  punch(ctx, 1, () => {
    circle(ctx, 210, 214, 20);
    circle(ctx, 302, 214, 20);
    circle(ctx, 400, 300, 56);
  });

  punch(ctx, 0.45, () => {
    for (let i = 0; i < 12; i++) {
      circle(ctx, 140 + ((i * 61) % 240), 280 + ((i * 37) % 90), 9);
    }
  });
};

const jandycane: DessertPainter = (ctx) => {
  const point = (t: number): [number, number] => {
    if (t <= 0.58) return [300, 40 + (t / 0.58) * 250];
    const u = (t - 0.58) / 0.42;
    const p0: [number, number] = [300, 290];
    const p1: [number, number] = [300, 420];
    const p2: [number, number] = [170, 470];
    const p3: [number, number] = [136, 360];
    const mt = 1 - u;
    return [
      mt ** 3 * p0[0] + 3 * mt ** 2 * u * p1[0] + 3 * mt * u ** 2 * p2[0] + u ** 3 * p3[0],
      mt ** 3 * p0[1] + 3 * mt ** 2 * u * p1[1] + 3 * mt * u ** 2 * p2[1] + u ** 3 * p3[1],
    ];
  };

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 78;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) {
    const [x, y] = point(i / 64);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  punch(ctx, 1, () => {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 26;
    for (let i = 0; i < 16; i++) {
      const t = i / 16;
      const [x, y] = point(t);
      ctx.beginPath();
      ctx.moveTo(x - 60, y + 30);
      ctx.lineTo(x + 60, y - 30);
      ctx.stroke();
    }
  });
};

export const DESSERTS: Readonly<Record<string, DessertPainter>> = {
  wafer, // stands in for dessert_kitkat, "used with permission" upstream
  android: bugdroid, // thx irina
  cupcake, // 2009
  donut, // 2009
  eclair, // 2009
  froyo, // 2010
  gingerbread: (ctx) => gingerbreadMan(ctx, false), // 2010
  honeycomb: honeycombBee, // 2011
  ics, // 2011
  jellybean, // 2012
  petitfour, // the original and still delicious
  donutburger, // remember kids, this was long before cronuts
  flan, // sholes final approach / landing gear punted to flan / runway foam glistens -- mcleron
  keylimepie, // from an alternative timeline
  zombiegingerbread: (ctx) => gingerbreadMan(ctx, true), // thx hackbod
  dandroid, // thx morrildl
  jandycane, // thx nes
};

export const PASTRIES = ['wafer', 'android'] as const;
export const RARE_PASTRIES = [
  'cupcake',
  'donut',
  'eclair',
  'froyo',
  'gingerbread',
  'honeycomb',
  'ics',
  'jellybean',
] as const;
export const XRARE_PASTRIES = ['petitfour', 'donutburger', 'flan', 'keylimepie'] as const;
export const XXRARE_PASTRIES = ['zombiegingerbread', 'dandroid', 'jandycane'] as const;

/** The 12 tile colours: `hsv = {i * 30deg, 1, 0.85}` for i in 0..11. */
export const TILE_COLORS = [
  '#D90000',
  '#D96C00',
  '#D9D900',
  '#6CD900',
  '#00D900',
  '#00D96C',
  '#00D9D9',
  '#006CD9',
  '#0000D9',
  '#6C00D9',
  '#D900D9',
  '#D9006C',
] as const;

export interface BakedDesserts {
  get(name: string): HTMLCanvasElement | undefined;
}

/** Bakes every silhouette once into a white-on-transparent alpha mask. */
export function bakeDesserts(size = 256): BakedDesserts {
  const cache = new Map<string, HTMLCanvasElement>();

  for (const [name, painter] of Object.entries(DESSERTS)) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx === null) continue;
    ctx.scale(size / DESSERT_SIZE, size / DESSERT_SIZE);
    painter(ctx);
    cache.set(name, canvas);
  }

  return {
    get: (name) => cache.get(name),
  };
}
