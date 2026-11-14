// Averages "Game by game" view: for each player, his actual stints in the last N games of the selection (newest
// first), or why he did not play.

import { availabilityFor, type AppearanceIndex } from './availability.ts';
import { reasonText } from '../app/labels.ts';
import { REGULATION_LEN } from './time.ts';
import type { Game, Stint } from './types.ts';

export const GAME_BY_GAME = { games: 5 } as const;

export interface GameStrip {
  game: Game;
  /** Opponent tricode and whether this team was at home. */
  opp: string;
  home: boolean;
  /** Regulation stints (the view's axis is Q1–Q4); empty when he did not play. */
  stints: Stint[];
  played: boolean;
  /** Overtime seconds not shown on the axis. */
  otSeconds: number;
  /** Why he did not play: DNP / inactive reason, "Not with the team", or estimated. */
  missed?: string;
}

/** The selection's last `n` games, newest first. */
export const lastGames = (games: Game[], n = GAME_BY_GAME.games) => games.slice(-n).reverse();

export function playerStrips(games: Game[], team: string, player: number, idx: AppearanceIndex): GameStrip[] {
  return games.map((g) => {
    const home = g.home.tri === team;
    const base = { game: g, opp: home ? g.away.tri : g.home.tri, home };
    const p = g.players.find((x) => x.id === player && x.team === team);
    if (p?.played && p.stints.some(([s, e]) => e > s)) {
      const real = p.stints.filter(([s, e]) => e > s);
      return {
        ...base,
        played: true,
        stints: real.filter(([s]) => s < REGULATION_LEN).map(([s, e, pm, f]) => [s, Math.min(e, REGULATION_LEN), pm, ...(f ? [f] : [])] as Stint),
        otSeconds: real.reduce((x, [s, e]) => x + Math.max(0, e - Math.max(s, REGULATION_LEN)), 0),
      };
    }
    const a = availabilityFor(idx, g, team, player, true);
    const inactive = g.inactive?.find((x) => x.id === player && x.team === team);
    const missed =
      a.status === 'dnp'
        ? `DNP${reasonText(p?.reason, p?.reasonDetail) ? ` — ${reasonText(p?.reason, p?.reasonDetail)}` : ''}`
        : a.status === 'out'
          ? `Inactive${inactive && reasonText(inactive.reason, inactive.reasonDetail) ? ` — ${reasonText(inactive.reason, inactive.reasonDetail)}` : a.source === 'rule' ? ' (estimated)' : ''}`
          : 'Not with the team';
    return { ...base, played: false, stints: [], otSeconds: 0, missed };
  });
}
