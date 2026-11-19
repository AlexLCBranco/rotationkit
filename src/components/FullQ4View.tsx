// Full Q4 tab: who played the entire regulation 4th quarter, as a season leaderboard (count, games played, %).
// Everything from quarters.json (src/domain/fullQ4.ts). The by-date view moved to the Games tab's By day view.

import { useMemo, useState } from 'react';
import { loadQuarters } from '../app/data.ts';
import { useAsync } from '../app/hooks.ts';
import { type FullQ4Query, type Nav, type Route } from '../app/route.ts';
import { tabRoute } from '../app/tabs.ts';
import { teamColor } from '../app/teams.ts';
import { leaderboard, seasonCounts, type FullQ4Threshold } from '../domain/fullQ4.ts';
import { NoBlowoutsToggle } from './DateBar.tsx';
import { Header } from './Header.tsx';
import { Headshot } from './Headshot.tsx';
import { PlayerLink, TeamLink } from './Links.tsx';
import { Tabs } from './Tabs.tsx';

interface Props {
  seasons: string[];
  season: string;
  team: string;
  route: Extract<Route, { view: 'fullq4' }>;
  nav: Nav;
}

const TOP_ROWS = 50;
const thLabel = (t: FullQ4Threshold) => (t === 'full' ? '12:00' : '11:00+');

export function FullQ4View({ seasons, season, team, route, nav }: Props) {
  const q = route.fullq4;
  const data = useAsync(() => loadQuarters(season), [season]);
  const set = (patch: Partial<FullQ4Query>, s?: string) => nav({ ...route, season: s ?? season, fullq4: { ...q, ...patch } });
  const [showAll, setShowAll] = useState(false);
  const opts = { threshold: q.threshold, noBlowouts: q.noBlowouts };

  const c = useMemo(() => {
    if (data.status !== 'ok') return null;
    return { board: leaderboard(seasonCounts(data.value, opts)) };
  }, [data, q.threshold, q.noBlowouts]); // eslint-disable-line react-hooks/exhaustive-deps

  const seg = <T extends string>(label: string, value: T, options: [T, string][], on: (v: T) => void) => (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} aria-pressed={value === v} onClick={() => on(v)}>
          {l}
        </button>
      ))}
    </div>
  );
  return (
    <div className="page wide">
      <Header>
        <Tabs active="fullq4" go={(x) => nav(tabRoute(x, { team, season, filters: route.filters }))} />
      </Header>
      <div className="filters fq-filters">
        <label className="field">
          <span>Season</span>
          <select value={season} aria-label="Season" onChange={(e) => set({}, e.target.value)}>
            {[...seasons].reverse().map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {seg('Minutes in the 4th', q.threshold, [['full', '12:00 exact'], ['11', '11:00+']], (v) => set({ threshold: v }))}
        <NoBlowoutsToggle checked={q.noBlowouts} onChange={(b) => set({ noBlowouts: b })} />
      </div>
      <p className="muted ld-note" data-testid="fq-note">
        Players on court for {q.threshold === 'full' ? 'the entire regulation 4th quarter (12:00)' : 'at least 11:00 of the regulation 4th quarter'}. Overtime never counts.
        {q.noBlowouts ? ' Games with 4th-quarter garbage time are left out (they count neither as played nor as full).' : ''}
      </p>
      {data.status === 'loading' && <p className="muted">Loading…</p>}
      {data.status === 'error' && <p className="error">Could not load: {data.error}</p>}
      {c && (
        <div className="fq-layout">
          <section className="fq-board" aria-label="Season leaderboard">
            <h2>
              Season leaderboard <span className="muted">· {season} · {thLabel(q.threshold)}</span>
            </h2>
            <div className="table-wrap">
              <table className="tbl" data-testid="fq-table">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th className="name-col">Player</th>
                    <th>Team</th>
                    <th className="num" title="Full 4th quarters">
                      Full Q4
                    </th>
                    <th className="num" title="Games he played">
                      GP
                    </th>
                    <th className="num">%</th>
                  </tr>
                </thead>
                <tbody>
                  {(showAll ? c.board : c.board.slice(0, TOP_ROWS)).map((r, k) => (
                    <tr key={r.id} data-testid="fq-row" data-player={r.id} data-full={r.full} data-gp={r.gp}>
                      <td className="num muted">{k + 1}</td>
                      <td className="ld-player">
                        <Headshot id={r.id} name={r.name} />
                        <PlayerLink id={r.id} team={r.team} className="ld-name">
                          {r.name}
                        </PlayerLink>
                      </td>
                      <td>
                        <span className="swatch" style={{ background: teamColor(r.team) }} /> <TeamLink team={r.team}>{r.team}</TeamLink>
                      </td>
                      <td className="num">
                        <strong>{r.full}</strong>
                      </td>
                      <td className="num">{r.gp}</td>
                      <td className="num">{Math.round(r.pct * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {c.board.length > TOP_ROWS && (
              <button className="link" onClick={() => setShowAll(!showAll)} data-testid="fq-show-all">
                {showAll ? `Show top ${TOP_ROWS}` : `Show all ${c.board.length} players`}
              </button>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
