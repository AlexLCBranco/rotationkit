import { useMemo, useState } from 'react';
import { appearanceIndex, loadTeamGames } from '../app/data.ts';
import { useAsync } from '../app/hooks.ts';
import { basedOn, describeSelection } from '../app/labels.ts';
import { shortNames } from '../app/names.ts';
import type { Route } from '../app/route.ts';
import { TEAM_CODES, teamColor, teamName } from '../app/teams.ts';
import { heat, LEGEND_STOPS } from '../app/colors.ts';
import { selectGames, teamPattern, type Filters as F, type Selection } from '../domain/patterns.ts';
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
          Only {n} game{n === 1 ? '' : 's'} match in {sel.season}.{' '}
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
  const data = useAsync(async () => {
    const games = await loadTeamGames(season, team);
    const idx = ww ? await appearanceIndex(season, games) : undefined;
    return { games, idx };
  }, [season, team, !!ww]);
  const [hover, setHover] = useState<{ player: number; bucket: number } | null>(null);

  const go = (patch: { team?: string; season?: string; filters?: F }) =>
    nav({ view: 'team', team: patch.team ?? team, season: patch.season ?? season, filters: patch.filters ?? route.filters });

  const computed = useMemo(() => {
    if (data.status !== 'ok') return null;
    const { games, idx } = data.value;
    const roster = rosterOf(games, team);
    const sel = selectGames(games, season, team, route.filters, idx);
    return { ...roster, sel, tp: teamPattern(sel) };
  }, [data, season, team, route.filters]);

  const hp = hover && computed?.tp.players.find((p) => p.id === hover.player);

  return (
    <div className="page">
      <HeatDefs />
      <Header>
        <label className="field team-pick">
          <span className="swatch" style={{ background: teamColor(team) }} />
          <select value={team} aria-label="Team" onChange={(e) => go({ team: e.target.value })}>
            {TEAM_CODES.map((t) => (
              <option key={t} value={t}>
                {teamName(t)}
              </option>
            ))}
          </select>
        </label>
      </Header>
      <Filters
        seasons={seasons}
        season={season}
        filters={route.filters}
        {...(computed ? { teammates: computed.teammates } : {})}
        onSeason={(s) => go({ season: s })}
        onFilters={(f) => go({ filters: f })}
      />
      {data.status === 'loading' && <p className="muted">Loading {teamName(team)} {season}…</p>}
      {data.status === 'error' && <p className="error">Could not load games: {data.error}</p>}
      {computed && (
        <>
          <SelectionSummary sel={computed.sel} names={computed.names} seasons={seasons} onSwitchSeason={(s) => go({ season: s })} />
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
                  <button className="name link" onClick={() => nav({ view: 'player', team, player: p.id, season, filters: route.filters })}>
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
                  <div className="num">{(p.avgMin / 60).toFixed(1)}</div>
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
              <i style={{ background: heat(null) }} />
              excluded
            </span>
          </div>
        </>
      )}
    </div>
  );
}
