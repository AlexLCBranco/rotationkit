// Single-game chart invariants over EVERY game in both seasons (committed data), plus a play-by-play
// spot-check of foul numbering on the raw fixtures.

import { describe, expect, it } from 'vitest';
import { FULL_SWEEP, sweepGames, WHOLE_DATA_TIMEOUT } from './data.ts';
import { fixtureIds, loadFixtureGame, loadRawFixture } from './fixtures.ts';
import { cursorInfo, foulMarks, foulsAt, layoutRow, lineupSegments, lineupSince, onCourtAt, quarterStats, rowBoxes, timelineWidth } from '../src/domain/gameChart.ts';
import { gameLength, periodLength } from '../src/domain/time.ts';
import { toEvents } from '../src/domain/pbp.ts';
import type { Game } from '../src/domain/types.ts';

const games: Game[] = sweepGames();
/** Games without data-quality notes. A game with notes has a play-by-play the NBA got wrong (e.g. a missing
 *  substitution leaves 6 on court); it is still shown, with its warning, so the 5-on-court invariants skip it
 *  instead of blocking the daily update for every other game. */
const clean = games.filter((g) => !g.quality?.length);
/** Timeline container width used by the UI at 1280px (desktop only). */
const WIDTHS = { desktop: 944 };
/** Every 7th game in a full sweep; every game when only the daily update's new games are checked. */
const every = FULL_SWEEP ? 7 : 1;

