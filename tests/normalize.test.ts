// normalizeGame on a tiny hand-made one-period game where the right answer is obvious.

import { describe, expect, it } from 'vitest';
import { normalizeGame } from '../src/domain/normalize.ts';
import type { RawAction, RawBoxPlayer, RawGame } from '../src/domain/raw.ts';

const HOME = 1;
const AWAY = 2;
const bp = (id: number, starter: boolean, played = true): RawBoxPlayer => ({
  personId: id,
  name: `P${id}`,
  starter: starter ? '1' : '0',
  played: played ? '1' : '0',
  statistics: { minutes: '', points: 0, reboundsTotal: 0, assists: 0, foulsPersonal: 0, plusMinusPoints: 0 },
});
let order = 0;
const clock = (t: number) => `PT${String(Math.floor((720 - t) / 60)).padStart(2, '0')}M${String((720 - t) % 60).padStart(2, '0')}.00S`;
const act = (t: number, actionType: string, score: [number, number], extra: Partial<RawAction> = {}): RawAction => ({
  actionNumber: ++order,
  orderNumber: order * 10,
  clock: clock(t),
  period: 1,
  actionType,
  scoreHome: String(score[0]),
  scoreAway: String(score[1]),
  ...extra,
});
const rot = (team: number, person: number, a: number, b: number) => ['G', team, '', '', person, '', '', a * 10, b * 10, 0, 0, 0];
const HEAD = ['GAME_ID', 'TEAM_ID', 'TEAM_CITY', 'TEAM_NAME', 'PERSON_ID', 'PLAYER_FIRST', 'PLAYER_LAST', 'IN_TIME_REAL', 'OUT_TIME_REAL', 'PLAYER_PTS', 'PT_DIFF', 'USG_PCT'];

// Home 11..15 start, 16 replaces 11 at t=300. Away 21..25 start, 26 replaces 21 at t=500. 17 DNP.
function game(): RawGame {
  const actions: RawAction[] = [
    act(0, 'period', [0, 0], { subType: 'start' }),
    act(100, '2pt', [2, 0], { personId: 12 }),
    // Foul before the sub, then FT1, sub, FT2: both free throws belong to the outgoing player 11.
    act(300, 'foul', [2, 0], { subType: 'personal', personId: 22 }),
    act(300, 'freethrow', [3, 0], { personId: 12 }),
    act(300, 'substitution', [3, 0], { subType: 'out', personId: 11 }),
    act(300, 'substitution', [3, 0], { subType: 'in', personId: 16 }),
    act(300, 'freethrow', [4, 0], { personId: 12 }),
    // Sub first, then a technical foul and its free throw: credited to the new lineup (26 in, 21 out).
    act(500, 'substitution', [4, 0], { subType: 'out', personId: 21 }),
    act(500, 'substitution', [4, 0], { subType: 'in', personId: 26 }),
    act(500, 'foul', [4, 0], { subType: 'technical', personId: 13 }),
    act(500, 'freethrow', [4, 1], { personId: 26 }),
    act(650, 'foul', [4, 1], { subType: 'offensive', personId: 16 }),
    act(720, 'period', [4, 1], { subType: 'end' }),
  ];
  return {
    boxscore: {
      game: {
        gameId: '0029900001',
        gameEt: '2026-01-01T19:00:00-05:00',
        gameStatus: 3,
        period: 1,
        homeTeam: { teamId: HOME, teamName: 'Home', teamCity: 'H', teamTricode: 'HOM', score: 4, players: [11, 12, 13, 14, 15].map((i) => bp(i, true)).concat([bp(16, false), bp(17, false, false)]) },
        awayTeam: { teamId: AWAY, teamName: 'Away', teamCity: 'A', teamTricode: 'AWY', score: 1, players: [21, 22, 23, 24, 25].map((i) => bp(i, true)).concat([bp(26, false)]) },
      },
    },
    playbyplay: { game: { gameId: '0029900001', actions } },
    gamerotation: {
      resultSets: [
        { name: 'HomeTeam', headers: HEAD, rowSet: [rot(HOME, 11, 0, 300), rot(HOME, 16, 300, 720), ...[12, 13, 14, 15].map((p) => rot(HOME, p, 0, 720))] },
        { name: 'AwayTeam', headers: HEAD, rowSet: [rot(AWAY, 21, 0, 500), rot(AWAY, 26, 500, 720), ...[22, 23, 24, 25].map((p) => rot(AWAY, p, 0, 720))] },
      ],
    },
    summary: {
      boxScoreSummary: {
        homeTeam: { teamTricode: 'HOM', players: [{ personId: 18, name: 'Hurt Guy' }, ...[11, 12, 13, 14, 15, 16, 17].map((i) => ({ personId: i, name: `P${i}` }))] },
        awayTeam: { teamTricode: 'AWY', players: [] },
      },
    },
  };
}

describe('normalizeGame (hand-made game)', () => {
  const g = normalizeGame(game());
  const stints = (id: number) => g.players.find((p) => p.id === id)!.stints;

  it('free throws after a sub, from a foul before it, go to the outgoing player', () => {
    expect(stints(11)).toEqual([[0, 300, 4]]);
    expect(stints(16)[0]!.slice(0, 3)).toEqual([300, 720, -1]);
  });
  it('technical free throw after a sub goes to the incoming lineup', () => {
    expect(stints(21)).toEqual([[0, 500, -4]]);
    expect(stints(26)).toEqual([[500, 720, 1]]);
  });
  it('full-period players get the whole margin', () => {
    expect(stints(12)).toEqual([[0, 720, 3]]);
    expect(stints(23)).toEqual([[0, 720, -3]]);
  });
  it('attaches personal/offensive fouls to stints at the exact time; technicals are not PF', () => {
    expect(stints(22)[0]![3]).toEqual([300]);
    expect(stints(16)[0]![3]).toEqual([650]);
    expect(stints(13)[0]![3]).toBeUndefined();
    expect(g.orphanFouls).toEqual([]);
  });
  it('did-not-play player has no stints', () => {
    const p = g.players.find((x) => x.id === 17)!;
    expect(p.played).toBe(false);
    expect(p.stints).toEqual([]);
  });
  it('inactive = roster list minus box score', () => {
    expect(g.inactive).toEqual([{ id: 18, name: 'Hurt Guy', team: 'HOM' }]);
  });
  it('margin timeline', () => {
    expect(g.margin).toEqual([[0, 0], [100, 2], [300, 4], [500, 3]]);
  });
  it('splits stints that cross a period boundary', () => {
    const raw = game();
    raw.boxscore.game.period = 2;
    raw.gamerotation.resultSets[0]!.rowSet[1] = rot(HOME, 16, 300, 900);
    const g2 = normalizeGame(raw);
    expect(g2.players.find((p) => p.id === 16)!.stints.map((s) => s.slice(0, 2))).toEqual([[300, 720], [720, 900]]);
  });
});
