// The checks must actually catch broken data (otherwise passing fixtures proves nothing).

import { describe, expect, it } from 'vitest';
import { fixtureIds, loadFixtureGame } from './fixtures.ts';
import { validateGame } from '../src/domain/validate.ts';

const id = fixtureIds[0]!;
const checksOf = (g: ReturnType<typeof loadFixtureGame>) => new Set(validateGame(g).map((i) => i.check));
const starter = (g: ReturnType<typeof loadFixtureGame>) => g.players.find((p) => p.starter && p.stints.length > 1)!;

describe('validateGame detects', () => {
  it('a clean fixture has no issues', () => expect(validateGame(loadFixtureGame(id))).toEqual([]));

  it('missing stint → minutes, five-on-court, plus-minus', () => {
    const g = loadFixtureGame(id);
    const p = starter(g);
    p.stints.splice(0, 1);
    const c = checksOf(g);
    expect(c.has('minutes')).toBe(true);
    expect(c.has('five-on-court')).toBe(true);
  });

  it('wrong foul count', () => {
    const g = loadFixtureGame(id);
    const p = starter(g);
    p.pf += 1;
    expect(checksOf(g).has('fouls')).toBe(true);
  });

  it('orphan foul', () => {
    const g = loadFixtureGame(id);
    g.orphanFouls.push({ player: starter(g).id, t: 100 });
    expect(checksOf(g).has('fouls')).toBe(true);
  });

  it('wrong plus-minus', () => {
    const g = loadFixtureGame(id);
    starter(g).stints[0]![2] += 2;
    expect(checksOf(g).has('plus-minus')).toBe(true);
  });

  it('overlapping stints', () => {
    const g = loadFixtureGame(id);
    const p = starter(g);
    p.stints[1]![0] = p.stints[0]![1] - 5;
    expect(checksOf(g).has('overlap')).toBe(true);
  });

  it('stint crossing a period boundary', () => {
    const g = loadFixtureGame(id);
    const p = g.players.find((x) => x.stints.some((s) => s[1] === 720))!;
    p.stints.find((s) => s[1] === 720)![1] = 730;
    expect(checksOf(g).has('stint-bounds')).toBe(true);
  });

  it('did-not-play player with a stint', () => {
    const g = loadFixtureGame(id);
    const p = g.players.find((x) => !x.played)!;
    p.stints.push([10, 20, 0]);
    expect(checksOf(g).has('dnp-stints')).toBe(true);
  });

  it('player who played but has no stints', () => {
    const g = loadFixtureGame(id);
    starter(g).stints = [];
    expect(checksOf(g).has('played-no-stints')).toBe(true);
  });
});
