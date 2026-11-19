// Points per stint for game files committed before they existed: taken from a fresh normalization of the same raw
// responses, ONLY when its stints are identical to the committed ones (same players, same start/end). Nothing else in
// the committed file changes.

import { compactCounts, countsOf, type UsageCounts } from '../../src/domain/usage.ts';
import type { RawBoxscore } from '../../src/domain/raw.ts';
import type { Game, PlayerGame, TeamInfo } from '../../src/domain/types.ts';

/** The committed game with `ptsS` / `stintPts` added, or a reason why not. */
export function addStintPoints(committed: Game, fresh: Game): { game: Game } | { skip: string } {
  if (committed.id !== fresh.id) return { skip: 'different game' };
  if (!fresh.stintPts) return { skip: 'fresh normalization has no points per stint' };
  const by = new Map(fresh.players.map((p) => [p.id, p]));
  const players = [];
  for (const p of committed.players) {
    const f = by.get(p.id);
    const same = f && f.stints.length === p.stints.length && f.stints.every((s, i) => s[0] === p.stints[i]![0] && s[1] === p.stints[i]![1]);
    if (!same) return { skip: `stints of ${p.name} differ from the committed file` };
    const { ptsS: _drop, ...rest } = p;
    void _drop;
    players.push(f.ptsS ? { ...rest, ptsS: f.ptsS } : rest);
  }
  return { game: { ...committed, players, stintPts: true } };
}

/**
 * FGA / FTA / TOV (usage rate) for a game file committed before they existed, taken from the game's raw box score.
 * Only when the box score has the three counts for both teams and for every player in the committed file. Nothing else
 * in the committed file changes.
 */
export function addUsageCounts(committed: Game, rawBox: unknown): { game: Game } | { skip: string } {
  const bg = (rawBox as RawBoxscore | undefined)?.game;
  if (!bg || bg.gameId !== committed.id) return { skip: 'box score is for a different game' };
  if (bg.homeTeam.teamTricode !== committed.home.tri || bg.awayTeam.teamTricode !== committed.away.tri) return { skip: 'teams differ from the committed file' };
  const teams = { home: countsOf(bg.homeTeam.statistics), away: countsOf(bg.awayTeam.statistics) };
  if (!teams.home || !teams.away) return { skip: 'box score has no team FGA / FTA / TOV' };
  const by = new Map([...bg.homeTeam.players, ...bg.awayTeam.players].map((p) => [p.personId, countsOf(p.statistics)]));
  const players = [];
  for (const p of committed.players) {
    if (!by.has(p.id)) return { skip: `${p.name} is not in the box score` };
    const c = by.get(p.id);
    if (!c) return { skip: `box score has no FGA / FTA / TOV for ${p.name}` };
    // Same key order as a fresh normalization: the counts right after +/-.
    const { fga: _a, fta: _b, tov: _c, ...rest } = p;
    void _a, void _b, void _c;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      out[k] = v;
      if (k === 'pm') Object.assign(out, compactCounts(c));
    }
    players.push(out as unknown as PlayerGame);
  }
  const team = (t: TeamInfo, c: UsageCounts): TeamInfo => {
    const { fga: _a, fta: _b, tov: _c, ...rest } = t;
    void _a, void _b, void _c;
    return { ...rest, ...compactCounts(c) };
  };
  return { game: { ...committed, home: team(committed.home, teams.home), away: team(committed.away, teams.away), players, usg: true } };
}
