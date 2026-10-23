// Step 3: data-integrity checks against committed real-game fixtures.

import { describe, expect, it } from 'vitest';
import { fixtureIds, loadFixtureGame, loadRawFixture } from './fixtures.ts';
import { validateGame, type CheckName } from '../src/domain/validate.ts';
import { periodStart } from '../src/domain/time.ts';
import { compareStints } from '../src/domain/compareStints.ts';

const CHECKS: [CheckName[], string][] = [
  [['minutes'], 'summed stint time = box-score minutes (±1s)'],
  [['five-on-court'], 'exactly 5 players per team on court at every moment'],
  [['fouls'], 'fouls across stints = box-score PF'],
  [['plus-minus'], 'sum of stint +/- = box-score +/-'],
  [['overlap', 'stint-bounds'], 'no overlapping stints; stints inside period bounds'],
  [['dnp-stints', 'played-no-stints'], 'did-not-play players have zero stints (and players who played have some)'],
];

describe('fixture coverage', () => {
  const games = fixtureIds.map(loadFixtureGame);
  it('has at least 5 fixture games', () => expect(games.length).toBeGreaterThanOrEqual(5));
  it('includes an overtime game', () => expect(games.some((g) => g.periods > 4)).toBe(true));
  it('includes a game where a full period without events was resolved from box minutes', () =>
    expect(games.some((g) => g.stintNotes?.some((n) => n.includes('played the full period with no event')))).toBe(true));
  it('includes a blowout (margin ≥ 20 in Q4)', () =>
    expect(games.some((g) => g.margin.some(([t, m]) => t >= periodStart(4) && Math.abs(m) >= 20))).toBe(true));
});

describe.each(fixtureIds)('game %s', (id) => {
  const g = loadFixtureGame(id);
  const issues = validateGame(g);
  it.each(CHECKS)('%j: %s', (checks) => {
    expect(issues.filter((i) => checks.includes(i.check))).toEqual([]);
  });
  // Cross-check against gamerotation's own per-stint +/-. PT_DIFF is occasionally wrong itself
  // (0022600002: Brunson's last 7.7s, PT_DIFF -2 while the box score agrees with 0), so a mismatch
  // is only accepted for a player whose PT_DIFF total disagrees with the box score.
  it('Path B stints match gamerotation exactly (when the fixture has it)', () => {
    const raw = loadRawFixture(id);
    if (raw.gamerotation) expect(compareStints(g, raw.gamerotation)).toEqual([]);
  });
  it('stint reconstruction needed no unresolved fixes', () => {
    expect((g.stintNotes ?? []).filter((n) => !n.includes('played the full period with no event'))).toEqual([]);
  });
  it('stint +/- matches gamerotation PT_DIFF (where PT_DIFF agrees with box score)', () => {
    const raw = loadRawFixture(id);
    if (!raw.gamerotation) return;
    const bad: string[] = [];
    const ptSum = new Map<number, number>();
    for (const set of raw.gamerotation!.resultSets) {
      const [iP, iD] = [set.headers.indexOf('PERSON_ID'), set.headers.indexOf('PT_DIFF')];
      for (const r of set.rowSet) ptSum.set(Number(r[iP]), (ptSum.get(Number(r[iP])) ?? 0) + Number(r[iD]));
    }
    for (const set of raw.gamerotation!.resultSets) {
      const h = (k: string) => set.headers.indexOf(k);
      for (const r of set.rowSet) {
        const p = g.players.find((x) => x.id === Number(r[h('PERSON_ID')]))!;
        const [a, b] = [Number(r[h('IN_TIME_REAL')]) / 10, Number(r[h('OUT_TIME_REAL')]) / 10];
        const mine = p.stints.filter((s) => s[0] >= a - 0.01 && s[1] <= b + 0.01).reduce((x, s) => x + s[2], 0);
        if (mine !== Number(r[h('PT_DIFF')]) && ptSum.get(p.id) === p.pm) bad.push(`${p.name} [${a},${b}] ${mine} vs ${r[h('PT_DIFF')]}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('final margin matches final score', () => {
    expect(g.margin[g.margin.length - 1]![1]).toBe(g.home.score - g.away.score);
  });
});
