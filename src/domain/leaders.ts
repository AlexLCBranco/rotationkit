// Leaders tab: who averages the most 4th-quarter (or second-half) minutes and points, over a team's last 5 / last 10
// games or the season. Built from a compact per-season file (data/<season>/quarters.json, written by normalize) so the
// browser does not load every game file.

import { quarterStats } from './gameChart.ts';
import { blowoutIntervals } from './patterns.ts';
import { periodEnd, periodStart, REG_PERIODS } from './time.ts';
import type { Game } from './types.ts';

/**
 * One game in quarters.json: [id, date, home, away, players]. Player: [id, team 0 = home / 1 = away, min per period (s),
 * pts per period, and only when he had any: garbage-time min per period, garbage-time pts per period].
 */
export type QPlayer = [id: number, side: 0 | 1, min: number[], pts: number[], gtMin?: number[], gtPts?: number[]];
export type QGame = [id: string, date: string, home: string, away: string, players: QPlayer[]];
export interface QuartersFile {
  /** id → [name, short name "F. Wagner"]. */
  names: Record<number, [string, string]>;
  games: QGame[];
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Compact quarters file from full game files (players who appeared: played with at least one stint). */
export function buildQuartersFile(games: Game[]): QuartersFile {
  const names: QuartersFile['names'] = {};
  const out: QGame[] = [];
  for (const g of [...games].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    const ps: QGame[4] = [];
    const gt = blowoutIntervals(g);
    for (const p of g.players) {
      if (!p.played || !p.stints.length) continue;
      names[p.id] = [p.name, p.nameI ?? p.name];
      const min = quarterStats(p, g.periods).map((q) => r1(q.min));
      const pts = Array.from({ length: g.periods }, (_, i) => p.ptsQ?.[i] ?? 0);
      const row: QPlayer = [p.id, p.team === g.home.tri ? 0 : 1, min, pts];
      // Garbage time (blowout rule): minutes on court inside the intervals, points from ptsGT.
      const gtMin = Array.from({ length: g.periods }, (_, i) => {
        const [q0, q1] = [periodStart(i + 1), periodEnd(i + 1)];
        return r1(gt.reduce((x, [a, b]) => x + p.stints.reduce((y, [s0, e0]) => y + Math.max(0, Math.min(e0, b, q1) - Math.max(s0, a, q0)), 0), 0));
      });
      if (gtMin.some((x) => x > 0) || p.ptsGT) row.push(gtMin, Array.from({ length: g.periods }, (_, i) => p.ptsGT?.[i] ?? 0));
      ps.push(row);
    }
    out.push([g.id, g.date, g.home.tri, g.away.tri, ps]);
  }
  return { names, games: out };
}

export type Part = 'q4' | 'h2';
export type LeaderWindow = 5 | 10 | 'season';
export interface LeaderOpts {
  part: Part;
  /** Count overtime periods too. */
  ot: boolean;
  window: LeaderWindow;
  /** Only this team's players (tricode), or all. */
  team?: string | null;
  sort: 'min' | 'pts';
  /** Leave out garbage time (blowout rule): its minutes and the points scored in it. */
  noGarbage?: boolean;
}

/** Minimum games played in the window to be ranked: 3 of the last 5, 5 of the last 10, 40% of the season. */
export const LEADER_MIN_GAMES = { 5: 3, 10: 5, seasonShare: 0.4 } as const;

export interface LeaderRow {
  id: number;
  name: string;
  short: string;
  team: string;
  /** Games he played in the window. */
  gp: number;
  /** Team games in the window. */
  of: number;
  /** Per game played, in the chosen part (seconds / points). */
  min: number;
  pts: number;
  /** Points per 12 minutes in that part (null with no minutes). */
  per12: number | null;
}

/** Periods (1-based) that count for a part: Q4 = 4, second half = 3–4; plus every OT when `ot`. */
export const partPeriods = (part: Part, ot: boolean, periods: number) => {
  const base = part === 'q4' ? [REG_PERIODS] : [REG_PERIODS - 1, REG_PERIODS];
  return ot ? [...base, ...Array.from({ length: periods - REG_PERIODS }, (_, i) => REG_PERIODS + 1 + i)] : base;
};

/**
 * Ranked players. Window = the last N games of the team he played for in his latest game (a traded player only counts
 * games with his current team); season = all his games. Averages are per game he played (0 when he sat the part).
 */
export function leaders(file: QuartersFile, o: LeaderOpts): LeaderRow[] {
  const byTeam = new Map<string, QGame[]>();
  for (const g of file.games) for (const t of [g[2], g[3]]) (byTeam.get(t) ?? byTeam.set(t, []).get(t)!).push(g);
  // Each player's games (in date order) and latest team.
  const mine = new Map<number, { g: QGame; p: QGame[4][number] }[]>();
  const latest = new Map<number, string>();
  for (const g of file.games)
    for (const p of g[4]) {
      (mine.get(p[0]) ?? mine.set(p[0], []).get(p[0])!).push({ g, p });
      latest.set(p[0], p[1] === 0 ? g[2] : g[3]);
    }
  const rows: LeaderRow[] = [];
  for (const [id, team] of latest) {
    if (o.team && team !== o.team) continue;
    const teamGames = byTeam.get(team)!;
    const inWindow = o.window === 'season' ? null : new Set(teamGames.slice(-o.window).map((g) => g[0]));
    let gp = 0;
    let min = 0;
    let pts = 0;
    for (const { g, p } of mine.get(id)!) {
      if (inWindow && !inWindow.has(g[0])) continue;
      gp++;
      for (const q of partPeriods(o.part, o.ot, p[2].length)) {
        min += (p[2][q - 1] ?? 0) - (o.noGarbage ? (p[4]?.[q - 1] ?? 0) : 0);
        pts += (p[3][q - 1] ?? 0) - (o.noGarbage ? (p[5]?.[q - 1] ?? 0) : 0);
      }
    }
    const of = o.window === 'season' ? teamGames.length : Math.min(o.window, teamGames.length);
    const need = o.window === 'season' ? Math.max(1, Math.ceil(teamGames.length * LEADER_MIN_GAMES.seasonShare)) : Math.min(LEADER_MIN_GAMES[o.window], of);
    if (gp < need) continue;
    const [name, short] = file.names[id] ?? [String(id), String(id)];
    rows.push({ id, name, short, team, gp, of, min: min / gp, pts: pts / gp, per12: min > 0 ? (pts / min) * 720 : null });
  }
  return rows.sort((a, b) => (o.sort === 'pts' ? b.pts - a.pts || b.min - a.min : b.min - a.min || b.pts - a.pts) || a.name.localeCompare(b.name));
}
