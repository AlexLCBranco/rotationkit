// Pattern engine on the real 2025-26 season (committed data), incl. real absences from official lists.

import { describe, expect, it } from 'vitest';
import { loadSeason } from './data.ts';
import { blowoutIntervals, DEFAULT_FILTERS, selectGames, teamPattern, type Filters } from '../src/domain/patterns.ts';
import { buildAppearances } from '../src/domain/availability.ts';
import type { Game } from '../src/domain/types.ts';

const S = '2025-26';
const games = loadSeason(S);
const idx = buildAppearances(games);
const F = (f: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...f });
const pid = (name: string) => games.flatMap((g) => g.players).find((p) => p.name === name)!.id;
const sel = (team: string, f: Partial<Filters>) => selectGames(games, S, team, F(f), idx);
const officialOut = (g: Game, team: string, id: number) =>
  g.inactive?.some((x) => x.id === id && x.team === team) || g.players.some((p) => p.id === id && p.team === team && !p.played);

describe('real absences (official inactive lists)', () => {
  it('Franz Wagner (ORL): 34 with, 48 without — the official injury stretch, not estimated', () => {
    const id = pid('Franz Wagner');
    const wo = sel('ORL', { withWithout: { player: id, mode: 'without' } });
    expect(wo.withWithout).toMatchObject({ withGames: 34, withoutGames: 48, notWithTeam: 0, withoutEstimated: false });
    expect(wo.games.every((g) => officialOut(g, 'ORL', id))).toBe(true);
    expect(wo.games.filter((g) => g.inactive?.find((x) => x.id === id)?.reason === 'INACTIVE_INJURY')).toHaveLength(48);
    const w = sel('ORL', { withWithout: { player: id, mode: 'with' } });
    expect(w.games.every((g) => g.players.find((p) => p.id === id)?.played)).toBe(true);
    // He's gone from the ORL pattern without him, and present in every "with" game.
    expect(teamPattern(wo).players.some((p) => p.id === id)).toBe(false);
    expect(teamPattern(w).players.find((p) => p.id === id)!.gamesPlayed).toBe(34);
  });

  it('Christian Braun (DEN): DNPs in the box score count as "without" too (35 inactive + 3 DNP)', () => {
    const id = pid('Christian Braun');
    const wo = sel('DEN', { withWithout: { player: id, mode: 'without' } });
    expect(wo.withWithout).toMatchObject({ withGames: 44, withoutGames: 38, notWithTeam: 0, withoutEstimated: false });
    expect(wo.games.filter((g) => g.players.some((p) => p.id === id && !p.played))).toHaveLength(3);
  });

  it('James Harden (LAC → CLE): LAC games after the trade and CLE games before it are in neither group', () => {
    const id = pid('James Harden');
    const lac = sel('LAC', { withWithout: { player: id, mode: 'without' } }).withWithout!;
    const cle = sel('CLE', { withWithout: { player: id, mode: 'without' } }).withWithout!;
    expect(lac.withGames).toBe(44);
    expect(cle.withGames).toBe(26);
    expect(lac.notWithTeam).toBeGreaterThan(20);
    expect(cle.notWithTeam).toBeGreaterThan(40);
    // Every CLE "without" game is after his first CLE appearance or he is on CLE's official list.
    const cleWo = sel('CLE', { withWithout: { player: id, mode: 'without' } }).games;
    expect(cleWo.every((g) => officialOut(g, 'CLE', id))).toBe(true);
    expect(lac.withGames + lac.withoutGames + lac.notWithTeam).toBe(82);
    expect(cle.withGames + cle.withoutGames + cle.notWithTeam).toBe(82);
  });
});

