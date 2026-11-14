// Browser-side loading of committed JSON (served at /data). Everything is memoized per session.

import type { Game, GameIndexEntry, ScheduleEntry } from '../domain/types.ts';
import { appearancesFromFile, buildAppearances, type AppearanceIndex } from '../domain/availability.ts';

export interface SeasonInfo {
  season: string;
  games: number;
}

const memo = new Map<string, Promise<unknown>>();
function get<T>(path: string): Promise<T> {
  if (!memo.has(path)) {
    memo.set(
      path,
      fetch(`/data/${path}`).then((r) => {
        if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
        return r.json();
      }),
    );
  }
  return memo.get(path) as Promise<T>;
}

export const loadSeasons = () => get<SeasonInfo[]>('seasons.json');
export const loadIndex = (season: string) => get<GameIndexEntry[]>(`${season}/index.json`);
/** Schedule of a season incl. unplayed games (only for seasons the feed was cached for). */
export const loadQuarters = (season: string) => get<import('../domain/leaders.ts').QuartersFile>(`${season}/quarters.json`);
export const loadSchedule = (season: string) => get<ScheduleEntry[]>(`${season}/schedule.json`);
export const loadGame = (season: string, id: string) => get<Game>(`${season}/games/${id}.json`);
/** Player index for the header search (generated at build time, src/domain/players.ts). */
export const loadPlayers = (season: string) => get<import('../domain/players.ts').PlayerIndexEntry[]>(`${season}/players.json`);

/** Season-wide appearances (every box-score listing, all teams): traded players' teams and the with/without rule. */
export async function loadSeasonAppearances(season: string): Promise<AppearanceIndex> {
  const [file, index] = await Promise.all([get<Record<string, [string, string][]>>(`${season}/appearances.json`), loadIndex(season)]);
  return appearancesFromFile(file, new Map(index.map((e) => [e.id, e.date])));
}

/**
 * All games of a team in a season, oldest first: ONE request for the team-season bundle (data/<season>/teams/<TEAM>.json,
 * generated at build time from the game files, scripts/lib/generated.ts). Single-game screens keep loading single files.
 */
export async function loadTeamGames(season: string, team: string): Promise<Game[]> {
  return get<Game[]>(`${season}/teams/${team}.json`);
}

/**
 * Appearance index for the with/without rule. Only needed when a game has no official inactive list;
 * then the season-wide file is loaded (a traded player's appearances for other teams matter).
 */
export async function appearanceIndex(season: string, games: Game[]): Promise<AppearanceIndex> {
  if (games.every((g) => g.inactive)) return buildAppearances(games);
  return loadSeasonAppearances(season);
}
