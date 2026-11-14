// Team pattern view in the single-game chart's design: one row per player with his TYPICAL rotation over the
// selected games — the stretches he is on court in at least half of them — as green bars with the duration
// inside (same layout rules as the game chart). Bright green = on court in 75%+ of games, darker = 50–75%.
// Hover/tap anywhere on a row: "on court in 7 of 10 games" at that moment.

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatMin } from '../app/labels.ts';
import { CHART } from '../domain/config.ts';
import { axisTicks, clockLabel, layoutRow, periodName, timelineWidth } from '../domain/gameChart.ts';
import { blowoutIntervals, teamPatternRows, type Selection, type TeamPattern } from '../domain/patterns.ts';
import { TEAM_PATTERN } from '../domain/config.ts';
import { periodEnd, periodStart, REGULATION_LEN } from '../domain/time.ts';
import type { PlayerGame } from '../domain/types.ts';
import { COLS } from './GameChart.tsx';
import { Headshot } from './Headshot.tsx';
import { PlayerLink } from './Links.tsx';

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

const usePhone = () => {
  const [phone, setPhone] = useState(() => matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const m = matchMedia('(max-width: 640px)');
    const on = () => setPhone(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
};

export const STRONG_SHARE = 0.75;
// GP column ("10/10") is wider than the game chart's PF column.
const GP_COL = { desktop: 52, phone: 46 };

interface Props {
  sel: Selection;
  tp: TeamPattern;
  names: Map<number, string>;
  showRare: boolean;
  onToggleRare: () => void;
}

export function PatternChart({ sel, tp, names, showRare, onToggleRare }: Props) {
  const phone = usePhone();
  const cols = { left: (phone ? COLS.phone : COLS.desktop).left, pf: phone ? GP_COL.phone : GP_COL.desktop };
  const [boxRef, boxW] = useWidth<HTMLDivElement>();
  const W = timelineWidth(4, Math.max(0, boxW - cols.left - cols.pf));
  const k = W / REGULATION_LEN;
  const ticks = useMemo(() => axisTicks(4), []);
  const contentRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  // Per player: his games (on-court intervals, excluded garbage time) for exact "X of Y games" at any moment.
  const perPlayer = useMemo(() => {
    const m = new Map<number, { on: [number, number][]; excl: [number, number][] }[]>();
    for (const g of sel.games) {
      const excl = sel.filters.blowout ? blowoutIntervals(g) : [];
      for (const p of g.players) {
        if (p.team !== sel.team || !p.played || !p.stints.length) continue;
        if (!m.has(p.id)) m.set(p.id, []);
        m.get(p.id)!.push({
          on: p.stints.filter(([s, e]) => e > s).map(([s, e]) => [s, e]),
          excl,
        });
      }
    }
    return m;
  }, [sel]);
  const countAt = (id: number, t: number) => {
    let on = 0;
    let elig = 0;
    for (const g of perPlayer.get(id) ?? []) {
      if (g.excl.some(([a, b]) => a <= t && t < b)) continue;
      elig++;
      if (g.on.some(([a, b]) => a <= t && t < b)) on++;
    }
    return { on, elig };
  };

  const rows = useMemo(
    () =>
      teamPatternRows(tp).map(({ player: p, bars: typical, rarelyUsed }) => {
        // Reuse the game chart's row layout with the typical stretches as stints.
        const fake: PlayerGame = {
          id: p.id, name: p.name, team: sel.team, starter: false, played: true, min: 0, pts: 0, reb: 0, ast: 0, pf: 0, pm: 0,
          stints: typical.map((s) => [s.start, s.end, 0]),
        };
        return { p, typical, rarelyUsed, layout: layoutRow(fake, 4, W, { trouble: false }) };
      }),
    [tp, sel, W],
  );
  const regular = rows.filter((r) => !r.rarelyUsed);
  const rare = rows.filter((r) => r.rarelyUsed);

  const local = (e: React.PointerEvent | React.MouseEvent) => {
    const r = contentRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const tipAt = (id: number, name: string) => (e: React.PointerEvent | React.MouseEvent) => {
    const { x, y } = local(e);
    const t = Math.max(0, Math.min(REGULATION_LEN - 0.01, (x - cols.left) / k));
    const { on, elig } = countAt(id, t);
    const bar = rows.find((r) => r.p.id === id)?.typical.find((s) => s.start <= t && t < s.end);
    const text = elig
      ? `${name} · ${clockLabel(t, true)} · on court in ${on} of ${elig} game${elig === 1 ? '' : 's'}` +
        (bar
          ? ` · typical stretch ${clockLabel(bar.start, true)} → ${clockLabel(bar.end)} (${formatMin(bar.end - bar.start)}, ${Math.round(bar.share * 100)}% of games)`
          : '')
      : `${name} · ${clockLabel(t, true)} · only garbage time here (excluded)`;
    setTip({ x, y, text });
  };

  const renderRow = ({ p, typical, rarelyUsed, layout }: (typeof rows)[number]) => {
          const name = names.get(p.id) ?? p.name;
          const longWord = Math.max(...name.split(/[\s-]+/).map((w) => w.length)) > 10;
          return (
            <div className={`gc-row${rarelyUsed ? ' rare' : ''}`} key={p.id} data-testid="player-row" data-player={p.id} data-rare={rarelyUsed}>
              <div className="gc-left gc-sticky">
                <Headshot id={p.id} name={p.name} />
                <span className="gc-name" title={p.name}>
                  <PlayerLink id={p.id} team={sel.team} season={sel.season}>
                    <span className="full">{p.name}</span>
                    <span className={`short${longWord ? ' long' : ''}`}>{name}</span>
                  </PlayerLink>
                </span>
                <span className="gc-min" data-testid="avg-min">
                  {formatMin(p.avgMin)}
                </span>
              </div>
              <div
                className="gc-track"
                style={{ width: W, height: layout.height }}
                onPointerMove={(e) => e.pointerType === 'mouse' && tipAt(p.id, p.name)(e)}
                onClick={tipAt(p.id, p.name)}
              >
                <i className="gc-band" style={{ top: CHART.laneTopPx, height: CHART.barPx }} />
                {ticks.map((x) =>
                  x.t === periodStart(x.period) ? (
                    x.period > 1 && (
                      <i
                        key={x.t}
                        className="gc-divider"
                        style={{
                          left: x.t * k,
                          top: CHART.laneTopPx,
                          height: CHART.barPx,
                        }}
                      />
                    )
                  ) : (
                    <i
                      key={x.t}
                      className="gc-grid"
                      style={{
                        left: x.t * k,
                        top: CHART.laneTopPx,
                        height: CHART.barPx,
                      }}
                    />
                  ),
                )}
                {!typical.length && (
                  <span className="gc-none" style={{ top: CHART.laneTopPx, height: CHART.barPx }} data-testid="no-typical">
                    No regular stretch — his minutes move around (hover for counts)
                  </span>
                )}
                {layout.bars.map((b, i) => (
                  <div
                    key={i}
                    className={`gc-bar ${(typical[i]?.share ?? 1) >= STRONG_SHARE ? 'lvl-ok' : 'lvl-typ-mid'}`}
                    style={{
                      left: b.x,
                      width: b.w,
                      top: CHART.laneTopPx,
                      height: CHART.barPx,
                    }}
                    data-testid="typical-stint"
                    data-start={b.st[0]}
                    data-end={b.st[1]}
                  />
                ))}
                {layout.bars.map((b, i) => (
                  <span
                    key={`l${i}`}
                    className={`gc-label${b.label.inside ? ' in' : ` out lane-${b.label.lane}`}${(typical[i]?.share ?? 1) < STRONG_SHARE && b.label.inside ? ' on-mid' : ''}`}
                    style={{
                      left: b.label.x,
                      width: b.label.w,
                      top: b.label.lane === 'bar' ? CHART.laneTopPx : b.label.lane === 'top' ? 0 : CHART.laneTopPx + CHART.barPx,
                      height: b.label.lane === 'bar' ? CHART.barPx : CHART.laneTopPx,
                    }}
                    data-testid="stint-label"
                    data-inside={b.label.inside}
                  >
                    {b.label.text}
                  </span>
                ))}
              </div>
              <div className="gc-pf gc-gp gc-sticky-r" data-testid="gp">
                {p.gamesPlayed}
                <span className="muted">/{tp.games}</span>
              </div>
            </div>
    );
  };

  return (
    <div className="gc-box" ref={boxRef} data-testid="pattern-chart">
      <div
        className="gc-content"
        ref={contentRef}
        style={{ width: cols.left + W + cols.pf }}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setTip(null)}
      >
        <div className="gc-legend-row tp-legend-row">
          <div className="gc-sticky gc-legend" data-testid="typical-legend">
            <span className="gc-legend-title">Typical rotation:</span>
            <span>
              <i className="lvl-ok" /> on court in {Math.round(STRONG_SHARE * 100)}%+ of games
            </span>
            <span>
              <i className="lvl-typ-mid" /> 50–{Math.round(STRONG_SHARE * 100)}%
            </span>
            <span className="muted">(stretches he plays in at least half of his games{tp.games >= 2 ? `; bars under ${formatMin(TEAM_PATTERN.minBarSeconds)} not drawn` : ''}; hover for exact counts)</span>
            {sel.games.some((g) => g.periods > 4) && <span className="muted">Overtime is not shown here.</span>}
          </div>
        </div>
        <div className="gc-row gc-axis">
          <div className="gc-left gc-sticky gc-colhead">
            <span className="gc-name">Player</span>
            <span className="gc-min">MIN</span>
          </div>
          <div className="gc-track" style={{ width: W }}>
            {[1, 2, 3, 4].map((q) => (
              <span
                key={q}
                className="gc-qname"
                style={{
                  left: periodStart(q) * k,
                  width: (periodEnd(q) - periodStart(q)) * k,
                }}
              >
                {periodName(q)}
              </span>
            ))}
            {ticks.map((x) => (
              <span key={x.t} className="gc-clock" style={{ left: x.t * k }}>
                {x.label}
              </span>
            ))}
          </div>
          <div className="gc-pf gc-gp gc-sticky-r gc-colhead" title="Games played / games in selection">
            GP
          </div>
        </div>
        {regular.map(renderRow)}
        {rare.length > 0 && (
          <RareToggle count={rare.length} games={tp.games} open={showRare} onToggle={onToggleRare} />
        )}
        {showRare && rare.map(renderRow)}
        {tip && (
          <div
            className="gc-tip"
            data-testid="pattern-tip"
            style={{
              left: tip.x,
              top: tip.y,
              transform: `translate(${tip.x > cols.left + W * 0.55 ? 'calc(-100% - 12px)' : '12px'}, -120%)`,
            }}
          >
            {tip.text}
          </div>
        )}
      </div>
    </div>
  );
}

/** "Rarely used (N)" header; the same open/closed state drives both team-page views. */
export function RareToggle({ count, games, open, onToggle }: { count: number; games: number; open: boolean; onToggle: () => void }) {
  return (
    <button className="gc-rare-toggle" aria-expanded={open} onClick={onToggle} data-testid="rare-toggle">
      {open ? '▾' : '▸'} Rarely used ({count}) · played in fewer than {Math.ceil(games * TEAM_PATTERN.rarelyUsedShare)} of the {games} game
      {games === 1 ? '' : 's'}
    </button>
  );
}
