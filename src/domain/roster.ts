// RK-6: a team's roster for the player page panel, from the season's games and appearances.

import { shortNames } from "../app/names.ts";
import type { AppearanceIndex } from "./availability.ts";
import { teamsOf } from "./players.ts";
import type { Game } from "./types.ts";

export interface RosterEntry {
  id: number;
  /** Short name ("Banchero", "F. Wagner" when two team-mates share the family name). */
  name: string;
  fullName: string;
  /** Games played for this team this season and minutes in them (seconds). */
  gp: number;
  min: number;
}

/** The team whose roster the player page shows: his latest team of the season (others = earlier teams, oldest first). */
export function rosterTeams(
  idx: AppearanceIndex,
  player: number,
  routeTeam: string,
): { team: string; others: string[] } {
  const teams = teamsOf(idx, player);
  const team = teams.at(-1) ?? routeTeam;
  return { team, others: teams.filter((t) => t !== team) };
}

/**
 * The team's current roster in a season: everyone in its box scores whose latest team of the season is this one (players
 * traded away leave it), plus players only ever on its inactive lists. Most minutes per game first (no games last), then by name.
 */
export function teamRoster(
  games: Game[],
  team: string,
  idx: AppearanceIndex,
): RosterEntry[] {
  const people = new Map<
    number,
    { id: number; name: string; last?: string; nameI?: string }
  >();
  const gp = new Map<number, number>();
  const min = new Map<number, number>();
  for (const g of games) {
    for (const p of g.players) {
      if (p.team !== team) continue;
      people.set(p.id, p);
      if (p.played) {
        gp.set(p.id, (gp.get(p.id) ?? 0) + 1);
        min.set(p.id, (min.get(p.id) ?? 0) + p.min);
      }
    }
    for (const p of g.inactive ?? [])
      if (p.team === team && !people.has(p.id)) people.set(p.id, p);
  }
  const current = [...people.values()].filter((p) => {
    const teams = teamsOf(idx, p.id);
    return teams.length ? teams.at(-1) === team : true;
  });
  const names = shortNames(current);
  return current
    .map((p) => ({
      id: p.id,
      name: names.get(p.id) ?? p.name,
      fullName: p.name,
      gp: gp.get(p.id) ?? 0,
      min: min.get(p.id) ?? 0,
    }))
    .sort((a, b) => (b.gp ? b.min / b.gp : -1) - (a.gp ? a.min / a.gp : -1) || a.fullName.localeCompare(b.fullName));
}
