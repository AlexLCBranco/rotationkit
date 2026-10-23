// Normalize every fetched game into data/<season>/games/<id>.json + data/<season>/index.json,
// and list seasons in data/seasons.json. A game that cannot be normalized is reported and skipped.
// Usage: npm run normalize -- [--season 2025-26]

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cachedSeasons, fetchedSeasonGames, normalizeCached, seasonsFromArgs } from './lib/games.ts';
import type { GameIndexEntry } from '../src/domain/types.ts';

const DATA = 'data';
let failedAny = false;
for (const season of seasonsFromArgs()) {
  const dir = join(DATA, season);
  mkdirSync(join(dir, 'games'), { recursive: true });
  const ids = fetchedSeasonGames(season);
  const index: GameIndexEntry[] = [];
  const failed: { id: string; error: string }[] = [];
  let bytes = 0;
  for (const id of ids) {
    try {
      const g = normalizeCached(id);
      const json = JSON.stringify(g);
      writeFileSync(join(dir, 'games', `${id}.json`), json);
      bytes += json.length;
      index.push({ id, date: g.date, home: g.home.tri, away: g.away.tri, hs: g.home.score, as: g.away.score, periods: g.periods });
    } catch (e) {
      failed.push({ id, error: (e as Error).message });
    }
  }
  // Drop files for games no longer produced (e.g. a game that now fails to normalize).
  const keep = new Set(index.map((g) => `${g.id}.json`));
  for (const f of readdirSync(join(dir, 'games'))) if (!keep.has(f)) rmSync(join(dir, 'games', f));

  index.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const indexJson = JSON.stringify(index);
  writeFileSync(join(dir, 'index.json'), indexJson);
  console.log(`${season}: normalized ${index.length}/${ids.length} games, ${(bytes / 1024).toFixed(0)} KB games + ${(indexJson.length / 1024).toFixed(0)} KB index, ${(bytes / 1024 / Math.max(1, index.length)).toFixed(1)} KB/game`);
  for (const f of failed) console.log(`  FAILED ${f.id}: ${f.error}`);
  if (failed.length) failedAny = true;
}

const seasons = cachedSeasons().filter((s) => existsSync(join(DATA, s, 'index.json')));
writeFileSync(join(DATA, 'seasons.json'), JSON.stringify(seasons.map((s) => ({ season: s, games: (JSON.parse(readFileSync(join(DATA, s, 'index.json'), 'utf8')) as unknown[]).length }))));
if (failedAny) process.exitCode = 1;