describe(`all ${games.length} games`, { timeout: WHOLE_DATA_TIMEOUT }, () => {
  it('flagged games stay rare (a parser bug would flag many)', () => {
    expect(games.length - clean.length).toBeLessThanOrEqual(Math.max(10, games.length * 0.02));
  });

  it('fouls: marks = PF = box score; per-quarter PF sums to PF; cumulative consistent', () => {
    const bad: string[] = [];
    for (const g of games)
      for (const p of g.players) {
        const q = quarterStats(p, g.periods);
        const marks = foulMarks(p);
        const sum = q.reduce((x, r) => x + r.pf, 0);
        if (marks.length !== p.pf || sum !== p.pf || q[q.length - 1]!.cum !== p.pf) bad.push(`${g.id} ${p.name}`);
        if (marks.some((m, i) => m.n !== i + 1 || (i > 0 && m.t < marks[i - 1]!.t))) bad.push(`${g.id} ${p.name} order`);
        for (const m of marks) if (foulsAt(p, m.t) < m.n) bad.push(`${g.id} ${p.name} foulsAt`);
      }
    expect(bad).toEqual([]);
  });

  it('minutes: per-quarter minutes sum to the total; each team plays 5 × period length every period', () => {
    const bad: string[] = [];
    for (const g of clean) {
      for (const team of [g.home.tri, g.away.tri]) {
        const ps = g.players.filter((p) => p.team === team);
        for (let q = 1; q <= g.periods; q++) {
          const m = ps.reduce((x, p) => x + quarterStats(p, g.periods)[q - 1]!.min, 0);
          if (Math.abs(m - 5 * periodLength(q)) > 0.05) bad.push(`${g.id} ${team} P${q} ${m}`);
        }
        const total = ps.reduce((x, p) => x + p.stints.reduce((y, [s, e]) => y + e - s, 0), 0);
        if (Math.abs(total - (14400 + 1500 * (g.periods - 4))) > 0.1) bad.push(`${g.id} ${team} total ${total}`);
        for (const p of ps) {
          const qsum = quarterStats(p, g.periods).reduce((x, r) => x + r.min, 0);
          const st = p.stints.reduce((y, [s, e]) => y + e - s, 0);
          if (Math.abs(qsum - st) > 0.01) bad.push(`${g.id} ${p.name} quarters ${qsum} vs ${st}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('lineups: 5 players per segment, durations sum to the game, +/- sums to the team margin', () => {
    const bad: string[] = [];
    for (const g of clean)
      for (const team of [g.home.tri, g.away.tri]) {
        const segs = lineupSegments(g, team);
        const dur = segs.reduce((x, s) => x + s.end - s.start, 0);
        const pm = segs.reduce((x, s) => x + s.pm, 0);
        const margin = (team === g.home.tri ? 1 : -1) * (g.home.score - g.away.score);
        if (Math.abs(dur - gameLength(g.periods)) > 0.01 || pm !== margin || segs.some((s) => s.players.length !== 5)) bad.push(`${g.id} ${team}`);
      }
    expect(bad).toEqual([]);
  });

  it('cursor: exactly 5 per team at every substitution clock (and just before), every 30 s, and game end', () => {
    const bad: string[] = [];
    for (const g of clean) {
      const times = new Set<number>([gameLength(g.periods)]);
      for (let t = 0; t < gameLength(g.periods); t += 30) times.add(t);
      for (const p of g.players) for (const [s, e] of p.stints) for (const x of [s, e, s - 0.1, e - 0.1]) if (x >= 0) times.add(x);
      for (const t of times) for (const team of [g.home.tri, g.away.tri]) if (onCourtAt(g, team, t).length !== 5) bad.push(`${g.id} ${team} t=${t}`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('cursor info: foul counts equal fouls committed so far; score never decreases', () => {
    const bad: string[] = [];
    // Clean games only, like the other chart invariants: a game with data-quality notes has a wrong play-by-play
    // (0022600101's score timeline is out of order), and which games the 1-in-7 sample hits moves when games are added.
    for (const g of clean.filter((_, i) => i % every === 0)) {
      let last = [0, 0];
      for (let t = 0; t <= gameLength(g.periods); t += 60) {
        const c = cursorInfo(g, t);
        if (c.score[0] < last[0]! || c.score[1] < last[1]!) bad.push(`${g.id} score at ${t}`);
        last = c.score;
        for (const tm of c.teams) for (const x of tm.players) if (x.fouls !== (x.p.fouls ?? []).filter((f) => f[0] <= t).length) bad.push(`${g.id} fouls`);
      }
      const end = cursorInfo(g, gameLength(g.periods));
      if (end.score[0] !== g.home.score || end.score[1] !== g.away.score) bad.push(`${g.id} final score`);
    }
    expect(bad).toEqual([]);
  });

  // Regression (daily update failed Nov 6–7, 2026): the test above timed out at 5 s on the CI runner because
  // cursorInfo(g, t) rebuilt every lineup segment (with +/-) of both teams on each call just to read "on since".
  it('cursor info without precomputed segments = with them ("on since" included), at every lineup boundary', () => {
    const bad: string[] = [];
    // Every 5th game (all would take ~8 s): each probed at every stint boundary, just before it, and game end.
    for (const g of clean.filter((_, i) => i % (FULL_SWEEP ? 5 : 1) === 0)) {
      const segs = { [g.home.tri]: lineupSegments(g, g.home.tri), [g.away.tri]: lineupSegments(g, g.away.tri) };
      const end = gameLength(g.periods);
      const times = new Set<number>([0, end]);
      for (const p of g.players) for (const [s, e] of p.stints) for (const x of [s, e, e - 0.1]) if (x >= 0 && x <= end) times.add(x);
      for (const t of times) {
        const [a, b] = [cursorInfo(g, t), cursorInfo(g, t, segs)];
        for (let k = 0; k < 2; k++) {
          const [x, y] = [a.teams[k]!, b.teams[k]!];
          if (x.since !== y.since || x.sinceClock !== y.sinceClock) bad.push(`${g.id} ${x.team} t=${t} since ${x.since} vs ${y.since}`);
          if (x.players.map((q) => q.p.id).join() !== y.players.map((q) => q.p.id).join()) bad.push(`${g.id} ${x.team} t=${t} players`);
          if (lineupSince(g, x.team, t) !== y.since) bad.push(`${g.id} ${x.team} t=${t} lineupSince`);
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  // A code cost guard, not a data check: needs a large sample, so it runs in full sweeps (every pull request) only.
  it.skipIf(!FULL_SWEEP)('cursor info costs less than one lineupSegments build per call (machine-independent cost guard)', () => {
    // The old cursorInfo built lineupSegments twice per call (ratio ≥ 2); now ≈ 0.2. Comparing against
    // lineupSegments on the same machine keeps this independent of runner speed and of how many games exist.
    const sample = games.filter((_, i) => i % 7 === 0);
    const time = (f: () => void) => {
      const t0 = performance.now();
      f();
      return performance.now() - t0;
    };
    const ratios: number[] = [];
    for (let rep = 0; rep < 3; rep++) {
      let calls = 0;
      let builds = 0;
      const c = time(() => {
        for (const g of sample) for (let t = 0; t <= gameLength(g.periods); t += 60) (cursorInfo(g, t), calls++);
      });
      const s = time(() => {
        for (const g of sample) for (const tm of [g.home.tri, g.away.tri]) (lineupSegments(g, tm), builds++);
      });
      ratios.push(c / calls / (s / builds));
    }
    expect(Math.min(...ratios)).toBeLessThan(1);
  });

  for (const [name, container] of Object.entries(WIDTHS)) {
    it(`label layout at ${name} width: every stint labelled (inside if ≥2:00), proportional bars, no collisions`, () => {
      const bad: string[] = [];
      for (const g of games) {
        const width = timelineWidth(g.periods, container);
        for (const p of g.players) {
          if (!p.stints.length) continue;
          const r = layoutRow(p, g.periods, width);
          for (const b of r.bars) {
            const dur = b.st[1] - b.st[0];
            if (Math.abs(b.w - Math.max(2, dur * r.pxPerSec)) > 1e-6) bad.push(`${g.id} ${p.name} width`);
            if (!b.label.text || b.label.w <= 0) bad.push(`${g.id} ${p.name} no label`);
            if (dur >= 120 && (!b.label.inside || b.label.x < b.x || b.label.x + b.label.w > b.x + b.w)) bad.push(`${g.id} ${p.name} inside ${dur}`);
            if (dur < 120 && b.label.inside) bad.push(`${g.id} ${p.name} short inside`);
            if (b.label.x < 0 || b.label.x + b.label.w > width + 1e-6) bad.push(`${g.id} ${p.name} off-track`);
            // Outside labels in the bar lane must not cover any bar.
            if (!b.label.inside && b.label.lane === 'bar')
              for (const o of r.bars) if (b.label.x < o.x + o.w && o.x < b.label.x + b.label.w) bad.push(`${g.id} ${p.name} label on bar`);
          }
          const boxes = rowBoxes(r).filter((x) => x.kind !== 'inside');
          for (let i = 0; i < boxes.length; i++)
            for (let j = i + 1; j < boxes.length; j++) {
              const [a, c] = [boxes[i]!, boxes[j]!];
              if (a.lane === c.lane && a.x < c.x + c.w && c.x < a.x + a.w) bad.push(`${g.id} ${p.name} ${a.kind}/${c.kind} overlap`);
            }
          // Short labels in the top lane must not sit on a foul tick line.
          for (const b of r.bars)
            if (b.label.lane === 'top') for (const t of r.ticks) if (t.x > b.label.x && t.x < b.label.x + b.label.w) bad.push(`${g.id} ${p.name} label on tick`);
        }
      }
      expect(bad.slice(0, 20)).toEqual([]);
    });
  }
});

describe('foul numbering matches play-by-play (raw fixtures)', () => {
  it.each(fixtureIds)('%s: cumulative number = pbp foulPersonalTotal at every personal foul', (id) => {
    const g = loadFixtureGame(id);
    const evs = toEvents(loadRawFixture(id).playbyplay.game.actions).filter(
      (e) => e.a.actionType === 'foul' && (e.a.subType === 'personal' || e.a.subType === 'offensive') && e.a.personId,
    );
    let checked = 0;
    for (const e of evs) {
      const p = g.players.find((x) => x.id === e.a.personId);
      const total = (e.a as unknown as { foulPersonalTotal?: number }).foulPersonalTotal;
      if (!p || total === undefined) continue;
      const mark = foulMarks(p).find((m) => m.t === e.t && m.period === e.period);
      expect(mark, `${p.name} foul at ${e.t}`).toBeDefined();
      expect(mark!.n).toBe(total);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });
});
