import { useMemo, useState } from 'react';
import { loadGame } from '../app/data.ts';
import { useAsync } from '../app/hooks.ts';
import { formatMin, reasonText, shortDate, signed } from '../app/labels.ts';
import type { Route } from '../app/route.ts';
import { teamColor, teamName } from '../app/teams.ts';
import { blowoutIntervals } from '../domain/patterns.ts';
import { seasonOf } from '../domain/season.ts';
import { gameLength, REG_PERIODS } from '../domain/time.ts';
import type { Game, PlayerGame, QualityNote, Stint, TeamInfo } from '../domain/types.ts';
import { AxisLabels } from './Axis.tsx';
import { Header } from './Header.tsx';
import { describeStint, StintBars } from './Stints.tsx';

interface Props {
  seasons: string[];
  season: string;
  route: Extract<Route, { view: 'game' }>;
  nav: (r: Route) => void;
}

/** Plain-words line for a data-quality note, using the game's own numbers. */
function qualityLine(g: Game, q: QualityNote): string {
  const p = g.players.find((x) => q.player === `${x.name} (${x.team})`);
  const verdict = q.verdict === 'box-score' ? `The box score looks wrong (${q.why}).` : `Unresolved (${q.why}).`;
  if (p && q.check === 'minutes') {
    const pbp = p.stints.reduce((s, [a, b]) => s + b - a, 0);
    return `${p.name} — minutes: play-by-play ${formatMin(pbp)} vs box score ${formatMin(p.min)}. ${verdict}`;
  }
  if (p && q.check === 'plus-minus') {
    const pbp = p.stints.reduce((s, st) => s + st[2], 0);
    return `${p.name} — +/-: play-by-play ${signed(pbp)} vs box score ${signed(p.pm)}. ${verdict}`;
  }
  return `${q.player ?? 'Game'} — ${q.check}: ${q.detail}. ${verdict}`;
}

export function GameView({ route, nav }: Props) {
  const gameSeason = seasonOf(route.game);
  const data = useAsync(() => loadGame(gameSeason, route.game), [route.game]);
  const [hover, setHover] = useState<{ player: PlayerGame; stint: Stint } | null>(null);
  const g = data.status === 'ok' ? data.value : null;
  const blowout = useMemo(() => (g ? blowoutIntervals(g) : []), [g]);
  const back = route.team
    ? { label: 'Back', onClick: () => history.back() }
    : { label: 'Teams', onClick: () => nav({ view: 'team', team: g?.home.tri ?? null, season: gameSeason, filters: route.filters }) };

  return (
    <div className="page">
      <Header back={back}>
        {g && (
          <h1 className="title">
            {g.away.tri} {g.away.score} @ {g.home.tri} {g.home.score}{' '}
            <span className="muted">
              · {shortDate(g.date)} {g.date.slice(0, 4)}
              {g.periods > REG_PERIODS ? ` · ${g.periods === 5 ? 'OT' : `${g.periods - REG_PERIODS}OT`}` : ''}
            </span>
          </h1>
        )}
      </Header>
      {data.status === 'loading' && <p className="muted">Loading…</p>}
      {data.status === 'error' && <p className="error">Could not load game: {data.error}</p>}
      {g && (
        <>
          {g.quality && (
            <div className="warn box" data-testid="quality-warning">
              <strong>⚠ Data note.</strong> Stints and minutes below come from play-by-play and are used in patterns. The box score disagrees for:
              <ul>
                {g.quality.map((q, i) => (
                  <li key={i}>{qualityLine(g, q)}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="readout" aria-live="polite" data-testid="readout">
            {hover ? (
              <>
                <strong>{hover.player.name}</strong> · {describeStint(hover.stint)}
              </>
            ) : (
              <span className="muted">Hover or tap a stint for in/out time, duration, +/- and fouls.</span>
            )}
          </div>
          {blowout.length > 0 && (
            <p className="muted legend-line">
              <i className="blowout-swatch" /> shaded = blowout time (excluded from patterns when “Hide blowout time” is on)
            </p>
          )}
          {[g.away, g.home].map((t) => (
            <TeamSection key={t.tri} g={g} team={t} blowout={blowout} hover={hover} setHover={setHover} onPlayer={(id) => nav({ view: 'player', team: t.tri, player: id, season: gameSeason, filters: route.filters })} />
          ))}
        </>
      )}
    </div>
  );
}

function TeamSection({
  g,
  team,
  blowout,
  hover,
  setHover,
  onPlayer,
}: {
  g: Game;
  team: TeamInfo;
  blowout: [number, number][];
  hover: { player: PlayerGame; stint: Stint } | null;
  setHover: (h: { player: PlayerGame; stint: Stint } | null) => void;
  onPlayer: (id: number) => void;
}) {
  const total = gameLength(g.periods);
  const players = g.players.filter((p) => p.team === team.tri);
  const played = players.filter((p) => p.played).sort((a, b) => Number(b.starter) - Number(a.starter) || b.min - a.min);
  const dnp = players.filter((p) => !p.played);
  const inactive = (g.inactive ?? []).filter((p) => p.team === team.tri);
  return (
    <section className="team-section" data-testid="game-team">
      <h2>
        <span className="swatch" style={{ background: teamColor(team.tri) }} />
        {teamName(team.tri)} <span className="muted">{team.score}</span>
      </h2>
      <div className="grid game-grid">
        <div className="gh name">Player</div>
        <div className="gh strip">
          <AxisLabels periods={g.periods} />
        </div>
        {['MIN', 'PTS', 'REB', 'AST', 'PF', '+/-'].map((h) => (
          <div key={h} className="gh num">
            {h}
          </div>
        ))}
        {played.map((p) => (
          <div className="row" key={p.id} data-testid="game-player-row">
            <button className={`name link${p.starter ? ' starter' : ''}`} onClick={() => onPlayer(p.id)} title={p.starter ? 'Starter' : undefined}>
              {p.name}
            </button>
            <div className="strip">
              <StintBars
                stints={p.stints}
                total={total}
                periods={g.periods}
                blowout={blowout}
                labels
                active={hover?.player.id === p.id ? hover.stint : null}
                onHover={(s) => setHover(s ? { player: p, stint: s } : null)}
              />
            </div>
            <div className="num">{formatMin(p.min)}</div>
            <div className="num">{p.pts}</div>
            <div className="num">{p.reb}</div>
            <div className="num">{p.ast}</div>
            <div className="num">{p.pf}</div>
            <div className="num pm">{signed(p.pm)}</div>
          </div>
        ))}
      </div>
      {(dnp.length > 0 || inactive.length > 0) && (
        <p className="dnp" data-testid="dnp-list">
          <span className="muted">Did not play: </span>
          {[...dnp.map((p) => ({ name: p.name, r: reasonText(p.reason, p.reasonDetail) ?? 'Did not play' })), ...inactive.map((p) => ({ name: p.name, r: reasonText(p.reason, p.reasonDetail) ?? 'Inactive' }))]
            .map((x) => `${x.name} (${x.r})`)
            .join(' · ')}
        </p>
      )}
    </section>
  );
}
