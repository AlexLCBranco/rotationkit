// What the browser tab says for each page (RK-9 / RK-16): the page's own part; src/app/site.ts adds the site's name.
// The same words are written into each generated page's <title> and link preview (RK-14), so they are pure functions.

import { shortDate } from './labels.ts';
import type { Route } from './route.ts';
import { teamName } from './teams.ts';
import { seasonOf } from '../domain/season.ts';
import type { GameIndexEntry } from '../domain/types.ts';

const longDate = (iso: string) => `${shortDate(iso)}, ${iso.slice(0, 4)}`;

/** "LAL 112, BOS 108 · Nov 20, 2026 · rotations" (away team first). */
export const gameTitle = (e: Pick<GameIndexEntry, 'date' | 'home' | 'away' | 'hs' | 'as'>) => `${e.away} ${e.as}, ${e.home} ${e.hs} · ${longDate(e.date)} · rotations`;
/** "Paolo Banchero · Orlando Magic · rotations" */
export const playerTitle = (name: string, team: string) => `${name} · ${teamName(team)} · rotations`;
/** "Orlando Magic · 2026-27 · usual rotation" */
export const teamTitle = (team: string, season: string) => `${teamName(team)} · ${season} · usual rotation`;

export interface TitleData {
  /** The season shown. */
  season: string;
  index?: GameIndexEntry[] | undefined;
  playerName?: string | undefined;
}

/** The page part of the tab title; null = the start page (the site's name and description alone). */
export function pageTitle(r: Route, d: TitleData): string | null {
  if (r.view === 'help') return 'How to read this';
  if (r.view === 'leaders') return `Leaders · ${d.season}`;
  if (r.view === 'fullq4') return `Full 4th quarters · ${d.season}`;
  if (r.view === 'day') return r.day.date ? `Games of ${longDate(r.day.date)}` : 'Games by day';
  if (r.view === 'playerName') return r.name || null;
  if (r.view === 'player') return d.playerName ? playerTitle(d.playerName, r.team) : `${teamName(r.team)} · ${d.season}`;
  if (r.view === 'team') return r.team ? teamTitle(r.team, d.season) : `Averages · ${d.season}`;
  const e = r.game !== 'latest' && seasonOf(r.game) === d.season ? d.index?.find((x) => x.id === r.game) : undefined;
  if (!e) return r.team ? `${teamName(r.team)} · games` : null;
  return gameTitle(e) + (r.tab === 'q4' ? ' · 4th quarter' : '');
}
