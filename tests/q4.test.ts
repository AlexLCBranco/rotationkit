// Q4 tab: row filter, sort, fouls entering Q4 (vs play-by-play), OT, row-height fit.

import { describe, expect, it } from 'vitest';
import { FULL_SWEEP, loadSeason, sweepGames, WHOLE_DATA_TIMEOUT } from './data.ts';
import { fixtureIds, loadFixtureGame, loadRawFixture } from './fixtures.ts';
import { onCourtAt } from '../src/domain/gameChart.ts';
import { Q4_ROW, Q4_START, q4RowHeight, q4Rows, q4Stints } from '../src/domain/q4.ts';
import { gameLength, periodLength } from '../src/domain/time.ts';
import { toEvents } from '../src/domain/pbp.ts';
import type { Game, PlayerGame, Stint } from '../src/domain/types.ts';

const games: Game[] = sweepGames();
const clean = games.filter((g) => !g.quality?.length);

const pl = (id: number, stints: Stint[], fouls: [number, number, string][] = [], name = `P${id}`): PlayerGame => ({
  id, name, team: 'AAA', starter: false, played: true, min: 0, pts: 0, reb: 0, ast: 0, pf: fouls.length, pm: 0, stints, fouls,
});
const game = (players: PlayerGame[], periods = 4): Game => ({
  id: '0022599999', date: '2026-01-01', periods, players,
  home: { id: 1, tri: 'AAA', name: 'A', city: 'A', score: 100 }, away: { id: 2, tri: 'BBB', name: 'B', city: 'B', score: 90 },
  inactive: [], inactiveSource: 'box', margin: [[0, 0]], score: [[0, 0, 0]], orphanFouls: [],
} as Game);

describe('q4Rows on hand-made games', () => {
  it('only players on court in Q4/OT; closers first, then by Q4 minutes; fouls before / in Q4', () => {
    const g = game([
      pl(1, [[0, 720, 0], [2160, 2400, 0]], [[100, 1, 'personal'], [2200, 4, 'personal']]), // Q4 4:00, not at the end
      pl(2, [[0, 2160, 0]], [[50, 1, 'personal']]), // no Q4 → no row
      pl(3, [[2400, 2880, 0]]), // closer, 8:00
      pl(4, [[2160, 2880, 0]], [[1500, 3, 'personal'], [1600, 3, 'personal'], [2879, 4, 'personal']]), // closer, 12:00
      pl(5, [[2160, 2160, 0]]), // zero-length in Q4 → no row
      pl(6, [[2160, 2400, 0], [2700, 2880, 0]], [], 'Aaron'), // closer, 7:00
      pl(7, [[2160, 2880, 0]]), // closer 12:00
      pl(8, [[2400, 2700, 0]]), // 5:00
      pl(9, [[2160, 2880, 0]]), // closer 12:00 (5 closers: 3, 4, 6, 7, 9)
    ]);
    const r = q4Rows(g, 'AAA');
    expect(r.map((x) => x.p.id)).toEqual([4, 7, 9, 3, 6, 8, 1]);
    expect(r.map((x) => x.closer)).toEqual([true, true, true, true, true, false, false]);
    expect(r.find((x) => x.p.id === 4)).toMatchObject({ min: 720, foulsBefore: 2, foulsIn: 1 });
    expect(r.find((x) => x.p.id === 1)).toMatchObject({ min: 240, foulsBefore: 1, foulsIn: 1 });
  });
  it('overtime: OT minutes count, an OT-only player gets a row, closers are the ones on at the end of OT', () => {
    const g = game([pl(1, [[2160, 2880, 0]]), pl(2, [[2880, 3180, 0]]), pl(3, [[2160, 2880, 0], [2880, 3000, 0]])], 5);
    const r = q4Rows(g, 'AAA');
    expect(r.map((x) => [x.p.id, x.min, x.closer])).toEqual([[2, 300, true], [3, 840, false], [1, 720, false]]);
  });
});

