// Team-season bundles (data/<season>/teams/<TEAM>.json, generated at build time, served the same in dev):
// a bundle's content equals the individual game files.

import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generatedFile, generatedFiles } from '../scripts/lib/generated.ts';
import { TEAM_CODES } from '../src/app/teams.ts';
import { seasonOf } from '../src/domain/season.ts';
import { FULL_SWEEP, sweepGames, WHOLE_DATA_TIMEOUT } from './data.ts';
import type { GameIndexEntry } from '../src/domain/types.ts';

const SEASONS = ['2025-26', '2026-27'];
const raw = (s: string, id: string) => JSON.parse(readFileSync(`data/${s}/games/${id}.json`, 'utf8'));

/** Every team of every season; in the daily update (RK_TEST_GAMES) only the teams of the new games. */
const swept = sweepGames();
const teamsOf = (s: string) =>
  FULL_SWEEP ? TEAM_CODES : [...new Set(swept.filter((g) => seasonOf(g.id) === s).flatMap((g) => [g.home.tri, g.away.tri]))];

describe('team-season bundles', { timeout: WHOLE_DATA_TIMEOUT }, () => {
  it('every team of every season: the bundle = that team\'s individual game files, in index order (oldest first)', () => {
    for (const s of SEASONS) {
      if (!teamsOf(s).length) continue;
      const files = generatedFiles('data', s);
      const index = JSON.parse(readFileSync(`data/${s}/index.json`, 'utf8')) as GameIndexEntry[];
      for (const t of teamsOf(s)) {
        const ids = index.filter((e) => e.home === t || e.away === t).map((e) => e.id);
        const bundle = files[`${s}/teams/${t}.json`] as { id: string }[];
        expect(bundle.map((g) => g.id), `${s} ${t}`).toEqual(ids);
        expect(JSON.parse(JSON.stringify(bundle))).toEqual(ids.map((id) => raw(s, id)));
        // Dev serves the same content as the build writes.
        expect(generatedFile('data', `${s}/teams/${t}.json`)).toEqual(bundle);
      }
      expect(Object.keys(files).filter((k) => k.includes('/teams/'))).toHaveLength(30);
    }
  });
  it('unknown paths are not generated', () => {
    expect(generatedFile('data', '2025-26/teams/XYZ.json')).toBeUndefined();
    expect(generatedFile('data', '1999-00/teams/ORL.json')).toBeUndefined();
    expect(generatedFile('data', '2025-26/teams/../index.json')).toBeUndefined();
  });
  it('a team without a game yet gets an empty bundle (the app never requests a missing file)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rk-bundle-'));
    mkdirSync(join(dir, '2030-31', 'games'), { recursive: true });
    const game = raw('2026-27', '0022600001');
    writeFileSync(join(dir, '2030-31', 'games', `${game.id}.json`), JSON.stringify(game));
    const e: GameIndexEntry = { id: game.id, date: game.date, home: game.home.tri, away: game.away.tri, hs: 0, as: 0, hid: 0, aid: 0, periods: 4 };
    writeFileSync(join(dir, '2030-31', 'index.json'), JSON.stringify([e]));
    expect(generatedFile(dir, '2030-31/teams/ORL.json')).toEqual([]);
    expect(generatedFile(dir, `2030-31/teams/${game.home.tri}.json`)).toEqual([game]);
    expect(generatedFiles(dir, '2030-31')['2030-31/teams/ORL.json']).toEqual([]);
  });
});
