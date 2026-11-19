import { useMemo, useState } from 'react';
import { appearanceIndex, loadSchedule, loadTeamGames } from '../app/data.ts';
import { restForTeam } from '../domain/rest.ts';
import { useAsync } from '../app/hooks.ts';
import { basedOn, describeSelection, formatMin, USG_TITLE } from '../app/labels.ts';
import { formatUsg } from '../domain/usage.ts';
import { shortNames } from '../app/names.ts';
import type { Route } from '../app/route.ts';
import { teamName } from '../app/teams.ts';
import { describeSit, isRarelyUsed, quarterAverages, selectGames, sitPattern, teamPattern, type Filters as F, type PlayerPattern, type QuarterAverages, type Selection } from '../domain/patterns.ts';
import { formatClock, periodAt, periodEnd } from '../domain/time.ts';
import type { Game } from '../domain/types.ts';
import { Filters } from './Filters.tsx';
import { Header } from './Header.tsx';
import { HeatDefs, HeatStrip } from './HeatStrip.tsx';
import { Headshot, TeamLogo } from './Headshot.tsx';
import { PatternChart, RareToggle } from './PatternChart.tsx';
import { Tabs } from './Tabs.tsx';
import { tabRoute } from '../app/tabs.ts';
import { TeamPicker } from './TeamPicker.tsx';
import { PlayerLink, TeamLink } from './Links.tsx';
import { GameByGame } from './GameByGame.tsx';
import { closersTable, type CloserRow } from '../domain/closers.ts';
import { CLOSE_GAME } from '../domain/config.ts';
import type { Game as G } from '../domain/types.ts';

interface Props {
  seasons: string[];
  season: string;
  team: string;
  route: Extract<Route, { view: 'team' }>;
  nav: (r: Route) => void;
}

/** "Q2 6:00–5:30" for a bucket. */
export function bucketLabel(b: number, size: number): string {
  const s = b * size;
  const p = periodAt(s + 0.05);
  const end = periodEnd(p);
  return `Q${p} ${formatClock(end - s)}–${formatClock(end - s - size)}`;
}

/** Team-mates in a season (box-score listings + inactive lists), for names and the with/without picker. */
export function rosterOf(games: Game[], team: string) {
  const people = [...games.flatMap((g) => g.players.filter((p) => p.team === team)), ...games.flatMap((g) => (g.inactive ?? []).filter((p) => p.team === team))];
  const names = shortNames(people);
  const minutes = new Map<number, number>();
  for (const g of games) for (const p of g.players) if (p.team === team && p.played) minutes.set(p.id, (minutes.get(p.id) ?? 0) + p.min);
  const teammates = [...minutes.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => ({ id, label: names.get(id) ?? String(id) }));
  return { names, teammates };
}

export function SelectionSummary({ sel, names, seasons, onSwitchSeason }: { sel: Selection; names: Map<number, string>; seasons: string[]; onSwitchSeason: (s: string) => void }) {
  const n = sel.games.length;
  const older = seasons[seasons.indexOf(sel.season) - 1];
  const ww = sel.withWithout;
  const flagged = sel.games.filter((g) => g.quality).length;
  return (
    <div className="summary">
      <p className="label" data-testid="selection-label">
        <strong>{describeSelection(sel, names)}</strong> <span className="based">· {basedOn(n)}</span>
      </p>
      {ww && (
        <p className="groups" data-testid="ww-groups">
          With{' '}
          <PlayerLink id={ww.player} team={sel.team} season={sel.season}>
            {names.get(ww.player) ?? ww.name}
          </PlayerLink>
          : {ww.withGames} game{ww.withGames === 1 ? '' : 's'} · Without: {ww.withoutGames} game{ww.withoutGames === 1 ? '' : 's'}
          {ww.withoutEstimated && <span className="est"> (estimated — some games have no official inactive list)</span>}
          {ww.notWithTeam > 0 && <span className="muted"> · {ww.notWithTeam} games before/after his time with the team not counted</span>}
        </p>
      )}
      {n < 5 && older && (
        <p className="note" data-testid="low-sample">
          {n === 0 ? 'No games' : `Only ${n} game${n === 1 ? '' : 's'}`} {n === 1 ? 'matches' : 'match'} in {sel.season}.{' '}
          <button className="link" onClick={() => onSwitchSeason(older)}>
            Show the same view for {older}
          </button>
        </p>
      )}
      {flagged > 0 && (
        <p className="warn" data-testid="flag-summary">
          ⚠ {flagged} game{flagged === 1 ? '' : 's'} in this selection {flagged === 1 ? 'has' : 'have'} a data note (shown in the player and game views).
        </p>
      )}
    </div>
  );
}

