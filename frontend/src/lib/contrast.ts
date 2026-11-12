// Habit colours are picked by users, so text drawn in them can fail contrast on a panel. This pulls a
// colour toward the readable end (black on light panels, white on dark ones) just far enough to reach
// the ratio, keeping the hue so it still reads as "that habit".

function parse(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

const lin = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: [number, number, number]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The panel colour of the active theme (the `--panel` CSS variable, "r g b"). */
export function panelRgb(): [number, number, number] {
  const raw = typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue('--panel').trim();
  const parts = raw.split(/\s+/).map(Number);
  return parts.length === 3 && parts.every((n) => Number.isFinite(n)) ? [parts[0], parts[1], parts[2]] : [22, 25, 28];
}

/** `hex` adjusted to reach `min` contrast against `bg` (3 suits large bold text, 4.5 normal text). */
export function readableColor(hex: string, bg: [number, number, number] = panelRgb(), min = 3): string {
  const c = parse(hex);
  if (!c) return hex;
  const target: [number, number, number] = luminance(bg) > 0.5 ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const mixed = c.map((v, i) => Math.round(v + (target[i] - v) * t)) as [number, number, number];
    if (contrastRatio(mixed, bg) >= min) return `rgb(${mixed.join(' ')})`;
  }
  return `rgb(${target.join(' ')})`;
}
