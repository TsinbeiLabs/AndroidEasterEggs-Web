// Converts Android VectorDrawable XML into a TypeScript module of ordered path
// records plus a renderer, so the PlatLogos are drawn from the real AOSP art
// instead of a hand-approximation.
//
// Usage: node tools/extract-vectordrawable.mjs <name=/> <name=file.xml> ... <out.ts>
//
// The upstream drawables only use fillColor/fillType/pathData/strokeColor/
// strokeWidth/strokeLineCap and contain <group> elements *without* transforms, so
// document order is paint order. Anything outside that subset is a hard error
// rather than a silent mis-draw.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const ARGS = process.argv.slice(2);
if (ARGS.length < 3) {
  console.error('usage: extract-vectordrawable.mjs <name=file.xml> [...] <out.ts>');
  process.exit(2);
}
const outPath = ARGS.pop();
const wanted = ARGS.map((spec) => {
  const eq = spec.indexOf('=');
  if (eq < 0) throw new Error(`expected name=file.xml, got "${spec}"`);
  return { name: spec.slice(0, eq), file: spec.slice(eq + 1) };
});

const PATH_ATTRS = new Set([
  'android:name',
  'android:pathData',
  'android:fillColor',
  'android:fillType',
  'android:strokeColor',
  'android:strokeWidth',
  'android:strokeLineCap',
  'android:strokeLineJoin',
  'android:strokeMiterLimit',
  'android:fillAlpha',
  'android:strokeAlpha',
]);
const GROUP_ATTRS = new Set([
  'android:name',
  'android:translateX',
  'android:translateY',
  'android:scaleX',
  'android:scaleY',
  'android:rotation',
  'android:pivotX',
  'android:pivotY',
]);

/**
 * Canvas/Android affine [a, b, c, d, e, f]: x' = a*x + c*y + e, y' = b*x + d*y + f.
 * `multiply(p, q)` is p . q, i.e. apply q first.
 */
const IDENTITY = [1, 0, 0, 1, 0, 0];

function multiply(p, q) {
  return [
    p[0] * q[0] + p[2] * q[1],
    p[1] * q[0] + p[3] * q[1],
    p[0] * q[1] + p[2] * q[3],
    p[1] * q[1] + p[3] * q[3],
    p[0] * q[4] + p[2] * q[5] + p[4],
    p[1] * q[4] + p[3] * q[5] + p[5],
  ];
}

/**
 * `VGroup.updateLocalMatrix()`:
 * `T(pivot) . R(rotation) . S(scale) . T(translate - pivot)`.
 */
function groupMatrix(attrs) {
  const num = (key, fallback) => {
    const raw = attrs.get(key);
    return raw === undefined ? fallback : Number(raw);
  };
  const tx = num('android:translateX', 0);
  const ty = num('android:translateY', 0);
  const sx = num('android:scaleX', 1);
  const sy = num('android:scaleY', 1);
  const rot = (num('android:rotation', 0) * Math.PI) / 180;
  const px = num('android:pivotX', 0);
  const py = num('android:pivotY', 0);

  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  // R . S, with S applied first.
  const rs = [cos * sx, sin * sx, -sin * sy, cos * sy, 0, 0];
  const t1 = IDENTITY.slice();
  t1[4] = tx - px;
  t1[5] = ty - py;
  const t2 = IDENTITY.slice();
  t2[4] = px;
  t2[5] = py;
  return multiply(t2, multiply(rs, t1));
}

/** Android `#AARRGGBB` -> CSS. */
function toCss(value, where) {
  const v = value.trim();
  if (!v.startsWith('#')) throw new Error(`${where}: unsupported colour "${v}" (theme/attr reference?)`);
  const hex = v.slice(1);
  if (hex.length === 6) return `#${hex.toLowerCase()}`;
  if (hex.length === 8) {
    const a = parseInt(hex.slice(0, 2), 16);
    const r = parseInt(hex.slice(2, 4), 16);
    const g = parseInt(hex.slice(4, 6), 16);
    const b = parseInt(hex.slice(6, 8), 16);
    return a === 255 ? `#${hex.slice(2).toLowerCase()}` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
  }
  if (hex.length === 3) return `#${hex.split('').map((c) => c + c).join('').toLowerCase()}`;
  throw new Error(`${where}: unsupported colour "${v}"`);
}