describe(`q4Rows on all ${games.length} games`, { timeout: WHOLE_DATA_TIMEOUT }, () => {
  it('rows = exactly the players with Q4/OT time; sorted closers first then minutes; minutes add up', () => {
    const bad: string[] = [];
    for (const g of games)
      for (const team of [g.home.tri, g.away.tri]) {
        const r = q4Rows(g, team);
        const want = g.players.filter((p) => p.team === team && p.stints.some(([s, e]) => e > s && s >= Q4_START)).map((p) => p.id).sort();
        if (r.map((x) => x.p.id).sort().join() !== want.join()) bad.push(`${g.id} ${team} rows`);
        const end = new Set(onCourtAt(g, team, gameLength(g.periods)).map((p) => p.id));
        for (let i = 1; i < r.length; i++) {
          const [a, b] = [r[i - 1]!, r[i]!];
          if (Number(a.closer) < Number(b.closer) || (a.closer === b.closer && a.min < b.min)) bad.push(`${g.id} ${team} order`);
        }
        if (r.some((x) => x.closer !== end.has(x.p.id))) bad.push(`${g.id} ${team} closer`);
        if (r.some((x) => x.foulsBefore + x.foulsIn !== (x.p.fouls ?? []).length)) bad.push(`${g.id} ${team} fouls`);
        if (!g.quality?.length) {
          const total = r.reduce((x, y) => x + y.min, 0);
          let want5 = 0;
          for (let q = 4; q <= g.periods; q++) want5 += 5 * periodLength(q);
          if (Math.abs(total - want5) > 0.05) bad.push(`${g.id} ${team} minutes ${total} vs ${want5}`);
          if (r.filter((x) => x.closer).length !== 5) bad.push(`${g.id} ${team} closers`);
        }
      }
    expect(bad.slice(0, 20)).toEqual([]);
    if (FULL_SWEEP) expect(clean.length).toBeGreaterThan(1000);
  });
  it('the Q4 stints are exactly the stints from Q4 on (none cross into Q4)', () => {
    for (const g of games) for (const p of g.players) for (const [s, e] of p.stints) expect(s < Q4_START && e > Q4_START, `${g.id} ${p.name}`).toBe(false);
    expect(q4Stints(pl(1, [[2000, 2160, 0], [2160, 2300, 0]]))).toEqual([[2160, 2300, 0]]);
  });
});

describe('fouls entering Q4 = play-by-play (raw fixtures)', () => {
  it.each(fixtureIds)('%s: fouls before Q4 = foulPersonalTotal of the last Q1–Q3 foul; in Q4/OT = the rest', (id) => {
    const g = loadFixtureGame(id);
    const evs = toEvents(loadRawFixture(id).playbyplay.game.actions).filter(
      (e) => e.a.actionType === 'foul' && (e.a.subType === 'personal' || e.a.subType === 'offensive') && e.a.personId,
    );
    let checked = 0;
    for (const team of [g.home.tri, g.away.tri])
      for (const r of q4Rows(g, team)) {
        const mine = evs.filter((e) => e.a.personId === r.p.id);
        const total = (e?: (typeof evs)[number]) => (e ? ((e.a as unknown as { foulPersonalTotal?: number }).foulPersonalTotal ?? 0) : 0);
        const before = total(mine.filter((e) => e.period < 4).at(-1));
        const after = total(mine.at(-1));
        expect(r.foulsBefore, `${r.p.name} entering Q4`).toBe(before);
        expect(r.foulsIn, `${r.p.name} in Q4/OT`).toBe(after - before);
        checked++;
      }
    expect(checked).toBeGreaterThanOrEqual(14);
  });
});

describe('row height fit', () => {
  it('shrinks to fit, never below the readable minimum, never above the maximum', () => {
    expect(q4RowHeight(10, 0, 1000, 100)).toEqual({ rowPx: Q4_ROW.maxPx, fits: true });
    const r = q4RowHeight(28, 1, 760, 80); // 680 px for 28 rows + 1 extra label lane
    expect(r.fits).toBe(true);
    expect(r.rowPx).toBe(24); // 28 × 24 + 8 (label lane) = 680 fits exactly; 25 would need 708

    expect(q4RowHeight(60, 0, 700, 80)).toEqual({ rowPx: Q4_ROW.minPx, fits: false });
  });
});

describe('fit-test worst cases (e2e/q4.spec.ts) are really the worst games in data/', () => {
  it('0022500086 has the most Q4/OT players; 0022500637 is the 2OT+ game with the most, and no game is longer', () => {
    const rows = (g: Game) => q4Rows(g, g.home.tri).length + q4Rows(g, g.away.tri).length;
    // Only the daily update's new games: they are compared with the two reference games.
    const all = FULL_SWEEP ? games : [...games, ...loadSeason('2025-26').filter((g) => g.id === '0022500086' || g.id === '0022500637')];
    const most = Math.max(...all.map(rows));
    const longest = Math.max(...all.map((g) => g.periods));
    const a = all.find((g) => g.id === '0022500086')!;
    const b = all.find((g) => g.id === '0022500637')!;
    expect(rows(a)).toBe(most);
    expect(b.periods).toBe(longest);
    expect(rows(b)).toBe(Math.max(...all.filter((g) => g.periods === longest).map(rows)));
  });
});
