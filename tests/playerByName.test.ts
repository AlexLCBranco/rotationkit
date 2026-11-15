// #/player?name=…: name matching (src/domain/playerByName.ts) and the route.

import { describe, expect, it } from 'vitest';
import { loadSeason } from './data.ts';
import { buildPlayerIndex, type PlayerIndexEntry } from '../src/domain/players.ts';
import { nameCandidates, nameKey, pickCandidate, type NameCandidate } from '../src/domain/playerByName.ts';
import { format, parse } from '../src/app/route.ts';
import { DEFAULT_FILTERS } from '../src/domain/patterns.ts';

const resolve = (bySeason: Record<string, PlayerIndexEntry[]>, q: string, preferred: string | null, lastSeen: (c: NameCandidate) => string | undefined = () => undefined) =>
  pickCandidate(nameCandidates(bySeason, q, preferred), lastSeen);

describe('nameKey', () => {
  it('ignores case, accents, periods, apostrophes, hyphens and spaces between initials', () => {
    expect(nameKey('Luka Dončić')).toBe(nameKey('luka doncic'));
    expect(nameKey('LUKA DONCIC')).toBe('lukadoncic');
    expect(nameKey('Kristaps Porziņģis')).toBe(nameKey('Kristaps Porzingis'));
    expect(nameKey("D'Angelo Russell")).toBe(nameKey('DAngelo Russell'));
    expect(nameKey('D’Angelo Russell')).toBe(nameKey("D'Angelo Russell"));
    expect(nameKey('P.J. Washington')).toBe(nameKey('PJ Washington'));
    expect(nameKey('P. J. Washington')).toBe(nameKey('PJ Washington'));
    expect(nameKey('Shai Gilgeous-Alexander')).toBe(nameKey('Shai Gilgeous Alexander'));
  });
  it('drops Jr., Sr., II, III, IV at the end, never a real word of the name', () => {
    expect(nameKey('Bobby Portis Jr.')).toBe(nameKey('Bobby Portis'));
    expect(nameKey('Bobby Portis Jr')).toBe('bobbyportis');
    expect(nameKey('Gary Payton II')).toBe('garypayton');
    expect(nameKey('Robert Williams III')).toBe('robertwilliams');
    expect(nameKey('Larry Nance Sr.')).toBe('larrynance');
    expect(nameKey('Jr Smith')).toBe('jrsmith');
    expect(nameKey('   ')).toBe('');
  });
});

describe('nameCandidates / pickCandidate (synthetic)', () => {
  const data: Record<string, PlayerIndexEntry[]> = {
    '2025-26': [
      [1, 'Luka Dončić', ['DAL', 'LAL']],
      [2, 'Gary Trent Jr.', ['MIL']],
      [3, 'Mover Guy', ['AAA', 'BBB']],
      [4, 'Old Timer', ['OLD']],
      [5, 'Same Name', ['XXX']],
    ],
    '2026-27': [
      [1, 'Luka Dončić', ['LAL']],
      [2, 'Gary Trent Jr.', ['MIL']],
      [3, 'Mover Guy', ['BBB', 'CCC']],
      [6, 'Same Name', ['YYY']],
      [7, 'Same Name', ['ZZZ']],
    ],
  };
  it('accents and case: "luka doncic" → Dončić, current season team', () => {
    expect(resolve(data, 'luka doncic', '2026-27')).toEqual({ id: 1, name: 'Luka Dončić', season: '2026-27', team: 'LAL' });
  });
  it('suffix on either side: "Gary Trent" and "Gary Trent Jr." both match "Gary Trent Jr."', () => {
    expect(resolve(data, 'Gary Trent', '2026-27')?.id).toBe(2);
    expect(resolve(data, 'GARY TRENT JR', '2026-27')?.id).toBe(2);
  });
  it('a player who changed teams: his latest team in the season wins', () => {
    expect(resolve(data, 'Mover Guy', '2026-27')).toMatchObject({ team: 'CCC', season: '2026-27' });
    // With s=2025-26 asked for: that season's latest team.
    expect(resolve(data, 'Mover Guy', '2025-26')).toMatchObject({ team: 'BBB', season: '2025-26' });
  });
  it('no games this season → his last season with data', () => {
    expect(resolve(data, 'Old Timer', '2026-27')).toEqual({ id: 4, name: 'Old Timer', season: '2025-26', team: 'OLD' });
  });
  it('duplicate names: the most recent appearance wins (newer season first, then last game)', () => {
    const cands = nameCandidates(data, 'Same Name', '2026-27');
    expect(cands.map((c) => c.id)).toEqual([7, 6, 5]);
    const seen: Record<number, string> = { 6: '2026-11-12 0022600200', 7: '2026-11-01 0022600050' };
    expect(pickCandidate(cands, (c) => seen[c.id])).toMatchObject({ id: 6, team: 'YYY' });
    expect(pickCandidate(cands, (c) => ({ 6: '2026-11-01 0022600050', 7: '2026-11-12 0022600200' })[c.id])).toMatchObject({ id: 7, team: 'ZZZ' });
    // Player 5 (only 2025-26) never beats someone who appeared this season.
    expect(pickCandidate(cands, (c) => (c.id === 5 ? '2099-01-01' : undefined))?.season).toBe('2026-27');
  });
  it('no match → null (exact full name only: no partial names, no guesses)', () => {
    expect(resolve(data, 'Nobody Here', '2026-27')).toBeNull();
    expect(resolve(data, 'Luka', '2026-27')).toBeNull();
    expect(resolve(data, 'Doncic', '2026-27')).toBeNull();
    expect(resolve(data, 'Luka Doncic Jr', '2026-27')?.id).toBe(1); // suffix ignored, rest exact
    expect(resolve(data, '', '2026-27')).toBeNull();
  });
});

