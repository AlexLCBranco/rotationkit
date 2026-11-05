// Leaders tab: Q4 / second-half minutes and points per game, last 5 / last 10 / season.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadSeason } from './data.ts';
import { buildQuartersFile, leaders, partPeriods, type QGame, type QuartersFile } from '../src/domain/leaders.ts';
import { quarterStats } from '../src/domain/gameChart.ts';
import type { Game } from '../src/domain/types.ts';

const games: Game[] = [...loadSeason('2025-26'), ...loadSeason('2026-27')];

describe('points per period (ptsQ) in the game files', () => {
  it('every player\'s points per period add up to his box-score points (all games)', () => {
    const bad: string[] = [];
    for (const g of games) for (const p of g.players) if ((p.ptsQ ?? []).reduce((a, b) => a + b, 0) !== p.pts) bad.push(`${g.id} ${p.name}`);
    // Rare NBA play-by-play gaps would show here; they must stay rare (they are shown as-is, never patched).
    expect(bad.length, bad.slice(0, 5).join(', ')).toBeLessThanOrEqual(Math.max(5, games.length * 0.005));
  });
  it('one entry per period, never negative', () => {
    for (const g of games) for (const p of g.players) if (p.ptsQ) {
      expect(p.ptsQ.length).toBe(g.periods);
      expect(p.ptsQ.every((x) => x >= 0)).toBe(true);
    }
  });
});

describe('quarters.json', () => {
  it('the committed file = buildQuartersFile(game files): per-period minutes from stints, points from ptsQ', () => {
    for (const season of ['2025-26', '2026-27']) {
      const file = JSON.parse(readFileSync(`data/${season}/quarters.json`, 'utf8')) as QuartersFile;
      expect(file).toEqual(JSON.parse(JSON.stringify(buildQuartersFile(loadSeason(season)))));
    }
    const g = games[0]!;
    const f = buildQuartersFile([g]);
    const p = g.players.find((x) => x.played && x.stints.length)!;
    const row = f.games[0]![4].find((x) => x[0] === p.id)!;
    expect(row[2].reduce((a, b) => a + b, 0)).toBeCloseTo(quarterStats(p, g.periods).reduce((a, q) => a + q.min, 0), 0);
    expect(row[3].reduce((a, b) => a + b, 0)).toBe(p.pts);
  });
});

