import type { VectorArt, VectorGradient } from './vectorArtTypes';

export type { VectorArt, VectorGradient, VectorPath } from './vectorArtTypes';

/**
 * Renderer for the VectorDrawables emitted by `npm run gen:art`.
 *
 * Paths are drawn in document order, which is paint order. `m` is the accumulated
 * `<group>` transform (Android's `T(pivot) . R(rotation) . S(scale) . T(translate -
 * pivot)`), applied per path so a transformed group does not leak into its
 * siblings. A path carrying both a fill and a stroke is painted fill-then-stroke,
 * matching SVG.
 */

const cache = new WeakMap<VectorArt, Path2D[]>();

function pathsFor(art: VectorArt): Path2D[] {
  let built = cache.get(art);
  if (built === undefined) {
    built = art.paths.map((p) => new Path2D(p.d));
    cache.set(art, built);
  }
  return built;
}

/**
 * Gradients are declared in viewport units, so they have to be rebuilt against the
 * current transform instead of being cached with the paths.
 */
function gradientFor(ctx: CanvasRenderingContext2D, spec: VectorGradient): CanvasGradient {
  const gradient =
    spec.type === 'linear'
      ? ctx.createLinearGradient(spec.startX, spec.startY, spec.endX, spec.endY)
      : ctx.createRadialGradient(spec.centerX, spec.centerY, 0, spec.centerX, spec.centerY, spec.radius);
  for (const stop of spec.stops) gradient.addColorStop(stop.offset, stop.color);
  return gradient;
}

/**
 * Draws `art` fitted into a `size` x `size` box at the current origin, preserving
 * the viewport aspect ratio and centring it. (A VectorDrawable told to fill a
 * square stretches instead; fitting keeps the non-square dessert illustrations
 * intact and is identical for the square 512 x 512 platlogos.)
 */
export function drawVectorArt(ctx: CanvasRenderingContext2D, art: VectorArt, size: number): void {
  const built = pathsFor(art);
  const k = size / Math.max(art.viewportWidth, art.viewportHeight);
  ctx.save();
  ctx.translate((size - art.viewportWidth * k) / 2, (size - art.viewportHeight * k) / 2);
  ctx.scale(k, k);
  art.paths.forEach((p, i) => {
    const path = built[i];
    const transformed = p.m !== undefined;
    if (transformed && p.m !== undefined) {
      ctx.save();
      ctx.transform(p.m[0], p.m[1], p.m[2], p.m[3], p.m[4], p.m[5]);
    }
    if (p.fillGradient !== undefined) {
      ctx.fillStyle = gradientFor(ctx, p.fillGradient);
      ctx.fill(path, p.fillType ?? 'nonzero');
    } else if (p.fill !== undefined) {
      ctx.fillStyle = p.fill;
      ctx.fill(path, p.fillType ?? 'nonzero');
    }
    if (p.stroke !== undefined) {
      ctx.strokeStyle = p.stroke;
      ctx.lineWidth = p.strokeWidth ?? 1;
      ctx.lineCap = p.lineCap ?? 'butt';
      ctx.lineJoin = p.lineJoin ?? 'miter';
      ctx.stroke(path);
    }
    if (transformed) ctx.restore();
  });
  ctx.restore();
}
