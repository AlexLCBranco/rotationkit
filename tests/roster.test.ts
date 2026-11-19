// RK-6: the roster panel on the player page (team = his latest of the season; current roster only).
import { describe, expect, it } from 'vitest';
import { buildAppearances } from '../src/domain/availability.ts';
import { rosterTeams, teamRoster } from '../src/domain/roster.ts';
import type { Game, PlayerGame } from '../src/domain/types.ts';
import { loadSeason, WHOLE_DATA_TIMEOUT } from './data.ts';

const pl = (id: number, team: string, min = 600, played = true): PlayerGame =>
  ({ id, name: `P${id} Last${id}`, team, starter: false, played, min: played ? min : 0, pts: 0, reb: 0, ast: 0, pf: 0, pm: 0, stints: [] }) as PlayerGame;
const game = (id: string, date: string, players: PlayerGame[], inactive: Game['inactive'] = []): Game =>
  ({ id, date, home: { tri: 'AAA' }, away: { tri: 'BBB' }, periods: 4, players, inactive, margin: [], score: [], orphanFouls: [] }) as unknown as Game;

describe('teamRoster / rosterTeams (synthetic)', () => {
  // 1 stays with AAA; 2 is traded AAA → BBB; 3 joins AAA from BBB; 4 is only ever inactive for AAA; 5 never plays.
  const games = [
    game('g1', '2025-10-22', [pl(1, 'AAA', 1800), pl(2, 'AAA', 1200), pl(3, 'BBB', 900), pl(5, 'AAA', 0, false)], [{ id: 4, name: 'P4 Last4', team: 'AAA' }]),
    game('g2', '2025-11-02', [pl(1, 'AAA', 2000), pl(2, 'BBB', 1500), pl(3, 'AAA', 600)], [{ id: 4, name: 'P4 Last4', team: 'AAA' }]),
  ];
  const idx = buildAppearances(games);
  const aaa = games.map((g) => ({ ...g, players: g.players.filter((p) => p.team === 'AAA') }));

  it('lists the current roster, most minutes per game first; traded-away players leave, newcomers and inactive-only stay', () => {
    const r = teamRoster(aaa, 'AAA', idx);
    expect(r.map((x) => x.id)).toEqual([1, 3, 4, 5]);
    expect(r[0]).toMatchObject({ gp: 2, min: 3800 });
    expect(r.find((x) => x.id === 5)).toMatchObject({ gp: 0, min: 0 });
  });
  it('a traded player: his latest team, the earlier ones as "others"', () => {
    expect(rosterTeams(idx, 2, 'AAA')).toEqual({ team: 'BBB', others: ['AAA'] });
    expect(rosterTeams(idx, 1, 'AAA')).toEqual({ team: 'AAA', others: [] });
    // No appearances at all: the page's own team.
    expect(rosterTeams(idx, 4, 'AAA')).toEqual({ team: 'AAA', others: [] });
  });
});

describe('teamRoster (2025-26 data)', () => {
  it(
    'James Harden (LAC → CLE): panel shows CLE, LAC as the other team; he is on CLE\'s roster, not on LAC\'s',
    () => {
      const games = loadSeason('2025-26');
      const idx = buildAppearances(games);
      expect(rosterTeams(idx, 201935, 'LAC')).toEqual({ team: 'CLE', others: ['LAC'] });
      const of = (t: string) => games.filter((g) => g.home.tri === t || g.away.tri === t);
      expect(teamRoster(of('CLE'), 'CLE', idx).map((p) => p.id)).toContain(201935);
      expect(teamRoster(of('LAC'), 'LAC', idx).map((p) => p.id)).not.toContain(201935);
      // Every team: no player on two current rosters.
      const seen = new Map<number, string>();
      for (const t of new Set(games.flatMap((g) => [g.home.tri, g.away.tri])))
        for (const p of teamRoster(of(t), t, idx).filter((x) => x.gp > 0)) {
          expect(seen.get(p.id), `${p.fullName} on ${seen.get(p.id)} and ${t}`).toBeUndefined();
          seen.set(p.id, t);
        }
    },
    WHOLE_DATA_TIMEOUT,
  );
});