describe('leaders on a hand-made season', () => {
  // AAA plays 6 games. Player 1 (AAA): Q4 10:00 + 6 pts every game; Q3 5:00 + 2 pts. Player 2 (AAA): only the last
  // 2 games, Q4 12:00 + 10 pts. Player 3 (BBB, opponent): 1 game. Player 4: AAA, 2OT game only extra.
  const P = (id: number, side: 0 | 1, min: number[], pts: number[]) => [id, side, min, pts] as QGame[4][number];
  const gamesH: QGame[] = Array.from({ length: 6 }, (_, i) => {
    const last2 = i >= 4;
    const ot = i === 5;
    return [
      `g${i}`, `2026-01-0${i + 1}`, 'AAA', i === 0 ? 'BBB' : 'CCC',
      [
        P(1, 0, ot ? [600, 600, 300, 600, 300] : [600, 600, 300, 600], ot ? [4, 4, 2, 6, 5] : [4, 4, 2, 6]),
        ...(last2 ? [P(2, 0, ot ? [0, 0, 0, 720, 300] : [0, 0, 0, 720], ot ? [0, 0, 0, 10, 3] : [0, 0, 0, 10])] : []),
        ...(i === 0 ? [P(3, 1, [720, 720, 720, 720], [9, 9, 9, 9])] : []),
      ],
    ] as QGame;
  });
  const file: QuartersFile = { names: { 1: ['Al One', 'A. One'], 2: ['Bo Two', 'B. Two'], 3: ['Cy Three', 'C. Three'] }, games: gamesH };

  it('Q4, last 5: per game played, minimum 3 games → player 2 (2 games) is not ranked', () => {
    const r = leaders(file, { part: 'q4', ot: false, window: 5, sort: 'min' });
    // Player 3's team (BBB) has only 1 game in the data, so its minimum drops to 1 (early season): he is ranked.
    expect(r.map((x) => [x.id, x.gp, x.of, x.min, x.pts])).toEqual([[3, 1, 1, 720, 9], [1, 5, 5, 600, 6]]);
    expect(r[1]!.per12).toBeCloseTo((6 / 600) * 720, 6);
  });
  it('second half adds Q3; OT adds every overtime period', () => {
    const h2 = leaders(file, { part: 'h2', ot: false, window: 'season', sort: 'min' }).find((x) => x.id === 1)!;
    expect([h2.min, h2.pts]).toEqual([900, 8]);
    const q4ot = leaders(file, { part: 'q4', ot: true, window: 'season', sort: 'min' }).find((x) => x.id === 1)!;
    expect(q4ot.min).toBeCloseTo((6 * 600 + 300) / 6, 6);
    expect(q4ot.pts).toBeCloseTo((6 * 6 + 5) / 6, 6);
    expect(partPeriods('q4', true, 6)).toEqual([4, 5, 6]);
    expect(partPeriods('h2', false, 5)).toEqual([3, 4]);
  });
  it('season minimum = 40% of his team\'s games; sort by points; team filter', () => {
    const all = leaders(file, { part: 'q4', ot: false, window: 'season', sort: 'pts' });
    // Player 2: 2 of 6 AAA games < 40% (3) → out. Player 3: 1 of BBB's 1 game → in, and first by points.
    expect(all.map((x) => x.id)).toEqual([3, 1]);
    const last10 = leaders(file, { part: 'q4', ot: false, window: 10, sort: 'pts' });
    expect(last10.map((x) => x.id)).toEqual([3, 1]);
    expect(leaders(file, { part: 'q4', ot: false, window: 'season', sort: 'pts', team: 'AAA' }).map((x) => x.id)).toEqual([1]);
    expect(leaders(file, { part: 'q4', ot: false, window: 'season', sort: 'pts', team: 'CCC' })).toEqual([]);
  });
});

describe('leaders on real data', () => {
  const file = JSON.parse(readFileSync('data/2025-26/quarters.json', 'utf8')) as QuartersFile;
  it('Q4 season leaders: sorted, minutes ≤ 12:00 per game, gp within the minimum, numbers match the game files', () => {
    const r = leaders(file, { part: 'q4', ot: false, window: 'season', sort: 'min' });
    expect(r.length).toBeGreaterThan(200);
    for (let i = 1; i < r.length; i++) expect(r[i - 1]!.min).toBeGreaterThanOrEqual(r[i]!.min);
    expect(r.every((x) => x.min <= 720 && x.gp >= 33)).toBe(true); // 40% of 82
    // Spot-check the leader against the full game files.
    const top = r[0]!;
    const mine = loadSeason('2025-26').filter((g) => g.players.some((p) => p.id === top.id && p.played && p.stints.length));
    const min = mine.reduce((a, g) => a + quarterStats(g.players.find((p) => p.id === top.id)!, g.periods)[3]!.min, 0) / mine.length;
    const pts = mine.reduce((a, g) => a + (g.players.find((p) => p.id === top.id)!.ptsQ?.[3] ?? 0), 0) / mine.length;
    expect(top.gp).toBe(mine.length);
    expect(top.min).toBeCloseTo(min, 0);
    expect(top.pts).toBeCloseTo(pts, 6);
  });
  it('last 5 / last 10 count only the player\'s current team\'s last N games', () => {
    for (const w of [5, 10] as const) {
      const r = leaders(file, { part: 'q4', ot: false, window: w, sort: 'pts' });
      expect(r.every((x) => x.gp <= w && x.of === w)).toBe(true);
      for (let i = 1; i < r.length; i++) expect(r[i - 1]!.pts).toBeGreaterThanOrEqual(r[i]!.pts);
    }
  });
});
