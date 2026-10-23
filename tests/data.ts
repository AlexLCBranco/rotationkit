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
