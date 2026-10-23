// Fetch every completed regular-season game of a season not already in the cache.
// Incremental: games whose required (CDN) sources are cached are skipped.
// Failed games are logged to cache/fetch-errors.json and skipped, never filled in.
//
// Usage: npm run fetch-season -- [--season 2025-26] [--cdn-only] [--retry-optional]
//   no --season       current season, from the CDN schedule
//   --season X        a past season; game list from stats.nba.com leaguegamelog (one request)
//   --cdn-only        skip stats.nba.com per-game sources (gamerotation cross-check, roster list)
//   --retry-optional  also retry missing stats.nba.com sources of already-fetched games

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  BOX_REFRESH_DAYS, CACHE_DIR, SCHEDULE_URL, fetchGame, isFetched, missingOptional, needsBoxRefresh, readCached,
  refetchSource, seasonFile, type GameFetchResult, type SeasonGames,
} from './lib/cache.ts';
import { fetchJson } from './lib/http.ts';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const cdnOnly = process.argv.includes('--cdn-only');
const retryOptional = process.argv.includes('--retry-optional');

type ScheduleGame = { gameId: string; gameStatus: number; gameDateEst?: string; gameDateTimeUTC?: string };
const schedule = (await fetchJson(SCHEDULE_URL)) as { leagueSchedule: { seasonYear: string; gameDates: { games: ScheduleGame[] }[] } };
const current = schedule.leagueSchedule.seasonYear;
const season = arg('--season') ?? current;

let list: SeasonGames;
if (season === current) {
  // Regular-season game IDs start with "002"; gameStatus 3 = final.
  const games = schedule.leagueSchedule.gameDates
    .flatMap((d) => d.games)
    .filter((g) => g.gameId.startsWith('002') && g.gameStatus === 3)
    .map((g) => ({ gameId: g.gameId, date: (g.gameDateEst ?? g.gameDateTimeUTC ?? '').slice(0, 10) }));
  list = { season, source: SCHEDULE_URL, games };
} else {
  const url = `https://stats.nba.com/stats/leaguegamelog?Counter=0&Direction=ASC&LeagueID=00&PlayerOrTeam=T&Season=${season}&SeasonType=Regular%20Season&Sorter=DATE`;
  const j = (await fetchJson(url)) as { resultSets: { headers: string[]; rowSet: (string | number)[][] }[] };
  const set = j.resultSets[0]!;
  const [iId, iDate] = [set.headers.indexOf('GAME_ID'), set.headers.indexOf('GAME_DATE')];
  const seen = new Map<string, string>();
  for (const r of set.rowSet) seen.set(String(r[iId]), String(r[iDate]));
  list = { season, source: url, games: [...seen].map(([gameId, date]) => ({ gameId, date })) };
}
list.games.sort((a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId));
mkdirSync(dirname(seasonFile(season)), { recursive: true });
writeFileSync(seasonFile(season), JSON.stringify(list));

const todo = list.games.filter((g) => !isFetched(g.gameId) || (retryOptional && !cdnOnly && missingOptional(g.gameId).length));
console.log(`season ${season}: ${list.games.length} finished regular-season games, ${todo.length} to fetch${cdnOnly ? ' (CDN only)' : ''}`);

const failed: GameFetchResult[] = [];
const warnings: GameFetchResult[] = [];
for (const [i, g] of todo.entries()) {
  const r = await fetchGame(g.gameId, { cdnOnly });
  console.log(`[${i + 1}/${todo.length}] ${g.gameId} ${r.ok ? 'OK' : 'FAILED'}${r.errors.length ? ' — ' + r.errors.join('; ') : ''}`);
  if (!r.ok) failed.push(r);
  else if (r.errors.length) warnings.push(r);
}

// This season's box scores have so far lacked inactive players (2025-26 ones list them, with
// reasons). Re-fetch recent ones in case the CDN fills them in later.
const refresh = season === current ? list.games.filter((g) => isFetched(g.gameId) && needsBoxRefresh(g.gameId)) : [];
let gained = 0;
if (refresh.length) console.log(`\nre-fetching ${refresh.length} box score(s) from the last ${BOX_REFRESH_DAYS} days without inactive players`);
for (const g of refresh) {
  const err = await refetchSource(g.gameId, 'boxscore');
  if (err) console.log(`  ${g.gameId} box refresh failed (kept old copy): ${err}`);
  else if (!needsBoxRefresh(g.gameId) && readCached(g.gameId, 'boxscore')) gained++;
}
if (refresh.length) console.log(`  ${gained} now list inactive players`);

writeFileSync(join(CACHE_DIR, 'fetch-errors.json'), JSON.stringify({ at: new Date().toISOString(), season, failed, warnings }, null, 2));
console.log(`\ndone: ${todo.length - failed.length} fetched, ${failed.length} failed, ${warnings.length} with optional-source warnings`);
if (failed.length) {
  console.log('failed games (skipped, re-run to retry):');
  for (const f of failed) console.log(`  ${f.gameId}: ${f.errors.join('; ')}`);
}
