// Display helpers for stints.

import type { PlayerGame, Stint } from './types.ts';

/**
 * Points he scored in this stint (one of `p.stints`, matched by identity, else by start/end), or null when the game file
 * has no points per stint (`Game.stintPts`, files normalized before they existed).
 */
export function stintPoints(p: PlayerGame, st: Stint, hasStintPts: boolean | undefined): number | null {
  if (!hasStintPts) return null;
  let k = p.stints.indexOf(st);
  if (k < 0) k = p.stints.findIndex((x) => x[0] === st[0] && x[1] === st[1]);
  return k < 0 ? null : (p.ptsS?.[k] ?? 0);
}

/** " · 8 pts" for readouts; "" without data. */
export const ptsText = (pts: number | null | undefined) => (pts === null || pts === undefined ? '' : ` · ${pts} pt${pts === 1 ? '' : 's'}`);

/** Merge stints that continue across a period boundary (end === next start) into one, summing +/- and fouls. */
export function mergeContinuous(stints: Stint[]): Stint[] {
  return mergeContinuousPts(stints, null).stints;
}

/** Same, carrying points per stint (parallel to `stints`; null = no data) through the merge. */
export function mergeContinuousPts(stints: Stint[], pts: number[] | null): { stints: Stint[]; pts: number[] | null } {
  const out: Stint[] = [];
  const outPts: number[] = [];
  stints.forEach((s, i) => {
    const last = out[out.length - 1];
    const p = pts?.[i] ?? 0;
    if (last && last[1] === s[0] && s[1] > s[0] && last[1] > last[0]) {
      const fouls = [...(last[3] ?? []), ...(s[3] ?? [])];
      out[out.length - 1] = [last[0], s[1], last[2] + s[2], ...(fouls.length ? [fouls] : [])] as Stint;
      outPts[outPts.length - 1]! += p;
    } else {
      out.push([...s] as Stint);
      outPts.push(p);
    }
  });
  return { stints: out, pts: pts ? outPts : null };
}