export function TeamView({ seasons, season, team, route, nav }: Props) {
  const ww = route.filters.withWithout;
  const vs = route.vs && route.vs !== team ? route.vs : null;
  // Team A's games also feed the with/without picker (memoized loads are shared with the block below).
  const roster = useAsync(async () => rosterOf(await loadTeamGames(season, team), team), [season, team]);
  const go = (patch: { team?: string; season?: string; filters?: F; vs?: string | null }) =>
    nav({
      view: 'team',
      team: patch.team ?? team,
      season: patch.season ?? season,
      filters: patch.filters ?? route.filters,
      vs: patch.vs === undefined ? vs : patch.vs,
    });
  return (
    <div className="page">
      <HeatDefs />
      <Header>
        <Tabs active="averages" go={(x) => nav(tabRoute(x, { team, season, filters: route.filters }))} />
        <TeamPicker team={team} onChange={(t) => go({ team: t })} />
        <span className="muted">vs</span>
        <TeamPicker team={vs} onChange={(t) => go({ vs: t })} placeholder="No matchup" label="Matchup opponent" testId="vs-picker" />
        {vs && (
          <button className="back" onClick={() => go({ vs: null })} title="Remove the matchup" data-testid="vs-clear">
            ✕ No matchup
          </button>
        )}
      </Header>
      <Filters
        seasons={seasons}
        season={season}
        filters={route.filters}
        {...(roster.status === 'ok' ? { teammates: roster.value.teammates } : {})}
        onSeason={(s) => go({ season: s })}
        onFilters={(f) => go({ filters: f })}
      />
      <TeamBlock seasons={seasons} season={season} team={team} filters={route.filters} nav={nav} go={go} />
      {vs && (
        <TeamBlock
          seasons={seasons}
          season={season}
          team={vs}
          filters={withoutWW(route.filters)}
          wwNote={ww ? `With/without ${roster.status === 'ok' ? (roster.value.names.get(ww.player) ?? '') : ''} applies to ${team} only.` : null}
          nav={nav}
          go={go}
         
        />
      )}
    </div>
  );
}

const withoutWW = (f: F): F => {
  const { withWithout: _, ...rest } = f;
  return rest;
};

