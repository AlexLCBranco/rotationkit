// Header search: player index (built at build time from the game files), matching, ranking; traded players' teams;
// player/team link targets; recently opened players (localStorage).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSeason } from './data.ts';
import { buildPlayerIndex, fold, matchScore, searchPlayers, teamsOf, type PlayerIndexEntry } from '../src/domain/players.ts';
import { appearancesFromFile } from '../src/domain/availability.ts';
import { generatedFile } from '../scripts/lib/generated.ts';
import { carryFilters, playerHref, teamHref } from '../src/app/links.ts';
import { parse } from '../src/app/route.ts';
import { DEFAULT_FILTERS } from '../src/domain/patterns.ts';
import { recentPlayers, rememberPlayer, RECENT_MAX } from '../src/app/recent.ts';
import type { GameIndexEntry } from '../src/domain/types.ts';

const SEASONS = ['2025-26', '2026-27'];
const idx: Record<string, PlayerIndexEntry[]> = Object.fromEntries(SEASONS.map((s) => [s, buildPlayerIndex(loadSeason(s))]));
const find = (s: string, name: string) => idx[s]!.find((p) => p[1] === name)!;

describe('player index', () => {
  it('the served file (generated at build time / in dev) is buildPlayerIndex over every game of the season', () => {
    for (const s of SEASONS) expect(generatedFile('data', `${s}/players.json`)).toEqual(idx[s]);
    expect(generatedFile('data', '2025-26/index.json')).toBeUndefined();
    expect(generatedFile('data', '1999-00/players.json')).toBeUndefined();
  });
  it('everyone in a box score, once, with his teams; small enough to load whole', () => {
    for (const s of SEASONS) {
      const ids = new Set(loadSeason(s).flatMap((g) => g.players.map((p) => p.id)));
      expect(idx[s]!.map((p) => p[0]).sort()).toEqual([...ids].sort());
      expect(JSON.stringify(idx[s]).length).toBeLessThan(60_000);
    }
  });
  it('teams = the season-wide appearances file (what the with/without rule uses), most recent team last', () => {
    for (const s of SEASONS) {
      const index = JSON.parse(readFileSync(`data/${s}/index.json`, 'utf8')) as GameIndexEntry[];
      const apps = appearancesFromFile(JSON.parse(readFileSync(`data/${s}/appearances.json`, 'utf8')), new Map(index.map((e) => [e.id, e.date])));
      for (const [id, , teams] of idx[s]!) {
        expect(teams, String(id)).toEqual(teamsOf(apps, id));
        const last = apps.get(id)!.at(-1)!.team;
        expect(teams.at(-1)).toBe(last);
      }
    }
    // James Harden 2025-26: traded LAC → CLE.
    expect(find('2025-26', 'James Harden')[2]).toEqual(['LAC', 'CLE']);
    expect(idx['2025-26']!.filter((p) => p[2].length > 1).length).toBeGreaterThan(20);
  });
  it('teamsOf orders by the last appearance for each team', () => {
    const a = (gameId: string, team: string) => ({ gameId, date: gameId, team });
    const m = new Map([[1, [a('1', 'AAA'), a('2', 'BBB'), a('3', 'AAA')]]]);
    expect(teamsOf(m, 1)).toEqual(['BBB', 'AAA']);
    expect(teamsOf(m, 2)).toEqual([]);
  });
});

