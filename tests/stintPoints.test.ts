// Points per stint (PlayerGame.ptsS) from the play-by-play, and the TV / Cup tags carried from the schedule feed.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fixtureIds, loadFixtureGame, loadRawFixture } from './fixtures.ts';
import { stintIndexFor } from '../src/domain/normalize.ts';
import { toEvents } from '../src/domain/pbp.ts';
import { scheduleChanges, scheduleEntryOf, withScheduleTags } from '../scripts/lib/data.ts';
import { parseSchedule } from '../src/shared/nba-schedule/parse.ts';
import type { GameIndexEntry, Stint } from '../src/domain/types.ts';

const sum = (xs: number[] = []) => xs.reduce((a, b) => a + b, 0);

describe('points per stint (fixtures)', () => {
  for (const id of fixtureIds) {
    it(`${id}: one entry per stint, adding up to his points per period and box-score points`, () => {
      const g = loadFixtureGame(id);
      expect(g.stintPts).toBe(true);
      expect((g.stintNotes ?? []).filter((n) => n.startsWith('points outside'))).toEqual([]);
      for (const p of g.players) {
        if (p.ptsS) expect(p.ptsS.length).toBe(p.stints.length);
        expect([p.name, sum(p.ptsS)]).toEqual([p.name, sum(p.ptsQ)]);
        // Each stint's points come from inside it (its period, its time span).
        (p.ptsS ?? []).forEach((pts, k) => {
          if (pts) expect(p.stints[k]![1]).toBeGreaterThanOrEqual(p.stints[k]![0]);
        });
      }
    });
  }

  it('free throws logged after substitutions at the same clock are credited to the shooter (real case)', () => {
    // 0022500643, 4th quarter, same clock: Brunson fouls Edgecombe; FT 1 of 2; Brunson and McBride sub out, Robinson and
    // Hukporti in; FT 2 of 2; timeout; Brunson back in; Edgecombe fouls Brunson; Embiid out; Brunson FT 1 of 1.
    // Edgecombe stays on court: both FTs in the stint covering that clock. Brunson's FT comes after his own exit and
    // return at that clock: his returning stint (by log order), not lost at the boundary.
    const id = '0022500643';
    const evs = toEvents(loadRawFixture(id).playbyplay.game.actions);
    const g = loadFixtureGame(id);
    const ft = evs.find((e) => e.a.actionType === 'freethrow' && e.a.shotResult === 'Made' && /Brunson away-from-play Free Throw 1 of 1/.test(String((e.a as { description?: string }).description ?? '')))!;
    const brunson = g.players.find((x) => x.id === ft.a.personId)!;
    const back = brunson.stints.findIndex((s) => s[0] === ft.t);
    const before = brunson.stints.findIndex((s) => s[1] === ft.t);
    expect(back).toBeGreaterThan(before);
    expect(before).toBeGreaterThanOrEqual(0);
    expect(brunson.ptsS![back]).toBe(1);
    expect(sum(brunson.ptsS)).toBe(brunson.pts);
    const edge = g.players.find((x) => x.name === 'VJ Edgecombe')!;
    const k = edge.stints.findIndex((s) => s[0] < ft.t && ft.t <= s[1]);
    expect(edge.ptsS![k]).toBeGreaterThanOrEqual(2);
    expect(sum(edge.ptsS)).toBe(edge.pts);
  });

  it('stintIndexFor: log order first; same-clock events after the exit go to the stint ending then; none = -1', () => {
    // Stints in Q1: [0, 300] (in before event 0, out at event 50) and [300, 720] (in at event 60).
    const a: Stint = [0, 300, 0];
    const b: Stint = [300, 720, 0];
    const bounds = new Map<Stint, [number, number]>([
      [a, [-0.5, 50]],
      [b, [60, 200]],
    ]);
    const f = (t: number, i: number) => stintIndexFor([a, b], (s) => bounds.get(s), { t, period: 1, i });
    expect(f(100, 10)).toBe(0);
    expect(f(400, 100)).toBe(1);
    // Free throw at 300 s logged at event 55: after his exit (50), before his return (60) → the stint that ended at 300.
    expect(f(300, 55)).toBe(0);
    // Same clock, logged after the return → the new stint (by order).
    expect(f(300, 61)).toBe(1);
    // Another period, or nowhere near a stint.
    expect(stintIndexFor([a, b], (s) => bounds.get(s), { t: 1000, period: 2, i: 300 })).toBe(-1);
    // Only a stint starting at that clock (he entered and the event was logged before his "in"): that one.
    const c: Stint = [500, 600, 0];
    expect(stintIndexFor([c], () => [80, 90], { t: 500, period: 1, i: 79 })).toBe(0);
  });
});

