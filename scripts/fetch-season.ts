// Fetch every completed regular-season game not already in the cache.
// Incremental: games whose required sources are cached are skipped.
// Failed games are logged to cache/fetch-errors.json and skipped, never filled in.
// Usage: npm run fetch-season

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_DIR, SCHEDULE_URL, fetchGame, isFetched, type GameFetchResult } from './lib/cache.ts';
import { fetchJson } from './lib/http.ts';

type ScheduleGame = { gameId: string; gameStatus: number; gameDateTimeUTC?: string };

mkdirSync(CACHE_DIR, { recursive: true });
const schedule = (await fetchJson(SCHEDULE_URL)) as { leagueSchedule: { seasonYear: string; gameDates: { games: ScheduleGame[] }[] } };
writeFileSync(join(CACHE_DIR, 'schedule.json'), JSON.stringify(schedule));

const all = schedule.leagueSchedule.gameDates.flatMap((d) => d.games);
// Regular-season game IDs start with "002"; gameStatus 3 = final.
const finished = all.filter((g) => g.gameId.startsWith('002') && g.gameStatus === 3);
const todo = finished.filter((g) => !isFetched(g.gameId));
console.log(`season ${schedule.leagueSchedule.seasonYear}: ${finished.length} finished regular-season games, ${todo.length} to fetch`);

const failed: GameFetchResult[] = [];
const warnings: GameFetchResult[] = [];
for (const [i, g] of todo.entries()) {
  const r = await fetchGame(g.gameId);
  console.log(`[${i + 1}/${todo.length}] ${g.gameId} ${r.ok ? 'OK' : 'FAILED'}${r.errors.length ? ' — ' + r.errors.join('; ') : ''}`);
  if (!r.ok) failed.push(r);
  else if (r.errors.length) warnings.push(r);
}

writeFileSync(join(CACHE_DIR, 'fetch-errors.json'), JSON.stringify({ at: new Date().toISOString(), failed, warnings }, null, 2));
console.log(`\ndone: ${todo.length - failed.length} fetched, ${failed.length} failed, ${warnings.length} with optional-source warnings`);
if (failed.length) {
  console.log('failed games (skipped, re-run to retry):');
  for (const f of failed) console.log(`  ${f.gameId}: ${f.errors.join('; ')}`);
}
