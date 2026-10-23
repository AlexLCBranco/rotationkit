// Load cached raw responses for a game and normalize them.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_DIR, isFetched, readCached, readSeason } from './cache.ts';
import { normalizeGame } from '../../src/domain/normalize.ts';
import type { RawGame } from '../../src/domain/raw.ts';
import type { Game } from '../../src/domain/types.ts';

export function loadRaw(id: string): RawGame {
  const raw = {
    boxscore: readCached(id, 'boxscore'),
    playbyplay: readCached(id, 'playbyplay'),
    gamerotation: readCached(id, 'gamerotation'),
    summary: readCached(id, 'summary'),
  } as RawGame;
  if (!raw.gamerotation) delete raw.gamerotation;
  if (!raw.summary) delete raw.summary;
  return raw;
}

export const normalizeCached = (id: string): Game => normalizeGame(loadRaw(id));

/** Seasons with a cached game list, oldest first. */
export function cachedSeasons(): string[] {
  const dir = join(CACHE_DIR, 'seasons');
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort() : [];
}

/** Seasons from `--season X` or all cached ones. */
export function seasonsFromArgs(): string[] {
  const i = process.argv.indexOf('--season');
  return i >= 0 ? [process.argv[i + 1]!] : cachedSeasons();
}

/** Finished regular-season games of a season that are fully fetched, in date order. */
export function fetchedSeasonGames(season: string): string[] {
  return readSeason(season).games.filter((g) => isFetched(g.gameId)).map((g) => g.gameId);
}
