// #/player?name=<full name>[&s=…&w=…]: open a player's page from his name alone (links from other apps, e.g.
// statmuse-builder). Exact name match (src/domain/playerByName.ts); the URL is then replaced by the normal
// #/player/<TEAM>/<id> (no extra history entry, so Back does not loop). No match → a clear message, never a guess.

import { useEffect } from 'react';
import { loadPlayers, loadSeasonAppearances } from '../app/data.ts';
import { useAsync } from '../app/hooks.ts';
import type { Nav, Route } from '../app/route.ts';
import { nameCandidates, pickCandidate, tiedCandidates, type NameCandidate } from '../domain/playerByName.ts';
import type { PlayerIndexEntry } from '../domain/players.ts';
import { SITE_NAME } from '../app/site.ts';

async function resolve(name: string, seasons: string[], preferred: string): Promise<NameCandidate | null> {
  const bySeason = Object.fromEntries(await Promise.all(seasons.map(async (s) => [s, await loadPlayers(s)] as const))) as Record<string, PlayerIndexEntry[]>;
  const cands = nameCandidates(bySeason, name, preferred);
  const tied = tiedCandidates(cands);
  if (tied.length <= 1) return tied[0] ?? null;
  // Same name, same season: the one who appeared most recently.
  const apps = await loadSeasonAppearances(tied[0]!.season);
  return pickCandidate(cands, (c) => {
    const last = apps.get(c.id)?.at(-1);
    return last && `${last.date} ${last.gameId}`;
  });
}

export function PlayerByName({ route, seasons, season, nav }: { route: Extract<Route, { view: 'playerName' }>; seasons: string[]; season: string; nav: Nav }) {
  const r = useAsync(() => resolve(route.name, seasons, season), [route.name, seasons, season]);
  useEffect(() => {
    if (r.status !== 'ok' || !r.value) return;
    const p = r.value;
    // Keep s= if it was given (or needed: a player only found in an older season); the filters pass through.
    const s = route.season || p.season !== seasons[seasons.length - 1] ? p.season : null;
    nav({ view: 'player', team: p.team, player: p.id, season: s, filters: route.filters }, { replace: true });
  }, [r, route, seasons, nav]);

  if (r.status === 'loading' || (r.status === 'ok' && r.value)) return <div className="page muted">Looking up {route.name || 'player'}…</div>;
  return (
    <div className="page">
      <div className="unavailable" data-testid="player-name-unavailable">
        <h1>No rotation data for '{route.name}'</h1>
        <p className="muted">
          {r.status === 'error' ? `Could not load the player list: ${r.error}` : 'We have no player with that full name in any season.'}
        </p>
        <p>
          <a href="/">Open {SITE_NAME}</a>
        </p>
      </div>
    </div>
  );
}
