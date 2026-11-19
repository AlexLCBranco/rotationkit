import { describe, expect, it } from 'vitest';
import { fixtureIds, loadFixtureGame, loadRawFixture } from './fixtures.ts';
import { formatUsg, gameUsage, usagePart, usageRate } from '../src/domain/usage.ts';
import { addUsageCounts } from '../scripts/lib/backfill.ts';
import type { Game } from '../src/domain/types.ts';

describe('usage rate (src/domain/usage.ts)', () => {
  it('matches a hand-computed value for a fixture game', () => {
    // 0022500020, IND: Pascal Siakam 29:47, 15 FGA, 10 FTA, 2 TOV; IND 99 FGA, 33 FTA, 12 TOV; 4 periods.
    // 100 × (15 + 0.44×10 + 2) × (240 min / 5 = 2880 s) / (1787 s × (99 + 0.44×33 + 12)) = 27.48
    const g = loadFixtureGame('0022500020');
    const p = g.players.find((x) => x.id === 1627783)!;
    expect([p.fga, p.fta, p.tov, p.min]).toEqual([15, 10, 2, 1787]);
    expect([g.home.fga, g.home.fta, g.home.tov]).toEqual([99, 33, 12]);
    expect(gameUsage(g, p)).toBeCloseTo(27.477, 3);
    expect(formatUsg(gameUsage(g, p))).toBe('27.5');
  });

  it('every fixture: team shares add up to 100% (minutes-weighted), DNP and files without counts give null', () => {
    for (const id of fixtureIds) {
      const g = loadFixtureGame(id);
      expect(g.usg, id).toBe(true);
      for (const t of [g.home, g.away]) {
        const ps = g.players.filter((p) => p.team === t.tri && p.played && p.min > 0);
        // Σ USG × MIN = 100 × team MIN / 5 when the players' counts add up to the team's.
        const sum = ps.reduce((x, p) => x + gameUsage(g, p)! * p.min, 0) / (g.periods <= 4 ? 2880 : 2880 + 300 * (g.periods - 4));
        const teamPlays = (t.fga ?? 0) + 0.44 * (t.fta ?? 0) + (t.tov ?? 0);
        const playerPlays = ps.reduce((x, p) => x + (p.fga ?? 0) + 0.44 * (p.fta ?? 0) + (p.tov ?? 0), 0);
        expect(sum, `${id} ${t.tri}`).toBeCloseTo((100 * playerPlays) / teamPlays, 6);
        expect(Math.abs(sum - 100), `${id} ${t.tri}`).toBeLessThan(15);
      }
      const dnp = g.players.find((p) => !p.played);
      if (dnp) expect(gameUsage(g, dnp)).toBeNull();
      const old = { ...g, usg: undefined } as Game;
      expect(gameUsage(old, g.players.find((p) => p.played)!)).toBeNull();
    }
  });

  it('several games: weighted by minutes (sum of plays / sum of team plays on court)', () => {
    const a = { plays: 10, teamPlaysOnCourt: 50 };
    const b = { plays: 2, teamPlaysOnCourt: 25 };
    expect(usageRate([a, b, null])).toBeCloseTo(16, 6);
    expect(usageRate([null])).toBeNull();
    expect(usagePart({ usg: true, periods: 4, home: { id: 1, tri: 'A', name: '', city: '', score: 0 }, away: { id: 2, tri: 'B', name: '', city: '', score: 0 } }, { team: 'A', played: true, min: 600, fga: 3 })).toBeNull();
  });
});

describe('backfill of FGA / FTA / TOV (scripts/lib/backfill.ts)', () => {
  it('adds exactly what a fresh normalization has; nothing else changes', () => {
    for (const id of ['0022500020', '0022600088']) {
      const fresh = loadFixtureGame(id);
      const old = structuredClone(fresh);
      delete old.usg;
      for (const t of [old.home, old.away]) delete t.fga, delete t.fta, delete t.tov;
      for (const p of old.players) delete p.fga, delete p.fta, delete p.tov;
      expect(JSON.stringify(old)).not.toBe(JSON.stringify(fresh));
      const r = addUsageCounts(old, loadRawFixture(id).boxscore);
      // Same content and the same key order (byte-identical file).
      expect('game' in r && JSON.stringify(r.game)).toBe(JSON.stringify(fresh));
    }
  });

  it('skips a box score of another game or one without the counts', () => {
    const g = loadFixtureGame('0022500020');
    expect(addUsageCounts(g, loadRawFixture('0022600088').boxscore)).toMatchObject({ skip: expect.stringContaining('different game') });
    const raw = loadRawFixture('0022500020').boxscore;
    delete raw.game.homeTeam.statistics;
    expect(addUsageCounts(g, raw)).toMatchObject({ skip: expect.stringContaining('no team') });
  });
});

describe('USG% in quarters.json / Leaders and Averages', () => {
  it('Leaders USG% over one game = that game\'s USG% (minutes from stints); sort by usg', async () => {
    const { buildQuartersFile, leaders } = await import('../src/domain/leaders.ts');
    const g = loadFixtureGame('0022500020');
    const file = buildQuartersFile([g]);
    expect(file.games[0]![5]![1]).toBeCloseTo(125.52, 6);
    const rows = leaders(file, { part: 'q4', ot: false, window: 'season', team: 'IND', sort: 'usg' });
    const siakam = rows.find((r) => r.id === 1627783)!;
    const p = g.players.find((x) => x.id === 1627783)!;
    const stintMin = p.stints.reduce((x, [s, e]) => x + e - s, 0);
    expect(siakam.usg).toBeCloseTo((gameUsage(g, p)! * p.min) / stintMin, 1);
    const us = rows.map((r) => r.usg ?? -1);
    expect(us).toEqual([...us].sort((a, b) => b - a));
    // Files without the counts: no usage entry, USG% null.
    const old = buildQuartersFile([{ ...g, usg: undefined }]);
    expect(old.games[0]!.length).toBe(5);
    expect(leaders(old, { part: 'q4', ot: false, window: 'season', team: 'IND', sort: 'min' })[0]!.usg).toBeNull();
  });

  it('Averages: usg on quarterAverages', async () => {
    const { quarterAverages } = await import('../src/domain/patterns.ts');
    const g = loadFixtureGame('0022500020');
    const qa = quarterAverages({ games: [g], team: 'IND', filters: { blowout: false } } as never);
    expect(qa.find((r) => r.id === 1627783)!.usg).toBeCloseTo(27.477, 3);
  });
});
