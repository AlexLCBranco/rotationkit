// Full 4th quarters: who was on court for the whole regulation 4th quarter (12:00), over the season (the per-day
// view is the Games tab's By day, src/domain/slate.ts).
// Computed in the browser from quarters.json (per-period minutes, written by normalize): Q4 minutes are the sum of
// his stints inside period 4, so being subbed out and back in at the same clock still counts as the full 12:00.
// Overtime never counts (period 4 only).

import { quarterStats } from './gameChart.ts';
import { blowoutIntervals } from './patterns.ts';
import type { QGame, QuartersFile } from './leaders.ts';
import { periodEnd, periodStart, REG_PERIOD_LEN, REG_PERIODS } from './time.ts';
import type { Game, PlayerGame } from './types.ts';

export type FullQ4Threshold = 'full' | '11';
/** Seconds on court in the 4th quarter needed: 12:00 exactly, or 11:00+. */
export const FULL_Q4_SECONDS: Record<FullQ4Threshold, number> = { full: REG_PERIOD_LEN, '11': 660 };
/** quarters.json rounds minutes to 0.1 s; anything that rounds to the threshold counts. */
const EPS = 0.05;
export const reachesQ4 = (sec: number, th: FullQ4Threshold) => sec >= FULL_Q4_SECONDS[th] - EPS;

export interface FullQ4Opts {
  threshold: FullQ4Threshold;
  /** Leave out games with garbage time (blowout rule) in the 4th quarter: they count neither as played nor as full. */
  noBlowouts: boolean;
}

/** quarters.json: a game had 4th-quarter garbage time when anyone was on court in it (10 players always are). */
export const hasQ4Garbage = (g: QGame) => g[4].some((p) => (p[4]?.[REG_PERIODS - 1] ?? 0) > 0);

/** Same question on a full game file (player page). */
export function gameHasQ4Garbage(g: Game): boolean {
  const [a, b] = [periodStart(REG_PERIODS), periodEnd(REG_PERIODS)];
  return blowoutIntervals(g).some(([s, e]) => Math.min(e, b) > Math.max(s, a));
}

/** Seconds he was on court in the regulation 4th quarter (full game file). */
export const q4Seconds = (p: PlayerGame, periods: number) => (p.played && p.stints.length ? (quarterStats(p, periods)[REG_PERIODS - 1]?.min ?? 0) : 0);

export interface SeasonCount {
  id: number;
  name: string;
  /** Team in his latest game. */
  team: string;
  /** Games he played (blowout games left out when noBlowouts). */
  gp: number;
  full: number;
  pct: number;
}

/** Season count per player (all teams he played for), over every game in the file. */
export function seasonCounts(file: QuartersFile, o: FullQ4Opts): Map<number, SeasonCount> {
  const out = new Map<number, SeasonCount>();
  for (const g of file.games) {
    if (o.noBlowouts && hasQ4Garbage(g)) continue;
    for (const p of g[4]) {
      const c = out.get(p[0]) ?? { id: p[0], name: file.names[p[0]]?.[0] ?? String(p[0]), team: '', gp: 0, full: 0, pct: 0 };
      c.team = p[1] === 0 ? g[2] : g[3];
      c.gp++;
      if (reachesQ4(p[2][REG_PERIODS - 1] ?? 0, o.threshold)) c.full++;
      out.set(p[0], c);
    }
  }
  for (const c of out.values()) c.pct = c.gp ? c.full / c.gp : 0;
  return out;
}

/** Leaderboard: players with at least one full 4th, most first; then higher share, then name. */
export const leaderboard = (counts: Map<number, SeasonCount>) =>
  [...counts.values()].filter((c) => c.full > 0).sort((a, b) => b.full - a.full || b.pct - a.pct || a.name.localeCompare(b.name));

/** Player page: of the given games, those he played for `team` and those where he reached the threshold in the 4th. */
export function playerFullQ4(games: Game[], player: number, team: string, th: FullQ4Threshold = 'full') {
  const full = new Set<string>();
  let played = 0;
  for (const g of games) {
    const p = g.players.find((x) => x.id === player && x.team === team && x.played && x.stints.length);
    if (!p) continue;
    played++;
    if (reachesQ4(q4Seconds(p, g.periods), th)) full.add(g.id);
  }
  return { played, full };
}
