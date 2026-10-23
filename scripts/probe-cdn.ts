// Quick reachability check of the CDN endpoints the daily update needs (no files written).
// Fetches the schedule, then the box score and play-by-play of the latest finished regular-season game.
// Exit 1 with a clear message if any request fails (e.g. NBA blocking the runner's IP).
// Usage: npx tsx scripts/probe-cdn.ts

import { fetchJson } from './lib/http.ts';
import { SOURCES } from './lib/cache.ts';
import { finished, parseSchedule, regularSeason } from '../src/shared/nba-schedule/parse.ts';
import { fetchScheduleJson } from '../src/shared/nba-schedule/node.ts';

let ok = true;
const check = async (label: string, f: () => Promise<string>) => {
  const t = Date.now();
  try {
    console.log(`OK    ${label} (${Date.now() - t + 0}ms) ${await f()}`);
  } catch (e) {
    ok = false;
    console.log(`FAIL  ${label}: ${(e as Error).message}`);
  }
};

let gameId: string | undefined;
await check('schedule (cdn.nba.com)', async () => {
  const s = parseSchedule(await fetchScheduleJson());
  gameId = finished(regularSeason(s)).at(-1)?.gameId;
  return `season ${s.seasonYear}, ${s.games.length} games, latest final ${gameId ?? 'none'}`;
});
if (gameId) {
  const id = gameId;
  await check(`boxscore ${id}`, async () => `${((await fetchJson(SOURCES.boxscore.url(id))) as { game: { homeTeam: { players: unknown[] } } }).game.homeTeam.players.length} home players`);
  await check(`playbyplay ${id}`, async () => `${((await fetchJson(SOURCES.playbyplay.url(id))) as { game: { actions: unknown[] } }).game.actions.length} actions`);
}
if (!ok) {
  console.error('CDN probe failed: cdn.nba.com did not answer this machine as expected (blocked or down). No data was changed.');
  process.exitCode = 1;
}
