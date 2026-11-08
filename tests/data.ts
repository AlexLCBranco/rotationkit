// Load committed normalized season data (data/<season>/...).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Game, GameIndexEntry } from '../src/domain/types.ts';

const DATA = join(import.meta.dirname, '..', 'data');
const cache = new Map<string, Game[]>();

export function loadSeason(season: string): Game[] {
  if (!cache.has(season)) {
    const index = JSON.parse(readFileSync(join(DATA, season, 'index.json'), 'utf8')) as GameIndexEntry[];
    cache.set(season, index.map((e) => JSON.parse(readFileSync(join(DATA, season, 'games', `${e.id}.json`), 'utf8')) as Game));
  }
  return cache.get(season)!;
}

/**
 * Timeout for tests that sweep EVERY committed game. Their run time grows with the season (≈10 games a day), so
 * Vitest's fixed 5 s default eventually fails the daily update with no assertion failing (it did on Nov 6–7, 2026,
 * on the GitHub runner). This only bounds a hang; correctness is in the assertions, and per-call cost regressions are
 * caught by machine-independent cost guards (e.g. gameChartAll's cursorInfo vs lineupSegments ratio).
 */
export const WHOLE_DATA_TIMEOUT = 60_000;
