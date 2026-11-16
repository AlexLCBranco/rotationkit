// App state lives in the URL hash so views are linkable and the back button works.
//   #/team/ORL?s=2025-26&w=10&v=home&b=0&p=1630532&m=without
//   #/player/ORL/1630532?…same filters
//   #/player?name=Luka%20Don%C4%8Di%C4%87&s=…  a player by full name (other apps): resolved, then replaced by the line above
//   #/game/0022500093?t=ORL&s=2025-26…  main screen: a team's game (t = whose games the picker lists)
//   #/game/0022500093?t=ORL&day=2026-11-12  same, opened from By day (previous / next game of that day, back link)
//   #/games?view=day&date=2026-11-12&s=2026-27&nb=1   Games tab, By day (date; nb=1 → No blowouts on the leaders panel)
//   #/q4/0022500093?t=ORL…               same game, Q4 tab (4th quarter + OT only)
//   #/leaders?s=2025-26&w=10&part=h2&ot=1&sort=pts&lt=ORL&gt=1   Leaders tab (lt = team filter, gt=1 keeps garbage time)
//   #/fullq4?s=2026-27&th=11&nb=1   Full Q4 tab (th=11 → 11:00+, nb=1 → exclude blowouts)
//   #/ (empty) → the main screen with the remembered team's latest game

import { useEffect, useState } from 'react';
import type { Filters, Venue, Window } from '../domain/patterns.ts';

export type Route =
  | { view: 'team'; team: string | null; season: string | null; filters: Filters; vs?: string | null }
  | { view: 'player'; team: string; player: number; season: string | null; filters: Filters }
  | { view: 'playerName'; name: string; team: null; season: string | null; filters: Filters }
  | { view: 'game'; game: string; team: string | null; season: string | null; filters: Filters; tab?: 'games' | 'q4'; day?: string | null }
  | { view: 'day'; team: string | null; season: string | null; filters: Filters; day: DayQuery }
  | { view: 'leaders'; team: string | null; season: string | null; filters: Filters; leaders: LeadersQuery }
  | { view: 'fullq4'; team: string | null; season: string | null; filters: Filters; fullq4: FullQ4Query };

/** Games tab, By day. */
export interface DayQuery {
  /** YYYY-MM-DD; null = the latest day with finished games. */
  date: string | null;
  /** Q4 minutes leaders panel only: leave out games with 4th-quarter garbage time (Full Q4's rule). */
  noBlowouts: boolean;
}
export const DEFAULT_DAY: DayQuery = { date: null, noBlowouts: false };
const isDate = (d: string | null): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

export const DEFAULT_FULLQ4: FullQ4Query = { threshold: 'full', noBlowouts: false };

/** Full Q4 tab settings (season leaderboard; the by-date view is the Games tab's By day). */
export interface FullQ4Query {
  threshold: 'full' | '11';
  noBlowouts: boolean;
}

export const DEFAULT_LEADERS: LeadersQuery = { part: 'q4', ot: false, sort: 'min', only: null, noGarbage: true };

/** Leaders tab settings (window comes from filters.window). */
export interface LeadersQuery {
  part: 'q4' | 'h2';
  ot: boolean;
  sort: 'min' | 'pts';
  /** Only this team's players; null = all teams. */
  only: string | null;
  /** Leave out garbage time (default on; `gt=1` in the URL keeps it). */
  noGarbage: boolean;
}

