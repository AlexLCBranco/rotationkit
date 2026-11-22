// Score margin strip (steps + paths on the chart's axis) and the "Usual" overlay (typical stints over the team's
// previous 10 games, this game excluded).

import { describe, expect, it } from 'vitest';
import { loadSeason, sweepGames, WHOLE_DATA_TIMEOUT } from './data.ts';
import { finalMarginText, marginPaths, marginScale, marginSteps } from '../src/domain/margin.ts';
import { usualAt, usualFor, usualSelection, usualStintAt, usualLine } from '../src/domain/usual.ts';
import { scoreAt } from '../src/domain/gameChart.ts';
import { Q4_START } from '../src/domain/q4.ts';
import { blowoutIntervals, selectGames, typicalStints, DEFAULT_FILTERS } from '../src/domain/patterns.ts';
import { gameLength, REGULATION_LEN } from '../src/domain/time.ts';
import { USUAL } from '../src/domain/config.ts';
import type { Game } from '../src/domain/types.ts';

const g0 = (margin: [number, number][], periods = 4) => ({ id: '0022600001', periods, margin, home: { tri: 'HHH', score: 0 }, away: { tri: 'AAA', score: 0 } }) as unknown as Game;

describe('margin steps', () => {
  it('lead = away − home, one step per change, from the window start', () => {
    const g = g0([[0, 0], [30, 2], [60, 2], [90, -3], [2200, 5]]);
    expect(marginSteps(g)).toEqual([[0, 0], [30, -2], [90, 3], [2200, -5]]);
    expect(marginSteps(g, Q4_START)).toEqual([[Q4_START, 3], [2200, -5]]);
    expect(marginSteps(g0([[0, 0]]))).toEqual([[0, 0]]);
  });
  it('paths: x = (t − from) × k, zero line in the middle, scale = largest lead (≥ 10)', () => {
    const g = g0([[0, 0], [720, 4], [1440, -12]]);
    const steps = marginSteps(g);
    expect(marginScale(steps)).toBe(12);
    expect(marginScale([[0, 3]])).toBe(10);
    const p = marginPaths(steps, 2880, 0, 0.5, 34);
    expect(p.mid).toBe(17);
    // Away lead (12 at t=1440 → x=720) is drawn up to y = 1; home lead (4) below.
    expect(p.up).toContain('L720 1 L1440 1');
    expect(p.down).toContain('L360 ');
    expect(p.down.split(' L').some((x) => x.startsWith('360 '))).toBe(true);
  });
  it('final margin text', () => {
    const g = { ...g0([]), home: { tri: 'DET', score: 121 }, away: { tri: 'BOS', score: 113 } } as unknown as Game;
    expect(finalMarginText(g)).toBe('DET +8');
    expect(finalMarginText({ ...g, away: { tri: 'BOS', score: 130 } } as unknown as Game)).toBe('BOS +9');
    expect(finalMarginText({ ...g, away: { tri: 'BOS', score: 121 } } as unknown as Game)).toBe('Tied');
  });
});

describe(`margin strip over ${sweepGames().length} games`, { timeout: WHOLE_DATA_TIMEOUT }, () => {
  /** Stored margin (home − away) at t, the timeline taken in time order (binary search). */
  const at = (sorted: [number, number][], t: number) => {
    let lo = 0;
    let hi = sorted.length - 1;
    let m = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid]![0] <= t) (m = sorted[mid]![1], (lo = mid + 1));
      else hi = mid - 1;
    }
    return m;
  };
  const sortedMargin = (g: Game) => [...g.margin].sort((x, y) => x[0] - y[0]);
  /** Games whose stored margin timeline and score timeline tell the same story (all but a rare play-by-play quirk). */
  const consistent = (g: Game) => {
    const m = sortedMargin(g);
    return g.score.every(([t, h, a]) => at(m, t) === h - a);
  };
  it('at every step and between steps the lead = the stored margin timeline (away − home); ends at the final margin', () => {
    const bad: string[] = [];
    for (const g of sweepGames()) {
      const sorted = sortedMargin(g);
      const ok = consistent(g) && g.score.every((x, j) => j === 0 || x[0] >= g.score[j - 1]![0]);
      for (const from of [0, Q4_START]) {
        const steps = marginSteps(g, from);
        const end = gameLength(g.periods);
        if (steps[0]![0] !== from) bad.push(`${g.id} from`);
        steps.forEach(([t, v], i) => {
          const next = steps[i + 1]?.[0] ?? end;
          for (const tt of [t, (t + next) / 2]) if (-at(sorted, tt) !== v) bad.push(`${g.id} t=${tt}`);
          // Where the timelines agree and are in time order, it is also exactly the cursor's score (scoreAt).
          if (ok && i % 5 === 0) {
            const [h, a] = scoreAt(g, (t + next) / 2);
            if (a - h !== v) bad.push(`${g.id} t=${t} score`);
          }
        });
        if (steps.at(-1)![1] !== g.away.score - g.home.score) bad.push(`${g.id} final`);
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });
  it('the stored margin and score timelines disagree only in rare games', () => {
    expect(sweepGames().filter((g) => !consistent(g)).length).toBeLessThanOrEqual(3);
  });
});

