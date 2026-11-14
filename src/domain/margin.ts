// Score margin strip (Games and Q4 charts): the game's stored margin timeline as a step function on the chart's own
// time axis, drawn as two filled areas around a zero line (away lead above, home lead below, like the chart's
// team order: away team first).

import { gameLength } from './time.ts';
import type { Game } from './types.ts';

/**
 * [t, lead] steps over [from, to]: lead = away minus home (> 0 = away leads), constant until the next step. Points
 * scored at the final horn (t = to) make a last zero-width step, so the strip ends on the final margin.
 */
export function marginSteps(g: Game, from = 0, to = gameLength(g.periods)): [number, number][] {
  const out: [number, number][] = [];
  let cur = 0;
  // Stable sort by time: a couple of games log a score change out of clock order in the play-by-play.
  const timeline = g.margin.every((x, i) => i === 0 || x[0] >= g.margin[i - 1]![0]) ? g.margin : [...g.margin].sort((a, b) => a[0] - b[0]);
  for (const [t, m] of timeline) {
    if (t <= from) cur = m === 0 ? 0 : -m;
    else if (t <= to) {
      if (!out.length) out.push([from, cur]);
      cur = m === 0 ? 0 : -m;
      if (out[out.length - 1]![1] !== cur) out.push([t, cur]);
    }
  }
  if (!out.length) out.push([from, cur]);
  return out;
}

/** Largest lead either way in the steps (at least `min`, so a close game keeps a readable scale). */
export const marginScale = (steps: [number, number][], min = 10) => Math.max(min, ...steps.map(([, v]) => Math.abs(v)));

/**
 * SVG paths for the strip: `up` fills away leads above the middle line, `down` home leads below it.
 * x = (t − from) × k (the bars' own mapping), y in [0, h] with the zero line at h/2.
 */
export function marginPaths(steps: [number, number][], to: number, from: number, k: number, h: number, scale = marginScale(steps)) {
  const mid = h / 2;
  const y = (v: number) => mid - (v / scale) * (mid - 1);
  const area = (clip: (v: number) => number) => {
    let d = `M0 ${mid}`;
    steps.forEach(([t, v], i) => {
      const x0 = (t - from) * k;
      const x1 = ((steps[i + 1]?.[0] ?? to) - from) * k;
      const yy = y(clip(v));
      d += ` L${r2(x0)} ${r2(yy)} L${r2(x1)} ${r2(yy)}`;
    });
    return `${d} L${r2((to - from) * k)} ${mid} Z`;
  };
  return { up: area((v) => Math.max(0, v)), down: area((v) => Math.min(0, v)), mid, scale };
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** "DET +8" / "Tied" for the final margin. */
export function finalMarginText(g: Game): string {
  const d = g.home.score - g.away.score;
  return d === 0 ? 'Tied' : d > 0 ? `${g.home.tri} +${d}` : `${g.away.tri} +${-d}`;
}