export function parse(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const q = new URLSearchParams(query);
  const w = q.get('w');
  const window: Window = w === '5' ? 5 : w === '10' ? 10 : 'season';
  const v = q.get('v');
  const venue: Venue = v === 'home' || v === 'away' ? v : 'all';
  const p = Number(q.get('p'));
  const m = q.get('m');
  const rest = q.get('rest');
  const filters: Filters = {
    window,
    venue,
    ...(rest === 'b2b' || rest === 'rested' ? { rest } : {}),
    blowout: q.get('b') !== '0',
    ...(p && (m === 'with' || m === 'without') ? { withWithout: { player: p, mode: m } } : {}),
  };
  const season = q.get('s');
  const t = q.get('t');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'player' && parts[1] && Number(parts[2])) return { view: 'player', team: parts[1], player: Number(parts[2]), season, filters };
  if (parts[0] === 'player' && !parts[1]) return { view: 'playerName', name: (q.get('name') ?? '').trim(), team: null, season, filters };
  const day = q.get('day');
  const from = isDate(day) ? { day } : {};
  if (parts[0] === 'game' && parts[1]) return { view: 'game', game: parts[1], team: t, season, filters, ...from };
  if (parts[0] === 'q4') return { view: 'game', game: parts[1] ?? 'latest', team: t, season, filters, tab: 'q4', ...from };
  if (parts[0] === 'games') {
    const date = q.get('date');
    if (q.get('view') === 'day') return { view: 'day', team: t, season, filters, day: { date: isDate(date) ? date : null, noBlowouts: q.get('nb') === '1' } };
    return { view: 'game', game: 'latest', team: t, season, filters };
  }
  if (parts[0] === 'leaders')
    return {
      view: 'leaders',
      team: t,
      season,
      filters,
      leaders: { part: q.get('part') === 'h2' ? 'h2' : 'q4', ot: q.get('ot') === '1', sort: q.get('sort') === 'pts' ? 'pts' : 'min', only: q.get('lt'), noGarbage: q.get('gt') !== '1' },
    };
  if (parts[0] === 'fullq4') return { view: 'fullq4', team: t, season, filters, fullq4: { threshold: q.get('th') === '11' ? '11' : 'full', noBlowouts: q.get('nb') === '1' } };
  if (parts[0] === 'team') return { view: 'team', team: parts[1] ?? null, season, filters, vs: q.get('vs') };
  return { view: 'game', game: 'latest', team: t, season, filters };
}

export function format(r: Route): string {
  const q = new URLSearchParams();
  if (r.view === 'day') q.set('view', 'day');
  if (r.view === 'day' && r.day.date) q.set('date', r.day.date);
  if (r.view === 'playerName') q.set('name', r.name);
  if (r.season) q.set('s', r.season);
  if (r.filters.window !== 'season') q.set('w', String(r.filters.window));
  if (r.filters.venue !== 'all') q.set('v', r.filters.venue);
  if (r.filters.rest) q.set('rest', r.filters.rest);
  if (!r.filters.blowout) q.set('b', '0');
  if (r.filters.withWithout) {
    q.set('p', String(r.filters.withWithout.player));
    q.set('m', r.filters.withWithout.mode);
  }
  if (r.view === 'game' && r.team) q.set('t', r.team);
  if (r.view === 'game' && r.day) q.set('day', r.day);
  if (r.view === 'day') {
    if (r.team) q.set('t', r.team);
    if (r.day.noBlowouts) q.set('nb', '1');
  }
  if (r.view === 'team' && r.vs) q.set('vs', r.vs);
  if (r.view === 'leaders') {
    if (r.team) q.set('t', r.team);
    if (r.leaders.part === 'h2') q.set('part', 'h2');
    if (r.leaders.ot) q.set('ot', '1');
    if (r.leaders.sort === 'pts') q.set('sort', 'pts');
    if (r.leaders.only) q.set('lt', r.leaders.only);
    if (!r.leaders.noGarbage) q.set('gt', '1');
  }
  if (r.view === 'fullq4') {
    if (r.team) q.set('t', r.team);
    if (r.fullq4.threshold === '11') q.set('th', '11');
    if (r.fullq4.noBlowouts) q.set('nb', '1');
  }
  const qs = q.toString() ? `?${q}` : '';
  if (r.view === 'player') return `#/player/${r.team}/${r.player}${qs}`;
  if (r.view === 'playerName') return `#/player${qs}`;
  if (r.view === 'leaders') return `#/leaders${qs}`;
  if (r.view === 'fullq4') return `#/fullq4${qs}`;
  if (r.view === 'day') return `#/games${qs}`;
  if (r.view === 'game') return `#/${r.tab === 'q4' ? 'q4' : 'game'}/${r.game}${qs}`;
  return `#/team/${r.team ?? ''}${qs}`;
}

export type Nav = (r: Route, opts?: { replace?: boolean }) => void;

export function useRoute(): [Route, Nav] {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(location.hash));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  // Update state synchronously too, so a quick second change builds on the first one.
  return [
    route,
    (r, opts) => {
      setRoute(r);
      // replace: fix up the URL (e.g. "latest" → the game id) without adding a history entry.
      if (opts?.replace) location.replace(format(r));
      else location.hash = format(r);
    },
  ];
}
