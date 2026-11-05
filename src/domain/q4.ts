// Q4 tab: the 4th quarter plus any overtime of one game, both teams on one shared axis.

import { onCourtAt } from './gameChart.ts';
import { gameLength, periodStart, REG_PERIODS } from './time.ts';
import type { Game, PlayerGame } from './types.ts';

/** Elapsed time at the start of Q4 (36:00). */
export const Q4_START = periodStart(REG_PERIODS);

export interface Q4Row {
  p: PlayerGame;
  /** Seconds on court in Q4 + OT. */
  min: number;
  /** Fouls committed before Q4 (Q1–Q3). */
  foulsBefore: number;
  /** Fouls committed in Q4 + OT. */
  foulsIn: number;
  /** On court at the final buzzer. */
  closer: boolean;
}

/** Q4 + OT stints of a player (stints never cross a period line). */
export const q4Stints = (p: PlayerGame) => p.stints.filter(([s, e]) => e > s && s >= Q4_START);

/**
 * Rows of one team: players on court at some point in Q4/OT. Order: the players on court at the final buzzer
 * (the closers) first, then everyone else; within each group by Q4+OT minutes, most first (then by name).
 */
export function q4Rows(g: Game, team: string): Q4Row[] {
  const closers = new Set(onCourtAt(g, team, gameLength(g.periods)).map((p) => p.id));
  return g.players
    .filter((p) => p.team === team && q4Stints(p).length > 0)
    .map((p) => {
      const fouls = p.fouls ?? [];
      return {
        p,
        min: q4Stints(p).reduce((x, [s, e]) => x + e - s, 0),
        foulsBefore: fouls.filter(([, period]) => period < REG_PERIODS).length,
        foulsIn: fouls.filter(([, period]) => period >= REG_PERIODS).length,
        closer: closers.has(p.id),
      };
    })
    .sort((a, b) => Number(b.closer) - Number(a.closer) || b.min - a.min || a.p.name.localeCompare(b.p.name));
}

/** Row geometry for a row height: foul-tick lane on top, bar below, optional label lane under the bar. */
export const Q4_ROW = { minPx: 22, maxPx: 34 } as const;
export function q4Geometry(rowPx: number) {
  const top = Math.max(8, Math.round(rowPx * 0.34));
  return { row: rowPx, top, bar: rowPx - top, bottom: Math.max(8, Math.round(rowPx * 0.32)) };
}

/**
 * Row height that makes `rows` rows (plus `bottomRows` rows that need the extra label lane) fit in `availPx` after
 * `fixedPx` of headers; clamped to [minPx, maxPx]. `fits` = false when even the minimum does not fit.
 */
export function q4RowHeight(rows: number, bottomRows: number, availPx: number, fixedPx: number) {
  const per = (h: number) => rows * h + bottomRows * q4Geometry(h).bottom;
  let h: number = Q4_ROW.maxPx;
  while (h > Q4_ROW.minPx && per(h) > availPx - fixedPx) h--;
  return { rowPx: h, fits: per(h) <= availPx - fixedPx };
}
