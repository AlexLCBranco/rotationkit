// Raw response cache (gitignored):
//   cache/seasons/<season>.json      finished regular-season games of a season (id + date)
//   cache/games/<gameId>/<source>.json

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchJson, gapFor, sleep } from './http.ts';

export const CACHE_DIR = 'cache';
export const SCHEDULE_URL = 'https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json';

/**
 * Sources per game. Required ones (CDN) must all succeed for a game to count as fetched. Optional ones
 * (stats.nba.com) are logged on failure but never block a game.
 */
export const SOURCES = {
  boxscore: { required: true, url: (id: string) => `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${id}.json` },
  playbyplay: { required: true, url: (id: string) => `https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${id}.json` },
  // Cross-check for the play-by-play stints (Path B).
  gamerotation: { required: false, url: (id: string) => `https://stats.nba.com/stats/gamerotation?GameID=${id}&LeagueID=00` },
  // Per-game roster incl. inactive players (no reasons).
  summary: { required: false, url: (id: string) => `https://stats.nba.com/stats/boxscoresummaryv3?GameID=${id}&LeagueID=00` },
} as const;
export type Source = keyof typeof SOURCES;

export const gameDir = (id: string) => join(CACHE_DIR, 'games', id);
export const sourcePath = (id: string, s: Source) => join(gameDir(id), `${s}.json`);

export function readCached(id: string, s: Source): unknown | undefined {
  const p = sourcePath(id, s);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : undefined;
}

export const missingOptional = (id: string) =>
  (Object.keys(SOURCES) as Source[]).filter((s) => !SOURCES[s].required && !existsSync(sourcePath(id, s)));

export const isFetched = (id: string) =>
  (Object.keys(SOURCES) as Source[]).every((s) => !SOURCES[s].required || existsSync(sourcePath(id, s)));

/** Sanity checks so a valid-looking but empty response is not cached as a real game. */
function checkShape(s: Source, json: any): string | undefined {
  switch (s) {
    case 'boxscore':
      return json?.game?.gameStatus === 3 ? undefined : `boxscore gameStatus=${json?.game?.gameStatus}, expected 3 (final)`;
    case 'playbyplay':
      return json?.game?.actions?.length ? undefined : 'playbyplay has no actions';
    case 'gamerotation': {
      const sets: any[] = json?.resultSets ?? [];
      return sets.length === 2 && sets.every((r) => r.rowSet?.length) ? undefined : 'gamerotation has empty result sets';
    }
    case 'summary':
      return json?.boxScoreSummary?.homeTeam ? undefined : 'summary missing boxScoreSummary';
  }
}

/** Box score of a recent game that does not (yet) list inactive players: worth re-fetching. */
export const BOX_REFRESH_DAYS = 7;
export function needsBoxRefresh(id: string, now = new Date()): boolean {
  const box = readCached(id, 'boxscore') as { game?: { gameTimeUTC?: string; homeTeam?: { players?: { status?: string }[] }; awayTeam?: { players?: { status?: string }[] } } } | undefined;
  const g = box?.game;
  if (!g?.gameTimeUTC) return false;
  const ageDays = (now.getTime() - new Date(g.gameTimeUTC).getTime()) / 86_400_000;
  const hasInactive = [...(g.homeTeam?.players ?? []), ...(g.awayTeam?.players ?? [])].some((p) => p.status === 'INACTIVE');
  return !hasInactive && ageDays <= BOX_REFRESH_DAYS;
}

/** Re-fetch one source, replacing the cached copy only if the new response passes the shape check. */
export async function refetchSource(id: string, s: Source): Promise<string | undefined> {
  try {
    const json = await fetchJson(SOURCES[s].url(id));
    const problem = checkShape(s, json);
    if (problem) return problem;
    writeFileSync(sourcePath(id, s), JSON.stringify(json));
    return undefined;
  } catch (e) {
    return (e as Error).message;
  } finally {
    await sleep(gapFor(SOURCES[s].url(id)));
  }
}

export type GameFetchResult = { gameId: string; ok: boolean; errors: string[]; fetched: Source[] };

export interface FetchOptions {
  force?: boolean;
  /** Skip stats.nba.com (optional) sources. */
  cdnOnly?: boolean;
}

/** Fetch every missing source for one game. Sources already cached are not re-fetched. */
export async function fetchGame(id: string, opts: FetchOptions = {}): Promise<GameFetchResult> {
  const result: GameFetchResult = { gameId: id, ok: true, errors: [], fetched: [] };
  mkdirSync(gameDir(id), { recursive: true });
  for (const s of Object.keys(SOURCES) as Source[]) {
    const p = sourcePath(id, s);
    if (!opts.force && existsSync(p)) continue;
    if (opts.cdnOnly && !SOURCES[s].required) continue;
    // If a required source already failed, don't spend time on the rest of this game.
    if (!result.ok) break;
    try {
      const json = await fetchJson(SOURCES[s].url(id));
      const problem = checkShape(s, json);
      if (problem) throw new Error(problem);
      writeFileSync(p, JSON.stringify(json));
      result.fetched.push(s);
    } catch (e) {
      const msg = `${s}: ${(e as Error).message}`;
      result.errors.push(SOURCES[s].required ? msg : `${msg} (optional)`);
      if (SOURCES[s].required) result.ok = false;
    }
    await sleep(gapFor(SOURCES[s].url(id)));
  }
  return result;
}

export interface SeasonGames {
  season: string;
  source: string;
  games: { gameId: string; date: string }[];
}
export const seasonFile = (season: string) => join(CACHE_DIR, 'seasons', `${season}.json`);
export function readSeason(season: string): SeasonGames {
  return JSON.parse(readFileSync(seasonFile(season), 'utf8')) as SeasonGames;
}
