// Colorblind-safe sequential scale (viridis) for on-court share. 0% is near the background on purpose.

const VIRIDIS = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'];
const EMPTY = '#1c2130';
export const NO_DATA = '#2a2f3c';

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [hex(a), hex(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i]! - v) * t)).join(',')})`;
};

/** Color for a share in [0, 1]; null = no eligible data (e.g. all blowout time). */
export function heat(share: number | null): string {
  if (share === null) return NO_DATA;
  if (share <= 0) return EMPTY;
  const x = Math.min(1, share) * (VIRIDIS.length - 1);
  const i = Math.min(VIRIDIS.length - 2, Math.floor(x));
  return mix(VIRIDIS[i]!, VIRIDIS[i + 1]!, x - i);
}

export const LEGEND_STOPS = [0, 0.25, 0.5, 0.75, 1];
