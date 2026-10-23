// Pattern engine on tiny hand-made games where the right answer is obvious.

import { describe, expect, it } from 'vitest';
import { blowoutIntervals, DEFAULT_FILTERS, playerGames, selectGames, teamPattern, type Filters } from '../src/domain/patterns.ts';
import { seasonOf } from '../src/domain/season.ts';
import type { Game, PlayerGame, Stint } from '../src/domain/types.ts';

const FULL: Stint[] = [[0, 720, 0], [720, 1440, 0], [1440, 2160, 0], [2160, 2880, 0]];
const pl = (id: number, team: string, stints: Stint[], played = true): PlayerGame => ({
  id, name: `P${id}`, team, starter: false, played, min: stints.reduce((s, [a, b]) => s + b - a, 0), pts: 0, reb: 0, ast: 0, pf: 0, pm: 0, stints,
});
const team = (tri: string, score = 100) => ({ id: 0, tri, name: tri, city: tri, score });
let seq = 0;
function game(date: string, home: string, away: string, players: PlayerGame[], opts: Partial<Game> = {}, season = '25'): Game {
  return {
    id: `002${season}${String(++seq).padStart(5, '0')}`, date, home: team(home), away: team(away), periods: 4, players,
    inactive: [], inactiveSource: 'box', margin: [[0, 0]], score: [[0, 0, 0]], orphanFouls: [], ...opts,
  };
}
const F = (f: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, blowout: false, ...f });
const q = (b: number) => b; // bucket index helper for readability

describe('seasonOf', () => {
  it('reads the season from the game ID', () => {
    expect(seasonOf('0022500001')).toBe('2025-26');
    expect(seasonOf('0022600093')).toBe('2026-27');
    expect(seasonOf('0029900001')).toBe('2099-00');
  });
});

describe('blowoutIntervals', () => {
  it('only Q4/OT, only under 6:00 left, only while |margin| ≥ 20', () => {
    // Margin hits 25 in Q2 (ignored), 22 at Q4 8:00 (2400s), drops to 18 at Q4 2:00 (2760s).
    const g = game('2025-11-01', 'AAA', 'BBB', [], { margin: [[0, 0], [1000, 25], [1500, 10], [2400, 22], [2760, 18]] });
    expect(blowoutIntervals(g)).toEqual([[2520, 2760]]);
  });
  it('covers OT periods too and handles away blowouts (negative margin)', () => {
    const g = game('2025-11-01', 'AAA', 'BBB', [], { periods: 5, margin: [[0, 0], [2900, -20]] });
    // Q4 window 2520–2880: margin 0 → none. OT (2880–3180) under 6:00 = whole OT; margin −20 from 2900.
    expect(blowoutIntervals(g)).toEqual([[2900, 3180]]);
  });
  it('no margin ≥ 20 → nothing', () => {
    expect(blowoutIntervals(game('2025-11-01', 'AAA', 'BBB', [], { margin: [[0, 0], [2800, 19]] }))).toEqual([]);
  });
});

describe('teamPattern', () => {
  // Game 1: A plays the first half; B plays the second half. Game 2: A plays all 48; B did not play.
  const g1 = game('2025-11-01', 'AAA', 'BBB', [pl(1, 'AAA', [[0, 720, 0], [720, 1440, 0]]), pl(2, 'AAA', [[1440, 2160, 0], [2160, 2880, 0]])]);
  const g2 = game('2025-11-03', 'BBB', 'AAA', [pl(1, 'AAA', FULL), pl(2, 'AAA', [], false)]);
  const sel = selectGames([g1, g2], '2025-26', 'AAA', F({}));
  const tp = teamPattern(sel);
  const A = tp.players.find((p) => p.id === 1)!;
  const B = tp.players.find((p) => p.id === 2)!;

  it('96 buckets of 30s over regulation; based on 2 games', () => {
    expect(tp.buckets).toBe(96);
    expect(tp.games).toBe(2);
  });
  it('on-court share only over games the player played', () => {
    expect(A.gamesPlayed).toBe(2);
    expect(A.onCourt[q(0)]).toBe(1); // first half: both games
    expect(A.onCourt[q(60)]).toBe(0.5); // second half: game 2 only
    expect(A.onAtMid[60]).toBe(1);
    expect(A.eligibleAtMid[60]).toBe(2);
    expect(B.gamesPlayed).toBe(1); // DNP in game 2 doesn't count against him
    expect(B.onCourt[0]).toBe(0);
    expect(B.onCourt[95]).toBe(1);
  });
  it('averages minutes over games played and sorts by them', () => {
    expect(A.avgMin).toBe((1440 + 2880) / 2);
    expect(B.avgMin).toBe(1440);
    expect(tp.players.map((p) => p.id)).toEqual([1, 2]);
  });
  it('partial bucket on-court time counts proportionally', () => {
    const g = game('2025-11-05', 'AAA', 'CCC', [pl(3, 'AAA', [[0, 15, 0]])]);
    const p = teamPattern(selectGames([g], '2025-26', 'AAA', F({}))).players[0]!;
    expect(p.onCourt[0]).toBe(0.5);
    expect(p.onAtMid[0]).toBe(0); // midpoint 15s: stint is [0, 15)
  });
});

