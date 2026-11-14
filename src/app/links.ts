// Where player and team names link to (src/components/Links.tsx). Pure, so it is unit-tested.
//   player → his page for that season (#/player/TEAM/ID), current filters kept
//   team   → that team's Averages view (#/team/TEAM), current filters kept

import type { Filters } from '../domain/patterns.ts';
import { format } from './route.ts';

/** What the current screen knows: its season, filters and team (whose with/without filter it is). */
export interface LinkContext {
  season: string;
  filters: Filters;
  team: string | null;
}

/** The current filters for a view of `team`: a with/without filter names a team-mate, so it only carries over to his own team. */
export function carryFilters(c: LinkContext, team: string): Filters {
  if (!c.filters.withWithout || c.team === team) return c.filters;
  const { withWithout: _, ...rest } = c.filters;
  return rest;
}

export const playerHref = (c: LinkContext, p: { id: number; team: string; season?: string }) =>
  format({ view: 'player', team: p.team, player: p.id, season: p.season ?? c.season, filters: carryFilters(c, p.team) });

export const teamHref = (c: LinkContext, team: string, season?: string) =>
  format({ view: 'team', team, season: season ?? c.season, filters: carryFilters(c, team) });
