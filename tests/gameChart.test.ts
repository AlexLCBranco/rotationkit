// Single-game chart logic on hand-made data where the answer is obvious.

import { describe, expect, it } from 'vitest';
import {
  axisTicks, barSegments, clockLabel, cursorInfo, foulMarks, foulReadout, gameBadge, layoutRow, lineupSegments, onCourtAt, quarterStats,
  troubleLevel, timelineWidth,
} from '../src/domain/gameChart.ts';
import { CHART } from '../src/domain/config.ts';
import type { Game, PlayerGame, PlayerFoul, Stint } from '../src/domain/types.ts';

const pl = (id: number, team: string, stints: Stint[], fouls: PlayerFoul[] = []): PlayerGame => ({
  id, name: `P${id}`, team, starter: false, played: true, min: stints.reduce((s, [a, b]) => s + b - a, 0), pts: 0, reb: 0, ast: 0,
  pf: fouls.length, pm: 0, stints, ...(fouls.length ? { fouls } : {}),
});
const team = (tri: string, score: number) => ({ id: 0, tri, name: tri, city: tri, score });
const Q = (q: number): Stint => [(q - 1) * 720, q * 720, 0];

describe('foul trouble thresholds (config)', () => {
  it.each([
    [1, 1, 'ok'], [1, 2, 'caution'], [1, 3, 'trouble'],
    [2, 2, 'ok'], [2, 3, 'caution'], [2, 4, 'trouble'],
    [3, 3, 'ok'], [3, 4, 'caution'], [3, 5, 'trouble'],
    [4, 3, 'ok'], [4, 4, 'caution'], [4, 5, 'trouble'], [4, 6, 'trouble'],
    [5, 3, 'ok'], [5, 4, 'caution'], [5, 5, 'trouble'], [6, 4, 'caution'], [6, 5, 'trouble'],
  ] as const)('Q%i with %i fouls → %s', (q, n, level) => expect(troubleLevel(q, n)).toBe(level));
});

describe('bar segments switch color exactly at the foul and at quarter changes', () => {
  // Fouls: Q1 3:00 left (540), Q1 1:00 left (660) → 2 fouls = caution in Q1; Q2: 2 fouls = ok again.
  const p = pl(1, 'AAA', [[0, 720, 0], [720, 1000, 0]], [[540, 1, 'personal foul'], [660, 1, 'shooting foul']]);
  it('ok → caution at the 2nd foul (Q1), back to ok when Q2 starts', () => {
    expect(barSegments([0, 1000, 0], p)).toEqual([
      { a: 0, b: 660, level: 'ok' },
      { a: 660, b: 720, level: 'caution' },
      { a: 720, b: 1000, level: 'ok' },
    ]);
  });
  it('third foul in Q1 → trouble', () => {
    const p3 = pl(1, 'AAA', [[0, 720, 0]], [[100, 1, 'a'], [200, 1, 'b'], [300, 1, 'c']]);
    expect(barSegments([0, 720, 0], p3).map((s) => [s.a, s.level])).toEqual([[0, 'ok'], [200, 'caution'], [300, 'trouble']]);
  });
});

describe('fouls and quarters', () => {
  const p = pl(1, 'AAA', [[0, 600, 0], [720, 1440, 0], [2000, 2880, 0]], [[100, 1, 'personal foul'], [720, 2, 'offensive foul (turnover)'], [2879, 4, 'shooting foul']]);
  it('cumulative foul numbers in order', () => {
    expect(foulMarks(p).map((f) => [f.n, f.period])).toEqual([[1, 1], [2, 2], [3, 4]]);
  });
  it('readout: player, number, type, quarter, clock', () => {
    expect(foulReadout('Tyrese Maxey', foulMarks(p)[1]!)).toBe('Tyrese Maxey — foul #2 — offensive foul (turnover) — Q2 12:00');
    expect(foulReadout('Tyrese Maxey', foulMarks(p)[2]!)).toBe('Tyrese Maxey — foul #3 — shooting foul — Q4 0:01');
  });
  it('per-quarter minutes, fouls and cumulative fouls; a foul at Q2 12:00 counts in Q2', () => {
    expect(quarterStats(p, 4)).toEqual([
      { period: 1, min: 600, pf: 1, cum: 1 },
      { period: 2, min: 720, pf: 1, cum: 2 },
      { period: 3, min: 160, pf: 0, cum: 2 },
      { period: 4, min: 720, pf: 1, cum: 3 },
    ]);
  });
});

