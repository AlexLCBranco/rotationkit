// Files derived from the committed game files at build time (never committed): written to dist/data/ by the Vite
// data plugin and served by it in dev, so dev, preview and production serve the same thing.
//   data/<season>/players.json       — player index for the header search (src/domain/players.ts)
//   data/<season>/teams/<TEAM>.json  — every game of that team in the season, oldest first (index order), exactly the
//                                      individual game files: one request per team-season for Averages / player pages

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPlayerIndex } from '../../src/domain/players.ts';
import { TEAM_CODES } from '../../src/app/teams.ts';
import type { Game, GameIndexEntry } from '../../src/domain/types.ts';

export const seasonsIn = (dataDir: string) => readdirSync(dataDir).filter((s) => /^\d{4}-\d{2}$/.test(s) && existsSync(join(dataDir, s, 'index.json'))).sort();

const readIndex = (dataDir: string, season: string) => JSON.parse(readFileSync(join(dataDir, season, 'index.json'), 'utf8')) as GameIndexEntry[];
const readGame = (dataDir: string, season: string, id: string) => JSON.parse(readFileSync(join(dataDir, season, 'games', `${id}.json`), 'utf8')) as Game;

/** Every game of a season in index order (oldest first). */
export function readSeasonGames(dataDir: string, season: string): Game[] {
  return readIndex(dataDir, season).map((e) => readGame(dataDir, season, e.id));
}

/** One team's games of a season, in index order (oldest first). */
export function teamBundle(index: GameIndexEntry[], team: string, game: (id: string) => Game): Game[] {
  return index.filter((e) => e.home === team || e.away === team).map((e) => game(e.id));
}

/** Generated files of one season: path under data/ → JSON content. */
export function generatedFiles(dataDir: string, season: string): Record<string, unknown> {
  const index = readIndex(dataDir, season);
  const games = new Map(index.map((e) => [e.id, readGame(dataDir, season, e.id)]));
  // Every team gets a bundle (empty before its first game), so the app never asks for a missing file.
  const teams = [...new Set([...TEAM_CODES, ...index.flatMap((e) => [e.home, e.away])])].sort();
  return {
    [`${season}/players.json`]: buildPlayerIndex([...games.values()]),
    ...Object.fromEntries(teams.map((t) => [`${season}/teams/${t}.json`, teamBundle(index, t, (id) => games.get(id)!)])),
  };
}

/** The content of one generated file (path relative to data/), or undefined if that path is not generated. */
export function generatedFile(dataDir: string, path: string): unknown {
  const players = /^(\d{4}-\d{2})\/players\.json$/.exec(path);
  const team = /^(\d{4}-\d{2})\/teams\/([A-Z]{3})\.json$/.exec(path);
  const season = (players ?? team)?.[1];
  if (!season || !existsSync(join(dataDir, season, 'index.json'))) return undefined;
  if (players) return buildPlayerIndex(readSeasonGames(dataDir, season));
  const index = readIndex(dataDir, season);
  if (!TEAM_CODES.includes(team![2]!) && !index.some((e) => e.home === team![2] || e.away === team![2])) return undefined;
  return teamBundle(index, team![2]!, (id) => readGame(dataDir, season, id));
}