/** Folds `android:fillAlpha` / `android:strokeAlpha` into an already-parsed colour. */
function withAlpha(css, alpha, where) {
  if (alpha === undefined || alpha === 1) return css;
  if (css.startsWith('#')) {
    const r = parseInt(css.slice(1, 3), 16);
    const g = parseInt(css.slice(3, 5), 16);
    const b = parseInt(css.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
  }
  const m = css.match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/);
  if (m === null) throw new Error(`${where}: cannot apply alpha to "${css}"`);
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${(Number(m[4]) * alpha).toFixed(3)})`;
}

function attrsOf(tag) {
  const out = new Map();
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) out.set(m[1], m[2]);
  return out;
}

function parse(file) {
  const text = readFileSync(file, 'utf8');
  for (const bad of ['android:trimPath', 'type="sweep"']) {
    if (text.includes(bad)) throw new Error(`${basename(file)}: unsupported feature ${bad}`);
  }
  const vector = text.match(/<vector[\s\S]*?>/);
  if (vector === null) throw new Error(`${basename(file)}: no <vector>`);
  const va = attrsOf(vector[0]);
  const vw = Number(va.get('android:viewportWidth'));
  const vh = Number(va.get('android:viewportHeight'));

  // Walk <group>/<path>/</group> in document order, which is paint order.
  const paths = [];
  const stack = [IDENTITY];
  const tagRe = /<(\/?)(group|path)((?:[^>"]|"[^"]*")*?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(text)) !== null) {
    const [, closing, kind, raw, selfClose] = m;
    if (closing === '/') {
      if (kind !== 'group') throw new Error(`${basename(file)}: unexpected </${kind}>`);
      stack.pop();
      if (stack.length === 0) throw new Error(`${basename(file)}: unbalanced </group>`);
      continue;
    }
    const attrs = attrsOf(`<x ${raw}`);
    if (kind === 'group') {
      for (const key of attrs.keys()) {
        if (!GROUP_ATTRS.has(key)) throw new Error(`${basename(file)}: <group> has unsupported attribute ${key}`);
      }
      stack.push(multiply(stack[stack.length - 1], groupMatrix(attrs)));
      continue;
    }
    for (const key of attrs.keys()) {
      if (!PATH_ATTRS.has(key)) throw new Error(`${basename(file)}: <path> has unsupported attribute ${key}`);
    }

    // A <path> may carry <aapt:attr> children holding an inline gradient.
    let body = '';
    if (selfClose !== '/') {
      const end = text.indexOf('</path>', tagRe.lastIndex);
      if (end < 0) throw new Error(`${basename(file)}: unterminated <path>`);
      body = text.slice(tagRe.lastIndex, end);
      tagRe.lastIndex = end + '</path>'.length;
    }

    const d = attrs.get('android:pathData');
    if (d === undefined) throw new Error(`${basename(file)}: <path> without pathData`);
    const fill = attrs.get('android:fillColor');
    const stroke = attrs.get('android:strokeColor');
    const where = `${basename(file)}:${attrs.get('android:name') ?? '<unnamed>'}`;
    const matrix = stack[stack.length - 1];
    const fillAlpha = attrs.has('android:fillAlpha') ? Number(attrs.get('android:fillAlpha')) : undefined;
    const strokeAlpha = attrs.has('android:strokeAlpha') ? Number(attrs.get('android:strokeAlpha')) : undefined;
    const gradient = parseGradient(body, where);
    if (gradient !== undefined && fillAlpha !== undefined) {
      gradient.stops = gradient.stops.map((s) => ({
        offset: s.offset,
        color: withAlpha(s.color, fillAlpha, where),
      }));
    }
    paths.push({
      d: d.replace(/\s+/g, ' ').trim(),
      m: matrix.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-9) ? undefined : matrix.map(round),
      fill:
        fill === undefined || fill === '#00000000'
          ? undefined
          : withAlpha(toCss(fill, where), fillAlpha, where),
      fillGradient: gradient,
      fillType: attrs.get('android:fillType') === 'evenOdd' ? 'evenodd' : undefined,
      stroke:
        stroke === undefined || stroke === '#00000000'
          ? undefined
          : withAlpha(toCss(stroke, where), strokeAlpha, where),
      strokeWidth: attrs.has('android:strokeWidth') ? Number(attrs.get('android:strokeWidth')) : undefined,
      lineCap: attrs.get('android:strokeLineCap'),
      lineJoin: attrs.get('android:strokeLineJoin'),
    });
  }
  if (stack.length !== 1) throw new Error(`${basename(file)}: unbalanced <group>`);
  return { viewportWidth: vw, viewportHeight: vh, paths };
}

/** The `<aapt:attr name="android:fillColor"><gradient …>` child of a path, if any. */
function parseGradient(body, where) {
  if (body === '') return undefined;
  const attr = body.match(/<aapt:attr\s+name="android:(\w+)"([\s\S]*?)<\/aapt:attr>/);
  if (attr === null) {
    if (/<aapt:attr/.test(body)) throw new Error(`${where}: malformed <aapt:attr>`);
    return undefined;
  }
  if (attr[1] !== 'fillColor') throw new Error(`${where}: <aapt:attr> on android:${attr[1]} is unsupported`);
  const g = attr[2].match(/<gradient([\s\S]*?)>([\s\S]*?)<\/gradient>/);
  if (g === null) throw new Error(`${where}: <aapt:attr> without a <gradient>`);
  const ga = attrsOf(`<x ${g[1]}`);
  const type = ga.get('android:type') ?? 'linear';
  const stops = [...g[2].matchAll(/<item([^>]*?)\/>/g)].map((item) => {
    const ia = attrsOf(`<x ${item[1]}`);
    const color = ia.get('android:color');
    if (color === undefined) throw new Error(`${where}: gradient <item> without a colour`);
    return { offset: Number(ia.get('android:offset') ?? 0), color: toCss(color, where) };
  });
  if (stops.length < 2) throw new Error(`${where}: gradient needs at least two stops`);
  if (type === 'radial') {
    return {
      type: 'radial',
      centerX: Number(ga.get('android:centerX')),
      centerY: Number(ga.get('android:centerY')),
      radius: Number(ga.get('android:gradientRadius')),
      stops,
    };
  }
  if (type !== 'linear') throw new Error(`${where}: unsupported gradient type "${type}"`);
  return {
    type: 'linear',
    startX: Number(ga.get('android:startX')),
    startY: Number(ga.get('android:startY')),
    endX: Number(ga.get('android:endX')),
    endY: Number(ga.get('android:endY')),
    stops,
  };
}

function round(v) {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
}

const arts = wanted.map(({ name, file }) => ({ name, file, art: parse(file) }));

let ts = `/**
 * Generated from the AOSP VectorDrawables (Apache-2.0). Do not edit by hand:
 * \`npm run gen:art\`.
 *
 * Each art is the drawable's \`<path>\` list in document order, which is paint
 * order. A path's \`m\` is the accumulated \`<group>\` transform as a canvas
 * \`[a, b, c, d, e, f]\` affine, omitted when it is the identity. Draw them with
 * \`drawVectorArt\` from \`./vectorArt\`.
 */

