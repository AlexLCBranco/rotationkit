// Load cached raw responses for a game and normalize them.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_DIR, isFetched, readCached } from './cache.ts';
import { normalizeGame } from '../../src/domain/normalize.ts';
import type { RawGame } from '../../src/domain/raw.ts';
import type { Game } from '../../src/domain/types.ts';

export function loadRaw(id: string): RawGame {
  const get = (s: 'boxscore' | 'playbyplay' | 'gamerotation' | 'summary') => readCached(id, s);
  return {
    boxscore: get('boxscore'),
    playbyplay: get('playbyplay'),
    gamerotation: get('gamerotation'),
    summary: get('summary'),
  } as RawGame;
}

export const normalizeCached = (id: string): Game => normalizeGame(loadRaw(id));

/** Finished regular-season games of the cached season schedule that are fully fetched, in date order. */
export function fetchedSeasonGames(): string[] {
  const sched = JSON.parse(readFileSync(join(CACHE_DIR, 'schedule.json'), 'utf8')) as {
    leagueSchedule: { gameDates: { games: { gameId: string; gameStatus: number }[] }[] };
  };
  return sched.leagueSchedule.gameDates
    .flatMap((d) => d.games)
    .filter((g) => g.gameId.startsWith('002') && g.gameStatus === 3 && isFetched(g.gameId))
    .map((g) => g.gameId);
}