describe('TV and Cup tags from the schedule feed', () => {
  const s = parseSchedule(JSON.parse(readFileSync('src/shared/nba-schedule/fixture.json', 'utf8')));
  const e = new Map(s.games.map((g) => [g.gameId, scheduleEntryOf(g)]));
  it('national TV abbreviations in feed order; none when the feed has none', () => {
    expect(e.get('0022600001')!.tv).toEqual(['NBC', 'Peacock']);
    expect(e.get('0022600006')!.tv).toEqual(['ESPN']);
    expect(e.get('0022601201')!.tv).toEqual(['Amazon']);
    expect(e.get('0022600015')!.tv).toBeUndefined();
  });
  it('Cup group / knockout from the parser flags', () => {
    expect(e.get('0022600015')!.cup).toBe('group');
    expect(e.get('0022601201')!.cup).toBe('knockout');
    expect(e.get('0022600001')!.cup).toBeUndefined();
    expect(e.get('0022600189')!.cup).toBeUndefined();
  });
  it('index entries get the tags by id; a changed tag counts as a schedule change', () => {
    const idx = [{ id: '0022600001' }, { id: '0022600015' }, { id: '0022699999' }] as GameIndexEntry[];
    expect(withScheduleTags(idx, [...e.values()])).toEqual([{ id: '0022600001', tv: ['NBC', 'Peacock'] }, { id: '0022600015', cup: 'group' }, { id: '0022699999' }]);
    const before = [...e.values()];
    expect(scheduleChanges(before, before.map((x) => (x.id === '0022600006' ? { ...x, tv: ['ESPN', 'ABC'] } : x)))).toBe(1);
  });
});

describe('display', () => {
  it('layoutRow: "12:00 · 8p" inside a bar long enough; plain duration otherwise; off by default', async () => {
    const { layoutRow } = await import('../src/domain/gameChart.ts');
    const g = loadFixtureGame('0022600085');
    const p = [...g.players].sort((a, b) => b.pts - a.pts)[0]!;
    const wide = layoutRow(p, g.periods, 4000, { points: true });
    const k = p.stints.findIndex((s, i) => s[1] - s[0] >= 300 && (p.ptsS![i] ?? 0) > 0);
    const bar = wide.bars.find((b) => b.st === p.stints[k])!;
    expect(bar.label.text).toMatch(new RegExp(` · ${p.ptsS![k]}p$`));
    expect(bar.label.inside).toBe(true);
    const narrow = layoutRow(p, g.periods, 500, { points: true });
    for (const b of narrow.bars) if (b.label.text.includes('p')) expect(b.label.w).toBeLessThanOrEqual(b.w);
    expect(layoutRow(p, g.periods, 4000).bars.every((b) => !b.label.text.includes('p'))).toBe(true);
  });
  it('merging continuous stints sums their points; stintPoints finds a stint\'s points', async () => {
    const { mergeContinuousPts, stintPoints, ptsText } = await import('../src/domain/stints.ts');
    const a: Stint = [2000, 2160, 3];
    const b: Stint = [2160, 2300, -1, [2200]];
    const c: Stint = [2500, 2600, 0];
    expect(mergeContinuousPts([a, b, c], [4, 5, 2])).toEqual({ stints: [[2000, 2300, 2, [2200]], [2500, 2600, 0]], pts: [9, 2] });
    expect(mergeContinuousPts([a, b], null).pts).toBeNull();
    const p = { stints: [a, b], ptsS: [4, 5] } as unknown as import('../src/domain/types.ts').PlayerGame;
    expect(stintPoints(p, b, true)).toBe(5);
    expect(stintPoints(p, [2160, 2300, -1], true)).toBe(5);
    expect(stintPoints(p, b, undefined)).toBeNull();
    expect(stintPoints({ ...p, ptsS: undefined }, a, true)).toBe(0);
    expect([ptsText(null), ptsText(1), ptsText(8)]).toEqual(['', ' · 1 pt', ' · 8 pts']);
  });
});

describe('backfill (scripts/lib/backfill.ts)', () => {
  it('adds ptsS / stintPts only when the stints are identical; nothing else changes', async () => {
    const { addStintPoints } = await import('../scripts/lib/backfill.ts');
    const fresh = loadFixtureGame('0022600088');
    const old = structuredClone(fresh);
    delete old.stintPts;
    for (const p of old.players) delete p.ptsS;
    const r = addStintPoints(old, fresh);
    expect('game' in r && r.game).toEqual(fresh);
    const moved = structuredClone(old);
    moved.players.find((p) => p.stints.length)!.stints[0]![1] += 1;
    expect(addStintPoints(moved, fresh)).toMatchObject({ skip: expect.stringContaining('differ') });
  });
});

describe('committed games with points per stint (whole-data sweep)', () => {
  it(
    'one entry per stint; they add up to his points per period',
    async () => {
      const { sweepGames } = await import('./data.ts');
      for (const g of sweepGames()) {
        if (!g.stintPts) continue;
        for (const p of g.players) {
          if (p.ptsS) expect([g.id, p.id, p.ptsS.length]).toEqual([g.id, p.id, p.stints.length]);
          expect([g.id, p.id, sum(p.ptsS)]).toEqual([g.id, p.id, sum(p.ptsQ)]);
        }
      }
    },
    60_000,
  );
});
