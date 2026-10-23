// Fetch raw data for a single game into the cache.
// Usage: npm run fetch-game -- <gameId> [--force] [--cdn-only]

import { fetchGame } from './lib/cache.ts';

const id = process.argv[2];
if (!id || !/^\d{10}$/.test(id)) {
  console.error('usage: fetch-game <10-digit gameId> [--force]');
  process.exit(1);
}
const r = await fetchGame(id, { force: process.argv.includes('--force'), cdnOnly: process.argv.includes('--cdn-only') });
console.log(`${id}: ${r.ok ? 'OK' : 'FAILED'} fetched=[${r.fetched.join(',')}]`);
for (const e of r.errors) console.log(`  ${e}`);
process.exit(r.ok ? 0 : 1);
