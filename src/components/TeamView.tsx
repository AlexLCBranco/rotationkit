import { useMemo, useState } from 'react';
import { appearanceIndex, loadTeamGames } from '../app/data.ts';
import { useAsync } from '../app/hooks.ts';
import { basedOn, describeSelection, formatMin } from '../app/labels.ts';
import { shortNames } from '../app/names.ts';
import type { Route } from '../app/route.ts';
import { TEAM_CODES, teamColor, teamName } from '../app/teams.ts';
import { heat, LEGEND_STOPS } from '../app/colors.ts';
import { quarterAverages, selectGames, teamPattern, type Filters as F, type QuarterAverages, type Selection } from '../domain/patterns.ts';
import { formatClock, periodAt, periodEnd } from '../domain/time.ts';
import type { Game } from '../domain/types.ts';
import { AxisLabels } from './Axis.tsx';
import { Filters } from './Filters.tsx';
import { Header } from './Header.tsx';
import { HeatDefs, HeatStrip } from './HeatStrip.tsx';

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
          With {names.get(ww.player) ?? ww.name}: {ww.withGames} game{ww.withGames === 1 ? '' : 's'} · Without: {ww.withoutGames} game{ww.withoutGames === 1 ? '' : 's'}
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
  const teamSelect = (value: string, onChange: (t: string) => void, label: string, extra?: React.ReactNode) => (
    <label className="field team-pick">
      <span className="swatch" style={{ background: teamColor(value || team) }} />
      <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}>
        {extra}
        {TEAM_CODES.map((t) => (
          <option key={t} value={t}>
            {teamName(t)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="page">
      <HeatDefs />
      <Header>
        {teamSelect(team, (t) => go({ team: t }), 'Team')}
        <span className="muted">vs</span>
        {teamSelect(vs ?? '', (t) => go({ vs: t || null }), 'Matchup opponent', <option value="">(no matchup)</option>)}
        <button className="back" onClick={() => nav({ view: 'game', game: 'latest', team, season, filters: route.filters })} data-testid="latest-game">
          Latest game →
        </button>
      </Header>
      <Filters
        seasons={seasons}
        season={season}
        filters={route.filters}
        {...(roster.status === 'ok' ? { teammates: roster.value.teammates } : {})}
        onSeason={(s) => go({ season: s })}
        onFilters={(f) => go({ filters: f })}
      />
      <TeamBlock seasons={seasons} season={season} team={team} filters={route.filters} nav={nav} go={go} heading={vs ? team : null} />
      {vs && (
        <TeamBlock
          seasons={seasons}
          season={season}
          team={vs}
          filters={withoutWW(route.filters)}
          wwNote={ww ? `With/without ${roster.status === 'ok' ? (roster.value.names.get(ww.player) ?? '') : ''} applies to ${team} only.` : null}
          nav={nav}
          go={go}
          heading={vs}
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
  heading,
  wwNote,
}: {
  seasons: string[];
  season: string;
  team: string;
  filters: F;
  nav: (r: Route) => void;
  go: (patch: { season?: string }) => void;
  heading: string | null;
  wwNote?: string | null;
}) {
  const ww = filters.withWithout;
  const data = useAsync(async () => {
    const games = await loadTeamGames(season, team);
    const idx = ww ? await appearanceIndex(season, games) : undefined;
    return { games, idx };
  }, [season, team, !!ww]);
  const [hover, setHover] = useState<{ player: number; bucket: number } | null>(null);

  const computed = useMemo(() => {
    if (data.status !== 'ok') return null;
    const { games, idx } = data.value;
    const roster = rosterOf(games, team);
    const sel = selectGames(games, season, team, filters, idx);
    return { ...roster, sel, tp: teamPattern(sel), qa: quarterAverages(sel) };
  }, [data, season, team, filters]);

  const hp = hover && computed?.tp.players.find((p) => p.id === hover.player);

  return (
    <section className="team-block" data-testid="team-block" data-team={team}>
      {heading && (
        <h2 className="block-head">
          <span className="swatch" style={{ background: teamColor(team) }} />
          {teamName(team)}
        </h2>
      )}
      {data.status === 'loading' && <p className="muted">Loading {teamName(team)} {season}…</p>}
      {data.status === 'error' && <p className="error">Could not load games: {data.error}</p>}
      {computed && (
        <>
          <SelectionSummary sel={computed.sel} names={computed.names} seasons={seasons} onSwitchSeason={(s) => go({ season: s })} />
          {wwNote && <p className="muted">{wwNote}</p>}
          <div className="readout" aria-live="polite" data-testid="readout">
            {hp && hover ? (
              <>
                <strong>{computed.names.get(hp.id) ?? hp.name}</strong> · {bucketLabel(hover.bucket, computed.tp.bucketSeconds)} ·{' '}
                {hp.eligibleAtMid[hover.bucket]! > 0 ? (
                  <>
                    on court in {hp.onAtMid[hover.bucket]} of {hp.eligibleAtMid[hover.bucket]} games
                    {hp.onCourt[hover.bucket] != null && <span className="muted"> ({Math.round(hp.onCourt[hover.bucket]! * 100)}% of the time)</span>}
                  </>
                ) : (
                  <span className="muted">only blowout time here (excluded)</span>
                )}
                {computed.tp.blowoutAtMid[hover.bucket]! > 0 && <span className="muted"> · {computed.tp.blowoutAtMid[hover.bucket]} blowout game(s) excluded</span>}
              </>
            ) : (
              <span className="muted">Hover or tap a strip for details.</span>
            )}
          </div>
          {computed.tp.players.length === 0 ? (
            <p className="muted">No games match these filters.</p>
          ) : (
            <div className="grid team-grid" data-testid="team-grid">
              <div className="gh name">Player</div>
              <div className="gh strip">
                <AxisLabels periods={4} />
              </div>
              <div className="gh num" title="Average minutes per game played">MIN</div>
              <div className="gh num" title="Games played / games in selection">GP</div>
              {computed.tp.players.map((p) => (
                <div className="row" key={p.id} data-testid="player-row">
                  <button className="name link" onClick={() => nav({ view: 'player', team, player: p.id, season, filters })}>
                    {computed.names.get(p.id) ?? p.name}
                  </button>
                  <div className="strip">
                    <HeatStrip
                      shares={p.onCourt}
                      bucketSeconds={computed.tp.bucketSeconds}
                      active={hover?.player === p.id ? hover.bucket : null}
                      onHover={(b) => setHover(b == null ? null : { player: p.id, bucket: b })}
                    />
                  </div>
                  <div className="num">{formatMin(p.avgMin)}</div>
                  <div className="num">
                    {p.gamesPlayed}
                    <span className="muted">/{computed.tp.games}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="legend" aria-label="Color scale">
            <span>On court:</span>
            {LEGEND_STOPS.map((s) => (
              <span key={s} className="chip">
                <i style={{ background: heat(s) }} />
                {Math.round(s * 100)}%
              </span>
            ))}
            <span className="chip">
              <i className="excluded-swatch" />
              only blowout time (excluded)
            </span>
          </div>
          {computed.qa.length > 0 && <AveragesTable qa={computed.qa} sel={computed.sel} names={computed.names} />}
        </>
      )}
    </section>
  );
}

function AveragesTable({ qa, sel, names }: { qa: QuarterAverages[]; sel: Selection; names: Map<number, string> }) {
  const ot = sel.games.some((g) => g.periods > 4);
  const qs = ot ? ['Q1', 'Q2', 'Q3', 'Q4', 'OT'] : ['Q1', 'Q2', 'Q3', 'Q4'];
  const f1 = (x: number) => x.toFixed(1);
  return (
    <details className="avg-table" open>
      <summary>
        Minutes & fouls per game <span className="muted">· {basedOn(sel.games.length)}{sel.filters.blowout ? ' · blowout time excluded (minutes and fouls)' : ''}</span>
      </summary>
      <div className="table-wrap">
        <table className="tbl" data-testid="averages-table">
          <thead>
            <tr>
              <th colSpan={3} />
              <th colSpan={qs.length} className="qgroup qgroup-start">MIN per quarter</th>
              <th colSpan={qs.length + 1} className="qgroup qgroup-start">PF per quarter</th>
            </tr>
            <tr>
              <th>Player</th>
              <th className="num">GP</th>
              <th className="num">MIN</th>
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
              <th className="num">PF</th>
            </tr>
          </thead>
          <tbody>
            {qa.map((p) => (
              <tr key={p.id} data-testid="avg-row">
                <td className="name-cell">{names.get(p.id) ?? p.name}</td>
                <td className="num">{p.gamesPlayed}</td>
                <td className="num strong">{formatMin(p.min)}</td>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
