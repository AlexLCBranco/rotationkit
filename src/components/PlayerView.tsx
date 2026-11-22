import { useEffect, useMemo, useState } from 'react';
import { appearanceIndex, loadSchedule, loadSeasonAppearances, loadTeamGames } from '../app/data.ts';
import { playerHref } from '../app/links.ts';
import { rememberPlayer } from '../app/recent.ts';
import { teamsOf } from '../domain/players.ts';
import { TeamLink, useLinkContext } from './Links.tsx';
import { restForTeam } from '../domain/rest.ts';
import { useAsync } from '../app/hooks.ts';
import { formatMin, shortDate, USG_TITLE } from '../app/labels.ts';
import { formatUsg, usagePart, usageRate } from '../domain/usage.ts';
import { format, type Route } from '../app/route.ts';
import { teamColor, teamName } from '../app/teams.ts';
import { playerGames, selectGames, type Filters as F } from '../domain/patterns.ts';
import { periodEnd } from '../domain/time.ts';
import type { Stint } from '../domain/types.ts';
import { AxisLabels } from './Axis.tsx';
import { Filters } from './Filters.tsx';
import { PageRows, Row, SeasonChips, SetChips } from './PageRows.tsx';
import { withSet } from '../domain/patterns.ts';
import { describeStint, StintBars } from './Stints.tsx';
import { rosterOf, SelectionSummary } from './TeamView.tsx';
import { BroadcastTags, GameBadge } from './GameBadge.tsx';
import { quarterStats } from '../domain/gameChart.ts';
import { describeSit, minutesTrend, sitPattern, type Selection } from '../domain/patterns.ts';
import { buildAppearances } from '../domain/availability.ts';
import { MinutesTrend } from './MinutesTrend.tsx';
import { dnpLabel, type DnpLabel } from '../app/dnp.ts';
import { Headshot } from './Headshot.tsx';
import { ReadoutMenu } from './ReadoutMenu.tsx';
import { loadReadout, saveReadout } from '../app/readoutSettings.ts';
import { playerFullQ4 } from '../domain/fullQ4.ts';
import { RosterPanel } from './RosterPanel.tsx';
import { HelpLink } from './HelpLink.tsx';

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
    const [games, schedule] = await Promise.all([loadTeamGames(season, team), loadSchedule(season).catch(() => [])]);
    return { games, idx: ww ? await appearanceIndex(season, games) : undefined, rest: restForTeam(schedule, team), sched: new Map(schedule.map((e) => [e.id, e])) };
  }, [season, team, !!ww]);
  // His teams this season (season-wide appearances, as the with/without rule uses): a traded player gets a switch.
  const teams = useAsync(async () => teamsOf(await loadSeasonAppearances(season), player), [season, player]);
  const links = useLinkContext();
  const [hover, setHover] = useState<{ game: string; stint: Stint; pts: number | null } | null>(null);
  const [readout, setReadout] = useState(loadReadout);
  const go = (patch: { season?: string; filters?: F }) => nav({ ...route, season: patch.season ?? season, filters: patch.filters ?? route.filters });

  const c = useMemo(() => {
    if (data.status !== 'ok') return null;
    const { games, idx, rest } = data.value;
    const roster = rosterOf(games, team);
    const sel = selectGames(games, season, team, route.filters, idx, rest);
    const rows = playerGames(sel, player);
    const inBox = new Set(rows.map((r) => r.gameId));
    // Selected games he missed while with the team (inactive list), for context.
    const missed = sel.games.flatMap((g) => {
      if (inBox.has(g.id)) return [];
      const x = g.inactive?.find((i) => i.id === player && i.team === team);
      return x ? [{ g, label: dnpLabel(x.reason, x.reasonDetail, true) }] : [];
    });
    const periods = Math.max(4, ...sel.games.filter((g) => inBox.has(g.id)).map((g) => g.periods));
    const anyName =
      games.flatMap((g) => g.players).find((p) => p.id === player)?.name ?? games.flatMap((g) => g.inactive ?? []).find((p) => p.id === player)?.name;
    const trend = minutesTrend(sel, player, idx ?? buildAppearances(games));
    const fullQ4 = playerFullQ4(sel.games, player, team);
    return { ...roster, sel, rows, missed, periods, trend, fullQ4, fullName: anyName ?? String(player) };
  }, [data, season, team, player, route.filters]);

  const total = c ? periodEnd(c.periods) : 2880;
  const fullName = c?.fullName;
  useEffect(() => {
    if (fullName && fullName !== String(player)) rememberPlayer({ id: player, name: fullName, team, season });
  }, [fullName, player, team, season]);
  const opp = (tri: string, cls?: string) => (
    <TeamLink team={tri} className={cls}>
      {tri}
    </TeamLink>
  );
  // His name, headshot and team sit on the readout line, right above his rows.
  const nameBlock = (
    <h1 className="title pl-title" data-testid="player-title">
          <Headshot id={player} name={c?.fullName ?? ''} />
          <span className="swatch" style={{ background: teamColor(team) }} />
          {c?.fullName ?? '…'}{' '}
          <span className="muted">
            ·{' '}
            <TeamLink team={team} title={`${teamName(team)} averages`}>
              {team}
            </TeamLink>
          </span>
          {teams.status === 'ok' && teams.value.length > 1 && links && (
            <span className="team-switch" data-testid="team-switch" aria-label="His teams this season">
              <span className="muted">Teams this season:</span>
              {teams.value.map((t) => (
                <a key={t} href={playerHref(links, { id: player, team: t, season })} aria-current={t === team ? 'page' : undefined} data-testid="team-switch-option" data-team={t}>
                  {t}
                </a>
              ))}
            </span>
          )}
        </h1>
  );
  return (
    <div className="page player-page">
      <PageRows
        line={
          <Row label="What">
            <SeasonChips seasons={seasons} season={season} onChange={(s) => go({ season: s })} />
            <SetChips season={season} value={route.filters.set ?? 'regular'} onChange={(s) => go({ filters: withSet(route.filters, s) })} />
          </Row>
        }
      />
      <div className="pl-layout">
      <RosterPanel season={season} team={team} player={player} />
      <div className="pl-main">
      <Filters filters={route.filters} {...(c ? { teammates: c.teammates } : {})} onFilters={(f) => go({ filters: f })} />
      {!c && <div className="pl-readout-bar">{nameBlock}</div>}
      {data.status === 'loading' && <p className="muted">Loading…</p>}
      {data.status === 'error' && <p className="error">Could not load games: {data.error}</p>}
      {c && (
        <>
          <SelectionSummary sel={c.sel} names={c.names} seasons={seasons} onSwitchSeason={(s) => go({ season: s })} />
          <p className="sit-line" data-testid="sit-line">
            <strong>When he sits:</strong>{' '}
            {describeSit(sitPattern(c.sel, player)) || <span className="muted">no pattern seen in 3+ games of this selection</span>}
            <span className="muted"> · median game clock (games)</span>
          </p>
          <p className="fq-counter" data-testid="fq-counter">
            <strong>Full Q4s:</strong> {c.fullQ4.full.size} of {c.fullQ4.played} game{c.fullQ4.played === 1 ? '' : 's'}
            <span className="muted"> · on court for the whole regulation 4th quarter (12:00) · games of this selection he played</span>
            <HelpLink section="fullq4" />
          </p>
          <div className="pl-readout-bar" data-testid="player-bar">
            {nameBlock}
            <div className="readout" aria-live="polite" data-testid="readout">
              {hover ? describeStint(hover.stint, hover.pts) : <span className="muted">Hover or tap a stint for details. Click a game to open it.</span>}
            </div>
            <ReadoutMenu
              barsOnly
              value={readout}
              onChange={(r) => {
                setReadout(r);
                saveReadout(r);
              }}
            />
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
                  <span className="name">
                    <a className="link" href={format({ view: 'game', game: r.gameId, team, season, filters: route.filters })} onClick={(e) => e.stopPropagation()}>
                      {shortDate(r.date)} {r.home ? 'vs' : '@'}
                    </a>{' '}
                    {opp(r.opponent)}
                    {(() => {
                      const g = c.sel.games.find((x) => x.id === r.gameId);
                      return g ? <GameBadge g={g} compact /> : null;
                    })()}
                    <BroadcastTags tv={data.status === 'ok' ? data.value.sched.get(r.gameId)?.tv : undefined} cup={data.status === 'ok' ? data.value.sched.get(r.gameId)?.cup : undefined} id={r.gameId} label={data.status === 'ok' ? data.value.sched.get(r.gameId)?.label : undefined} />
                    {c.fullQ4.full.has(r.gameId) && (
                      <span className="fq-mark" title="Played the full 4th quarter (12:00)" data-testid="fq-mark">
                        Q4
                      </span>
                    )}
                    {r.flagged && (
                      <span className="flag" title="This game has a data note" data-testid="flag">
                        {' '}
                        ⚠
                      </span>
                    )}
                  </span>
                  <div className="strip">
                    {r.played ? (
                      <StintBars
                        stints={r.stints}
                        total={total}
                        periods={c.periods}
                        labels
                        pts={c.sel.games.find((x) => x.id === r.gameId)?.stintPts ? (r.ptsS ?? r.stints.map(() => 0)) : null}
                        barPoints={readout.barPoints}
                        active={hover?.game === r.gameId ? hover.stint : null}
                        onHover={(s, pts) => setHover(s ? { game: r.gameId, stint: s, pts } : null)}
                      />
                    ) : (
                      <DnpTag label={dnpLabel(r.reason, r.reasonDetail)} />
                    )}
                  </div>
                  <div className="num">{r.played ? formatMin(r.min) : '—'}</div>
                </div>
              ))}
            </div>
          )}
          <MinutesTrend {...c.trend} />
          {c.rows.some((r) => r.played) && <GameLog sel={c.sel} player={player} team={team} opp={opp} onOpen={(id) => nav({ view: 'game', game: id, team, season, filters: route.filters })} />}
          {c.missed.length > 0 && (
            <details className="missed">
              <summary>
                Missed {c.missed.length} game{c.missed.length === 1 ? '' : 's'} in this selection <HelpLink section="dnp" />
              </summary>
              <ul>
                {c.missed.map(({ g, label }) => (
                  <li key={g.id} data-testid="missed-game">
                    {shortDate(g.date)} {g.home.tri === team ? 'vs' : '@'} {opp(g.home.tri === team ? g.away.tri : g.home.tri)} <DnpTag label={label} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      </div>
      </div>
    </div>
  );
}

/** Game-by-game minutes and fouls (OT periods combined), with an average row on top. */
function GameLog({ sel, player, team, opp, onOpen }: { sel: Selection; player: number; team: string; opp: (tri: string) => React.ReactNode; onOpen: (id: string) => void }) {
  const rows = [...sel.games]
    .reverse()
    .flatMap((g) => {
      const p = g.players.find((x) => x.id === player && x.team === team && x.played && x.stints.length);
      if (!p) return [];
      const q = quarterStats(p, g.periods);
      const fold = (f: (r: (typeof q)[number]) => number) => [0, 1, 2, 3].map((i) => f(q[i]!)).concat([q.slice(4).reduce((x, r) => x + f(r), 0)]);
      return [{ g, p, min: p.stints.reduce((x, [s, e]) => x + e - s, 0), minQ: fold((r) => r.min), pfQ: fold((r) => r.pf), usage: usagePart(g, p) }];
    });
  const ot = rows.some((r) => r.g.periods > 4);
  const qi = ot ? [0, 1, 2, 3, 4] : [0, 1, 2, 3];
  const qn = ['Q1', 'Q2', 'Q3', 'Q4', 'OT'];
  const n = rows.length;
  const avg = (f: (r: (typeof rows)[number]) => number) => rows.reduce((x, r) => x + f(r), 0) / n;
  return (
    <div className="table-wrap game-log">
      <h2 className="log-head">Game log</h2>
      <table className="tbl" data-testid="game-log">
        <thead>
          <tr>
            <th>Date</th>
            <th>Opp</th>
            <th>H/A</th>
            <th>Game</th>
            <th>Starter</th>
            <th className="num">MIN</th>
            <th className="num" title={USG_TITLE}>
              USG% <HelpLink section="usg" />
            </th>
            {qi.map((i) => (
              <th key={`m${i}`} className={`num${i === 0 ? ' qgroup-start' : ''}`}>
                {qn[i]} MIN
              </th>
            ))}
            {qi.map((i) => (
              <th key={`f${i}`} className={`num${i === 0 ? ' qgroup-start' : ''}`}>
                {qn[i]} PF
              </th>
            ))}
            <th className="num">PF</th>
          </tr>
        </thead>
        <tbody>
          <tr className="avg" data-testid="game-log-avg">
            <td colSpan={4}>Average · {n} game{n === 1 ? '' : 's'}</td>
            <td className="num">{Math.round(avg((r) => (r.p.starter ? 1 : 0)) * n)}/{n}</td>
            <td className="num">{formatMin(avg((r) => r.min))}</td>
            <td className="num" data-testid="game-log-usg">
              {formatUsg(usageRate(rows.map((r) => r.usage)))}
            </td>
            {qi.map((i) => (
              <td key={`m${i}`} className={`num${i === 0 ? ' qgroup-start' : ''}`}>
                {formatMin(avg((r) => r.minQ[i]!))}
              </td>
            ))}
            {qi.map((i) => (
              <td key={`f${i}`} className={`num${i === 0 ? ' qgroup-start' : ''}`}>
                {avg((r) => r.pfQ[i]!).toFixed(1)}
              </td>
            ))}
            <td className="num">{avg((r) => r.p.pf).toFixed(1)}</td>
          </tr>
          {rows.map((r) => {
            const home = r.g.home.tri === team;
            return (
              <tr key={r.g.id} className="clickable" onClick={() => onOpen(r.g.id)} data-testid="game-log-row">
                <td>{shortDate(r.g.date)}</td>
                <td>{opp(home ? r.g.away.tri : r.g.home.tri)}</td>
                <td>{home ? 'H' : 'A'}</td>
                <td>
                  <GameBadge g={r.g} compact />
                </td>
                <td>{r.p.starter ? 'Yes' : 'No'}</td>
                <td className="num strong">{formatMin(r.min)}</td>
                <td className="num" data-testid="game-log-usg">
                  {formatUsg(usageRate([r.usage]))}
                </td>
                {qi.map((i) => (
                  <td key={`m${i}`} className={`num${i === 0 ? ' qgroup-start' : ''}`}>
                    {r.minQ[i]! > 0 ? formatMin(r.minQ[i]!) : '—'}
                  </td>
                ))}
                {qi.map((i) => (
                  <td key={`f${i}`} className={`num${i === 0 ? ' qgroup-start' : ''}`}>
                    {r.pfQ[i] || ''}
                  </td>
                ))}
                <td className="num strong">{r.p.pf}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** DNP / inactive reason tag (src/app/dnp.ts) with the source's detail. */
function DnpTag({ label }: { label: DnpLabel }) {
  return (
    <span className="dnp-inline" data-testid="dnp-label" data-kind={label.kind}>
      <span className={`dnp-tag ${label.kind}`}>{label.tag}</span>
      {label.detail && <span className="dnp-detail">{label.detail}</span>}
    </span>
  );
}
