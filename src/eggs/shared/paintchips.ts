import type { EggContext } from '../../core/types';
import {
  SHADES,
  loadSeedArgb,
  parseHexColor,
  randomSeedArgb,
  saveSeedArgb,
  systemPalettes,
  toHex,
  type SystemGroup,
} from './hct';

/**
 * Paint Chips (Android 12 Snow Cone and 13 Tiramisu) — `widget/PaintChipsActivity.kt`
 * showing `buildFullWidget(context, ClickBehavior.SHARE)`.
 *
 * The full 13 x 5 grid of the dynamic system colours: shades
 * 0/10/50/100/.../1000 (`SHADE_NUMBERS`) of neutral1, neutral2, accent1,
 * accent2 and accent3 (`COLORS` / `COLOR_NAMES` = N1, N2, A1, A2, A3). The
 * upstream GridLayout uses `orientation="vertical"`, so the chips are filled
 * column-major, one column per group; each cell is a 12dp-rounded chip
 * (`s_roundrect` + `setBackgroundTintList`) labelled `<group>-<shade>` with
 * 2dp margins, and the label colour is shade 0 of the same group above tone
 * 500 and shade 1000 below (`if (SHADE_NUMBERS[j] > 500) colorlist[0] else
 * colorlist[last]`). Tapping a chip shares
 * `A1-500 (@android:color/system_accent1_500)\ncurrently: #rrggbb`, which
 * becomes a clipboard copy here.
 *
 * The colours are the genuine Material You ones: the seed colour stands in for
 * the wallpaper (there is none on the web, so it is persisted and can be
 * picked or randomised), and hct.ts runs the same HCT/CAM16 derivation as the
 * upstream `SystemTonalColors.updateSourceColor` (Monet tonal-spot chromas
 * 36/16/24@hue+60/4/8 over the framework tone ladder 100, 99, 95, 90, 80, 70,
 * 60, 49.6, 40, 30, 20, 10, 0).
 */

/** `COLORS` zipped with `COLOR_NAMES`. */
const GROUPS: ReadonlyArray<readonly [SystemGroup, string]> = [
  ['neutral1', 'N1'],
  ['neutral2', 'N2'],
  ['accent1', 'A1'],
  ['accent2', 'A2'],
  ['accent3', 'A3'],
];

const CSS = `
.chips-panel { position: absolute; inset: 0; overflow: auto; padding: 10px;
  background: #12161b; color: #e6edf3; font: 13px/1.4 system-ui, sans-serif; }
.chips-panel h2 { margin: 0 0 2px; font-size: 17px; }
.chips-note { margin: 0 0 10px; color: #9aa7b2; font-size: 12px; }
.chips-seed { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.chips-seed span { color: #9aa7b2; font-size: 12px; }
.chips-seed code { color: #e6edf3; font-size: 12px; }
.chips-seed input[type="color"] { width: 40px; height: 28px; padding: 1px; cursor: pointer;
  background: #1a2027; border: 1px solid #2b343d; border-radius: 8px; }
.chips-seed button { background: #1a2027; color: #e6edf3; border: 1px solid #2b343d;
  border-radius: 10px; padding: 5px 12px; cursor: pointer; font-size: 12px; }
.chips-grid { display: grid; grid-auto-flow: column; grid-template-rows: repeat(13, minmax(28px, 1fr));
  gap: 4px; min-width: 520px; }
.chip { display: flex; align-items: center; justify-content: center; border-radius: 12px;
  min-height: 28px; padding: 0 4px; cursor: pointer; border: none; font: inherit; font-size: 11px;
  white-space: nowrap; transition: transform 120ms ease; }
.chip:hover { transform: scale(1.06); }
`;

export interface PaintChipsHandle {
  destroy(): void;
}

export function mountPaintChips(
  context: EggContext,
  options: { heading: string; subtitle: string },
): PaintChipsHandle {
  const parent = context.canvas.parentElement;
  const style = document.createElement('style');
  style.textContent = CSS;

  const panel = document.createElement('div');
  panel.className = 'chips-panel';

  const build = (): void => {
    const seed = loadSeedArgb(context.store);
    const palettes = systemPalettes(seed);

    const heading = document.createElement('h2');
    heading.textContent = options.heading;
    const note = document.createElement('p');
    note.className = 'chips-note';
    note.textContent = `${options.subtitle} · 点任意色块可复制它的 system color 名称与当前色值`;

    // The web has no wallpaper to sample, so the seed colour that feeds the
    // derivation can be picked or randomised; it is persisted like a wallpaper.
    const seedRow = document.createElement('div');
    seedRow.className = 'chips-seed';
    const seedLabel = document.createElement('span');
    seedLabel.textContent = '壁纸主色';
    const seedInput = document.createElement('input');
    seedInput.type = 'color';
    seedInput.value = toHex(seed);
    seedInput.addEventListener('change', () => {
      const picked = parseHexColor(seedInput.value);
      if (picked === null) return;
      saveSeedArgb(context.store, picked);
      build();
    });
    const seedHex = document.createElement('code');
    seedHex.textContent = toHex(seed);
    const reroll = document.createElement('button');
    reroll.type = 'button';
    reroll.textContent = '换一组壁纸取色';
    reroll.addEventListener('click', () => {
      saveSeedArgb(context.store, randomSeedArgb(context.random));
      build();
    });
    seedRow.append(seedLabel, seedInput, seedHex, reroll);

    const grid = document.createElement('div');
    grid.className = 'chips-grid';

    for (const [group, name] of GROUPS) {
      const ramp = palettes[group];
      for (let j = 0; j < SHADES.length; j++) {
        const shade = SHADES[j];
        const color = toHex(ramp[j]);
        const label = `${name}-${shade}`;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.textContent = label;
        chip.style.background = color;
        chip.style.color = shade > 500 ? toHex(ramp[0]) : toHex(ramp[ramp.length - 1]);
        chip.title = `@android:color/system_${group}_${shade}`;
        chip.addEventListener('click', () => {
          const text = `${label} (@android:color/system_${group}_${shade})\ncurrently: ${color}`;
          void navigator.clipboard?.writeText(text);
          context.toast(`${label} ${color} 已复制`, 1.6);
        });
        grid.appendChild(chip);
      }
    }

    panel.replaceChildren(heading, note, seedRow, grid);
  };

  build();
  parent?.append(style, panel);

  return {
    destroy() {
      panel.remove();
      style.remove();
    },
  };
}
