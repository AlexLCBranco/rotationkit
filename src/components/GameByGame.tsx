// Averages "Game by game" view: per player (same order and "Rarely used" group as the other views), one thin strip per
// game of his actual stints in the selection's last 5 games, newest on top, on the shared quarter axis (Q1–Q4).
// A game he missed shows an empty strip with the reason. Clicking a strip opens that game.

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatMin, shortDate } from '../app/labels.ts';
import { format, type Route } from '../app/route.ts';
import { axisTicks, periodName, timelineWidth } from '../domain/gameChart.ts';
import { lastGames, playerStrips, GAME_BY_GAME } from '../domain/gameByGame.ts';
import type { AppearanceIndex } from '../domain/availability.ts';
import { teamPatternRows, type Selection, type TeamPattern } from '../domain/patterns.ts';
import { periodEnd, periodStart, REGULATION_LEN } from '../domain/time.ts';
import { COLS } from './GameChart.tsx';
import { Headshot } from './Headshot.tsx';
import { PlayerLink, TeamLink } from './Links.tsx';
import { RareToggle } from './PatternChart.tsx';

const GP_COL = 52;
const STRIP_PX = 10;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e!.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

interface Props {
  sel: Selection;
  tp: TeamPattern;
  names: Map<number, string>;
  idx: AppearanceIndex;
  showRare: boolean;
  onToggleRare: () => void;
  nav: (r: Route) => void;
}

export function GameByGame({ sel, tp, names, idx, showRare, onToggleRare, nav }: Props) {
  const [boxRef, boxW] = useWidth<HTMLDivElement>();
  const cols = { left: COLS.desktop.left, pf: GP_COL };
  const W = timelineWidth(4, Math.max(0, boxW - cols.left - cols.pf));
  const k = W / REGULATION_LEN;
  const ticks = useMemo(() => axisTicks(4), []);
  const games = useMemo(() => lastGames(sel.games), [sel.games]);
  const rows = useMemo(() => teamPatternRows(tp), [tp]);
  const gameRoute = (id: string): Route => ({ view: 'game', game: id, team: sel.team, season: sel.season, filters: sel.filters });
  const grid = (
    <>
      {ticks.map((x) =>
        x.t === periodStart(x.period) ? (
          x.period > 1 && <i key={x.t} className="gc-divider" style={{ left: x.t * k, top: 2, height: STRIP_PX }} />
        ) : (
          <i key={x.t} className="gc-grid" style={{ left: x.t * k, top: 2, height: STRIP_PX }} />
        ),
      )}
    </>
  );

  const renderPlayer = ({ player: p, rarelyUsed }: (typeof rows)[number]) => {
    const strips = playerStrips(games, sel.team, p.id, idx);
    return (
      <div className={`gbg-player${rarelyUsed ? ' rare' : ''}`} key={p.id} data-testid="player-row" data-player={p.id} data-rare={rarelyUsed}>
        <div className="gc-row gbg-head">
          <div className="gc-left gc-sticky">
            <Headshot id={p.id} name={p.name} />
            <span className="gc-name" title={p.name}>
              <PlayerLink id={p.id} team={sel.team} season={sel.season}>
                {names.get(p.id) ?? p.name}
              </PlayerLink>
            </span>
            <span className="gc-min">{formatMin(p.avgMin)}</span>
          </div>
          <div className="gc-track" style={{ width: W }} />
          <div className="gc-pf gc-gp gc-sticky-r" data-testid="gp">
            {p.gamesPlayed}
            <span className="muted">/{tp.games}</span>
          </div>
        </div>
        {strips.map((s) => (
          <div
            key={s.game.id}
            className={`gc-row gbg-game clickable${s.played ? '' : ' gbg-off'}`}
            onClick={() => nav(gameRoute(s.game.id))}
            title={`${shortDate(s.game.date)} ${s.home ? 'vs' : '@'} ${s.opp} — open the game`}
            data-testid="gbg-strip"
            data-game={s.game.id}
            data-played={s.played}
          >
            <div className="gc-left gc-sticky gbg-label">
              <a href={format(gameRoute(s.game.id))} onClick={(e) => e.stopPropagation()} className="gbg-date">
                {shortDate(s.game.date)}
              </a>
              <span className="muted">{s.home ? 'vs' : '@'}</span>
              <TeamLink team={s.opp} season={sel.season}>
                {s.opp}
              </TeamLink>
            </div>
            <div className="gc-track" style={{ width: W, height: STRIP_PX + 4 }}>
              <i className="gc-band" style={{ top: 2, height: STRIP_PX }} />
              {grid}
              {s.stints.map(([a, b]) => (
                <i
                  key={a}
                  className="gbg-bar"
                  style={{ left: a * k, width: Math.max(2, (b - a) * k), top: 2, height: STRIP_PX }}
                  data-testid="gbg-stint"
                  data-start={a}
                  data-end={b}
                  title={`${formatMin(b - a)}`}
                />
              ))}
              {!s.played && (
                <span className="gbg-missed" data-testid="gbg-missed">
                  {s.missed}
                </span>
              )}
            </div>
            <div className="gc-pf gc-gp gc-sticky-r gbg-min" data-testid="gbg-min">
              {s.played ? formatMin(s.stints.reduce((x, [a, b]) => x + b - a, 0) + s.otSeconds) : '—'}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="gc-box" ref={boxRef} data-testid="game-by-game">
      <div className="gc-content" style={{ width: cols.left + W + cols.pf }}>
        <div className="gc-legend-row tp-legend-row">
          <div className="gc-sticky gc-legend">
            <span className="gc-legend-title">Game by game:</span>
            <span className="muted">
              his actual stints in the last {Math.min(GAME_BY_GAME.games, games.length)} game{games.length === 1 ? '' : 's'} of this selection, newest on top · click a strip
              to open the game{games.some((g) => g.periods > 4) ? ' · overtime is not shown (MIN includes it)' : ''}
            </span>
          </div>
        </div>
        <div className="gc-row gc-axis">
          <div className="gc-left gc-sticky gc-colhead">
            <span className="gc-name">Player / game</span>
            <span className="gc-min">MIN</span>
          </div>
          <div className="gc-track" style={{ width: W }}>
            {[1, 2, 3, 4].map((q) => (
              <span key={q} className="gc-qname" style={{ left: periodStart(q) * k, width: (periodEnd(q) - periodStart(q)) * k }}>
                {periodName(q)}
              </span>
            ))}
            {ticks.map((x) => (
              <span key={x.t} className="gc-clock" style={{ left: x.t * k }}>
                {x.label}
              </span>
            ))}
          </div>
          <div className="gc-pf gc-gp gc-sticky-r gc-colhead" title="Games played / games in selection (header); minutes that game">
            GP
          </div>
        </div>
        {rows.filter((r) => !r.rarelyUsed).map(renderPlayer)}
        {rows.some((r) => r.rarelyUsed) && <RareToggle count={rows.filter((r) => r.rarelyUsed).length} games={tp.games} open={showRare} onToggle={onToggleRare} />}
        {showRare && rows.filter((r) => r.rarelyUsed).map(renderPlayer)}
      </div>
    </div>
  );
}

