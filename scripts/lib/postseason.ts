// RK-13: finding a PAST season's play-in, playoff and NBA Cup final games without a schedule feed (the CDN only
// serves the current season's feed, and stats.nba.com does not answer GitHub's runners). Nothing is assumed about
// which games exist: each candidate id is asked for on cdn.nba.com, and only a real, final box score with that very
// id counts. A candidate the CDN does not have is simply not a game.
//   Cup final  006YY00001                 (the id the schedule feed itself gives the final: 0062600001 for 2026-27)
//   playoffs   004YY00<round><series><game>   round 1–4, series 0–7 / 0–3 / 0–1 / 0, game 1–7
//   play-in    005YY00<nnn>               every nnn from 001 to 299 is asked for
// Pure helpers here (unit-tested); the downloading is in scripts/backfill-postseason.ts.

export const yyOf = (season: string) => season.slice(2, 4);

export const SERIES_PER_ROUND = [8, 4, 2, 1] as const;

/** Game 1 of every possible playoff series of a season. */
export function playoffSeries(season: string): { round: number; series: number; prefix: string }[] {
  const out = [];
  for (let r = 1; r <= SERIES_PER_ROUND.length; r++) for (let s = 0; s < SERIES_PER_ROUND[r - 1]!; s++) out.push({ round: r, series: s, prefix: `004${yyOf(season)}00${r}${s}` });
  return out;
}

export const playInCandidates = (season: string) => Array.from({ length: 299 }, (_, i) => `005${yyOf(season)}00${String(i + 1).padStart(3, '0')}`);
export const cupFinalCandidates = (season: string) => [`006${yyOf(season)}00001`];

export interface FoundGame {
  id: string;
  date: string;
  home: string;
  away: string;
  hs: number;
  as: number;
}

/** A raw CDN box score as a found game, or the reason it does not count (wrong id, not final, another season). */
export function foundGame(id: string, season: string, box: unknown): FoundGame | string {
  const g = (box as { game?: { gameId?: string; gameStatus?: number; gameEt?: string; homeTeam?: { teamTricode?: string; score?: number }; awayTeam?: { teamTricode?: string; score?: number } } } | undefined)?.game;
  if (!g) return 'no game in the response';
  if (g.gameId !== id) return `box score is for ${g.gameId}, not ${id}`;
  if (g.gameStatus !== 3) return `gameStatus=${g.gameStatus}, expected 3 (final)`;
  const date = String(g.gameEt ?? '').slice(0, 10);
  const [y1, y2] = [Number(season.slice(0, 4)), Number(season.slice(0, 4)) + 1];
  // A season's games are played from October of its first year to June of its second.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < `${y1}-10-01` || date > `${y2}-07-31`) return `date ${date} is not in the ${season} season`;
  if (!g.homeTeam?.teamTricode || !g.awayTeam?.teamTricode) return 'no team codes';
  return { id, date, home: g.homeTeam.teamTricode, away: g.awayTeam.teamTricode, hs: g.homeTeam.score ?? 0, as: g.awayTeam.score ?? 0 };
}

/** Checks on the playoff games found: every series is the same two teams and ends when one has 4 wins. A problem
 * means games are missing (or the id pattern is not what was assumed): it is reported, never papered over. */
export function playoffProblems(games: FoundGame[]): string[] {
  const out: string[] = [];
  const series = new Map<string, FoundGame[]>();
  for (const g of games) (series.get(g.id.slice(0, 9)) ?? series.set(g.id.slice(0, 9), []).get(g.id.slice(0, 9))!).push(g);
  for (const [key, gs] of [...series].sort()) {
    const teams = new Set(gs.flatMap((g) => [g.home, g.away]));
    if (teams.size !== 2) out.push(`series ${key}: ${teams.size} teams (${[...teams].join(', ')})`);
    const nums = gs.map((g) => Number(g.id.slice(9))).sort((a, b) => a - b);
    if (nums.some((n, i) => n !== i + 1)) out.push(`series ${key}: game numbers ${nums.join(', ')}`);
    const wins = new Map<string, number>();
    for (const g of gs) wins.set(g.hs > g.as ? g.home : g.away, (wins.get(g.hs > g.as ? g.home : g.away) ?? 0) + 1);
    const top = Math.max(...wins.values());
    if (top !== 4) out.push(`series ${key}: the leader has ${top} wins after ${gs.length} games (a finished series has 4)`);
    else if (gs.filter((g) => (g.hs > g.as ? g.home : g.away) === [...wins].find(([, w]) => w === 4)![0]).length === 4 && gs.length > 7) out.push(`series ${key}: ${gs.length} games`);
  }
  const perRound = [1, 2, 3, 4].map((r) => [...series.keys()].filter((k) => k[7] === String(r)).length);
  perRound.forEach((n, i) => n !== SERIES_PER_ROUND[i] && out.push(`round ${i + 1}: ${n} series found, ${SERIES_PER_ROUND[i]} expected`));
  return out;
}
