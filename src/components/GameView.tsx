import { useEffect, useMemo, useState } from 'react';
import { loadGame, loadIndex } from '../app/data.ts';
import { useAsync } from '../app/hooks.ts';
import { formatMin, shortDate, signed } from '../app/labels.ts';
import type { Route } from '../app/route.ts';
import { seasonOf } from '../domain/season.ts';
import { REG_PERIODS } from '../domain/time.ts';
import type { Game, QualityNote } from '../domain/types.ts';
import { GameBadge } from './GameBadge.tsx';
import { GameChart, totalPlayed, type Cursor } from './GameChart.tsx';
import { CursorPanel, LineupList, QuarterTable, segmentsByTeam, useGameNames } from './GamePanels.tsx';
import { Header } from './Header.tsx';
import { TeamLogo } from './Headshot.tsx';
import { remember } from '../app/hooks.ts';

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
  if (p && q.check === 'minutes') return `${p.name} — minutes: play-by-play ${formatMin(totalPlayed(p))} vs box score ${formatMin(p.min)}. ${verdict}`;
  if (p && q.check === 'plus-minus') {
    const pbp = p.stints.reduce((s, st) => s + st[2], 0);
    return `${p.name} — +/-: play-by-play ${signed(pbp)} vs box score ${signed(p.pm)}. ${verdict}`;
  }
  return `${q.player ?? 'Game'} — ${q.check}: ${q.detail}. ${verdict}`;
}

/** `#/game/latest?t=PHI` → that team's most recent game in the selected season. */
async function resolveGame(route: Props['route'], season: string): Promise<Game> {
  if (route.game !== 'latest') return loadGame(seasonOf(route.game), route.game);
  const idx = await loadIndex(season);
  const last = [...idx].reverse().find((e) => !route.team || e.home === route.team || e.away === route.team);
  if (!last) throw new Error(`No ${route.team ?? ''} games in ${season} yet`);
  return loadGame(season, last.id);
}

export function GameView({ season, route, nav }: Props) {
  const data = useAsync(() => resolveGame(route, season), [route.game, route.team, season]);
  const g = data.status === 'ok' ? data.value : null;
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [trouble, setTrouble] = useState(() => remember('rk.trouble') !== '0');
  useEffect(() => void remember('rk.trouble', trouble ? '1' : '0'), [trouble]);
  useEffect(() => setCursor(null), [g?.id]);

  const back = route.team
    ? { label: 'Back', onClick: () => history.back() }
    : { label: 'Teams', onClick: () => nav({ view: 'team', team: g?.home.tri ?? null, season: g ? seasonOf(g.id) : season, filters: route.filters }) };

  return (
    <div className="page wide">
      <Header back={back}>
        {g && (
          <h1 className="title game-title">
            <TeamLogo teamId={g.away.id} tri={g.away.tri} />
            {g.away.tri} {g.away.score} <span className="muted">@</span> {g.home.tri} {g.home.score}
            <TeamLogo teamId={g.home.id} tri={g.home.tri} />
            <span className="muted">
              · {shortDate(g.date)} {g.date.slice(0, 4)}
              {g.periods > REG_PERIODS ? ` · Final/${g.periods === 5 ? 'OT' : `${g.periods - REG_PERIODS}OT`}` : ' · Final'}
            </span>
            <GameBadge g={g} />
          </h1>
        )}
      </Header>
      {data.status === 'loading' && <p className="muted">Loading…</p>}
      {data.status === 'error' && <p className="error">Could not load game: {data.error}</p>}
      {g && <GameBody g={g} trouble={trouble} setTrouble={setTrouble} cursor={cursor} setCursor={setCursor} info={info} setInfo={setInfo} />}
    </div>
  );
}

function GameBody({
  g,
  trouble,
  setTrouble,
  cursor,
  setCursor,
  info,
  setInfo,
}: {
  g: Game;
  trouble: boolean;
  setTrouble: (b: boolean) => void;
  cursor: Cursor | null;
  setCursor: (c: Cursor | null) => void;
  info: string | null;
  setInfo: (s: string | null) => void;
}) {
  const segments = useMemo(() => segmentsByTeam(g), [g]);
  const names = useGameNames(g);
  return (
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
      <div className="gc-controls">
        <label className="toggle">
          <input type="checkbox" checked={trouble} onChange={(e) => setTrouble(e.target.checked)} />
          <span>Foul trouble</span>
        </label>
        {trouble ? (
          <span className="legend-inline" data-testid="trouble-legend">
            <i className="lvl-ok" /> No trouble <i className="lvl-caution" /> Caution <i className="lvl-trouble" /> Foul trouble
            <span className="muted"> (thresholds adjust per quarter)</span>
          </span>
        ) : (
          <span className="muted">Foul-trouble coloring off</span>
        )}
      </div>
      <div className="gc-sticky-panel">
        <div className="readout" aria-live="polite" data-testid="readout">
          {info ?? <span className="muted">Hover or tap a stint or a numbered foul tick for details.</span>}
        </div>
        <CursorPanel g={g} cursor={cursor} segments={segments} names={names} />
      </div>
      <GameChart g={g} trouble={trouble} cursor={cursor} setCursor={setCursor} setInfo={setInfo} />
      {[g.away, g.home].map((t) => (
        <section key={t.tri} className="team-extras">
          <h2>{t.tri}: minutes & fouls by quarter</h2>
          <QuarterTable g={g} team={t.tri} />
          <LineupList g={g} team={t.tri} segs={segments[t.tri]!} names={names} onPick={(time) => setCursor({ t: time, pinned: true })} />
        </section>
      ))}
    </>
  );
}
