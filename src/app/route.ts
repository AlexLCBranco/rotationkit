// App state lives in the URL hash so views are linkable and the back button works.
//   #/team/ORL?s=2025-26&w=10&v=home&b=0&p=1630532&m=without
//   #/player/ORL/1630532?…same filters
//   #/game/0022500093?t=ORL&s=2025-26…  main screen: a team's game (t = whose games the picker lists)
//   #/q4/0022500093?t=ORL…               same game, Q4 tab (4th quarter + OT only)
//   #/ (empty) → the main screen with the remembered team's latest game

import { useEffect, useState } from 'react';
import type { Filters, Venue, Window } from '../domain/patterns.ts';

export type Route =
  | { view: 'team'; team: string | null; season: string | null; filters: Filters; vs?: string | null }
  | { view: 'player'; team: string; player: number; season: string | null; filters: Filters }
  | { view: 'game'; game: string; team: string | null; season: string | null; filters: Filters; tab?: 'games' | 'q4' };

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
  if (parts[0] === 'game' && parts[1]) return { view: 'game', game: parts[1], team: t, season, filters };
  if (parts[0] === 'q4') return { view: 'game', game: parts[1] ?? 'latest', team: t, season, filters, tab: 'q4' };
  if (parts[0] === 'team') return { view: 'team', team: parts[1] ?? null, season, filters, vs: q.get('vs') };
  return { view: 'game', game: 'latest', team: t, season, filters };
}

export function format(r: Route): string {
  const q = new URLSearchParams();
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
  if (r.view === 'team' && r.vs) q.set('vs', r.vs);
  const qs = q.toString() ? `?${q}` : '';
  if (r.view === 'player') return `#/player/${r.team}/${r.player}${qs}`;
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
