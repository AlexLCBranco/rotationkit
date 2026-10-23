// Committed data/ helpers shared by fetch-season, normalize, validate-all and the CI update.
// The raw cache does not exist on a CI runner, so data/<season>/index.json is the record of what we have.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Game, GameIndexEntry, ScheduleEntry } from '../../src/domain/types.ts';

export const DATA_DIR = 'data';

/** Seasons that have data/<season>/index.json, oldest first. */
export function dataSeasons(dir = DATA_DIR): string[] {
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((s) => /^\d{4}-\d{2}$/.test(s) && existsSync(join(dir, s, 'index.json')))
        .sort()
    : [];
}

export function readIndex(season: string, dir = DATA_DIR): GameIndexEntry[] {
  const f = join(dir, season, 'index.json');
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as GameIndexEntry[]) : [];
}

export const readDataGame = (season: string, id: string, dir = DATA_DIR) =>
  JSON.parse(readFileSync(join(dir, season, 'games', `${id}.json`), 'utf8')) as Game;

/** Games to download: not committed in data/ and not already in the raw cache. */
export function gamesToFetch<T extends { gameId: string }>(games: T[], inData: Set<string>, isCached: (id: string) => boolean): T[] {
  return games.filter((g) => !inData.has(g.gameId) && !isCached(g.gameId));
}

export const indexEntry = (g: Game): GameIndexEntry => ({
  id: g.id,
  date: g.date,
  home: g.home.tri,
  away: g.away.tri,
  hs: g.home.score,
  as: g.away.score,
  hid: g.home.id,
  aid: g.away.id,
  periods: g.periods,
  ...(g.quality ? { flagged: true as const } : {}),
});

/** New games between two versions of the indexes (all seasons): count and latest date. */
export function newGamesSummary(before: GameIndexEntry[], after: GameIndexEntry[]): { n: number; through: string | null } {
  const had = new Set(before.map((g) => g.id));
  const added = after.filter((g) => !had.has(g.id));
  const through = added.reduce<string | null>((m, g) => (m === null || g.date > m ? g.date : m), null);
  return { n: added.length, through };
}

/** Schedule entries added, removed or changed (date, teams, status) between two versions of all schedules. */
export function scheduleChanges(before: ScheduleEntry[], after: ScheduleEntry[]): number {
  const key = (e: ScheduleEntry) => `${e.date}|${e.home}|${e.away}|${e.status}|${e.label ?? ''}`;
  const b = new Map(before.map((e) => [e.id, key(e)]));
  const a = new Map(after.map((e) => [e.id, key(e)]));
  let n = 0;
  for (const [id, k] of a) if (b.get(id) !== k) n++;
  for (const id of b.keys()) if (!a.has(id)) n++;
  return n;
}

export function readSchedule(season: string, dir = DATA_DIR): ScheduleEntry[] {
  const f = join(dir, season, 'schedule.json');
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as ScheduleEntry[]) : [];
}

export const scheduleCommitMessage = (n: number) => `data: schedule update (${n} game${n === 1 ? '' : 's'} changed)`;

export const commitMessage = (s: { n: number; through: string | null }) => `data: ${s.n} new game${s.n === 1 ? '' : 's'} through ${s.through}`;

/** Known, reviewed data issues (game id → note). Validation fails only on games not listed here. */
export function readKnownIssues(dir = DATA_DIR): Record<string, string> {
  const f = join(dir, 'known-issues.json');
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Record<string, string>) : {};
}

export function unexpectedFailures(failedGames: Iterable<string>, known: Record<string, string>): string[] {
  return [...failedGames].filter((id) => !(id in known)).sort();
}
