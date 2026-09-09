/**
 * Version patches for the Android 14-17 PlatLogos, drawn in a 512 unit space.
 *
 * These are stylised redrawings of `u_platlogo.xml`, `v_platlogo.xml`,
 * `baklava_platlogo.xml` and `cinnamon_bun_platlogo.xml`: the measured geometry
 * (radii, stroke widths, colours, vertex counts) is kept, but the hand-outlined
 * wordmarks and the long bezier silhouettes are replaced with primitive
 * equivalents so nothing has to be traced from the upstream vectors.
 */

export type PatchKind = 'udc' | 'vic' | 'baklava' | 'cinnamon';

function sparkles(
  ctx: CanvasRenderingContext2D,
  points: ReadonlyArray<readonly [number, number, number]>,
  color: string,
): void {
  ctx.fillStyle = color;
  for (const [x, y, s] of points) ctx.fillRect(x, y, s, s);
}

function drawUdc(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(256, 256, 200, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = '#073042';
  ctx.fillRect(56, 56, 400, 400);

  // White android bust with the two green antennae sweeping down from the crown.
  ctx.strokeStyle = '#3ddc84';
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(196, 188);
  ctx.bezierCurveTo(214, 250, 240, 300, 250, 340);
  ctx.moveTo(316, 188);
  ctx.bezierCurveTo(298, 250, 272, 300, 262, 340);
  ctx.stroke();

  ctx.fillStyle = '#3ddc84';
  ctx.fillRect(242, 188, 16, 32);
  ctx.fillRect(242, 170, 16, 8);
  ctx.beginPath();
  ctx.arc(256, 138, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(250, 138, 12, 24);

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(159, 181);
  ctx.lineTo(126, 238);
  ctx.bezierCurveTo(124, 244, 126, 250, 132, 252);
  ctx.lineTo(380, 252);
  ctx.bezierCurveTo(411, 149, 450, 92, 456, 24);
  ctx.lineTo(57, 24);
  ctx.bezierCurveTo(63, 92, 102, 150, 159, 181);
  ctx.closePath();
  ctx.fill();

  sparkles(ctx, [
    [172, 217, 4], [189, 276, 4], [369, 337, 4], [286, 252, 4], [319, 219, 4],
    [294, 289, 4], [189, 299, 4], [331, 273, 8], [220, 239, 8], [272, 319, 8],
    [293, 349, 8], [161, 254, 8], [379, 192, 8], [138, 324, 8],
  ], '#FFFFFF');

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 34px system-ui, "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ANDROID', 256, 88);
  ctx.restore();

  ctx.strokeStyle = '#f86734';
  ctx.lineWidth = 56.561;
  ctx.beginPath();
  ctx.arc(256, 256, 200, 0, Math.PI * 2);
  ctx.stroke();
}

function drawVic(ctx: CanvasRenderingContext2D): void {
  const patch = new Path2D();
  patch.moveTo(256, 446);
  patch.bezierCurveTo(230, 446, 212, 428, 195, 398);
  patch.bezierCurveTo(177, 368, 92, 219, 74, 189);
  patch.bezierCurveTo(57, 159, 50, 135, 63, 112);
  patch.bezierCurveTo(76, 89, 101, 83, 135, 83);
  patch.lineTo(377, 83);
  patch.bezierCurveTo(411, 83, 436, 89, 449, 112);
  patch.bezierCurveTo(462, 135, 455, 159, 438, 189);
  patch.bezierCurveTo(420, 219, 335, 368, 317, 398);
  patch.bezierCurveTo(300, 428, 282, 446, 256, 446);
  patch.closePath();

  ctx.save();
  ctx.fillStyle = '#202124';
  ctx.fill(patch);
  ctx.clip(patch);

  ctx.fillStyle = '#C6FF00';
  ctx.beginPath();
  ctx.moveTo(253, 153);
  ctx.bezierCurveTo(250, 187, 226, 262, 168, 285);
  ctx.bezierCurveTo(110, 308, 74, 318, 63, 320);
  ctx.lineTo(256, 399);
  ctx.lineTo(449, 320);
  ctx.bezierCurveTo(438, 318, 402, 308, 344, 285);
  ctx.bezierCurveTo(286, 262, 256, 187, 253, 153);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(253, 153);
  ctx.bezierCurveTo(251, 187, 242, 262, 214, 285);
  ctx.bezierCurveTo(190, 305, 176, 312, 170, 315);
  ctx.lineTo(256, 399);
  ctx.lineTo(347, 320);
  ctx.bezierCurveTo(336, 314, 320, 302, 300, 285);
  ctx.bezierCurveTo(268, 258, 255, 187, 253, 153);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.arc(256, 153, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#5F6368';
  ctx.fillRect(151, 350, 199, 104);
  ctx.beginPath();
  ctx.arc(250, 350, 60, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#5F6368';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(212, 300);
  ctx.lineTo(228, 322);
  ctx.moveTo(288, 300);
  ctx.lineTo(272, 322);
  ctx.stroke();

  ctx.restore();

  sparkles(ctx, [
    [131, 134, 4], [167, 256, 4], [373, 127, 4], [292, 226, 4], [319, 187, 4],
    [355, 222, 4], [192, 136, 4], [222, 212, 4], [336, 196, 8], [163, 175, 8],
    [211, 143, 8], [369, 204, 8], [169, 204, 8], [383, 160, 8], [192, 183, 8],
  ], '#FFFFFF');

  ctx.strokeStyle = '#34A853';
  ctx.lineWidth = 55;
  ctx.stroke(patch);

  ctx.fillStyle = '#E9F3EB';
  ctx.font = '700 30px system-ui, "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ANDROID', 256, 82);
  ctx.font = '700 62px system-ui, "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('15', 256, 330);

  ctx.fillStyle = '#E9F3EB';
  ctx.beginPath();
  ctx.arc(256, 133, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(250, 133, 12, 20);
}

function drawBaklava(ctx: CanvasRenderingContext2D): void {
  const badge = new Path2D();
  badge.moveTo(127, 58.5);
  badge.lineTo(385, 58.5);
  badge.arcTo(453.5, 58.5, 453.5, 127, 68.5);
  badge.lineTo(453.5, 385);
  badge.arcTo(453.5, 453.5, 385, 453.5, 68.5);
  badge.lineTo(127, 453.5);
  badge.arcTo(58.5, 453.5, 58.5, 385, 68.5);
  badge.lineTo(58.5, 127);
  badge.arcTo(58.5, 58.5, 127, 58.5, 68.5);
  badge.closePath();

  ctx.fillStyle = '#1D2126';
  ctx.fill(badge);
  ctx.strokeStyle = '#4285F4';
  ctx.lineWidth = 55;
  ctx.stroke(badge);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 30px system-ui, "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BAKLAVA', 256, 60);

  // The Android 16 patch: 16 triangles forming a diamond rosette.
  const cx = 257.84;
  const cy = 259.04;
  const half = 121.739;
  const vertices: Array<[number, number]> = [];
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i / 8) * Math.PI * 2;
    vertices.push([cx + Math.cos(a) * half, cy + Math.sin(a) * half]);
  }

  // 16 triangles: each edge contributes one facet to the rim vertex and one to
  // the edge midpoint, alternating the two greens.
  for (let i = 0; i < 8; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % 8];
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const facets: Array<[[number, number], [number, number], string]> = [
      [a, mid, '#34A853'],
      [mid, b, '#1F8E3D'],
    ];
    for (const [p, q, color] of facets) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(q[0], q[1]);
      ctx.lineTo(cx, cy);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.strokeStyle = '#5F6368';
  ctx.lineWidth = 14.3349;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy - half);
  ctx.lineTo(cx + half, cy);
  ctx.lineTo(cx, cy + half);
  ctx.lineTo(cx - half, cy);
  ctx.closePath();
  ctx.stroke();

  ctx.strokeStyle = '#C6FF00';
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(172, 318);
  ctx.bezierCurveTo(212, 359, 146, 406, 134, 394);
  ctx.bezierCurveTo(126, 386, 142, 357, 172, 318);
  ctx.stroke();
}

function drawCinnamon(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#0D242F';
  ctx.beginPath();
  ctx.arc(256, 256, 182, 0, Math.PI * 2);
  ctx.fill();

  const vertex = (i: number, r: number): [number, number] => {
    const a = -Math.PI / 2 + (i / 17) * Math.PI * 2;
    return [256 + Math.cos(a) * r, 256 + Math.sin(a) * r];
  };

  const rosette = (step: number, radius: number, color: string, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i < 17; i++) {
      const [x0, y0] = vertex(i, radius);
      const [x1, y1] = vertex((i + step) % 17, radius);
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
    }
    ctx.stroke();
  };

  rosette(8, 176, '#66245A', 8);
  rosette(7, 150, '#B31F7F', 6);
  rosette(5, 110, '#B31F7F', 4);

  ctx.fillStyle = '#E08DE9';
  for (let i = 0; i < 17; i++) {
    const [x, y] = vertex(i, 196);
    const s = i % 3 === 0 ? 10.6 : i % 3 === 1 ? 5.3 : 4;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(0, 0, s, 0);
    ctx.quadraticCurveTo(0, 0, 0, s);
    ctx.quadraticCurveTo(0, 0, -s, 0);
    ctx.quadraticCurveTo(0, 0, 0, -s);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(256, 256, 75, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#34A853';
  ctx.fillRect(181, 181, 150, 150);

  ctx.strokeStyle = '#61DD82';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const offset = -60 + i * 20;
    ctx.beginPath();
    ctx.moveTo(216 + offset, 320);
    ctx.lineTo(300 + offset, 236);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(266, 299);
  ctx.bezierCurveTo(285, 280, 267, 272, 287, 252);
  ctx.stroke();

  // The great cinnamon swirl.
  ctx.beginPath();
  for (let i = 0; i <= 90; i++) {
    const t = i / 90;
    const a = t * Math.PI * 3.2;
    const r = 8 + t * 34;
    const x = 250 + Math.cos(a) * r;
    const y = 262 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = '#61DD82';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(256, 256, 75, 0, Math.PI * 2);
  ctx.stroke();
}

export function drawPatch(ctx: CanvasRenderingContext2D, kind: PatchKind, size: number): void {
  const k = size / 512;
  ctx.save();
  ctx.scale(k, k);
  switch (kind) {
    case 'udc':
      drawUdc(ctx);
      break;
    case 'vic':
      drawVic(ctx);
      break;
    case 'baklava':
      drawBaklava(ctx);
      break;
    case 'cinnamon':
      drawCinnamon(ctx);
      break;
  }
  ctx.restore();
}