function TeamBlock({
  seasons,
  season,
  team,
  filters,
  nav,
  go,
  wwNote,
}: {
  seasons: string[];
  season: string;
  team: string;
  filters: F;
  nav: (r: Route) => void;
  go: (patch: { season?: string }) => void;
  wwNote?: string | null;
}) {
  const ww = filters.withWithout;
  const data = useAsync(async () => {
    const [games, schedule] = await Promise.all([loadTeamGames(season, team), loadSchedule(season).catch(() => [])]);
    const idx = ww ? await appearanceIndex(season, games) : undefined;
    return { games, idx, rest: restForTeam(schedule, team) };
  }, [season, team, !!ww]);
  const [hover, setHover] = useState<{ player: number; bucket: number; x: number; y: number } | null>(null);
  const [view, setView] = useState<'typical' | 'heat' | 'games'>('typical');
  // Game by game needs to know why a player missed a game (with the team or not): the appearance index.
  const gbgIdx = useAsync(
    async () => (view === 'games' && data.status === 'ok' ? (data.value.idx ?? (await appearanceIndex(season, data.value.games))) : null),
    [view, data.status, season, team, !!ww],
  );
  const [showRare, setShowRare] = useState(false);

  const computed = useMemo(() => {
    if (data.status !== 'ok') return null;
    const { games, idx, rest } = data.value;
    const roster = rosterOf(games, team);
    const sel = selectGames(games, season, team, filters, idx, rest);
    return { ...roster, sel, tp: teamPattern(sel), qa: quarterAverages(sel) };
  }, [data, season, team, filters]);

  const hp = hover && computed?.tp.players.find((p) => p.id === hover.player);
  // Team id (for the logo) from the team's own games.
  const g0 = data.status === 'ok' ? data.value.games[0] : undefined;
  const teamId = g0 ? (g0.home.tri === team ? g0.home.id : g0.away.id) : 0;

  const rareHeat = computed ? computed.tp.players.filter((p) => isRarelyUsed(p.gamesPlayed, computed.tp.games)) : [];
  const heatRow = (p: PlayerPattern, rare: boolean) => (
    <div className={`tp-row${rare ? ' rare' : ''}`} key={p.id} data-testid="player-row" data-player={p.id} data-rare={rare}>
      <span className="tp-player">
        <Headshot id={p.id} name={p.name} />
        <PlayerLink
          id={p.id}
          team={team}
          season={season}
          className={`tp-name${Math.max(...(computed!.names.get(p.id) ?? p.name).split(/[\s-]+/).map((w) => w.length)) > 10 ? ' long' : ''}`}
        >
          {computed!.names.get(p.id) ?? p.name}
        </PlayerLink>
      </span>
      <span className="tp-min">{formatMin(p.avgMin)}</span>
      <HeatStrip
        shares={p.onCourt}
        bucketSeconds={computed!.tp.bucketSeconds}
        active={hover?.player === p.id ? hover.bucket : null}
        onHover={(b, e) => {
          const r = (e.currentTarget as Element).closest('.tp-grid')!.getBoundingClientRect();
          setHover({ player: p.id, bucket: b, x: e.clientX - r.left, y: e.clientY - r.top });
        }}
      />
      <span className="tp-gp" data-testid="gp">
        {p.gamesPlayed}
        <span className="muted">/{computed!.tp.games}</span>
      </span>
    </div>
  );

  return (
    <section className="team-block" data-testid="team-block" data-team={team}>
      <h2 className="block-head">
        <TeamLogo teamId={teamId} tri={team} />
        <TeamLink team={team} season={season}>
          {teamName(team)}
        </TeamLink>
      </h2>
      {data.status === 'loading' && <p className="muted">Loading {teamName(team)} {season}…</p>}
      {data.status === 'error' && <p className="error">Could not load games: {data.error}</p>}
      {computed && (
        <>
          <SelectionSummary sel={computed.sel} names={computed.names} seasons={seasons} onSwitchSeason={(s) => go({ season: s })} />
          {wwNote && <p className="muted">{wwNote}</p>}
          {computed.tp.players.length > 0 && (
            <div className="seg view-seg" role="group" aria-label="Pattern view">
              <button aria-pressed={view === 'typical'} onClick={() => setView('typical')}>
                Typical stints
              </button>
              <button aria-pressed={view === 'heat'} onClick={() => setView('heat')}>
                Heat map
              </button>
              <button aria-pressed={view === 'games'} onClick={() => setView('games')}>
                Game by game
              </button>
            </div>
          )}
          {computed.tp.players.length === 0 ? (
            <p className="muted">No games match these filters.</p>
          ) : view === 'games' ? (
            gbgIdx.status === 'ok' && gbgIdx.value ? (
              <GameByGame
                sel={computed.sel}
                tp={computed.tp}
                names={computed.names}
                idx={gbgIdx.value}
                showRare={showRare}
                onToggleRare={() => setShowRare(!showRare)}
                nav={nav}
              />
            ) : (
              <p className="muted">Loading…</p>
            )
          ) : view === 'typical' ? (
            <PatternChart
              sel={computed.sel}
              tp={computed.tp}
              names={computed.names}
              showRare={showRare}
              onToggleRare={() => setShowRare(!showRare)}
            />
          ) : (
            <>
              <div className="tp-grid" data-testid="team-grid" onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}>
                <div className="tp-row tp-head">
                  <span className="tp-player">Player</span>
                  <span className="tp-min">MIN</span>
                  <span className="tp-quarters">
                    {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
                      <span key={q}>{q}</span>
                    ))}
                  </span>
                  <span className="tp-gp" title="Games played / games in selection">
                    GP
                  </span>
                </div>
                {computed.tp.players.filter((p) => !isRarelyUsed(p.gamesPlayed, computed.tp.games)).map((p) => heatRow(p, false))}
                {rareHeat.length > 0 && <RareToggle count={rareHeat.length} games={computed.tp.games} open={showRare} onToggle={() => setShowRare(!showRare)} />}
                {showRare && rareHeat.map((p) => heatRow(p, true))}
                {hp && hover && (
                  <div className="gc-tip" data-testid="pattern-tip" style={{ left: hover.x, top: hover.y, transform: `translate(${hover.x > 500 ? 'calc(-100% - 12px)' : '12px'}, -120%)` }}>
                    <strong>{computed.names.get(hp.id) ?? hp.name}</strong> · {bucketLabel(hover.bucket, computed.tp.bucketSeconds)} ·{' '}
                    {hp.eligibleAtMid[hover.bucket]! > 0
                      ? `on court in ${hp.onAtMid[hover.bucket]} of ${hp.eligibleAtMid[hover.bucket]} games${hp.onCourt[hover.bucket] != null ? ` (${Math.round(hp.onCourt[hover.bucket]! * 100)}% of the time)` : ''}`
                      : 'only garbage time here (excluded)'}
                    {computed.tp.blowoutAtMid[hover.bucket]! > 0 ? ` · ${computed.tp.blowoutAtMid[hover.bucket]} garbage-time game(s) excluded` : ''}
                  </div>
                )}
              </div>
              <div className="legend tp-legend" aria-label="Color scale">
                <span>On court:</span>
                <span className="chip">
                  <i className="ramp" /> 0% → 100% of games
                </span>
                <span className="chip">
                  <i className="excluded-swatch" />
                  only garbage time (excluded)
                </span>
                <span className="muted">Hover or tap a strip for details.</span>
              </div>
            </>
          )}
          {computed.qa.length > 0 && <AveragesTable qa={computed.qa} sel={computed.sel} names={computed.names} />}
          {computed.sel.games.length > 0 && <ClosersTable games={computed.sel.games} sel={computed.sel} names={computed.names} />}
        </>
      )}
    </section>
  );
}

