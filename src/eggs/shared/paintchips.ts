import type { EggContext } from '../../core/types';

/**
 * Paint Chips (Android 12 Snow Cone and 13 Tiramisu).
 *
 * The full 13 x 5 grid of dynamic-colour swatches: shades
 * 0/10/50/100/200/.../1000 for N1, N2, A1, A2, A3, each cell labelled
 * `<group>-<shade>`, filled column-major like the upstream GridLayout, with the
 * label colour taken from shade 0 above 500 and shade 1000 below. Tapping a chip
 * shares `A1-500 (@android:color/system_accent1_500)\ncurrently: #rrggbb`, which
 * becomes a clipboard copy here.
 *
 * The real `system_*` colours come from the device wallpaper, so the palettes are
 * generated as Material-style tonal ramps from a random seed hue.
 */

export const SHADES = [0, 10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000] as const;
export const GROUPS = ['N1', 'N2', 'A1', 'A2', 'A3'] as const;

const SYSTEM_NAMES: Record<string, string> = {
  N1: 'system_neutral1',
  N2: 'system_neutral2',
  A1: 'system_accent1',
  A2: 'system_accent2',
  A3: 'system_accent3',
};

interface GroupSpec {
  name: string;
  hue: number;
  saturation: number;
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
    return Math.round(255 * value)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function makeGroups(hueSeed: number): GroupSpec[] {
  return [
    { name: 'N1', hue: hueSeed, saturation: 0.06 },
    { name: 'N2', hue: (hueSeed + 24) % 360, saturation: 0.11 },
    { name: 'A1', hue: (hueSeed + 200) % 360, saturation: 0.72 },
    { name: 'A2', hue: (hueSeed + 320) % 360, saturation: 0.55 },
    { name: 'A3', hue: (hueSeed + 120) % 360, saturation: 0.62 },
  ];
}

function toneColor(spec: GroupSpec, shade: number): string {
  const tone = shade / 1000;
  // Neutral 0 and 1000 are pure black/white; saturation peaks mid-ramp.
  if (shade === 0) return '#000000';
  if (shade === 1000) return '#FFFFFF';
  const lightness = 0.03 + tone * 0.94;
  const saturation = spec.saturation * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, tone))), 0.55);
  return hslToHex(spec.hue, saturation, lightness);
}

const CSS = `
.chips-panel { position: absolute; inset: 0; overflow: auto; padding: 12px;
  background: #12161b; color: #e6edf3; font: 13px/1.4 system-ui, sans-serif; }
.chips-panel h2 { margin: 0 0 2px; font-size: 17px; }
.chips-note { margin: 0 0 12px; color: #9aa7b2; font-size: 12px; }
.chips-grid { display: grid; grid-auto-flow: column; grid-template-rows: repeat(13, minmax(28px, 1fr));
  gap: 4px; min-width: 520px; }
.chip { display: flex; align-items: center; justify-content: center; border-radius: 12px;
  min-height: 28px; padding: 0 4px; cursor: pointer; border: none; font: inherit; font-size: 11px;
  white-space: nowrap; transition: transform 120ms ease; }
.chip:hover { transform: scale(1.06); }
.chips-actions { margin-top: 12px; display: flex; gap: 8px; }
.chips-actions button { background: #1a2027; color: #e6edf3; border: 1px solid #2b343d;
  border-radius: 10px; padding: 7px 12px; cursor: pointer; font-size: 12px; }
`;

export interface PaintChipsHandle {
  destroy(): void;
  reroll(): void;
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

  let groups = makeGroups(context.random() * 360);

  const build = (): void => {
    const heading = document.createElement('h2');
    heading.textContent = options.heading;
    const note = document.createElement('p');
    note.className = 'chips-note';
    note.textContent = `${options.subtitle} · 点任意色块可复制它的 system color 名称与当前色值`;

    const grid = document.createElement('div');
    grid.className = 'chips-grid';

    for (const spec of groups) {
      const ramp = SHADES.map((shade) => toneColor(spec, shade));
      for (const shade of SHADES) {
        const index = SHADES.indexOf(shade);
        const color = ramp[index];
        const label = `${spec.name}-${shade}`;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.textContent = label;
        chip.style.background = color;
        chip.style.color = shade > 500 ? ramp[0] : ramp[ramp.length - 1];
        chip.title = `@android:color/${SYSTEM_NAMES[spec.name]}_${shade}`;
        chip.addEventListener('click', () => {
          const text = `${label} (@android:color/${SYSTEM_NAMES[spec.name]}_${shade})\ncurrently: ${color}`;
          void navigator.clipboard?.writeText(text);
          context.toast(`${label} ${color} 已复制`, 1.6);
        });
        grid.appendChild(chip);
      }
    }

    const actions = document.createElement('div');
    actions.className = 'chips-actions';
    const reroll = document.createElement('button');
    reroll.type = 'button';
    reroll.textContent = '换一组壁纸取色';
    reroll.addEventListener('click', () => {
      groups = makeGroups(context.random() * 360);
      build();
    });
    actions.appendChild(reroll);

    panel.replaceChildren(heading, note, grid, actions);
  };

  build();
  parent?.append(style, panel);

  return {
    reroll: () => {
      groups = makeGroups(context.random() * 360);
      build();
    },
    destroy() {
      panel.remove();
      style.remove();
    },
  };
}
