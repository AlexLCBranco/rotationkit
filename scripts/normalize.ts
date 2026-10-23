// Normalize every fetched game into data/<season>/games/<id>.json + data/<season>/index.json,
// and list seasons in data/seasons.json. A game that cannot be normalized is reported and skipped.
// Usage: npm run normalize -- [--season 2025-26]

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cachedSeasons, fetchedSeasonGames, loadRaw, seasonsFromArgs } from './lib/games.ts';
import { normalizeGame } from '../src/domain/normalize.ts';
import { validateGame } from '../src/domain/validate.ts';
import { qualityNotes } from '../src/domain/quality.ts';
import { parseSchedule } from '../src/shared/nba-schedule/parse.ts';
import { CACHE_DIR } from './lib/cache.ts';
import type { ScheduleEntry } from '../src/domain/types.ts';

/** Compact schedule per season for ?game= deep links: every game in the feed (played or not) for the feed's season. */
function writeSchedule(season: string, dir: string, index: GameIndexEntry[]) {
  const file = join(CACHE_DIR, 'schedule.json');
  const s = existsSync(file) ? parseSchedule(JSON.parse(readFileSync(file, 'utf8'))) : undefined;
  if (s?.seasonYear !== season) {
    // Past season (feed not cached for it): every game we have is final.
    const entries: ScheduleEntry[] = index.map((g) => ({ id: g.id, date: g.date, home: g.home, away: g.away, status: 'final' }));
    writeFileSync(join(dir, 'schedule.json'), JSON.stringify(entries));
    return;
  }
  const entries: ScheduleEntry[] = s.games.map((g) => ({
    id: g.gameId,
    date: g.dateEt,
    home: g.homeTeam.teamTricode,
    away: g.awayTeam.teamTricode,
    status: g.status,
    ...(g.gameLabel ? { label: [g.gameLabel, g.gameSubLabel].filter(Boolean).join(' · ') } : {}),
  }));
  writeFileSync(join(dir, 'schedule.json'), JSON.stringify(entries));
  console.log(`  schedule.json: ${entries.length} games from the feed`);
}
import type { GameIndexEntry } from '../src/domain/types.ts';

const DATA = 'data';
let failedAny = false;
for (const season of seasonsFromArgs()) {
  const dir = join(DATA, season);
  mkdirSync(join(dir, 'games'), { recursive: true });
  const ids = fetchedSeasonGames(season);
  const index: GameIndexEntry[] = [];
  // Appearances for the with/without rule in the browser: playerId → [gameId, team][] (box-score listings).
  const apps: Record<number, [string, string][]> = {};
  const failed: { id: string; error: string }[] = [];
  let bytes = 0;
  let flagged = 0;
  for (const id of ids) {
    try {
      const raw = loadRaw(id);
      const g = normalizeGame(raw);
      const notes = qualityNotes(g, validateGame(g), raw.gamerotation);
      if (notes.length) g.quality = notes;
      const json = JSON.stringify(g);
      writeFileSync(join(dir, 'games', `${id}.json`), json);
      bytes += json.length;
      if (g.quality) flagged++;
      for (const p of g.players) (apps[p.id] ??= []).push([g.id, p.team]);
      index.push({ id, date: g.date, home: g.home.tri, away: g.away.tri, hs: g.home.score, as: g.away.score, periods: g.periods, ...(g.quality ? { flagged: true } : {}) });
    } catch (e) {
      failed.push({ id, error: (e as Error).message });
    }
  }
  // Drop files for games no longer produced (e.g. a game that now fails to normalize).
  const keep = new Set(index.map((g) => `${g.id}.json`));
  for (const f of readdirSync(join(dir, 'games'))) if (!keep.has(f)) rmSync(join(dir, 'games', f));

  index.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const indexJson = JSON.stringify(index);
  writeFileSync(join(dir, 'index.json'), indexJson);
  writeFileSync(join(dir, 'appearances.json'), JSON.stringify(apps));
  writeSchedule(season, dir, index);
  console.log(`${season}: normalized ${index.length}/${ids.length} games, ${(bytes / 1024).toFixed(0)} KB games + ${(indexJson.length / 1024).toFixed(0)} KB index, ${(bytes / 1024 / Math.max(1, index.length)).toFixed(1)} KB/game`);
  console.log(`  ${flagged} game(s) carry data-quality notes`);
  for (const f of failed) console.log(`  FAILED ${f.id}: ${f.error}`);
  if (failed.length) failedAny = true;
}

const seasons = cachedSeasons().filter((s) => existsSync(join(DATA, s, 'index.json')));
writeFileSync(join(DATA, 'seasons.json'), JSON.stringify(seasons.map((s) => ({ season: s, games: (JSON.parse(readFileSync(join(DATA, s, 'index.json'), 'utf8')) as unknown[]).length }))));
if (failedAny) process.exitCode = 1;
