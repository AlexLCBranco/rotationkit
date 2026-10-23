import { useMemo, useState } from 'react';
import { appearanceIndex, loadTeamGames } from '../app/data.ts';
import { useAsync } from '../app/hooks.ts';
import { formatMin, reasonText, shortDate } from '../app/labels.ts';
import type { Route } from '../app/route.ts';
import { teamColor, teamName } from '../app/teams.ts';
import { playerGames, selectGames, type Filters as F } from '../domain/patterns.ts';
import { periodEnd } from '../domain/time.ts';
import type { Stint } from '../domain/types.ts';
import { AxisLabels } from './Axis.tsx';
import { Filters } from './Filters.tsx';
import { Header } from './Header.tsx';
import { describeStint, StintBars } from './Stints.tsx';
import { rosterOf, SelectionSummary } from './TeamView.tsx';

interface Props {
  seasons: string[];
  season: string;
  route: Extract<Route, { view: 'player' }>;
  nav: (r: Route) => void;
}

export function PlayerView({ seasons, season, route, nav }: Props) {
  const { team, player } = route;
  const ww = route.filters.withWithout;
  const data = useAsync(async () => {
    const games = await loadTeamGames(season, team);
    return { games, idx: ww ? await appearanceIndex(season, games) : undefined };
  }, [season, team, !!ww]);
  const [hover, setHover] = useState<{ game: string; stint: Stint } | null>(null);
  const go = (patch: { season?: string; filters?: F }) => nav({ ...route, season: patch.season ?? season, filters: patch.filters ?? route.filters });

  const c = useMemo(() => {
    if (data.status !== 'ok') return null;
    const { games, idx } = data.value;
    const roster = rosterOf(games, team);
    const sel = selectGames(games, season, team, route.filters, idx);
    const rows = playerGames(sel, player);
    const inBox = new Set(rows.map((r) => r.gameId));
    // Selected games he missed while with the team (inactive list), for context.
    const missed = sel.games.flatMap((g) => {
      if (inBox.has(g.id)) return [];
      const x = g.inactive?.find((i) => i.id === player && i.team === team);
      return x ? [{ g, reason: reasonText(x.reason, x.reasonDetail) }] : [];
    });
    const periods = Math.max(4, ...sel.games.filter((g) => inBox.has(g.id)).map((g) => g.periods));
    const anyName =
      games.flatMap((g) => g.players).find((p) => p.id === player)?.name ?? games.flatMap((g) => g.inactive ?? []).find((p) => p.id === player)?.name;
    return { ...roster, sel, rows, missed, periods, fullName: anyName ?? String(player) };
  }, [data, season, team, player, route.filters]);

  const total = c ? periodEnd(c.periods) : 2880;
  return (
    <div className="page">
      <Header back={{ label: teamName(team), onClick: () => nav({ view: 'team', team, season, filters: route.filters }) }}>
        <h1 className="title">
          <span className="swatch" style={{ background: teamColor(team) }} />
          {c?.fullName ?? '…'} <span className="muted">· {team}</span>
        </h1>
      </Header>
      <Filters
        seasons={seasons}
        season={season}
        filters={route.filters}
        {...(c ? { teammates: c.teammates } : {})}
        onSeason={(s) => go({ season: s })}
        onFilters={(f) => go({ filters: f })}
      />
      {data.status === 'loading' && <p className="muted">Loading…</p>}
      {data.status === 'error' && <p className="error">Could not load games: {data.error}</p>}
      {c && (
        <>
          <SelectionSummary sel={c.sel} names={c.names} seasons={seasons} onSwitchSeason={(s) => go({ season: s })} />
          <div className="readout" aria-live="polite" data-testid="readout">
            {hover ? describeStint(hover.stint) : <span className="muted">Hover or tap a stint for details. Click a game to open it.</span>}
          </div>
          {c.rows.length === 0 ? (
            <p className="muted">He has no games in this selection.</p>
          ) : (
            <div className="grid player-grid" data-testid="player-grid">
              <div className="gh name">Game</div>
              <div className="gh strip">
                <AxisLabels periods={c.periods} />
              </div>
              <div className="gh num">MIN</div>
              {[...c.rows].reverse().map((r) => (
                <div
                  className="row clickable"
                  key={r.gameId}
                  data-testid="game-row"
                  onClick={() => nav({ view: 'game', game: r.gameId, team, season, filters: route.filters })}
                >
                  <button className="name link" onClick={(e) => (e.stopPropagation(), nav({ view: 'game', game: r.gameId, team, season, filters: route.filters }))}>
                    {shortDate(r.date)} {r.home ? 'vs' : '@'} {r.opponent}
                    {r.flagged && (
                      <span className="flag" title="This game has a data note" data-testid="flag">
                        {' '}
                        ⚠
                      </span>
                    )}
                  </button>
                  <div className="strip">
                    {r.played ? (
                      <StintBars
                        stints={r.stints}
                        total={total}
                        periods={c.periods}
                        active={hover?.game === r.gameId ? hover.stint : null}
                        onHover={(s) => setHover(s ? { game: r.gameId, stint: s } : null)}
                      />
                    ) : (
                      <span className="dnp-inline">Did not play</span>
                    )}
                  </div>
                  <div className="num">{r.played ? formatMin(r.min) : '—'}</div>
                </div>
              ))}
            </div>
          )}
          {c.missed.length > 0 && (
            <details className="missed">
              <summary>
                Missed {c.missed.length} game{c.missed.length === 1 ? '' : 's'} in this selection
              </summary>
              <ul>
                {c.missed.map(({ g, reason }) => (
                  <li key={g.id}>
                    {shortDate(g.date)} {g.home.tri === team ? 'vs' : '@'} {g.home.tri === team ? g.away.tri : g.home.tri}
                    {reason && <span className="muted"> — {reason}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