describe('blowout filter', () => {
  // Up 30 from Q4 10:00 (2280s). Blowout time = Q4 6:00–0:00 = [2520, 2880].
  // Starter S plays to 2520, bench guy G plays 2520–2880.
  const g = game('2025-11-01', 'AAA', 'BBB', [pl(1, 'AAA', [...FULL.slice(0, 3), [2160, 2520, 0]]), pl(2, 'AAA', [[2520, 2880, 0]])], { margin: [[0, 0], [2280, 30]] });
  it('ON: blowout time is removed from numerator and denominator', () => {
    const tp = teamPattern(selectGames([g], '2025-26', 'AAA', F({ blowout: true })));
    const S = tp.players.find((p) => p.id === 1)!;
    const G = tp.players.find((p) => p.id === 2)!;
    expect(S.onCourt[90]).toBeNull(); // Q4 3:00: fully excluded
    expect(S.onCourt[83]).toBe(1); // Q4 6:30: not excluded
    expect(G.avgMin).toBe(0); // garbage-time minutes removed
    expect(G.onCourt[95]).toBeNull();
    expect(tp.blowoutAtMid[90]).toBe(1);
    expect(G.eligibleAtMid[90]).toBe(0);
  });
  it('OFF: all time counts', () => {
    const tp = teamPattern(selectGames([g], '2025-26', 'AAA', F({ blowout: false })));
    const G = tp.players.find((p) => p.id === 2)!;
    expect(G.avgMin).toBe(360);
    expect(G.onCourt[95]).toBe(1);
  });
});

describe('selectGames', () => {
  const games = Array.from({ length: 7 }, (_, i) =>
    game(`2025-11-${String(i + 10)}`, i % 2 ? 'AAA' : 'ZZZ', i % 2 ? 'ZZZ' : 'AAA', [pl(1, 'AAA', FULL)]),
  );
  const next = game('2026-10-21', 'AAA', 'ZZZ', [pl(1, 'AAA', FULL)], {}, '26');
  const all = [...games, next];

  it('last 5 / last 10 / season, with the actual count', () => {
    expect(selectGames(all, '2025-26', 'AAA', F({ window: 5 })).games.map((g) => g.date)).toEqual(games.slice(-5).map((g) => g.date));
    expect(selectGames(all, '2025-26', 'AAA', F({ window: 10 })).games).toHaveLength(7);
    expect(selectGames(all, '2025-26', 'AAA', F({ window: 'season' })).games).toHaveLength(7);
  });
  it('never mixes seasons: last 10 of 2026-27 is 1 game', () => {
    const s = selectGames(all, '2026-27', 'AAA', F({ window: 10 }));
    expect(s.games).toHaveLength(1);
    expect(s.games[0]!.id).toBe(next.id);
  });
  it('home / away, applied before the window', () => {
    const home = selectGames(all, '2025-26', 'AAA', F({ venue: 'home' }));
    expect(home.games.every((g) => g.home.tri === 'AAA')).toBe(true);
    expect(home.games).toHaveLength(3);
    expect(selectGames(all, '2025-26', 'AAA', F({ venue: 'away', window: 5 })).games).toHaveLength(4);
  });
  it('playerGames lists his games with opponent and venue', () => {
    const rows = playerGames(selectGames(all, '2025-26', 'AAA', F({ window: 5 })), 1);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ opponent: 'ZZZ', played: true });
  });
});