describe('matching', () => {
  it('folds case, accents and punctuation', () => {
    expect(fold('Nikola Jokić')).toBe('nikola jokic');
    expect(fold('Kristaps Porziņģis')).toBe('kristaps porzingis');
    expect(fold("D'Angelo Russell")).toBe('dangelo russell');
    expect(fold('Shai Gilgeous-Alexander')).toBe('shai gilgeous alexander');
    expect(fold('  JOKIĆ ')).toBe('jokic');
  });
  it('any part of the name; initials; best match first', () => {
    expect(matchScore('Nikola Jokić', 'nik')).toBe(0);
    expect(matchScore('Nikola Jokić', 'jok')).toBe(1);
    expect(matchScore('Nikola Jokić', 'JOKIĆ')).toBe(1);
    expect(matchScore('Nikola Jokić', 'okic')).toBe(2);
    expect(matchScore('Shai Gilgeous-Alexander', 'gilgeous')).toBe(1);
    expect(matchScore('Shai Gilgeous-Alexander', 'gilgeous-alex')).toBe(1);
    expect(matchScore('Shai Gilgeous-Alexander', 'sga')).toBe(3);
    expect(matchScore('Shai Gilgeous-Alexander', 's')).toBe(0);
    expect(matchScore('Nikola Jokić', 'xyz')).toBeNull();
    expect(matchScore('Nikola Jokić', '   ')).toBeNull();
  });
  it('real data: "jok" → Jokić, "sga" and "gilgeous" → SGA, "porzingis" → Porziņģis', () => {
    // Names compared folded: the feed's spelling can change between games (e.g. "Jokić" / "Jokic"); the index keeps the latest.
    const jok = searchPlayers(idx, 'jok', '2026-27')[0]!;
    expect(jok).toMatchObject({ id: 203999, teams: ['DEN'], season: '2026-27' });
    expect(fold(jok.name)).toBe('nikola jokic');
    expect(searchPlayers(idx, 'sga', '2026-27').map((h) => h.name)).toContain('Shai Gilgeous-Alexander');
    expect(searchPlayers(idx, 'gilgeous', '2026-27')[0]!.name).toBe('Shai Gilgeous-Alexander');
    const kp = searchPlayers(idx, 'porzingis', '2025-26')[0]!;
    expect(kp).toMatchObject({ teams: ['ATL', 'GSW'] });
    expect(fold(kp.name)).toBe('kristaps porzingis');
  });
  it('at most 8; selected season first; each player once (his entry in the selected season if any)', () => {
    const hits = searchPlayers(idx, 'a', '2026-27');
    expect(hits).toHaveLength(8);
    const all = searchPlayers(idx, 'jo', '2025-26', 1000);
    expect(new Set(all.map((h) => h.id)).size).toBe(all.length);
    const firstOther = all.findIndex((h) => h.season !== '2025-26');
    expect(firstOther).toBeGreaterThan(0);
    expect(all.slice(firstOther).every((h) => h.season !== '2025-26')).toBe(true);
    // Harden: 2025-26 entry (two teams) when that season is selected, 2026-27 entry otherwise.
    expect(searchPlayers(idx, 'harden', '2025-26')[0]).toMatchObject({ season: '2025-26', teams: ['LAC', 'CLE'] });
    expect(searchPlayers(idx, 'harden', '2026-27')[0]).toMatchObject({ season: '2026-27', teams: ['CLE'] });
  });
  it('a player only in another season is found, with that season', () => {
    const only25 = idx['2025-26']!.find((p) => !idx['2026-27']!.some((q) => q[0] === p[0]))!;
    expect(searchPlayers(idx, only25[1], '2026-27')[0]).toMatchObject({ id: only25[0], season: '2025-26' });
  });
});

describe('player and team links', () => {
  const c = { season: '2025-26', filters: { ...DEFAULT_FILTERS, window: 10 as const, venue: 'home' as const }, team: 'ORL' };
  it('player → his page for that season with the current filters', () => {
    const h = playerHref(c, { id: 203999, team: 'DEN' });
    expect(h).toBe('/player/DEN/203999?s=2025-26&w=10&v=home');
    expect(parse(h)).toMatchObject({ view: 'player', team: 'DEN', player: 203999, season: '2025-26', filters: c.filters });
    expect(playerHref(c, { id: 1, team: 'DEN', season: '2026-27' })).toBe('/player/DEN/1?s=2026-27&w=10&v=home');
  });
  it('team → its Averages view for that season', () => {
    expect(teamHref(c, 'BOS')).toBe('/team/BOS?s=2025-26&w=10&v=home');
    expect(parse(teamHref(c, 'BOS', '2026-27'))).toMatchObject({ view: 'team', team: 'BOS', season: '2026-27' });
  });
  it('a with/without filter only carries over to its own team', () => {
    const ww = { ...c, filters: { ...c.filters, withWithout: { player: 1630532, mode: 'without' as const } } };
    expect(carryFilters(ww, 'ORL').withWithout).toEqual({ player: 1630532, mode: 'without' });
    expect(carryFilters(ww, 'BOS').withWithout).toBeUndefined();
    expect(playerHref(ww, { id: 1, team: 'ORL' })).toContain('p=1630532&m=without');
    expect(teamHref(ww, 'BOS')).not.toContain('p=');
  });
});

describe('recently opened players (localStorage)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  const p = (id: number) => ({ id, name: `P${id}`, team: 'ORL', season: '2026-27' });
  it('most recent first, once each, at most 5', () => {
    vi.stubGlobal('localStorage', store());
    for (const id of [1, 2, 3, 2, 4, 5, 6, 7]) rememberPlayer(p(id));
    expect(recentPlayers().map((x) => x.id)).toEqual([7, 6, 5, 4, 2]);
    expect(RECENT_MAX).toBe(5);
  });
  it('broken or blocked storage: empty list, no throw', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{oops', setItem: () => undefined });
    expect(recentPlayers()).toEqual([]);
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(recentPlayers()).toEqual([]);
    expect(() => rememberPlayer(p(1))).not.toThrow();
  });
});
