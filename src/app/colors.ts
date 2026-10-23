// On-court share colors for the team pattern view: one green ramp on the chart's dark track, matching the
// single-game chart (dark = never on court, bright green = always). Colorblind-safe: only lightness changes.

export const TRACK = '#101010';
const GREEN = '#22c55e';

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [hex(a), hex(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i]! - v) * t)).join(',')})`;
};

/** Color for a share in [0, 1]; null = no eligible time (only garbage time) → drawn striped by the caller. */
export function heat(share: number | null): string {
  if (share === null || share <= 0) return TRACK;
  return mix(TRACK, GREEN, Math.min(1, share));
}

export const LEGEND_STOPS = [0, 0.25, 0.5, 0.75, 1];
