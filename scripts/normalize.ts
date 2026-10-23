// Normalize every fetched game of the current season into data/games/<id>.json + data/index.json.
// A game that cannot be normalized is reported and skipped (no file written).
// Usage: npm run normalize

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchedSeasonGames, normalizeCached } from './lib/games.ts';
import type { GameIndexEntry } from '../src/domain/types.ts';

const DATA = 'data';
mkdirSync(join(DATA, 'games'), { recursive: true });

const ids = fetchedSeasonGames();
const index: GameIndexEntry[] = [];
const failed: { id: string; error: string }[] = [];
let bytes = 0;
for (const id of ids) {
  try {
    const g = normalizeCached(id);
    const json = JSON.stringify(g);
    writeFileSync(join(DATA, 'games', `${id}.json`), json);
    bytes += json.length;
    index.push({ id, date: g.date, home: g.home.tri, away: g.away.tri, hs: g.home.score, as: g.away.score, periods: g.periods });
  } catch (e) {
    failed.push({ id, error: (e as Error).message });
  }
}
// Drop files for games no longer produced (e.g. a game that now fails to normalize).
const keep = new Set(index.map((g) => `${g.id}.json`));
for (const f of readdirSync(join(DATA, 'games'))) if (!keep.has(f)) rmSync(join(DATA, 'games', f));

index.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
writeFileSync(join(DATA, 'index.json'), JSON.stringify(index));
console.log(`normalized ${index.length}/${ids.length} games, ${(bytes / 1024).toFixed(0)} KB total, ${(bytes / 1024 / Math.max(1, index.length)).toFixed(1)} KB/game`);
for (const f of failed) console.log(`  FAILED ${f.id}: ${f.error}`);
if (failed.length) process.exitCode = 1;