describe('invariants on real data', () => {
  const teams = ['ORL', 'DEN', 'TOR', 'LAL'];
  it.each(teams)('%s: exactly 5 players on court at every bucket midpoint (blowout ON and OFF)', (team) => {
    for (const blowout of [false, true]) {
      const tp = teamPattern(sel(team, { blowout }));
      for (let b = 0; b < tp.buckets; b++) {
        const on = tp.players.reduce((s, p) => s + p.onAtMid[b]!, 0);
        expect(on).toBe(5 * (tp.games - tp.blowoutAtMid[b]!));
      }
    }
  });
  it.each(teams)('%s: on-court shares × games played sum to 5 per bucket (blowout OFF)', (team) => {
    const tp = teamPattern(sel(team, { blowout: false }));
    for (let b = 0; b < tp.buckets; b++) {
      const sum = tp.players.reduce((s, p) => s + (p.onCourt[b] ?? 0) * p.gamesPlayed, 0);
      expect(sum / tp.games).toBeCloseTo(5, 6);
    }
  });
  it('season window = 82 games; last 5 / 10 are the latest games', () => {
    expect(sel('ORL', {}).games).toHaveLength(82);
    const last10 = sel('ORL', { window: 10 }).games;
    expect(last10).toHaveLength(10);
    expect(last10.at(-1)!.date >= sel('ORL', {}).games.at(-1)!.date).toBe(true);
    // Designated home games; NBA Cup knockout games can make it 42/40.
    const home = sel('ORL', { venue: 'home' }).games;
    const away = sel('ORL', { venue: 'away' }).games;
    expect(home.length + away.length).toBe(82);
    expect(home.every((g) => g.home.tri === 'ORL') && away.every((g) => g.away.tri === 'ORL')).toBe(true);
  });
  it('blowout filter removes minutes in real blowouts (TOR 2025-26)', () => {
    const on = teamPattern(sel('TOR', { blowout: true }));
    const off = teamPattern(sel('TOR', { blowout: false }));
    expect(on.blowoutAtMid.some((x) => x > 0)).toBe(true);
    const totalOn = on.players.reduce((s, p) => s + p.avgMin * p.gamesPlayed, 0);
    const totalOff = off.players.reduce((s, p) => s + p.avgMin * p.gamesPlayed, 0);
    expect(totalOn).toBeLessThan(totalOff);
  });
  it('flagged games stay in the data and in patterns', () => {
    const flagged = games.filter((g) => g.quality);
    expect(flagged.map((g) => g.id).sort()).toEqual(['0022500093', '0022500374', '0022500722', '0022500753']);
    expect(sel('HOU', {}).games.some((g) => g.id === '0022500093')).toBe(true);
    expect(flagged.find((g) => g.id === '0022500093')!.quality![0]).toMatchObject({ check: 'minutes', verdict: 'box-score' });
  });
});

describe('minutes trend (real data)', () => {
  it('Franz Wagner, full season: one point per ORL game, minutes = his stints, DNP for the 48 injury games', async () => {
    const { minutesTrend } = await import('../src/domain/patterns.ts');
    const id = pid('Franz Wagner');
    const s = sel('ORL', { blowout: false });
    const t = minutesTrend(s, id, idx);
    expect(t.points).toHaveLength(82);
    expect(t.points.filter((x) => x.status === 'dnp')).toHaveLength(48);
    for (const pt of t.points) {
      const g = s.games.find((x) => x.id === pt.gameId)!;
      const p = g.players.find((x) => x.id === id);
      expect(pt.min).toBeCloseTo(p?.played ? p.stints.reduce((x, [a, b]) => x + b - a, 0) : 0, 6);
      expect(pt.garbage).toBe(blowoutIntervals(g).length > 0);
    }
    const played = t.points.filter((x) => x.status === 'played');
    expect(t.avg).toBeCloseTo(played.reduce((x, y) => x + y.min, 0) / 34, 6);
  });
  it('a traded player: games before he joined are not in the trend', async () => {
    const { minutesTrend } = await import('../src/domain/patterns.ts');
    const t = minutesTrend(sel('CLE', {}), pid('James Harden'), idx);
    expect(t.points.every((x) => x.date >= '2026-02-01')).toBe(true);
    expect(t.points.filter((x) => x.status === 'played')).toHaveLength(26);
  });
});
