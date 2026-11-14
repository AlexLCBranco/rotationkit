// Full Q4 tab: who played the whole regulation 4th quarter, computed from quarters.json; checked against the stints in
// the full game files (whole-season sweep) and on small hand-made files.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadSeason, WHOLE_DATA_TIMEOUT } from './data.ts';
import { fullQ4Day, gameDates, gameHasQ4Garbage, hasQ4Garbage, leaderboard, playerFullQ4, reachesQ4, seasonCounts } from '../src/domain/fullQ4.ts';
import type { QuartersFile } from '../src/domain/leaders.ts';
import { parse, format } from '../src/app/route.ts';
import type { Game } from '../src/domain/types.ts';

const file = (s: string) => JSON.parse(readFileSync(`data/${s}/quarters.json`, 'utf8')) as QuartersFile;

/** On court from the first to the last second of period 4 (back-to-back stints joined). */
function coversQ4(stints: [number, number, ...unknown[]][]): boolean {
  let t = 2160;
  for (const [a, b] of [...stints].sort((x, y) => x[0] - y[0])) if (a <= t && b > t) t = b;
  return t >= 2880;
}

describe('full 4th quarters from quarters.json = from the stints', () => {
  for (const season of ['2025-26', '2026-27']) {
    it(
      `${season}: every player's "full Q4" (12:00) matches his stints; counts per player match`,
      () => {
        const games = loadSeason(season);
        const want = new Map<number, { gp: number; full: number }>();
        for (const g of games)
          for (const p of g.players) {
            if (!p.played || !p.stints.length) continue;
            const c = want.get(p.id) ?? { gp: 0, full: 0 };
            c.gp++;
            if (coversQ4(p.stints)) c.full++;
            want.set(p.id, c);
          }
        const got = seasonCounts(file(season), { threshold: 'full', noBlowouts: false });
        expect(got.size).toBe(want.size);
        for (const [id, w] of want) expect([id, got.get(id)?.gp, got.get(id)?.full]).toEqual([id, w.gp, w.full]);
        // Five players per team at most can play the whole 4th.
        for (const date of gameDates(file(season)))
          for (const g of fullQ4Day(file(season), date, { threshold: 'full', noBlowouts: false })) {
            expect(g.home5.length).toBeLessThanOrEqual(5);
            expect(g.away5.length).toBeLessThanOrEqual(5);
          }
      },
      WHOLE_DATA_TIMEOUT,
    );
    it(
      `${season}: "4th-quarter garbage time" in quarters.json = the blowout rule on the game file`,
      () => {
        const byId = new Map(loadSeason(season).map((g) => [g.id, g]));
        for (const g of file(season).games) expect([g[0], hasQ4Garbage(g)]).toEqual([g[0], gameHasQ4Garbage(byId.get(g[0])!)]);
      },
      WHOLE_DATA_TIMEOUT,
    );
  }
  it('the player page counter uses the same rule', () => {
    const games = loadSeason('2025-26');
    const counts = seasonCounts(file('2025-26'), { threshold: 'full', noBlowouts: false });
    // A player who stayed with one team all season: same numbers on his page (season selection) and the leaderboard.
    const one = [...counts.values()].find((c) => c.full >= 10 && games.every((g) => !g.players.some((p) => p.id === c.id && p.played && p.team !== c.team)))!;
    const mine = playerFullQ4(games, one.id, one.team);
    expect([mine.played, mine.full.size]).toEqual([one.gp, one.full]);
  });
});

describe('options', () => {
  const mk = (q4: number[], gt?: number): QuartersFile => ({
    names: { 1: ['A A', 'A. A'], 2: ['B B', 'B. B'], 3: ['C C', 'C. C'] },
    games: [
      ['g1', '2026-11-01', 'ORL', 'MIA', [
        [1, 0, [720, 0, 0, q4[0]!, 300], [0, 0, 0, 0, 0]],
        [2, 1, [0, 0, 0, q4[1]!], [0, 0, 0, 0]],
        gt ? [3, 1, [0, 0, 0, q4[2]!], [0, 0, 0, 0], [0, 0, 0, gt], [0, 0, 0, 0]] : [3, 1, [0, 0, 0, q4[2]!], [0, 0, 0, 0]],
      ]],
      ['g2', '2026-11-03', 'MIA', 'ORL', [[1, 1, [0, 0, 0, 720], [0, 0, 0, 0]]]],
    ],
  });
  it('12:00 exact vs 11:00+; OT never counts; rounding to 0.1 s', () => {
    const f = mk([719.96, 690, 659.9]);
    expect(reachesQ4(719.96, 'full')).toBe(true);
    expect(reachesQ4(719.9, 'full')).toBe(false);
    const full = seasonCounts(f, { threshold: 'full', noBlowouts: false });
    expect(full.get(1)).toMatchObject({ gp: 2, full: 2, pct: 1, team: 'ORL' });
    expect(full.get(2)).toMatchObject({ gp: 1, full: 0 });
    const eleven = seasonCounts(f, { threshold: '11', noBlowouts: false });
    expect(eleven.get(2)?.full).toBe(1);
    expect(eleven.get(3)?.full).toBe(0);
    expect(leaderboard(eleven).map((r) => r.id)).toEqual([1, 2]);
  });
  it('exclude blowouts: games with 4th-quarter garbage time leave both counts and are marked on the day', () => {
    const f = mk([720, 720, 720], 120);
    const c = seasonCounts(f, { threshold: 'full', noBlowouts: true });
    expect(c.get(1)).toMatchObject({ gp: 1, full: 1 });
    expect(c.has(3)).toBe(false);
    const [g] = fullQ4Day(f, '2026-11-01', { threshold: 'full', noBlowouts: true });
    expect(g).toMatchObject({ excluded: true, home5: [], away5: [] });
    const [k] = fullQ4Day(f, '2026-11-01', { threshold: 'full', noBlowouts: false });
    expect(k!.home5.map((p) => p.id)).toEqual([1]);
    expect(k!.away5.map((p) => p.id)).toEqual([2, 3]);
    expect(gameDates(f)).toEqual(['2026-11-01', '2026-11-03']);
  });
  it('gameHasQ4Garbage ignores 3rd-quarter blowouts', () => {
    const g = { periods: 4, margin: [[0, 0], [1500, 30], [2880, 30]] } as unknown as Game;
    expect(gameHasQ4Garbage(g)).toBe(true);
    const g2 = { periods: 4, margin: [[0, 0], [1500, 30], [2200, 5]] } as unknown as Game;
    expect(gameHasQ4Garbage(g2)).toBe(false);
  });
});

describe('route', () => {
  it('date and options round-trip in the URL', () => {
    const r = parse('#/fullq4?s=2026-27&d=2026-11-12&th=11&nb=1&t=ORL');
    expect(r).toMatchObject({ view: 'fullq4', season: '2026-27', team: 'ORL', fullq4: { date: '2026-11-12', threshold: '11', noBlowouts: true } });
    expect(parse(format(r))).toEqual(r);
    expect(parse('#/fullq4?d=bad')).toMatchObject({ fullq4: { date: null, threshold: 'full', noBlowouts: false } });
  });
});