describe('clock', () => {
  it.each([
    [0, true, 'Q1 12:00'], [720, false, 'Q1 0:00'], [720, true, 'Q2 12:00'], [1080, false, 'Q2 6:00'],
    [2160, true, 'Q4 12:00'], [2879, false, 'Q4 0:01'], [2880, true, 'OT 5:00'], [3030, false, 'OT 2:30'],
    [3180, false, 'OT 0:00'], [3180, true, '2OT 5:00'], [3480, false, '2OT 0:00'], [3600, false, '3OT 3:00'],
  ] as const)('t=%i (entering=%s) → %s', (t, entering, label) => expect(clockLabel(t, entering)).toBe(label));
  it('axis ticks at 12/9/6/3 per quarter and 5:00/2:30 in OT', () => {
    const ticks = axisTicks(5);
    expect(ticks.filter((x) => x.period === 2).map((x) => [x.t, x.label])).toEqual([[720, '12:00'], [900, '9:00'], [1080, '6:00'], [1260, '3:00']]);
    expect(ticks.filter((x) => x.period === 5).map((x) => [x.t, x.label])).toEqual([[2880, '5:00'], [3030, '2:30']]);
  });
});

describe('game badge', () => {
  const g = (hs: number, as: number, score: Game['score'] = [[0, 0, 0]], margin: Game['margin'] = [[0, 0]]): Game => ({
    id: '0022500001', date: '2025-11-01', home: team('AAA', hs), away: team('BBB', as), periods: 4, players: [], inactive: [], margin, score, orphanFouls: [],
  });
  it('final margin: 15+ blowout, 10–14 comfortable, <10 competitive', () => {
    expect(gameBadge(g(115, 100)).kind).toBe('Blowout');
    expect(gameBadge(g(100, 114)).kind).toBe('Comfortable');
    expect(gameBadge(g(100, 110)).kind).toBe('Comfortable');
    expect(gameBadge(g(109, 100)).kind).toBe('Competitive');
  });
  it('garbage time = time excluded by the blowout rule', () => {
    expect(gameBadge(g(130, 100, [[0, 0, 0]], [[0, 0], [2400, 25]])).garbage).toBe(360);
    expect(gameBadge(g(130, 100, [[0, 0, 0]], [[0, 0], [2700, 25]])).garbage).toBe(180);
    expect(gameBadge(g(115, 100)).garbage).toBe(0);
  });
});

