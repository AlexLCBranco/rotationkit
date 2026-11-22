// RK-13, one-off: add a PAST season's play-in, playoff and NBA Cup final games (the regular update only knows the
// current season's schedule feed). Asks cdn.nba.com for each candidate id (scripts/lib/postseason.ts), keeps only
// real final games, downloads box score + play-by-play into cache/, and lists them in cache/seasons/<season>.json
// so `npm run normalize` writes their game files. Then run normalize, validate-all and the tests, and commit data/.
// On GitHub: .github/workflows/backfill-postseason.yml (cdn.nba.com refuses cloud sessions). Never patches data.
// Usage: npx tsx scripts/backfill-postseason.ts --season 2025-26

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fetchGame, gameDir, readSeason, seasonFile, sourcePath, SOURCES, type SeasonGames } from './lib/cache.ts';
import { fetchJson, sleep, type FetchError } from './lib/http.ts';
import { cupFinalCandidates, foundGame, playInCandidates, playoffProblems, playoffSeries, type FoundGame } from './lib/postseason.ts';

const i = process.argv.indexOf('--season');
const season = i >= 0 ? process.argv[i + 1] : undefined;
if (!season || !/^\d{4}-\d{2}$/.test(season)) {
  console.error('usage: backfill-postseason --season 2025-26');
  process.exit(1);
}

let asked = 0;
/** The game with this id, if cdn.nba.com has it as a final game of the season. Its box score is kept in the cache. */
async function ask(id: string): Promise<FoundGame | null> {
  asked++;
  let box: unknown;
  try {
    box = await fetchJson(SOURCES.boxscore.url(id));
  } catch (e) {
    const status = (e as FetchError).status;
    // 403 / 404 = the CDN has no such file: not a game. Anything else is a real failure.
    if (status === 403 || status === 404) return null;
    throw new Error(`${id}: ${(e as Error).message}`);
  } finally {
    await sleep(120);
  }
  const g = foundGame(id, season!, box);
  if (typeof g === 'string') {
    console.log(`  ${id}: not counted (${g})`);
    return null;
  }
  mkdirSync(gameDir(id), { recursive: true });
  writeFileSync(sourcePath(id, 'boxscore'), JSON.stringify(box));
  return g;
}

const line = (g: FoundGame) => `${g.id} ${g.date} ${g.away} ${g.as} @ ${g.home} ${g.hs}`;

console.log(`${season}: NBA Cup final`);
const cup: FoundGame[] = [];
for (const id of cupFinalCandidates(season)) {
  const g = await ask(id);
  if (g) cup.push(g), console.log(`  ${line(g)}`);
}

console.log(`${season}: play-in`);
const playIn: FoundGame[] = [];
for (const id of playInCandidates(season)) {
  const g = await ask(id);
  if (g) playIn.push(g), console.log(`  ${line(g)}`);
}

console.log(`${season}: playoffs`);
const playoffs: FoundGame[] = [];
for (const s of playoffSeries(season)) {
  for (let n = 1; n <= 7; n++) {
    const g = await ask(`${s.prefix}${n}`);
    if (!g) break; // a series has no game n+1 without a game n
    playoffs.push(g);
    console.log(`  ${line(g)}`);
  }
}

const found = [...cup, ...playIn, ...playoffs];
console.log(`\nasked for ${asked} ids; found ${cup.length} Cup final, ${playIn.length} play-in, ${playoffs.length} playoff games`);
const problems = playoffProblems(playoffs);
if (playIn.length !== 6) problems.push(`${playIn.length} play-in games found (the format has 6)`);
if (cup.length !== 1) problems.push(`${cup.length} Cup final found`);
for (const p of problems) console.log(`  CHECK: ${p}`);

// Play-by-play for each (the box score is already in the cache).
const failed: string[] = [];
for (const g of found) {
  const r = await fetchGame(g.id, { cdnOnly: true });
  if (!r.ok) failed.push(`${g.id}: ${r.errors.join('; ')}`);
}
for (const f of failed) console.log(`  FAILED ${f}`);

// The season's list for normalize: these games join whatever list is already cached (a full local cache keeps its
// regular-season list).
const ok = found.filter((g) => !failed.some((f) => f.startsWith(g.id)));
const have: SeasonGames = existsSync(seasonFile(season)) ? readSeason(season) : { season, source: 'cdn.nba.com box scores (scripts/backfill-postseason.ts)', games: [] };
const ids = new Set(have.games.map((g) => g.gameId));
have.games.push(...ok.filter((g) => !ids.has(g.id)).map((g) => ({ gameId: g.id, date: g.date })));
have.games.sort((a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId));
mkdirSync(dirname(seasonFile(season)), { recursive: true });
writeFileSync(seasonFile(season), JSON.stringify(have));
mkdirSync('cache', { recursive: true });
writeFileSync('cache/postseason-backfill.json', JSON.stringify({ season, asked, found: ok, problems, failed }, null, 2));
console.log(`\n${ok.length} game(s) ready for normalize.`);
// Nothing found, a download failure or a failed check: the step fails (the workflow still commits what did work).
if (!ok.length || failed.length || problems.length) process.exitCode = 1;
