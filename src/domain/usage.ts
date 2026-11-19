// Usage rate (USG%): the share of his team's plays a player finishes while on court, from box-score counts.
//   USG% = 100 × (FGA + 0.44×FTA + TOV) × (team MIN / 5) / (MIN × (team FGA + 0.44×team FTA + team TOV))
// FGA / FTA / TOV come from the cdn.nba.com box score (`statistics.fieldGoalsAttempted`, `freeThrowsAttempted`,
// `turnovers`, per player and per team) and sit on game files that have `Game.usg`. Team MIN = the game's length
// (48:00 + 5:00 per OT) × 5. Box-score counts are whole-game: no per-quarter or garbage-time split exists.

import { gameLength } from './time.ts';
import type { Game, PlayerGame, TeamInfo } from './types.ts';

/** The three box-score counts. */
export interface UsageCounts {
  fga: number;
  fta: number;
  tov: number;
}

/** The counts from a raw box-score `statistics` object, or undefined when any of them is missing. */
export function countsOf(s: unknown): UsageCounts | undefined {
  const o = s as Record<string, unknown> | undefined;
  const [fga, fta, tov] = [o?.fieldGoalsAttempted, o?.freeThrowsAttempted, o?.turnovers];
  return typeof fga === 'number' && typeof fta === 'number' && typeof tov === 'number' ? { fga, fta, tov } : undefined;
}

/** Counts as stored on a game file: zeros left out (absent = 0 in games with `Game.usg`). */
export function compactCounts(c: UsageCounts): Partial<UsageCounts> {
  return { ...(c.fga ? { fga: c.fga } : {}), ...(c.fta ? { fta: c.fta } : {}), ...(c.tov ? { tov: c.tov } : {}) };
}

/** Plays finished: FGA + 0.44 × FTA + TOV. */
export const playsOf = (c: Partial<UsageCounts>) => (c.fga ?? 0) + 0.44 * (c.fta ?? 0) + (c.tov ?? 0);

/** Team minutes / 5 = the game's length in seconds. */
export const gameSeconds = gameLength;

/**
 * One player-game's share: his plays and his team's plays scaled to his time on court
 * (team plays × MIN / (team MIN / 5)). USG% = 100 × plays / teamPlaysOnCourt. Null when the game has no counts or
 * he did not play.
 */
export interface UsagePart {
  plays: number;
  teamPlaysOnCourt: number;
}

export function usagePart(g: Pick<Game, 'usg' | 'periods' | 'home' | 'away'>, p: Pick<PlayerGame, 'team' | 'played' | 'min' | 'fga' | 'fta' | 'tov'>): UsagePart | null {
  if (!g.usg || !p.played || !(p.min > 0)) return null;
  const team: TeamInfo = p.team === g.home.tri ? g.home : g.away;
  const tp = playsOf(team);
  if (!(tp > 0)) return null;
  return { plays: playsOf(p), teamPlaysOnCourt: (tp * p.min) / gameSeconds(g.periods) };
}

/** USG% over one or more games (each game weighted by his minutes in it); null with no data. */
export function usageRate(parts: (UsagePart | null)[]): number | null {
  let a = 0;
  let b = 0;
  for (const x of parts) {
    if (!x) continue;
    a += x.plays;
    b += x.teamPlaysOnCourt;
  }
  return b > 0 ? (100 * a) / b : null;
}

/** USG% of one player in one game, or null. */
export const gameUsage = (g: Game, p: PlayerGame) => usageRate([usagePart(g, p)]);

/** "24.3" or "—". */
export const formatUsg = (x: number | null) => (x == null ? '—' : x.toFixed(1));