describe('lineups and cursor', () => {
  // AAA: 1–4 play all game; 5 plays Q1–Q2, 6 plays Q3–Q4 (sub at 1440). 6 commits a foul at 1440 right after entering.
  const players = [1, 2, 3, 4].map((i) => pl(i, 'AAA', [Q(1), Q(2), Q(3), Q(4)]));
  players.push(pl(5, 'AAA', [Q(1), Q(2)]), pl(6, 'AAA', [Q(3), Q(4)], [[1440, 3, 'personal foul']]));
  players.push(...[11, 12, 13, 14, 15].map((i) => pl(i, 'BBB', [Q(1), Q(2), Q(3), Q(4)])));
  const g: Game = {
    id: '0022500002', date: '2025-11-01', home: team('AAA', 10), away: team('BBB', 4), periods: 4, players, inactive: [],
    margin: [[0, 0]], score: [[0, 0, 0], [100, 2, 0], [1440, 4, 2], [2000, 10, 4]], orphanFouls: [],
  };
  it('two lineup segments for AAA (merged across quarters), one for BBB; durations sum to the game; +/- sums to team +/-', () => {
    const segs = lineupSegments(g, 'AAA');
    expect(segs.map((s) => [s.start, s.end, s.players.length])).toEqual([[0, 1440, 5], [1440, 2880, 5]]);
    expect(segs.reduce((x, s) => x + s.end - s.start, 0)).toBe(2880);
    expect(segs.reduce((x, s) => x + s.pm, 0)).toBe(6);
    expect(lineupSegments(g, 'BBB').map((s) => s.pm)).toEqual([-6]);
  });
  it('exactly 5 on court at a substitution clock; the new player is on from the sub', () => {
    expect(onCourtAt(g, 'AAA', 1440).map((p) => p.id).sort()).toEqual([1, 2, 3, 4, 6]);
    expect(onCourtAt(g, 'AAA', 1439.9).map((p) => p.id).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(onCourtAt(g, 'AAA', 2880)).toHaveLength(5);
  });
  it('cursor: clock, score, fouls at that moment, lineup "on since"', () => {
    const c = cursorInfo(g, 1800);
    expect(c.clock).toBe('Q3 6:00');
    expect(c.score).toEqual([4, 2]);
    const aaa = c.teams.find((t) => t.team === 'AAA')!;
    expect(aaa.sinceClock).toBe('Q3 12:00');
    expect(aaa.players.find((x) => x.p.id === 6)!.fouls).toBe(1);
    expect(cursorInfo(g, 1439).teams.find((t) => t.team === 'AAA')!.players.some((x) => x.p.id === 6)).toBe(false);
  });
});

describe('row layout', () => {
  // Long stint, a 1:30 stint, a 0:20 stint right after a gap, fouls clustered in a few seconds.
  const p = pl(1, 'AAA', [[0, 600, 0], [650, 740, 0], [745, 765, 0], [2000, 2880, 0]], [
    [100, 1, 'a'], [102, 1, 'b'], [104, 1, 'c'], [2878, 4, 'd'],
  ]);
  for (const width of [timelineWidth(4, 300), timelineWidth(4, 1400)]) {
    const r = layoutRow(p, 4, width);
    it(`width ${Math.round(width)}: bar widths are proportional to time`, () => {
      for (const b of r.bars) expect(b.w).toBeCloseTo(Math.max(2, (b.st[1] - b.st[0]) * r.pxPerSec), 6);
    });
    it(`width ${Math.round(width)}: every stint has a label; long ones inside, short ones outside`, () => {
      expect(r.bars).toHaveLength(4);
      for (const b of r.bars) {
        expect(b.label.text).toMatch(/^\d+:\d\d$/);
        if (b.st[1] - b.st[0] >= 120) {
          expect(b.label.inside).toBe(true);
          expect(b.label.x).toBeGreaterThanOrEqual(b.x);
          expect(b.label.x + b.label.w).toBeLessThanOrEqual(b.x + b.w);
        } else expect(b.label.inside).toBe(false);
      }
    });
    it(`width ${Math.round(width)}: nothing overlaps`, () => {
      const boxes = [...r.bars.filter((b) => !b.label.inside).map((b) => b.label), ...r.ticks.map((t) => t.label), ...r.badges.map((b) => b.box)];
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const [a, b] = [boxes[i]!, boxes[j]!];
          if (a.lane === b.lane) expect(a.x + a.w <= b.x || b.x + b.w <= a.x, JSON.stringify([a, b])).toBe(true);
        }
    });
  }
  it('minimum scale: 2:00 is wide enough for an inside label', () => {
    expect((120 / 60) * CHART.minPxPerMinute).toBeGreaterThanOrEqual(5 * CHART.labelCharPx + 2 * CHART.labelPadPx - CHART.labelCharPx);
  });
});

describe('foul trouble on a real game (0022500093, Isaiah Stewart: 6 fouls)', async () => {
  const { loadSeason } = await import('./data.ts');
  const { mergeContinuous } = await import('../src/domain/stints.ts');
  const g = loadSeason('2025-26').find((x) => x.id === '0022500093')!;
  const p = g.players.find((x) => x.name === 'Isaiah Stewart')!;
  it('colors follow the per-quarter thresholds', () => {
    // Fouls: Q1 372; Q2 762, 836, 1139; Q3 1891; Q4 2543.
    expect(mergeContinuous(p.stints).map((st) => barSegments(st, p).map((s) => s.level))).toEqual([
      ['ok'], // Q1–Q2 to 836: 2 fouls in Q2 is below Q2 caution (3); the 3rd comes at the stint's last instant
      ['caution'], // Q2 with 3 fouls
      ['caution'], // Q3 with 4 fouls
      ['trouble'], // Q4 with 5 fouls
    ]);
  });
});
