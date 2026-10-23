// Copy a cached game's raw responses into a gzipped test fixture: tests/fixtures/<id>.raw.json.gz
// Usage: npm run make-fixture -- <gameId> [...]

import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { loadRaw } from './lib/games.ts';
import { isFetched } from './lib/cache.ts';

mkdirSync('tests/fixtures', { recursive: true });
for (const id of process.argv.slice(2)) {
  if (!isFetched(id)) {
    console.error(`${id}: not fully fetched; run fetch-game first`);
    process.exitCode = 1;
    continue;
  }
  const buf = gzipSync(JSON.stringify(loadRaw(id)), { level: 9 });
  writeFileSync(`tests/fixtures/${id}.raw.json.gz`, buf);
  console.log(`${id}: ${(buf.length / 1024).toFixed(0)} KB`);
}
