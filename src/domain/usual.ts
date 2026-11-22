// "Usual vs tonight" overlay on the Games chart: each player's typical stints (typicalStints, regulation only) over his
// team's previous USUAL.games games of the same season before this game (this game excluded, blowout rule on).

import { USUAL } from './config.ts';
import { blowoutIntervals, selectGames, typicalStints, DEFAULT_FILTERS, type Selection, type TypicalStint } from './patterns.ts';
import { seasonOf } from './season.ts';
import { setOf } from './gameSet.ts';
import { REGULATION_LEN } from './time.ts';
import type { Game } from './types.ts';

/** The team's previous USUAL.games games of the season before `g` (by date, then id), as a pattern selection. */
export function usualSelection(teamGames: Game[], g: Game, team: string): Selection {
  const before = teamGames.filter((x) => x.id !== g.id && (x.date < g.date || (x.date === g.date && x.id < g.id)));
  // RK-13: games of the same set as this one (a playoff game is compared with the team's earlier postseason games,
  // never with the regular season); the Cup final belongs to no set, so it has no "usual".
  const set = setOf(g.id);
  if (!set) return selectGames([], seasonOf(g.id), team, { ...DEFAULT_FILTERS, window: USUAL.games, blowout: true });
  return selectGames(before, seasonOf(g.id), team, { ...DEFAULT_FILTERS, window: USUAL.games, blowout: true, ...(set === 'post' ? { set } : {}) });
}

export interface Usual {
  stints: TypicalStint[];
  /** Games he played in the window. */
  played: number;
  /** Per played game: on-court intervals and excluded garbage time (for "7 of 10" at a moment). */
  games: { on: [number, number][]; excl: [number, number][] }[];
}

/** His usual stints in the window, or null when he played fewer than USUAL.minGames of its games. */
export function usualFor(sel: Selection, playerId: number): Usual | null {
  const games = sel.games.flatMap((g) => {
    const p = g.players.find((x) => x.id === playerId && x.team === sel.team);
    if (!p?.played || !p.stints.length) return [];
    return [{ on: p.stints.filter(([s, e]) => e > s).map(([s, e]) => [s, e] as [number, number]), excl: blowoutIntervals(g) }];
  });
  if (games.length < USUAL.minGames) return null;
  return { stints: typicalStints(sel, playerId), played: games.length, games };
}

/** At moment t (regulation): in how many of his window games he was on court, of those where t was not garbage time. */
export function usualAt(u: Usual, t: number): { on: number; of: number } {
  let on = 0;
  let of = 0;
  if (t >= REGULATION_LEN) return { on, of };
  for (const g of u.games) {
    if (g.excl.some(([a, b]) => a <= t && t < b)) continue;
    of++;
    if (g.on.some(([a, b]) => a <= t && t < b)) on++;
  }
  return { on, of };
}

/** The usual stint covering t, if any. */
export const usualStintAt = (u: Usual, t: number) => u.stints.find((s) => s.start <= t && t < s.end);

export const usualLine = (c: { on: number; of: number }) => `usually on court here (${c.on} of ${c.of})`;
