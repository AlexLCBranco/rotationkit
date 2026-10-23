// normalizeGame on a tiny hand-made one-period game where the right answer is obvious.

import { describe, expect, it } from 'vitest';
import { normalizeGame } from '../src/domain/normalize.ts';
import { stintsFromPbp, type PlayerRef } from '../src/domain/stintsPbp.ts';
import type { Ev } from '../src/domain/pbp.ts';
import { loadFixtureGame } from './fixtures.ts';
import type { RawAction, RawBoxPlayer, RawGame } from '../src/domain/raw.ts';

const HOME = 1;
const AWAY = 2;
const MIN: Record<number, number> = { 11: 300, 16: 420, 12: 720, 13: 720, 14: 720, 15: 720, 21: 500, 26: 220, 22: 720, 23: 720, 24: 720, 25: 720 };
const iso = (sec: number) => `PT${String(Math.floor(sec / 60)).padStart(2, '0')}M${String(sec % 60).padStart(2, '0')}.00S`;
const bp = (id: number, starter: boolean, played = true): RawBoxPlayer => ({
  personId: id,
  name: `P${id}`,
  starter: starter ? '1' : '0',
  played: played ? '1' : '0',
  statistics: { minutes: played ? iso(MIN[id] ?? 0) : '', points: 0, reboundsTotal: 0, assists: 0, foulsPersonal: 0, plusMinusPoints: 0 },
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
    // gamerotation is ignored by normalize (Path B); kept to mirror the real input shape.
    gamerotation: {
      resultSets: [
        { name: 'HomeTeam', headers: HEAD, rowSet: [rot(HOME, 11, 0, 300), rot(HOME, 16, 300, 720), ...[12, 13, 14, 15].map((p) => rot(HOME, p, 0, 720))] },
        { name: 'AwayTeam', headers: HEAD, rowSet: [rot(AWAY, 21, 0, 500), rot(AWAY, 26, 500, 720), ...[22, 23, 24, 25].map((p) => rot(AWAY, p, 0, 720))] },
      ],
    },
    summary: {
      boxScoreSummary: {
        homeTeam: { teamTricode: 'HOM', players: [{ personId: 18, name: 'Hurt Guy' }, ...[11, 12, 13, 14, 15, 16, 17].map((i) => ({ personId: i, name: `P${i}` }))] },
        awayTeam: { teamTricode: 'AWY', players: [21, 22, 23, 24, 25, 26].map((i) => ({ personId: i, name: `P${i}` })) },
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
  it('inactive = roster list minus box score when the box has no inactive players', () => {
    expect(g.inactive).toEqual([{ id: 18, name: 'Hurt Guy', team: 'HOM' }]);
    expect(g.inactiveSource).toBe('roster');
  });
  it('box-score INACTIVE players (with reason) take precedence and are not players', () => {
    const raw = game();
    raw.boxscore.game.awayTeam.players.push({
      ...bp(27, false, false), status: 'INACTIVE', notPlayingReason: 'INACTIVE_INJURY', notPlayingDescription: 'Left Knee; Sprain',
    });
    const g2 = normalizeGame(raw);
    expect(g2.inactiveSource).toBe('box');
    expect(g2.inactive).toEqual([{ id: 27, name: 'P27', team: 'AWY', reason: 'INACTIVE_INJURY', reasonDetail: 'Left Knee; Sprain' }]);
    expect(g2.players.some((p) => p.id === 27)).toBe(false);
  });
  it('no usable roster list → inactive null (appearance rule applies)', () => {
    const raw = game();
    delete raw.summary;
    expect(normalizeGame(raw).inactive).toBeNull();
  });
  it('margin timeline', () => {
    expect(g.margin).toEqual([[0, 0], [100, 2], [300, 4], [500, 3]]);
  });
});

describe('normalizeGame (real 2025-26 box score with inactive players)', () => {
  it('takes inactive players and reasons from the box score', () => {
    const g = loadFixtureGame('0022501147');
    expect(g.inactiveSource).toBe('box');
    expect(g.inactive).toContainEqual({ id: expect.any(Number), name: 'Peyton Watson', last: 'Watson', nameI: 'P. Watson', team: 'DEN', reason: 'INACTIVE_INJURY', reasonDetail: 'Right Hamstring; Strain' });
    expect(g.players.some((p) => p.name === 'Peyton Watson')).toBe(false);
  });
});

describe('stintsFromPbp (Path B)', () => {
  // One team, two periods. P1: 1-5 start, 6 replaces 5 at 300. P2: 1 scores, a bench technical on 5,
  // 2 is subbed out for 7 at 800; 6 plays all of P2 without any event.
  let o = 0;
  const ev = (period: number, t: number, actionType: string, personId: number, subType?: string): Ev => {
    o++;
    return { i: o, period, t, home: 0, away: 0, a: { actionNumber: o, orderNumber: o, clock: '', period, actionType, personId, scoreHome: '0', scoreAway: '0', ...(subType ? { subType } : {}) } };
  };
  const evs = [
    ev(1, 300, 'substitution', 5, 'out'),
    ev(1, 300, 'substitution', 6, 'in'),
    ev(1, 400, 'rebound', 3),
    ev(1, 500, 'turnover', 4),
    ev(2, 750, '2pt', 1),
    ev(2, 760, 'foul', 5, 'technical'),
    ev(2, 770, 'rebound', 3),
    ev(2, 780, 'steal', 4),
    ev(2, 800, 'substitution', 2, 'out'),
    ev(2, 800, 'substitution', 7, 'in'),
  ];
  const ref = (starter: boolean, min: number): PlayerRef => ({ side: 'home', starter, min });
  const players = () =>
    new Map<number, PlayerRef>([
      [1, ref(true, 1440)], [2, ref(true, 800)], [3, ref(true, 1440)], [4, ref(true, 1440)],
      [5, ref(true, 300)], [6, ref(false, 1140)], [7, ref(false, 640)],
    ]);
  const byPlayer = (r: ReturnType<typeof stintsFromPbp>) => {
    const m: Record<number, [number, number][]> = {};
    for (const s of r.stints) (m[s.player] ??= []).push([s.start, s.end]);
    return m;
  };

  it('infers period starters from first involvement and resolves a no-event full period from box minutes', () => {
    const r = stintsFromPbp(evs, players(), 2);
    expect(byPlayer(r)).toEqual({
      1: [[0, 720], [720, 1440]],
      2: [[0, 720], [720, 800]],
      3: [[0, 720], [720, 1440]],
      4: [[0, 720], [720, 1440]],
      5: [[0, 300]],
      6: [[300, 720], [720, 1440]],
      7: [[800, 1440]],
    });
    expect(r.notes).toEqual(['P2 home: 6 played the full period with no event (from box-score minutes)']);
  });

  it('a bench player with a technical foul is not treated as on court', () => {
    const r = stintsFromPbp(evs, players(), 2);
    expect(byPlayer(r)[5]).toEqual([[0, 300]]);
  });

  it('leaves an ambiguous period short and reports it instead of guessing', () => {
    const ps = players();
    ps.set(8, ref(false, 720)); // box says 12 minutes, but never appears in play-by-play
    const r = stintsFromPbp(evs, ps, 2);
    expect(byPlayer(r)[6]).toEqual([[300, 720]]);
    expect(r.notes.some((n) => n.includes('P2 home: 4 starters found, 2 candidates for 1 missing (unresolved)'))).toBe(true);
  });
});
