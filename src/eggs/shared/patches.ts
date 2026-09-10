import {
  baklavaPlatlogo,
  cinnamonPlatlogo,
  udcPlatlogo,
  udcPreviewPlatlogo,
  vicPlatlogo,
} from './platlogoArt';
import { drawVectorArt } from './vectorArt';
import type { VectorArt } from './vectorArtTypes';

/**
 * Version patches for the Android 14-17 PlatLogos.
 *
 * These are the real AOSP VectorDrawables — `u_platlogo.xml`, `u_platlogo_1.xml`,
 * `v_platlogo.xml`, `baklava_platlogo.xml` and `cinnamon_bun_platlogo.xml` —
 * reduced to ordered path lists by `npm run gen:art`. The port used to redraw
 * these from measurements, with primitive stand-ins for the hand-outlined
 * wordmarks; that is no longer necessary now that the path data itself is
 * available, so every glyph here is the shipped one.
 */

export type PatchKind = 'udc' | 'udc-preview' | 'vic' | 'baklava' | 'cinnamon';

const ARTS: Readonly<Record<PatchKind, VectorArt>> = {
  udc: udcPlatlogo,
  'udc-preview': udcPreviewPlatlogo,
  vic: vicPlatlogo,
  baklava: baklavaPlatlogo,
  cinnamon: cinnamonPlatlogo,
};

export function drawPatch(ctx: CanvasRenderingContext2D, kind: PatchKind, size: number): void {
  drawVectorArt(ctx, ARTS[kind], size);
}