import type { VectorArt } from './vectorArtTypes';

`;

for (const { name, file, art } of arts) {
  ts += `/** \`${file.replace(/\\/g, '/').split('/').slice(-3).join('/')}\` */\n`;
  ts += `export const ${name}: VectorArt = {\n  viewportWidth: ${art.viewportWidth},\n  viewportHeight: ${art.viewportHeight},\n  paths: [\n`;
  for (const p of art.paths) {
    const parts = [`d: '${p.d.replace(/'/g, "\\'")}'`];
    if (p.m !== undefined) parts.push(`m: [${p.m.join(', ')}]`);
    if (p.fill !== undefined) parts.push(`fill: '${p.fill}'`);
    if (p.fillGradient !== undefined) {
      const g = p.fillGradient;
      const geom =
        g.type === 'linear'
          ? `startX: ${g.startX}, startY: ${g.startY}, endX: ${g.endX}, endY: ${g.endY}`
          : `centerX: ${g.centerX}, centerY: ${g.centerY}, radius: ${g.radius}`;
      const stops = g.stops.map((s) => `{ offset: ${s.offset}, color: '${s.color}' }`).join(', ');
      parts.push(`fillGradient: { type: '${g.type}', ${geom}, stops: [${stops}] }`);
    }
    if (p.fillType !== undefined) parts.push(`fillType: '${p.fillType}'`);
    if (p.stroke !== undefined) parts.push(`stroke: '${p.stroke}'`);
    if (p.strokeWidth !== undefined) parts.push(`strokeWidth: ${p.strokeWidth}`);
    if (p.lineCap !== undefined) parts.push(`lineCap: '${p.lineCap}'`);
    if (p.lineJoin !== undefined) parts.push(`lineJoin: '${p.lineJoin}'`);
    ts += `    { ${parts.join(', ')} },\n`;
  }
  ts += `  ],\n};\n\n`;
}


writeFileSync(outPath, ts);

const bytes = Buffer.byteLength(ts);
console.log(`wrote ${outPath} (${(bytes / 1024).toFixed(1)} KB)`);
for (const { name, art } of arts) {
  console.log(`  ${name}: ${art.paths.length} paths, viewport ${art.viewportWidth}x${art.viewportHeight}`);
}