describe('with/without', () => {
  // X (id 9) plays g1–g2, out (official list) in g3, out (no official list → rule) in g4, plays g5.
  const X = (played: boolean) => pl(9, 'AAA', played ? FULL : []);
  const T = pl(1, 'AAA', FULL);
  const g1 = game('2025-11-01', 'AAA', 'B', [T, X(true)]);
  const g2 = game('2025-11-02', 'AAA', 'B', [T, X(true)]);
  const g3 = game('2025-11-03', 'AAA', 'B', [T], { inactive: [{ id: 9, name: 'P9', team: 'AAA', reason: 'INACTIVE_INJURY' }] });
  const g4 = game('2025-11-04', 'AAA', 'B', [T], { inactive: null });
  const g5 = game('2025-11-05', 'AAA', 'B', [T, X(true)]);
  const g0 = game('2025-10-30', 'AAA', 'B', [T], { inactive: [] }); // before he joined: listed nowhere
  const all = [g0, g1, g2, g3, g4, g5];

  it('groups games and counts each group; games he was not with the team are in neither', () => {
    const w = selectGames(all, '2025-26', 'AAA', F({ withWithout: { player: 9, mode: 'with' } }));
    expect(w.games.map((g) => g.id)).toEqual([g1.id, g2.id, g5.id]);
    expect(w.withWithout).toMatchObject({ withGames: 3, withoutGames: 2, notWithTeam: 1, withoutEstimated: true });
    const wo = selectGames(all, '2025-26', 'AAA', F({ withWithout: { player: 9, mode: 'without' } }));
    expect(wo.games.map((g) => g.id)).toEqual([g3.id, g4.id]);
  });
  it('without count is not estimated when every game has an official list', () => {
    const wo = selectGames([g0, g1, g2, g3, g5], '2025-26', 'AAA', F({ withWithout: { player: 9, mode: 'without' } }));
    expect(wo.withWithout!.withoutEstimated).toBe(false);
  });
  it('window applies after the with/without split', () => {
    const wo = selectGames(all, '2025-26', 'AAA', F({ window: 5, withWithout: { player: 9, mode: 'with' } }));
    expect(wo.games).toHaveLength(3);
    expect(wo.candidates).toBe(3);
  });
});

describe('mergeContinuous (display)', () => {
  it('joins stints split at period boundaries, summing +/- and fouls', async () => {
    const { mergeContinuous } = await import('../src/domain/stints.ts');
    expect(mergeContinuous([[400, 720, 2, [500]], [720, 900, -1, [800]], [1000, 1100, 3]])).toEqual([[400, 900, 1, [500, 800]], [1000, 1100, 3]]);
    expect(mergeContinuous([[0, 300, 1], [300, 300, -1], [300, 400, 0]])).toEqual([[0, 300, 1], [300, 300, -1], [300, 400, 0]]);
  });
});

describe('quarterAverages', () => {
  it('per-quarter minutes and fouls averaged over games played; blowout filter removes minutes, never fouls', async () => {
    const { quarterAverages } = await import('../src/domain/patterns.ts');
    const p1 = { ...pl(1, 'AAA', FULL), fouls: [[100, 1, 'x'], [2600, 4, 'y']] as [number, number, string][], pf: 2 };
    const p2 = { ...pl(1, 'AAA', [[0, 720, 0]]) };
    const g1 = game('2025-12-01', 'AAA', 'BBB', [p1], { margin: [[0, 0], [2280, 30]] });
    const g2 = game('2025-12-02', 'AAA', 'BBB', [p2]);
    const off = quarterAverages(selectGames([g1, g2], '2025-26', 'AAA', F({ blowout: false })))[0]!;
    expect(off.gamesPlayed).toBe(2);
    expect(off.minQ.slice(0, 4)).toEqual([720, 360, 360, 360]);
    expect(off.pfQ.slice(0, 4)).toEqual([0.5, 0, 0, 0.5]);
    expect(off.pf).toBe(1);
    const on = quarterAverages(selectGames([g1, g2], '2025-26', 'AAA', F({ blowout: true })))[0]!;
    expect(on.minQ[3]).toBe((720 - 360) / 2); // Q4 6:00–0:00 excluded in g1
    expect(on.pfQ[3]).toBe(0.5); // the Q4 foul at 2600 is in garbage time but fouls always count
    expect(on.pf).toBe(off.pf);
    expect(on.min).toBe(on.minQ.reduce((x, y) => x + y, 0));
  });
});

