// "Did not play" only when the player was with the team at the time.

import { describe, expect, it } from 'vitest';
import { availabilityFor, buildAppearances, withTeamByRule } from '../src/domain/availability.ts';
import type { Game, PlayerGame } from '../src/domain/types.ts';

const pl = (id: number, team: string, played = true): PlayerGame => ({
  id, name: `P${id}`, team, starter: false, played, min: played ? 600 : 0, pts: 0, reb: 0, ast: 0, pf: 0, pm: 0, stints: played ? [[0, 600, 0]] : [],
});
const team = (tri: string) => ({ id: 0, tri, name: tri, city: tri, score: 0 });
let n = 0;
const game = (date: string, home: string, away: string, players: PlayerGame[], inactive: Game['inactive'] = null): Game => ({
  id: `00226${String(++n).padStart(5, '0')}`, date, home: team(home), away: team(away), periods: 4, players, inactive, margin: [[0, 0]], score: [[0, 0, 0]], orphanFouls: [],
});

// Player 7: plays for AAA in g1-g2, traded, debuts for BBB in g5. Player 8 (AAA): injured after g2.
// Player 9 (AAA): debuts in g4. Player 10 (AAA): DNP coach's decision in g3.
const g1 = game('2026-10-21', 'AAA', 'BBB', [pl(7, 'AAA'), pl(8, 'AAA'), pl(10, 'AAA'), pl(20, 'BBB')]);
const g2 = game('2026-10-23', 'AAA', 'CCC', [pl(7, 'AAA'), pl(8, 'AAA'), pl(10, 'AAA')]);
const g3 = game('2026-10-25', 'BBB', 'AAA', [pl(10, 'AAA', false), pl(20, 'BBB')]); // 7 traded, not yet with BBB in box
const g4 = game('2026-10-27', 'AAA', 'DDD', [pl(9, 'AAA'), pl(10, 'AAA')]);
const g5 = game('2026-10-29', 'BBB', 'CCC', [pl(7, 'BBB'), pl(20, 'BBB')]);
const g6 = game('2026-10-31', 'AAA', 'EEE', [pl(9, 'AAA'), pl(10, 'AAA')]);
const games = [g1, g2, g3, g4, g5, g6];
const idx = buildAppearances(games);
const st = (g: Game, tri: string, id: number, official = false) => availabilityFor(idx, g, tri, id, official);

describe('appearance rule', () => {
  it('traded player: with old team before the trade, new team after, never "out" for new team before arriving', () => {
    expect(st(g1, 'AAA', 7).status).toBe('played');
    expect(st(g2, 'AAA', 7).status).toBe('played');
    // after last AAA game, before first BBB game: still counted with AAA (estimate)
    expect(st(g3, 'AAA', 7)).toEqual({ status: 'out', source: 'rule' });
    expect(st(g3, 'BBB', 7).status).toBe('not-with-team');
    expect(st(g1, 'BBB', 7).status).toBe('not-with-team');
    // appeared for BBB in g5 → no longer with AAA afterwards
    expect(st(g6, 'AAA', 7).status).toBe('not-with-team');
    expect(st(g5, 'BBB', 7).status).toBe('played');
  });

  it('player out injured mid-season stays with his team', () => {
    expect(st(g3, 'AAA', 8)).toEqual({ status: 'out', source: 'rule' });
    expect(st(g4, 'AAA', 8).status).toBe('out');
    expect(st(g6, 'AAA', 8).status).toBe('out');
  });

  it('player who has not debuted yet does not count before his first appearance', () => {
    expect(st(g1, 'AAA', 9).status).toBe('not-with-team');
    expect(st(g3, 'AAA', 9).status).toBe('not-with-team');
    expect(st(g4, 'AAA', 9).status).toBe('played');
  });

  it('player who never appeared for a team is never with it', () => {
    expect(withTeamByRule(idx.get(20), g4, 'AAA')).toBe(false);
    expect(withTeamByRule(undefined, g4, 'AAA')).toBe(false);
  });

  it('in box score but did not play = dnp (from box)', () => {
    expect(st(g3, 'AAA', 10)).toEqual({ status: 'dnp', source: 'box' });
  });

  it('official roster list overrides the rule when preferred and available', () => {
    const g = game('2026-10-26', 'AAA', 'FFF', [pl(10, 'AAA')], [{ id: 9, name: 'P9', team: 'AAA' }]);
    const gs = [...games, g];
    const ix = buildAppearances(gs);
    expect(availabilityFor(ix, g, 'AAA', 9, true)).toEqual({ status: 'out', source: 'official' });
    expect(availabilityFor(ix, g, 'AAA', 9, false).status).toBe('not-with-team'); // rule: not debuted yet
    expect(availabilityFor(ix, g, 'AAA', 8, true)).toEqual({ status: 'not-with-team', source: 'official' });
    expect(availabilityFor(ix, g, 'AAA', 8, false)).toEqual({ status: 'out', source: 'rule' });
  });
});
