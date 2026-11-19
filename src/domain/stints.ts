// Display helpers for stints.

import type { PlayerGame, Stint } from './types.ts';
import { formatDuration, periodAt, periodEnd, REG_PERIODS } from './time.ts';

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

// ---------- RK-5: a stint that runs across a quarter (or OT) break, in parts ----------

/** One quarter's piece of a stint. */
export interface StintPart {
  a: number;
  b: number;
  period: number;
}

/** A (merged) stint cut at each period break it crosses; a stint inside one period is one part. */
export function stintParts(st: Stint): StintPart[] {
  const [a, b] = st;
  if (b <= a) return [{ a, b, period: periodAt(a + 0.05) }];
  const out: StintPart[] = [];
  let x = a;
  while (x < b) {
    const period = periodAt(x + 0.05);
    const end = Math.min(b, periodEnd(period));
    out.push({ a: x, b: end, period });
    x = end;
  }
  return out;
}

const periodName = (p: number) => (p <= REG_PERIODS ? `Q${p}` : p === REG_PERIODS + 1 ? 'OT' : `${p - REG_PERIODS}OT`);

/** "18:54 — Q2 6:54, Q3 12:00" for a stint crossing a break; the plain "18:54" otherwise. */
export function stintSplitText(st: Stint): string {
  const parts = stintParts(st);
  const total = formatDuration(st[1] - st[0]);
  return parts.length < 2 ? total : `${total} — ${parts.map((p) => `${periodName(p.period)} ${formatDuration(p.b - p.a)}`).join(', ')}`;
}

/** Labels on a stint bar: one per part (null = too narrow, the notch still shows), or the total when no part fits. */
export interface BarLabels {
  /** Same order and length as stintParts(st). */
  parts: (StintPart & { text: string | null })[];
  /** Set when no part has room for its own label: the whole bar's label, as before RK-5 (null = none fits either). */
  total: string | null;
}

/**
 * `pxPerSec` = bar scale; `textPx(text)` = width a label needs; `minPx` = narrowest bar that gets any label. Points
 * (`pts`, shown when not null) go once, after the last part's minutes ("12:00 · 17p") when that fits, else are left off.
 */
export function barLabels(st: Stint, pxPerSec: number, pts: number | null, textPx: (t: string) => number, minPx: number): BarLabels {
  const fits = (sec: number, text: string) => sec * pxPerSec >= Math.max(minPx, textPx(text));
  const withPts = (min: string) => (pts === null ? null : `${min} · ${pts}p`);
  const parts = stintParts(st).map((p, i, all) => {
    const min = formatDuration(p.b - p.a);
    const long = i === all.length - 1 && all.length > 1 ? withPts(min) : null;
    const text = long && fits(p.b - p.a, long) ? long : fits(p.b - p.a, min) ? min : null;
    return { ...p, text };
  });
  if (parts.length > 1 && parts.some((p) => p.text !== null)) return { parts, total: null };
  // As before RK-5: the total (with points when they fit) on any bar at least minPx wide.
  const px = (st[1] - st[0]) * pxPerSec;
  const min = formatDuration(st[1] - st[0]);
  const long = withPts(min);
  const total = px < minPx ? null : long && px >= textPx(long) ? long : min;
  return { parts: parts.map((p) => ({ ...p, text: null })), total };
}
