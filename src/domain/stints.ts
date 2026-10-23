// Display helpers for stints.

import type { Stint } from './types.ts';

/** Merge stints that continue across a period boundary (end === next start) into one, summing +/- and fouls. */
export function mergeContinuous(stints: Stint[]): Stint[] {
  const out: Stint[] = [];
  for (const s of stints) {
    const last = out[out.length - 1];
    if (last && last[1] === s[0] && s[1] > s[0] && last[1] > last[0]) {
      const fouls = [...(last[3] ?? []), ...(s[3] ?? [])];
      out[out.length - 1] = [last[0], s[1], last[2] + s[2], ...(fouls.length ? [fouls] : [])] as Stint;
    } else out.push([...s] as Stint);
  }
  return out;
}