describe('real data', () => {
  const idx = Object.fromEntries(['2025-26', '2026-27'].map((s) => [s, buildPlayerIndex(loadSeason(s))]));
  it('"Luka Doncic" → Dončić (1629029) on LAL', () => {
    expect(resolve(idx, 'Luka Doncic', '2026-27')).toMatchObject({ id: 1629029, name: 'Luka Dončić', team: 'LAL', season: '2026-27' });
  });
  it('"Kevin McCullar" (no Jr.) → Kevin McCullar Jr., traded NYK → TOR in 2026-27: TOR', () => {
    expect(resolve(idx, 'Kevin McCullar', '2026-27')).toMatchObject({ id: 1641755, team: 'TOR', season: '2026-27' });
    expect(resolve(idx, 'Kevin McCullar', '2025-26')).toMatchObject({ team: 'NYK', season: '2025-26' });
  });
  it('a player only in 2025-26 resolves to that season', () => {
    const only25 = idx['2025-26']!.find((p) => !idx['2026-27']!.some((q) => q[0] === p[0]))!;
    expect(resolve(idx, only25[1], '2026-27')).toMatchObject({ id: only25[0], season: '2025-26', team: only25[2].at(-1) });
  });
  it('every player in the data resolves to himself unless another player shares his name key', () => {
    const idsByKey = new Map<string, Set<number>>();
    for (const [id, name] of Object.values(idx).flat()) idsByKey.set(nameKey(name), (idsByKey.get(nameKey(name)) ?? new Set()).add(id));
    for (const s of Object.keys(idx)) {
      for (const [id, name, teams] of idx[s]!) {
        if (idsByKey.get(nameKey(name))!.size > 1) continue;
        expect(resolve(idx, name, s), name).toMatchObject({ id, season: s, team: teams.at(-1) });
      }
    }
  });
});

describe('route', () => {
  it('#/player?name=… parses to playerName with season and filters; round-trips', () => {
    const r = parse('#/player?name=Luka%20Don%C4%8Di%C4%87&s=2025-26&w=10&v=away');
    expect(r).toEqual({ view: 'playerName', name: 'Luka Dončić', team: null, season: '2025-26', filters: { ...DEFAULT_FILTERS, window: 10, venue: 'away' } });
    expect(parse(format(r))).toEqual(r);
    expect(parse('#/player')).toMatchObject({ view: 'playerName', name: '' });
    expect(parse('#/player/LAL/1629029')).toMatchObject({ view: 'player', team: 'LAL', player: 1629029 });
  });
});
