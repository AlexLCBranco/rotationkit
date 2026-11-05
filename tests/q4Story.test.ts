// The Q4 paragraph: every lineup change of Q4/OT exactly once, in words, no clock times, only facts from the data.

import { describe, expect, it } from 'vitest';
import { loadSeason } from './data.ts';
import { onCourtAt } from '../src/domain/gameChart.ts';
import { Q4_START } from '../src/domain/q4.ts';
import { q4Story, scoreWords } from '../src/domain/q4Story.ts';
import { shortNames } from '../src/app/names.ts';
import { gameLength } from '../src/domain/time.ts';
import type { Game, PlayerGame, Stint } from '../src/domain/types.ts';

const games: Game[] = [...loadSeason('2025-26'), ...loadSeason('2026-27')];
const names = (g: Game) => {
  const m = new Map<number, string>();
  for (const tri of [g.home.tri, g.away.tri]) for (const [id, n] of shortNames(g.players.filter((p) => p.team === tri))) m.set(id, n);
  return m;
};
const onAt = (g: Game, team: string, t: number) => new Set(onCourtAt(g, team, t).map((p) => p.id));

describe(`Q4 paragraph over all ${games.length} games`, () => {
  it('replaying its changes from the Q4 opener gives the real lineup after every change and the closers at the end', () => {
    const bad: string[] = [];
    for (const g of games) {
      const s = q4Story(g, names(g));
      const cur: Record<string, Set<number>> = {};
      for (const team of [g.home.tri, g.away.tri]) cur[team] = onAt(g, team, Q4_START);
      if (s[0]!.kind !== 'start' || s.at(-1)!.kind !== 'end') bad.push(`${g.id} shape`);
      for (const x of s.slice(1, -1)) {
        for (const team of Object.keys(x.ins)) {
          for (const id of x.outs[team] ?? []) if (!cur[team]!.delete(id)) bad.push(`${g.id} ${team} out ${id} was not on`);
          for (const id of x.ins[team] ?? []) cur[team]!.add(id);
          const real = onAt(g, team, x.t);
          if ([...cur[team]!].sort().join() !== [...real].sort().join()) bad.push(`${g.id} ${team} t=${x.t} replay differs`);
        }
      }
      const end = gameLength(g.periods);
      for (const team of [g.home.tri, g.away.tri]) if ([...cur[team]!].sort().join() !== [...onAt(g, team, end)].sort().join()) bad.push(`${g.id} ${team} closers`);
      // Every moment a lineup really changes in Q4/OT has a sentence.
      const changes = new Set<number>();
      for (const p of g.players) for (const [a, b] of p.stints) if (b > a) for (const t of [a, b]) if (t > Q4_START && t < end) changes.add(t);
      for (const t of changes)
        for (const team of [g.home.tri, g.away.tri]) {
          const before = g.players.filter((p) => p.team === team && p.stints.some(([a, b]) => b > a && a < t && t <= b)).map((p) => p.id).sort().join();
          if (before !== [...onAt(g, team, t)].sort().join() && !s.some((x) => x.t === t && (x.ins[team]?.length || x.outs[team]?.length))) bad.push(`${g.id} ${team} t=${t} change not told`);
        }
    }
    expect(bad.slice(0, 20)).toEqual([]);
  }, 120_000);

  it('no clock times in the text; every named player is in the game; sentences are in time order', () => {
    const bad: string[] = [];
    for (const g of games) {
      const s = q4Story(g, names(g));
      for (const x of s) {
        if (/\b\d{1,2}:\d{2}\b/.test(x.text)) bad.push(`${g.id} clock in "${x.text}"`);
        if (x.players.some((id) => !g.players.some((p) => p.id === id))) bad.push(`${g.id} unknown player`);
      }
      for (let i = 1; i < s.length; i++) if (s[i]!.t < s[i - 1]!.t) bad.push(`${g.id} order`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });
});

describe('Q4 paragraph wording (hand-made game)', () => {
  const pl = (id: number, team: string, name: string, stints: Stint[], fouls: [number, number, string][] = []): PlayerGame => ({
    id, name, team, starter: false, played: true, min: 0, pts: 0, reb: 0, ast: 0, pf: fouls.length, pm: 0, stints, fouls,
  });
  // AAA (home): A1–A5 open Q4; A5 fouls out-ish (5th foul) at 40:00 and A6 (no earlier minutes) replaces him.
  // BBB (away): B1–B5 all of Q4.
  const Q = [[2160, 2880, 0]] as Stint[];
  const g = {
    id: '0022599998', date: '2026-01-01', periods: 4,
    home: { id: 1, tri: 'AAA', name: 'A', city: 'A', score: 101 }, away: { id: 2, tri: 'BBB', name: 'B', city: 'B', score: 99 },
    inactive: [], inactiveSource: 'box', margin: [[0, 0]], orphanFouls: [],
    score: [[0, 0, 0], [2160, 80, 80], [2400, 90, 88], [2880, 101, 99]],
    players: [
      ...[1, 2, 3, 4].map((i) => pl(i, 'AAA', `Al ${'ABCD'[i - 1]}lpha`, [[0, 720, 0], ...Q])),
      pl(5, 'AAA', 'Ed Echo', [[0, 720, 0], [2160, 2400, 0]], [[100, 1, 'p'], [200, 1, 'p'], [300, 1, 'p'], [400, 1, 'p'], [2400, 4, 'p']]),
      pl(6, 'AAA', 'Fay Fox', [[2400, 2880, 0]]),
      ...[1, 2, 3, 4, 5].map((i) => pl(10 + i, 'BBB', `Bo ${'VWXYZ'[i - 1]}ee`, [[0, 720, 0], ...Q])),
    ],
  } as unknown as Game;
  const s = q4Story(g, new Map(g.players.map((p) => [p.id, p.name.split(' ')[1]!])));
  it('opener, one change with its facts, closers + result; no times', () => {
    expect(s.map((x) => x.kind)).toEqual(['start', 'sub', 'end']);
    expect(s[0]!.text).toBe('The 4th quarter started tied at 80: BBB with Vee, Wee, Xee, Yee and Zee; AAA with Alpha, Blpha, Clpha, Dlpha and Echo.');
    expect(s[1]!).toMatchObject({ t: 2400, team: 'AAA', ins: { AAA: [6] }, outs: { AAA: [5] } });
    expect(s[1]!.text).toBe("AAA brought Fox in for Echo (Echo had just picked up his 5th foul; Fox's first minutes of the game), AAA up 90–88.");
    expect(s[2]!.text).toBe('At the buzzer BBB had Vee, Wee, Xee, Yee and Zee on the floor; AAA had Alpha, Blpha, Clpha, Dlpha and Fox. AAA won 101–99.');
  });
  it('score words', () => {
    expect(scoreWords(g, 2160)).toBe('tied at 80');
    expect(scoreWords(g, 2400)).toBe('AAA up 90–88');
  });
});
