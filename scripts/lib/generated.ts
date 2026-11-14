// Files derived from the committed game files at build time (never committed): written to dist/data/ by the Vite
// data plugin and served by it in dev, so dev, preview and production serve the same thing.
//   data/<season>/players.json — player index for the header search (src/domain/players.ts)

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPlayerIndex } from '../../src/domain/players.ts';
import type { Game, GameIndexEntry } from '../../src/domain/types.ts';

export const seasonsIn = (dataDir: string) => readdirSync(dataDir).filter((s) => /^\d{4}-\d{2}$/.test(s) && existsSync(join(dataDir, s, 'index.json'))).sort();

/** Every game of a season in index order (oldest first). */
export function readSeasonGames(dataDir: string, season: string): Game[] {
  const index = JSON.parse(readFileSync(join(dataDir, season, 'index.json'), 'utf8')) as GameIndexEntry[];
  return index.map((e) => JSON.parse(readFileSync(join(dataDir, season, 'games', `${e.id}.json`), 'utf8')) as Game);
}

/** Generated files of one season: path under data/ → JSON content. */
export function generatedFiles(dataDir: string, season: string): Record<string, unknown> {
  const games = readSeasonGames(dataDir, season);
  return { [`${season}/players.json`]: buildPlayerIndex(games) };
}

/** The content of one generated file (path relative to data/), or undefined if that path is not generated. */
export function generatedFile(dataDir: string, path: string): unknown {
  const m = /^(\d{4}-\d{2})\/players\.json$/.exec(path);
  if (!m || !existsSync(join(dataDir, m[1]!, 'index.json'))) return undefined;
  return generatedFiles(dataDir, m[1]!)[path];
}