describe('sitPattern ("when does he sit?")', () => {
  // Starter: Q1 out at 4:40 left (elapsed 440) in 3 games, 5:00 left (420) in 1 → median 4:40 (n 4);
  // Q2 back at 9:00 left (900) in 4 games; Q3 out at 3:30 left (1950) in only 2 games → hidden (< 3).
  const st = (q1out: number, q3out: number | null): Stint[] => [
    [0, q1out, 0],
    [900, 1440, 0],
    ...(q3out ? ([[1440, q3out, 0]] as Stint[]) : ([[1440, 2160, 0]] as Stint[])),
    [2160, 2880, 0],
  ];
  const games = [st(440, 1950), st(440, 1950), st(440, null), st(420, null)].map((s, i) =>
    game(`2026-01-0${i + 1}`, 'AAA', 'BBB', [pl(7, 'AAA', s)]),
  );
  it('medians with counts; events seen in < 3 games are not shown', async () => {
    const { sitPattern, describeSit } = await import('../src/domain/patterns.ts');
    const evs = sitPattern(selectGames(games, '2025-26', 'AAA', F({ blowout: false })), 7);
    expect(evs.map((e) => [e.period, e.kind, e.clock, e.n])).toEqual([
      [1, 'out', '4:40', 4],
      [2, 'in', '9:00', 4],
    ]);
    expect(describeSit(evs)).toBe('Q1 out ~4:40 (4) · Q2 in ~9:00 (4)');
  });
  it('even count → mean of the middle two; rounding to 10 s', async () => {
    const { median } = await import('../src/domain/patterns.ts');
    expect(median([440, 440, 440, 420])).toBe(440);
    expect(median([400, 410])).toBe(405);
  });
  it('the 3-game rule counts games in the selection: 2 games → nothing shown', async () => {
    const { sitPattern } = await import('../src/domain/patterns.ts');
    expect(sitPattern(selectGames(games.slice(-2), '2025-26', 'AAA', F({ blowout: false })), 7)).toEqual([]);
    expect(sitPattern(selectGames(games.slice(-3), '2025-26', 'AAA', F({ blowout: false })), 7).map((e) => e.n)).toEqual([3, 3]);
  });
  it('subs during garbage time are ignored when the blowout filter is on', async () => {
    const { sitPattern } = await import('../src/domain/patterns.ts');
    // Pulled at Q4 4:00 left (2640) during a 30-point lead in 3 games.
    const gs = [1, 2, 3].map((i) => game(`2026-02-0${i}`, 'AAA', 'BBB', [pl(8, 'AAA', [[0, 720, 0], [720, 1440, 0], [1440, 2160, 0], [2160, 2640, 0]])], { margin: [[0, 0], [2000, 30]] }));
    expect(sitPattern(selectGames(gs, '2025-26', 'AAA', F({ blowout: false })), 8).map((e) => [e.period, e.kind, e.clock])).toEqual([[4, 'out', '4:00']]);
    expect(sitPattern(selectGames(gs, '2025-26', 'AAA', F({ blowout: true })), 8)).toEqual([]);
  });
});

describe('shortNames', () => {
  it('family name; initial when surnames collide; full name when initials collide too', async () => {
    const { shortNames } = await import('../src/app/names.ts');
    const n = shortNames([
      { id: 1, name: 'Jalen Williams', last: 'Williams', nameI: 'J. Williams' },
      { id: 2, name: 'Jaylin Williams', last: 'Williams', nameI: 'J. Williams' },
      { id: 3, name: 'Kenrich Williams', last: 'Williams', nameI: 'K. Williams' },
      { id: 4, name: 'Alex Caruso', last: 'Caruso', nameI: 'A. Caruso' },
    ]);
    expect([...n.values()]).toEqual(['Jalen Williams', 'Jaylin Williams', 'K. Williams', 'Caruso']);
  });
});

describe('typicalStints', () => {
  it('one game → exactly his stints (split at quarter lines), share 1', async () => {
    const { typicalStints } = await import('../src/domain/patterns.ts');
    const g = game('2026-03-01', 'AAA', 'BBB', [pl(1, 'AAA', [[0, 447, 0], [720, 1100, 0], [1100, 1440, 0], [1500, 2000, 0]])]);
    expect(typicalStints(selectGames([g], '2025-26', 'AAA', F({ blowout: false })), 1)).toEqual([
      { start: 0, end: 447, share: 1 },
      { start: 720, end: 1440, share: 1 },
      { start: 1500, end: 2000, share: 1 },
    ]);
  });
  it('several games → stretches he plays in at least half of them, with the share', async () => {
    const { typicalStints } = await import('../src/domain/patterns.ts');
    // On 0–400 in all 4 games; 400–600 in 2 of 4 (counts, ≥ half); 600–700 in 1 of 4 (not typical).
    const gs = [
      [[0, 700, 0]],
      [[0, 600, 0]],
      [[0, 400, 0]],
      [[0, 400, 0]],
    ].map((st, i) => game(`2026-03-0${i + 1}`, 'AAA', 'BBB', [pl(1, 'AAA', st as Stint[])]));
    const t = typicalStints(selectGames(gs, '2025-26', 'AAA', F({ blowout: false })), 1);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ start: 0, end: 600 });
    expect(t[0]!.share).toBeCloseTo((4 * 400 + 2 * 200) / (4 * 600), 6);
  });
  it('garbage time is left out when the blowout filter is on', async () => {
    const { typicalStints } = await import('../src/domain/patterns.ts');
    const g = game('2026-03-01', 'AAA', 'BBB', [pl(1, 'AAA', [[2160, 2880, 0]])], { margin: [[0, 0], [2200, 30]] });
    expect(typicalStints(selectGames([g], '2025-26', 'AAA', F({ blowout: true })), 1)).toEqual([{ start: 2160, end: 2520, share: 1 }]);
  });
});
