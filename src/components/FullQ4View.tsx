// Full Q4 tab: who played the entire regulation 4th quarter. Left: one date (default the latest day with finished
// games), grouped by game, with each player's season count. Right: the season leaderboard (count, games played, %).
// Everything from quarters.json (src/domain/fullQ4.ts); the index only adds scores and team ids for logos.

import { useMemo, useState } from 'react';
import { loadIndex, loadQuarters } from '../app/data.ts';
import { useAsync } from '../app/hooks.ts';
import { formatMin } from '../app/labels.ts';
import { format, type FullQ4Query, type Nav, type Route } from '../app/route.ts';
import { tabRoute } from '../app/tabs.ts';
import { teamColor } from '../app/teams.ts';
import { fullQ4Day, gameDates, leaderboard, seasonCounts, type DayPlayer, type FullQ4Threshold } from '../domain/fullQ4.ts';
import { GARBAGE_RULE } from './LeadersView.tsx';
import { Header } from './Header.tsx';
import { Headshot, TeamLogo } from './Headshot.tsx';
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
  const data = useAsync(async () => {
    const [file, index] = await Promise.all([loadQuarters(season), loadIndex(season)]);
    return { file, index: new Map(index.map((e) => [e.id, e])) };
  }, [season]);
  const set = (patch: Partial<FullQ4Query>, s?: string) => nav({ ...route, season: s ?? season, fullq4: { ...q, ...patch } });
  const [showAll, setShowAll] = useState(false);
  const opts = { threshold: q.threshold, noBlowouts: q.noBlowouts };

  const c = useMemo(() => {
    if (data.status !== 'ok') return null;
    const { file } = data.value;
    const dates = gameDates(file);
    const date = q.date && dates.includes(q.date) ? q.date : (dates[dates.length - 1] ?? null);
    const counts = seasonCounts(file, opts);
    return { dates, date, counts, board: leaderboard(counts), day: date ? fullQ4Day(file, date, opts) : [] };
  }, [data, q.date, q.threshold, q.noBlowouts]); // eslint-disable-line react-hooks/exhaustive-deps

  const seg = <T extends string>(label: string, value: T, options: [T, string][], on: (v: T) => void) => (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} aria-pressed={value === v} onClick={() => on(v)}>
          {l}
        </button>
      ))}
    </div>
  );
  const i = c?.date ? c.dates.indexOf(c.date) : -1;
  const prev = c && i > 0 ? c.dates[i - 1] : undefined;
  const next = c && i >= 0 && i < c.dates.length - 1 ? c.dates[i + 1] : undefined;
  const gameHref = (id: string) => format({ view: 'game', game: id, team: null, season, filters: route.filters });

  const playerLine = (p: DayPlayer) => (
    <li key={p.id} className="fq-player" data-testid="fq-player" data-player={p.id} data-team={p.team}>
      <Headshot id={p.id} name={p.name} />
      <PlayerLink id={p.id} team={p.team} className="fq-name">
        {p.name}
      </PlayerLink>
      {q.threshold === '11' && <span className="muted fq-q4">{formatMin(p.q4)}</span>}
      <span className="fq-count" title={`Full 4th quarters (${thLabel(q.threshold)}) this season, all games so far`} data-testid="fq-season-count">
        {c?.counts.get(p.id)?.full ?? 0} this season
      </span>
    </li>
  );

  return (
    <div className="page wide">
      <Header>
        <Tabs active="fullq4" go={(x) => nav(tabRoute(x, { team, season, filters: route.filters }))} />
      </Header>
      <div className="filters fq-filters">
        <label className="field">
          <span>Season</span>
          <select value={season} aria-label="Season" onChange={(e) => set({ date: null }, e.target.value)}>
            {[...seasons].reverse().map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {seg('Minutes in the 4th', q.threshold, [['full', '12:00 exact'], ['11', '11:00+']], (v) => set({ threshold: v }))}
        <label className="toggle" title={`Leaves out games with garbage time in the 4th quarter: ${GARBAGE_RULE}`}>
          <input type="checkbox" checked={q.noBlowouts} onChange={(e) => set({ noBlowouts: e.target.checked })} />
          <span>Exclude blowouts</span>
        </label>
      </div>
      <p className="muted ld-note" data-testid="fq-note">
        Players on court for {q.threshold === 'full' ? 'the entire regulation 4th quarter (12:00)' : 'at least 11:00 of the regulation 4th quarter'}. Overtime never counts.
        {q.noBlowouts ? ' Games with 4th-quarter garbage time are left out (they count neither as played nor as full).' : ''}
      </p>
      {data.status === 'loading' && <p className="muted">Loading…</p>}
      {data.status === 'error' && <p className="error">Could not load: {data.error}</p>}
      {c && (
        <div className="fq-layout">
          <section className="fq-day" aria-label="By date">
            <div className="fq-datebar">
              <button className="gp-arrow" disabled={!prev} onClick={() => prev && set({ date: prev })} aria-label="Previous day" data-testid="fq-prev">
                ◀
              </button>
              <input
                type="date"
                aria-label="Date"
                data-testid="fq-date"
                value={c.date ?? ''}
                min={c.dates[0]}
                max={c.dates[c.dates.length - 1]}
                onChange={(e) => e.target.value && set({ date: e.target.value })}
              />
              <button className="gp-arrow" disabled={!next} onClick={() => next && set({ date: next })} aria-label="Next day" data-testid="fq-next">
                ▶
              </button>
              {q.date && c.date !== q.date && <span className="muted">No games on {q.date}; showing {c.date}.</span>}
            </div>
            {c.day.length === 0 && <p className="muted">No games.</p>}
            {c.day.map((g) => {
              const e = data.status === 'ok' ? data.value.index.get(g.id) : undefined;
              const side = (tri: string, id: number | undefined, list: DayPlayer[], score: number | undefined) => (
                <div className="fq-team" data-testid="fq-team" data-team={tri}>
                  <div className="fq-team-head">
                    <TeamLogo teamId={id ?? 0} tri={tri} />
                    <TeamLink team={tri}>{tri}</TeamLink>
                    {score !== undefined && <span className="muted">{score}</span>}
                  </div>
                  {g.excluded ? null : list.length ? <ul>{list.map(playerLine)}</ul> : <p className="muted fq-none">Nobody</p>}
                </div>
              );
              return (
                <article key={g.id} className="fq-game" data-testid="fq-game" data-game={g.id}>
                  <header>
                    <a className="link" href={gameHref(g.id)}>
                      {g.away} @ {g.home}
                    </a>
                    {e && e.periods > 4 && <span className="muted"> · {e.periods === 5 ? 'OT' : `${e.periods - 4}OT`} (regulation 4th only)</span>}
                    {g.excluded && (
                      <span className="muted" data-testid="fq-excluded">
                        {' '}
                        · blowout, left out
                      </span>
                    )}
                  </header>
                  <div className="fq-sides">
                    {side(g.away, e?.aid, g.away5, e?.as)}
                    {side(g.home, e?.hid, g.home5, e?.hs)}
                  </div>
                </article>
              );
            })}
          </section>
          <section className="fq-board" aria-label="Season leaderboard">
            <h2>
              Season leaderboard <span className="muted">· {season} · {thLabel(q.threshold)}</span>
            </h2>
            <div className="table-wrap">
              <table className="tbl" data-testid="fq-table">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>Player</th>
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