function AveragesTable({ qa, sel, names }: { qa: QuarterAverages[]; sel: Selection; names: Map<number, string> }) {
  const ot = sel.games.some((g) => g.periods > 4);
  const qs = ot ? ['Q1', 'Q2', 'Q3', 'Q4', 'OT'] : ['Q1', 'Q2', 'Q3', 'Q4'];
  const f1 = (x: number) => x.toFixed(1);
  // Sortable columns: MIN (default), USG%, PF; always biggest first, ties by minutes.
  const [sort, setSort] = useState<'min' | 'usg' | 'pf'>('min');
  const rows = useMemo(() => [...qa].sort((a, b) => (sort === 'usg' ? (b.usg ?? -1) - (a.usg ?? -1) : sort === 'pf' ? b.pf - a.pf : 0) || b.min - a.min), [qa, sort]);
  const th = (key: typeof sort, label: string, title?: string) => (
    <th className={`num sortable${sort === key ? ' sorted' : ''}`} aria-sort={sort === key ? 'descending' : 'none'} title={title}>
      <button onClick={() => setSort(key)}>{label}</button>
    </th>
  );
  return (
    <details className="avg-table" open>
      <summary>
        Minutes & fouls per game <span className="muted">· {basedOn(sel.games.length)}{sel.filters.blowout ? ' · garbage-time minutes excluded (fouls always count)' : ''}</span>
      </summary>
      <div className="table-wrap">
        <table className="tbl" data-testid="averages-table">
          <thead>
            <tr>
              <th colSpan={4} />
              <th colSpan={qs.length} className="qgroup qgroup-start">MIN per quarter</th>
              <th colSpan={qs.length + 1} className="qgroup qgroup-start">PF per quarter</th>
              <th />
            </tr>
            <tr>
              <th className="name-col">Player</th>
              <th className="num">GP</th>
              {th('min', 'MIN')}
              {th('usg', 'USG%', USG_TITLE)}
              {qs.map((q, i) => (
                <th key={`m${q}`} className={`num${i === 0 ? ' qgroup-start' : ''}`}>
                  {q}
                </th>
              ))}
              {qs.map((q, i) => (
                <th key={`f${q}`} className={`num${i === 0 ? ' qgroup-start' : ''}`}>
                  {q}
                </th>
              ))}
              {th('pf', 'PF')}
              <th title="Median game clock of his first sub-out / first entry per quarter (games it happened in); shown when seen in 3+ games">When he sits</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} data-testid="avg-row">
                <td className="name-cell">
                  <PlayerLink id={p.id} team={sel.team} season={sel.season}>
                    {names.get(p.id) ?? p.name}
                  </PlayerLink>
                </td>
                <td className="num">{p.gamesPlayed}</td>
                <td className="num strong">{formatMin(p.min)}</td>
                <td className="num" data-testid="avg-usg">
                  {formatUsg(p.usg)}
                </td>
                {qs.map((_, i) => (
                  <td key={`m${i}`} className={`num${i === 0 ? ' qgroup-start' : ''}`}>
                    {formatMin(p.minQ[i]!)}
                  </td>
                ))}
                {qs.map((_, i) => (
                  <td key={`f${i}`} className={`num${i === 0 ? ' qgroup-start' : ''}`}>
                    {f1(p.pfQ[i]!)}
                  </td>
                ))}
                <td className="num strong">{f1(p.pf)}</td>
                <td className="sit-cell" data-testid="sit-cell">
                  {describeSit(sitPattern(sel, p.id)) || <span className="muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Close games of the selection (CLOSE_GAME): who plays them and who is on court at the final buzzer. */
function ClosersTable({ games, sel, names }: { games: G[]; sel: Selection; names: Map<number, string> }) {
  const { close, rows } = useMemo(() => closersTable(games, sel.team), [games, sel.team]);
  const pct = (r: CloserRow) => `${Math.round(r.share * 100)}%`;
  return (
    <details className="avg-table closers" open data-testid="closers">
      <summary>
        Closers{' '}
        <span className="muted" data-testid="closers-based-on">
          · {close.length ? `based on ${close.length} close game${close.length === 1 ? '' : 's'}` : 'no close games in this selection'} (margin ≤ {CLOSE_GAME.margin} at some point in
          the last {CLOSE_GAME.lastSeconds / 60}:00 of Q4 or in overtime)
        </span>
      </summary>
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="tbl" data-testid="closers-table">
            <thead>
              <tr>
                <th className="name-col">Player</th>
                <th className="num" title="Close games he played">
                  Close GP
                </th>
                <th className="num" title="On court at the final buzzer (as on the Q4 tab)">
                  Closed
                </th>
                <th className="num">Share</th>
                <th className="num" title="Average 4th-quarter + overtime minutes in the close games he played">
                  Q4+OT MIN
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid="closers-row" data-player={r.id}>
                  <td className="name-cell">
                    <PlayerLink id={r.id} team={sel.team} season={sel.season}>
                      {names.get(r.id) ?? r.name}
                    </PlayerLink>
                  </td>
                  <td className="num">{r.played}</td>
                  <td className="num strong">{r.closed}</td>
                  <td className="num">{pct(r)}</td>
                  <td className="num">{formatMin(r.q4Min)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
