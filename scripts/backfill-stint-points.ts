// Add points per stint (PlayerGame.ptsS) to committed game files that predate them. Needs each game's raw box score
// and play-by-play: from cache/ when present; with --fetch, missing ones are downloaded from cdn.nba.com (required
// sources only, like --cdn-only). A game is updated only when the fresh stints equal the committed ones; nothing else
// in the file changes (scripts/lib/backfill.ts). Run validate-all and the tests afterwards, then commit data/.
// Usage: npx tsx scripts/backfill-stint-points.ts [--season 2026-27] [--fetch]

import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, dataSeasons, readDataGame } from './lib/data.ts';
import { fetchGame, readCached } from './lib/cache.ts';
import { loadRaw } from './lib/games.ts';
import { addStintPoints } from './lib/backfill.ts';
import { normalizeGame } from '../src/domain/normalize.ts';

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const fetch = process.argv.includes('--fetch');
const seasons = arg('--season') ? [arg('--season')!] : dataSeasons();
let failed = 0;
for (const season of seasons) {
  const ids = readdirSync(join(DATA_DIR, season, 'games')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
  const n = { done: 0, had: 0, noRaw: 0, skipped: [] as string[] };
  for (const id of ids) {
    const committed = readDataGame(season, id);
    if (committed.stintPts) {
      n.had++;
      continue;
    }
    if (!readCached(id, 'boxscore') || !readCached(id, 'playbyplay')) {
      if (!fetch) {
        n.noRaw++;
        continue;
      }
      const r = await fetchGame(id, { cdnOnly: true });
      if (!r.ok) {
        n.skipped.push(`${id}: ${r.errors.join('; ')}`);
        continue;
      }
    }
    const res = addStintPoints(committed, normalizeGame(loadRaw(id)));
    if ('skip' in res) {
      n.skipped.push(`${id}: ${res.skip}`);
      continue;
    }
    writeFileSync(join(DATA_DIR, season, 'games', `${id}.json`), JSON.stringify(res.game));
    n.done++;
  }
  console.log(`${season}: ${n.done} updated, ${n.had} already had points per stint, ${n.noRaw} without raw data (use --fetch)`);
  for (const s of n.skipped) console.log(`  SKIPPED ${s}`);
  failed += n.skipped.length;
}
if (failed) process.exitCode = 1;
