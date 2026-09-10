// Extracts the SVG path data out of Cinnamon Bun's Assets.kt and emits a TS module
// of Path2D constants. Validates that every command carries exactly the number of
// arguments `parseSvgPathData` consumes, since Canvas' Path2D would otherwise
// silently repeat a command that upstream ignores the tail of.
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2];
const out = process.argv[3];
const text = readFileSync(src, 'utf8');

const ARITY = { M: 2, C: 6, L: 2, l: 2, H: 1, h: 1, V: 1, v: 1, Z: 0 };

const blocks = [];
const re = /val\s+(\w+)\s*=\s*Path\(\)\.apply\s*\{[\s\S]*?parseSvgPathData\(\s*"""([\s\S]*?)"""/g;
let m;
while ((m = re.exec(text)) !== null) {
  blocks.push({ name: m[1], d: m[2].trim() });
}

const problems = [];
for (const block of blocks) {
  const commands = [...block.d.matchAll(/([A-Za-z])\s*([-.,0-9e ]+)/g)];
  for (const command of commands) {
    const [, cmd, raw] = command;
    const args = raw.split(/\s+/).filter((v) => v.length > 0);
    const arity = ARITY[cmd];
    if (arity === undefined) {
      problems.push(`${block.name}: unsupported command "${cmd}"`);
      continue;
    }
    if (args.length !== arity) {
      problems.push(`${block.name}: "${cmd}" has ${args.length} args, parseSvgPathData reads ${arity}`);
    }
  }
  // Rebuild a compact single-line path so Path2D and upstream see the same tokens.
  block.compact = commands
    .map(([, cmd, raw]) => cmd + raw.trim().split(/\s+/).filter((v) => v.length > 0).join(' '))
    .join(' ');
}

const names = blocks.map((b) => b.name);
const orderMatch = text.match(/val planetTextures = arrayOf\(([\s\S]*?)\)/);
const order = orderMatch
  ? orderMatch[1]
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  : names;
const sizeMatch = text.match(/val planetTextureSize = ([0-9.]+)f/);

let ts = `/**
 * Generated from \`eggs/CinnamonBun/.../landroid/Assets.kt\` (Apache-2.0, AOSP).
 * Do not edit by hand: \`npm run gen:assets\`.
 *
 * Android 17 draws a procedurally chosen texture inside every *explored* planet
 * once the camera is close enough (\`zoom > 0.05\` and within 10 000 units), and
 * picks it from the planet radius:
 * \`planetTextures[((radius % 17f) / 17f * planetTextures.size).toInt()]\`.
 * Each texture is authored in a \`planetTextureSize\` box and scaled to the disc.
 */

`;
for (const block of blocks) {
  ts += `export const ${block.name} = new Path2D(\n  '${block.compact.replace(/'/g, "\\'")}',\n);\n\n`;
}
ts += `export const planetTextures: readonly Path2D[] = [\n`;
for (const name of order) ts += `  ${name},\n`;
ts += `];\n\nexport const planetTextureSize = ${sizeMatch ? sizeMatch[1] : '128'};\n`;

writeFileSync(out, ts);

console.log(`extracted ${blocks.length} paths -> ${out} (${(ts.length / 1024).toFixed(1)} KB)`);
console.log(`planetTextures order: ${order.join(', ')}`);
if (problems.length > 0) {
  console.log(`\n${problems.length} arity problem(s):`);
  for (const p of problems.slice(0, 20)) console.log('  ' + p);
} else {
  console.log('arity check: every command matches parseSvgPathData exactly');
}
