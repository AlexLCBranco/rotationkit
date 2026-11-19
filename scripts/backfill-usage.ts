// Add FGA / FTA / TOV (for usage rate, `Game.usg`) to committed game files that predate them. Needs only each game's
// raw box score: from cache/ when present; with --fetch, missing ones are downloaded from cdn.nba.com. Nothing else in
// the files changes (scripts/lib/backfill.ts). Run normalize (rebuilds quarters.json), validate-all and the tests
// afterwards, then commit data/. On GitHub: .github/workflows/backfill-usage.yml (cdn.nba.com refuses cloud sessions).
// Usage: npx tsx scripts/backfill-usage.ts [--season 2026-27] [--fetch]

import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, dataSeasons, readDataGame } from './lib/data.ts';
import { gameDir, readCached, refetchSource } from './lib/cache.ts';
import { addUsageCounts } from './lib/backfill.ts';

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
  for (const [i, id] of ids.entries()) {
    const committed = readDataGame(season, id);
    if (committed.usg) {
      n.had++;
      continue;
    }
    if (!readCached(id, 'boxscore')) {
      if (!fetch) {
        n.noRaw++;
        continue;
      }
      mkdirSync(gameDir(id), { recursive: true });
      const err = await refetchSource(id, 'boxscore');
      if (err) {
        n.skipped.push(`${id}: box score: ${err}`);
        continue;
      }
    }
    const res = addUsageCounts(committed, readCached(id, 'boxscore'));
    if ('skip' in res) {
      n.skipped.push(`${id}: ${res.skip}`);
      continue;
    }
    writeFileSync(join(DATA_DIR, season, 'games', `${id}.json`), JSON.stringify(res.game));
    n.done++;
    if ((i + 1) % 100 === 0) console.log(`  ${season}: ${i + 1} / ${ids.length}`);
  }
  console.log(`${season}: ${n.done} updated, ${n.had} already had FGA / FTA / TOV, ${n.noRaw} without a cached box score (use --fetch)`);
  for (const s of n.skipped) console.log(`  SKIPPED ${s}`);
  failed += n.skipped.length;
}
if (failed) process.exitCode = 1;
