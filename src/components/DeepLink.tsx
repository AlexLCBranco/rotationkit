// ?game=<NBA gameId>: open that game's chart if rotationkit has data for it, otherwise say so clearly.

import { useEffect } from 'react';
import { loadIndex, loadSchedule } from '../app/data.ts';
import { useAsync } from '../app/hooks.ts';
import { shortDate } from '../app/labels.ts';
import type { Route } from '../app/route.ts';
import { teamName } from '../app/teams.ts';
import { DEFAULT_FILTERS } from '../domain/patterns.ts';
import { seasonOf } from '../domain/season.ts';
import type { ScheduleEntry } from '../domain/types.ts';

type Resolution = { found: true; season: string } | { found: false; entry?: ScheduleEntry };

async function resolve(id: string, seasons: string[]): Promise<Resolution> {
  if (!/^\d{10}$/.test(id)) return { found: false };
  const season = seasonOf(id);
  if (!seasons.includes(season)) return { found: false };
  const index = await loadIndex(season);
  if (index.some((e) => e.id === id)) return { found: true, season };
  const entry = (await loadSchedule(season).catch(() => [])).find((e) => e.id === id);
  return entry ? { found: false, entry } : { found: false };
}

export function DeepLink({ id, seasons, nav }: { id: string; seasons: string[]; nav: (r: Route) => void }) {
  const r = useAsync(() => resolve(id, seasons), [id]);
  useEffect(() => {
    if (r.status === 'ok' && r.value.found) {
      // Drop ?game= from the URL and show the chart; the back button then leads into the app.
      history.replaceState(null, '', `${location.pathname}#/game/${id}?s=${r.value.season}`);
      nav({ view: 'game', game: id, team: null, season: r.value.season, filters: DEFAULT_FILTERS });
    }
  }, [r, id, nav]);

  if (r.status === 'loading' || (r.status === 'ok' && r.value.found)) return <div className="page muted">Loading game {id}…</div>;
  const entry = r.status === 'ok' && !r.value.found ? r.value.entry : undefined;
  const team = (tri: string) => (tri ? teamName(tri) : 'TBD');
  return (
    <div className="page">
      <div className="unavailable" data-testid="deeplink-unavailable">
        <h1>Rotation data not available for this game yet</h1>
        {entry ? (
          <p data-testid="deeplink-matchup">
            {team(entry.away)} @ {team(entry.home)} · {shortDate(entry.date)}, {entry.date.slice(0, 4)}
            {entry.label ? <span className="muted"> · {entry.label}</span> : null}
            <br />
            <span className="muted">
              {entry.status === 'final'
                ? 'The game is final; its rotation data has not been added yet.'
                : entry.status === 'live'
                  ? 'The game is in progress. Rotation data is added after it ends.'
                  : 'The game has not been played yet.'}
            </span>
          </p>
        ) : (
          <p className="muted">
            {/^\d{10}$/.test(id) ? `No game ${id} in rotationkit's data.` : `“${id}” is not an NBA game ID (expected 10 digits, e.g. 0022600123).`}
          </p>
        )}
        <p>
          <a href={location.pathname}>Open rotationkit</a>
        </p>
      </div>
    </div>
  );
}