describe('usual window', () => {
  const games = loadSeason('2025-26');
  const team = 'ORL';
  // regular-season games (RK-13: a game's "usual" is taken over games of its own set)
  const mine = games.filter((g) => g.id.startsWith('002') && (g.home.tri === team || g.away.tri === team));
  it('= the team\'s previous 10 games of the season, this one excluded, blowout rule on', () => {
    const g = mine[30]!;
    const sel = usualSelection(mine, g, team);
    expect(sel.games.map((x) => x.id)).toEqual(mine.slice(20, 30).map((x) => x.id));
    expect(sel.filters).toMatchObject({ window: 10, blowout: true, venue: 'all' });
    expect(sel.games.some((x) => x.id === g.id)).toBe(false);
    // Early season: fewer games; the opener has none.
    expect(usualSelection(mine, mine[4]!, team).games).toHaveLength(4);
    expect(usualSelection(mine, mine[0]!, team).games).toHaveLength(0);
    // Later games of the season never count, nor other seasons.
    expect(usualSelection([...mine, ...loadSeason('2026-27')], mine[2]!, team).games.map((x) => x.id)).toEqual(mine.slice(0, 2).map((x) => x.id));
  });
  it('stints = typicalStints over that window (regulation only); null under 3 games played', () => {
    const g = mine[40]!;
    const sel = usualSelection(mine, g, team);
    let some = 0;
    for (const p of g.players.filter((x) => x.team === team)) {
      const played = sel.games.filter((x) => x.players.some((q) => q.id === p.id && q.team === team && q.played && q.stints.length)).length;
      const u = usualFor(sel, p.id);
      if (played < USUAL.minGames) expect(u, p.name).toBeNull();
      else {
        expect(u!.played).toBe(played);
        expect(u!.stints).toEqual(typicalStints(selectGames(sel.games, '2025-26', team, { ...DEFAULT_FILTERS, window: 10 }), p.id));
        expect(u!.stints.every((s) => s.end <= REGULATION_LEN)).toBe(true);
        some++;
      }
    }
    expect(some).toBeGreaterThan(5);
  });
  it('"usually on court here (7 of 10)": games he played, garbage time left out', () => {
    const g = mine[40]!;
    const sel = usualSelection(mine, g, team);
    const p = g.players.find((x) => x.team === team && x.starter && usualFor(sel, x.id)?.stints.length)!;
    const u = usualFor(sel, p.id)!;
    const s = u.stints[0]!;
    const t = (s.start + s.end) / 2;
    const c = usualAt(u, t);
    let on = 0;
    let of = 0;
    for (const x of sel.games) {
      const q = x.players.find((y) => y.id === p.id && y.team === team && y.played && y.stints.length);
      if (!q || blowoutIntervals(x).some(([a, b]) => a <= t && t < b)) continue;
      of++;
      if (q.stints.some(([a, b]) => a <= t && t < b)) on++;
    }
    expect(c).toEqual({ on, of });
    expect(on * 2).toBeGreaterThanOrEqual(of); // a usual stint: on court in at least half
    expect(usualStintAt(u, t)).toBe(s);
    expect(usualLine({ on: 7, of: 10 })).toBe('usually on court here (7 of 10)');
    expect(usualAt(u, REGULATION_LEN + 10)).toEqual({ on: 0, of: 0 });
  });
});
