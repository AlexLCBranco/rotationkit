// Normalize fetched games into data/<season>/games/<id>.json, then rebuild data/<season>/index.json,
// appearances.json, quarters.json, schedule.json and data/seasons.json from ALL committed game files.
// Incremental: games whose raw responses are not in the cache (e.g. on a CI runner) keep their committed file.
// A game that cannot be normalized is reported, and the run fails.
// Usage: npm run normalize -- [--season 2025-26]

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cachedSeasons, fetchedSeasonGames, loadRaw } from './lib/games.ts';
import { DATA_DIR, dataSeasons, indexEntry, mergeFinalGames, readSchedule, scheduleEntryOf, withScheduleTags } from './lib/data.ts';
import { normalizeGame } from '../src/domain/normalize.ts';
import { validateGame } from '../src/domain/validate.ts';
import { qualityNotes } from '../src/domain/quality.ts';
import { buildQuartersFile } from '../src/domain/leaders.ts';
import { parseSchedule } from '../src/shared/nba-schedule/parse.ts';
import { CACHE_DIR } from './lib/cache.ts';
import type { Game, GameIndexEntry, ScheduleEntry } from '../src/domain/types.ts';

/** Compact schedule per season for ?game= deep links and rest days: the feed's season has every game (played or not). */
function writeSchedule(season: string, dir: string, index: GameIndexEntry[]) {
  const file = join(CACHE_DIR, 'schedule.json');
  const s = existsSync(file) ? parseSchedule(JSON.parse(readFileSync(file, 'utf8'))) : undefined;
  if (s?.seasonYear === season) {
    const entries: ScheduleEntry[] = s.games.map(scheduleEntryOf);
    writeFileSync(join(dir, 'schedule.json'), JSON.stringify(entries));
    console.log(`  schedule.json: ${entries.length} games from the feed (${entries.filter((e) => e.tv).length} on national TV, ${entries.filter((e) => e.cup).length} NBA Cup)`);
  } else {
    // Past season without a cached feed: every game we have is final. Games added later (RK-13: the postseason
    // backfill) join the entries already there, which are kept as they are.
    const have = readSchedule(season);
    const entries = mergeFinalGames(have, index);
    if (entries.length !== have.length) writeFileSync(join(dir, 'schedule.json'), JSON.stringify(entries));
  }
}

const argSeason = (() => {
  const i = process.argv.indexOf('--season');
  return i >= 0 ? process.argv[i + 1] : undefined;
})();
const seasons = argSeason ? [argSeason] : [...new Set([...cachedSeasons(), ...dataSeasons()])].sort();

let failedAny = false;
for (const season of seasons) {
  const dir = join(DATA_DIR, season);
  mkdirSync(join(dir, 'games'), { recursive: true });
  const ids = existsSync(join(CACHE_DIR, 'seasons', `${season}.json`)) ? fetchedSeasonGames(season) : [];
  const failed: { id: string; error: string }[] = [];
  let written = 0;
  for (const id of ids) {
    try {
      const raw = loadRaw(id);
      const g = normalizeGame(raw);
      const notes = qualityNotes(g, validateGame(g), raw.gamerotation);
      if (notes.length) g.quality = notes;
      writeFileSync(join(dir, 'games', `${id}.json`), JSON.stringify(g));
      written++;
    } catch (e) {
      failed.push({ id, error: (e as Error).message });
    }
  }

  // Rebuild season-level files from every committed game file.
  const index: GameIndexEntry[] = [];
  const apps: Record<number, [string, string][]> = {};
  let bytes = 0;
  const all: Game[] = [];
  for (const f of readdirSync(join(dir, 'games')).filter((x) => x.endsWith('.json'))) {
    const text = readFileSync(join(dir, 'games', f), 'utf8');
    bytes += text.length;
    const g = JSON.parse(text) as Game;
    index.push(indexEntry(g));
    all.push(g);
    // Appearances for the with/without rule in the browser: playerId → [gameId, team][] (box-score listings).
    for (const p of g.players) (apps[p.id] ??= []).push([g.id, p.team]);
  }
  index.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const list of Object.values(apps)) list.sort((a, b) => a[0].localeCompare(b[0]));
  writeSchedule(season, dir, index);
  // TV / Cup tags come from the schedule (only seasons whose feed was cached have them).
  writeFileSync(join(dir, 'index.json'), JSON.stringify(withScheduleTags(index, readSchedule(season))));
  writeFileSync(join(dir, 'appearances.json'), JSON.stringify(apps));
  // Minutes + points per period of every player in every game, for the Leaders tab (one small file per season).
  writeFileSync(join(dir, 'quarters.json'), JSON.stringify(buildQuartersFile(all)));
  console.log(`${season}: ${written} normalized from raw this run, ${index.length} games in data/ (${(bytes / 1024 / Math.max(1, index.length)).toFixed(1)} KB/game)`);
  console.log(`  ${index.filter((g) => g.flagged).length} game(s) carry data-quality notes`);
  for (const f of failed) console.log(`  FAILED ${f.id}: ${f.error}`);
  if (failed.length) failedAny = true;
}

const all = dataSeasons();
writeFileSync(join(DATA_DIR, 'seasons.json'), JSON.stringify(all.map((s) => ({ season: s, games: readdirSync(join(DATA_DIR, s, 'games')).length }))));
if (failedAny) process.exitCode = 1;
