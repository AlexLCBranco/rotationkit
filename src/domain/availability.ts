// Whether a player was with a team for a given game, and if so whether he played.
// Used by the with/without filter: "did not play" only counts games where the player was with the team.

import type { Game } from './types.ts';

export type Availability =
  | 'played'
  | 'dnp' // in the box score, did not play (e.g. coach's decision)
  | 'out' // with the team but not in the box score (inactive / injured)
  | 'not-with-team';

/** 'official' = per-game roster list; 'rule' = estimated from appearances. */
export type AvailabilitySource = 'box' | 'official' | 'rule';

export interface Appearance {
  gameId: string;
  date: string;
  team: string;
}

/** Appearance = listed in a team's box score (played or not). Per player, sorted by date. */
export type AppearanceIndex = Map<number, Appearance[]>;

export function buildAppearances(games: Game[]): AppearanceIndex {
  const idx: AppearanceIndex = new Map();
  for (const g of games) {
    for (const p of g.players) {
      if (!idx.has(p.id)) idx.set(p.id, []);
      idx.get(p.id)!.push({ gameId: g.id, date: g.date, team: p.team });
    }
  }
  for (const list of idx.values()) list.sort((a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId));
  return idx;
}

/** Chronological order of games: by date, then game ID (same-day ties). */
const cmp = (a: { date: string; id: string }, b: { date: string; id: string }) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const key = (a: Appearance) => ({ date: a.date, id: a.gameId });

/**
 * Appearance rule (estimate):
 * - with team T from his first appearance for T up to his last appearance for T;
 * - after his last appearance for T, still with T unless he has appeared for another team since;
 * - games before his first appearance for T: not with T.
 */
export function withTeamByRule(apps: Appearance[] | undefined, game: { id: string; date: string }, team: string): boolean {
  const forTeam = (apps ?? []).filter((a) => a.team === team);
  const first = forTeam[0];
  const last = forTeam[forTeam.length - 1];
  if (!first || !last) return false;
  if (cmp(game, key(first)) < 0) return false;
  if (cmp(game, key(last)) <= 0) return true;
  return !apps!.some((a) => a.team !== team && cmp(key(a), key(last)) > 0 && cmp(key(a), game) <= 0);
}

export interface AvailabilityResult {
  status: Availability;
  source: AvailabilitySource;
}

/**
 * Player's availability for team `team` in game `g`.
 * Box score decides played/dnp. Otherwise the official per-game roster list is used when
 * `preferOfficial` and the game has one; else the appearance rule.
 */
export function availabilityFor(
  idx: AppearanceIndex,
  g: Game,
  team: string,
  playerId: number,
  preferOfficial: boolean,
): AvailabilityResult {
  const p = g.players.find((x) => x.id === playerId);
  if (p) return p.team === team ? { status: p.played ? 'played' : 'dnp', source: 'box' } : { status: 'not-with-team', source: 'box' };
  if (preferOfficial && g.inactive) {
    const listed = g.inactive.some((x) => x.id === playerId && x.team === team);
    return { status: listed ? 'out' : 'not-with-team', source: 'official' };
  }
  return { status: withTeamByRule(idx.get(playerId), g, team) ? 'out' : 'not-with-team', source: 'rule' };
}

/** Rebuild the index from data/<season>/appearances.json + index.json (browser side). */
export function appearancesFromFile(file: Record<string, [string, string][]>, dates: Map<string, string>): AppearanceIndex {
  const idx: AppearanceIndex = new Map();
  for (const [pid, list] of Object.entries(file)) {
    const apps = list.map(([gameId, team]) => ({ gameId, date: dates.get(gameId) ?? '', team }));
    apps.sort((a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId));
    idx.set(Number(pid), apps);
  }
  return idx;
}
