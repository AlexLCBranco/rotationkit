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
 * Vitest's fixed 5 s default eventually fails the data update with no assertion failing (it did on Nov 6–7, 2026,
 * on the GitHub runner). This only bounds a hang; correctness is in the assertions, and per-call cost regressions are
 * caught by machine-independent cost guards (e.g. gameChartAll's cursorInfo vs lineupSegments ratio).
 */
export const WHOLE_DATA_TIMEOUT = 60_000;

/**
 * Games the whole-data sweeps (the suites using WHOLE_DATA_TIMEOUT) check. Normally every committed game of both
 * seasons. The data update sets RK_TEST_GAMES to the comma-separated ids of the games it just added, so its
 * test step checks only those (the full sweeps run on every push to main instead, .github/workflows/pr.yml).
 * RK_TEST_GAMES="" (a day with no new games) = no games.
 */
export const SWEEP_ONLY: Set<string> | null = process.env.RK_TEST_GAMES === undefined ? null : new Set(process.env.RK_TEST_GAMES.split(',').filter(Boolean));
/** True when the sweeps run over every committed game (thresholds like "more than 1000 games" only apply then). */
export const FULL_SWEEP = SWEEP_ONLY === null;

export function sweepGames(): Game[] {
  const all = [...loadSeason('2025-26'), ...loadSeason('2026-27')];
  if (!SWEEP_ONLY) return all;
  const out = all.filter((g) => SWEEP_ONLY.has(g.id));
  const missing = [...SWEEP_ONLY].filter((id) => !out.some((g) => g.id === id));
  if (missing.length) throw new Error(`RK_TEST_GAMES: not in data/: ${missing.join(', ')}`);
  return out;
}
