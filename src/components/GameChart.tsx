// Single-game rotation chart, laid out like fantasyteamadvice.com/nba/rotations: per team a logo + name header,
// foul-trouble legend, PLAYER | MIN | Q1–Q4 (+OT) | PF, one compact row per player with stints on a dark track.
// Improvements: every stint shows its duration, numbered foul ticks with type/quarter/clock, per-quarter PF
// badges, clock ticks, blowout shading, a floating tooltip, and a lineup cursor (hover; click/tap to pin).
// Name + MIN are frozen on the left and PF on the right; the timeline scrolls sideways inside its own box when
// the screen is narrower than the minimum scale.

import { usePhone, useTapOutside } from '../app/phone.ts';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatMin, signed } from '../app/labels.ts';
import { dnpLabel } from '../app/dnp.ts';
import { shortNames } from '../app/names.ts';
import { teamName } from '../app/teams.ts';
import { CHART, CHART_COMPACT, type ChartGeo } from '../domain/config.ts';
import type { ReadoutSettings } from '../app/readoutSettings.ts';
import {
  axisTicks, clockLabel, foulReadout, hoverReadout, layoutRow, periodName, scoreAt, timelineWidth, type HoverReadout, type LineupSegment, type RowLayout,
} from '../domain/gameChart.ts';
import { blowoutIntervals } from '../domain/patterns.ts';
import { gameLength, periodEnd, periodStart } from '../domain/time.ts';
import type { Game, PlayerGame, Stint, TeamInfo } from '../domain/types.ts';
import { Headshot, TeamLogo } from './Headshot.tsx';
import { PlayerLink, TeamLink } from './Links.tsx';
import { MarginLabel, MarginSvg } from './MarginStrip.tsx';
import { usualAt, usualLine, usualStintAt, type Usual } from '../domain/usual.ts';
import { seasonOf } from '../domain/season.ts';
import { mergeContinuous, ptsText, stintSplitText } from '../domain/stints.ts';

export interface Cursor {
  t: number;
  pinned: boolean;
}

/** Frozen column widths (must match styles.css .gc-left / .gc-pf). */
export const COLS = { desktop: { left: 230, pf: 40 }, phone: { left: 160, pf: 32 } } as const;

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

export const totalPlayed = (p: PlayerGame) => p.stints.reduce((x, [s, e]) => x + e - s, 0);

/** "Maxey: in Q1 12:00 → out Q1 6:12 · 5:48 · +/- +4 · 8 pts", or "Maxey (off court)". Points only with data. */
export const stintLine = (name: string, s: Stint | null, pts: number | null = null, all: Stint[] = []) => {
  if (!s) return `${name} (off court)`;
  const fouls = s[3]?.length ? ` · ${s[3].length} foul${s[3].length > 1 ? 's' : ''}` : '';
  // RK-5: on court straight through a quarter break: the whole run, with each quarter's part.
  const run = mergeContinuous(all).find((x) => x[0] <= s[0] && x[1] >= s[1]);
  const across = run && (run[0] < s[0] || run[1] > s[1]) ? ` · in a row: ${stintSplitText(run)}` : '';
  return `${name}: in ${clockLabel(s[0], true)} → out ${clockLabel(s[1])} · ${formatMin(s[1] - s[0])} · +/- ${signed(s[2])}${ptsText(pts)}${fouls}${across}`;
};

function ReadoutCard({ r, names, settings, season, usual }: { r: HoverReadout; names: Map<number, string>; settings: ReadoutSettings; season: string; usual: string | null }) {
  const [mine, theirs] = r.teams as [HoverReadout['teams'][number], HoverReadout['teams'][number]];
  const name = (p: PlayerGame) => names.get(p.id) ?? p.name;
  const lineup = (t: HoverReadout['teams'][number], muted: boolean) => (
    <div className={`rd-lineup${muted ? ' opp' : ''}`} data-testid="readout-lineup" data-team={t.team}>
      <TeamLink team={t.team} season={season} className="rd-tri">
        {t.team}
      </TeamLink>
      {t.players.map((x) => (
        <span key={x.p.id} className={`rd-p${x.me ? ' me' : ''}`} data-testid="readout-player" data-player={x.p.id} data-fouls={x.fouls}>
          <PlayerLink id={x.p.id} team={x.p.team} season={season}>
            {name(x.p)}
          </PlayerLink>
          {settings.fouls && x.fouls > 0 && (
            <span className="rd-pf" data-testid="readout-fouls">
              {x.fouls}
            </span>
          )}
        </span>
      ))}
    </div>
  );
  return (
    <>
      <div className="rd-head" data-testid="readout-head">
        {r.clock} ·{' '}
        <TeamLink team={mine.team} season={season}>
          {mine.team}
        </TeamLink>{' '}
        {mine.score}–{theirs.score}{' '}
        <TeamLink team={theirs.team} season={season}>
          {theirs.team}
        </TeamLink>
      </div>
      {settings.lineups !== 'off' && lineup(mine, false)}
      {settings.lineups === 'both' && lineup(theirs, true)}
      {settings.stint && (
        <div className="rd-stint" data-testid="readout-stint">
          {stintLine(name(r.player), r.stint, r.stintPts, r.player.stints)}
        </div>
      )}
      {usual && (
        <div className="rd-usual" data-testid="readout-usual">
          {usual}
        </div>
      )}
    </>
  );
}

/** Readout anchor in viewport coordinates: pointer x and the hovered row's top/bottom (the card never covers it). */
interface Tip {
  x: number;
  top: number;
  bottom: number;
  content: { kind: 'text'; text: string } | { kind: 'player'; id: number; t: number };
}

interface Props {
  g: Game;
  trouble: boolean;
  cursor: Cursor | null;
  setCursor: (c: Cursor | null) => void;
  names: Map<number, string>;
  segments: Record<string, LineupSegment[]>;
  readout: ReadoutSettings;
  /** "Usual" outlines per player (null = toggle off). */
  usual?: Map<number, Usual> | null;
  /** Compact (both teams): thinner rows, one shared time axis, DNP rows folded into one line per team. */
  compact?: boolean;
  /** This team's rows first (the selected team); null = away first, as before. */
  first?: string | null;
}

export function GameChart({ g, trouble, cursor, setCursor, names, segments, readout, usual = null, compact = false, first = null }: Props) {
  const phone = usePhone();
  const cols = phone ? COLS.phone : COLS.desktop;
  const [boxRef, boxW] = useWidth<HTMLDivElement>();
  const total = gameLength(g.periods);
  const W = timelineWidth(g.periods, Math.max(0, boxW - cols.left - cols.pf));
  const k = W / total;
  const blowout = useMemo(() => blowoutIntervals(g), [g]);
  const ticks = useMemo(() => axisTicks(g.periods), [g.periods]);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  // Text of the hovered item (stint / foul tick / DNP); a ref so the move handler sees it in the same event.
  const item = useRef<string | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  // A new game: drop the readout (it may point at a player of the previous game).
  useEffect(() => {
    setTip(null);
    item.current = null;
  }, [g.id]);

  const local = (clientX: number) => clientX - contentRef.current!.getBoundingClientRect().left;
  const tAt = (x: number) => {
    const tx = x - cols.left;
    return tx < 0 || tx > W ? null : Math.max(0, Math.min(total, tx / k));
  };
  const cursorText = (t: number) => {
    const [h, a] = scoreAt(g, t);
    return `${clockLabel(t, t < total)} · ${g.away.tri} ${a}–${h} ${g.home.tri}`;
  };
  /** Anchor at the pointer, above/below the row under it. */
  const anchor = (e: { clientX: number; clientY: number; target: EventTarget | null }) => {
    const row = (e.target as Element | null)?.closest?.('.gc-row')?.getBoundingClientRect();
    return { x: e.clientX, top: row?.top ?? e.clientY - 10, bottom: row?.bottom ?? e.clientY + 10 };
  };
  /** The player whose timeline (track) is under the pointer, if any. */
  const trackPlayer = (target: EventTarget | null) => {
    const el = target as Element | null;
    if (!el?.closest?.('.gc-track')) return null;
    const id = el.closest('[data-testid=gc-player-row]')?.getAttribute('data-player');
    return id ? Number(id) : null;
  };
  /** Foul ticks and DNP badges report their own text here (it wins over the row readout). */
  const show = (text: string) => (e: React.PointerEvent | React.MouseEvent) => {
    item.current = text;
    setTip({ ...anchor(e), content: { kind: 'text', text } });
  };
  const tipFor = (e: React.PointerEvent | React.MouseEvent, t: number | null): Tip | null => {
    if (item.current) return { ...anchor(e), content: { kind: 'text', text: item.current } };
    const id = trackPlayer(e.target);
    if (id !== null && t !== null) return { ...anchor(e), content: { kind: 'player', id, t } };
    return t !== null ? { ...anchor(e), content: { kind: 'text', text: cursorText(t) } } : null;
  };
  // Touch: a tapped readout stays until the next tap outside the chart (shared rule, useTapOutside).
  useTapOutside(!!tip, () => [tipRef.current, contentRef.current], () => {
    setTip(null);
    item.current = null;
  });
  // Place the card: beside the pointer, above the hovered row (below if no room), always inside the window.
  useLayoutEffect(() => {
    const el = tipRef.current;
    if (!el || !tip) return;
    const m = 8;
    const { width: w, height: h } = el.getBoundingClientRect();
    let left = tip.x + 14;
    if (left + w > innerWidth - m) left = tip.x - w - 14;
    left = Math.max(m, Math.min(left, innerWidth - w - m));
    const above = tip.top - h - 6;
    const below = tip.bottom + 6;
    let top = above >= m ? above : below + h <= innerHeight - m ? below : tip.top - m > innerHeight - tip.bottom - m ? m : innerHeight - h - m;
    top = Math.max(m, Math.min(top, innerHeight - h - m));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = 'visible';
  });

  return (
    <div className={`gc-box${compact ? ' gc-compact' : ''}`} ref={boxRef} data-testid="game-chart" data-compact={compact}>
      <div
        className="gc-content"
        ref={contentRef}
        style={{ width: cols.left + W + cols.pf }}
        onPointerMove={(e) => {
          const t = tAt(local(e.clientX));
          if (dragging.current || (e.pointerType === 'mouse' && !cursor?.pinned)) {
            if (t !== null) setCursor({ t, pinned: dragging.current || !!cursor?.pinned });
          }
          if (e.pointerType === 'mouse') setTip(tipFor(e, t));
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'mouse') return;
          setTip(null);
          item.current = null;
          if (!cursor?.pinned) setCursor(null);
        }}
        onPointerUp={() => (dragging.current = false)}
        onClick={(e) => {
          const t = tAt(local(e.clientX));
          if (t === null) return;
          // Mouse: click pins/unpins. Touch: tap pins the cursor there and shows the readout.
          const mouse = e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType === 'mouse';
          if (cursor?.pinned && mouse) setCursor({ t, pinned: false });
          else {
            setCursor({ t, pinned: true });
            if (!mouse) setTip(tipFor(e, t));
          }
        }}
      >
        <div className="gc-row gc-margin-row" data-testid="margin-row">
          <div className="gc-left gc-sticky">
            <MarginLabel g={g} />
          </div>
          <div className="gc-track" style={{ width: W }}>
            <MarginSvg g={g} width={W} {...(compact ? { height: 18 } : {})} />
          </div>
          <div className="gc-pf gc-sticky-r" />
        </div>
        {(first === g.home.tri ? [g.home, g.away] : [g.away, g.home]).map((team, i) => (
          <TeamRows
            key={team.tri}
            side={team.tri === g.home.tri ? 'home' : 'away'}
            compact={compact}
            axis={!compact || i === 0}
            g={g}
            team={team}
            W={W}
            k={k}
            blowout={blowout}
            ticks={ticks}
            trouble={trouble}
            points={readout.barPoints && !!g.stintPts}
            show={show}
            leave={() => (item.current = null)}
            usual={usual}
          />
        ))}
        {cursor && (
          <div className="gc-cursor" style={{ left: cols.left + cursor.t * k }} data-testid="cursor-line">
            <span
              className="gc-cursor-handle"
              onPointerDown={(e) => {
                dragging.current = true;
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                e.stopPropagation();
              }}
              onPointerUp={() => (dragging.current = false)}
              onClick={(e) => e.stopPropagation()}
              title="Drag to move"
            >
              {clockLabel(cursor.t, cursor.t < total)}
            </span>
          </div>
        )}
        {tip && (
          <div
            className={`gc-tip at-viewport${tip.content.kind === 'player' ? ' rd' : ''}`}
            ref={tipRef}
            data-testid="chart-tip"
            data-t={tip.content.kind === 'player' ? tip.content.t : undefined}
            data-player={tip.content.kind === 'player' ? tip.content.id : undefined}
            style={{ visibility: 'hidden' }}
          >
            {tip.content.kind === 'text' ? (
              tip.content.text
            ) : g.players.some((p) => tip.content.kind === 'player' && p.id === tip.content.id) ? (
              <ReadoutCard
                r={hoverReadout(g, tip.content.id, tip.content.t, segments)}
                names={names}
                settings={readout}
                season={seasonOf(g.id)}
                usual={(() => {
                  const u = usual?.get(tip.content.id);
                  return u && usualStintAt(u, tip.content.t) ? usualLine(usualAt(u, tip.content.t)) : null;
                })()}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function TeamRows({
  g,
  team,
  side,
  compact,
  axis,
  W,
  k,
  blowout,
  ticks,
  trouble,
  points,
  show,
  leave,
  usual,
}: {
  g: Game;
  team: TeamInfo;
  side: 'home' | 'away';
  compact: boolean;
  /** Show the clock axis row (compact: only above the first team, shared by both). */
  axis: boolean;
  W: number;
  k: number;
  blowout: [number, number][];
  ticks: { t: number; label: string; period: number }[];
  trouble: boolean;
  /** Points on the bars (readout setting, only for game files with points per stint). */
  points: boolean;
  show: (text: string) => (e: React.PointerEvent | React.MouseEvent) => void;
  leave: () => void;
  usual: Map<number, Usual> | null;
}) {
  const geo: ChartGeo = compact ? CHART_COMPACT : CHART;
  const [dnpOpen, setDnpOpen] = useState(false);
  const players = g.players.filter((p) => p.team === team.tri);
  const inactive = (g.inactive ?? []).filter((p) => p.team === team.tri);
  const names = useMemo(() => shortNames([...players, ...inactive]), [g, team.tri]); // eslint-disable-line react-hooks/exhaustive-deps
  const played = players.filter((p) => p.played && p.stints.length);
  const starters = played.filter((p) => p.starter).sort((a, b) => totalPlayed(b) - totalPlayed(a));
  const bench = played.filter((p) => !p.starter).sort((a, b) => totalPlayed(b) - totalPlayed(a));
  const dnp = [
    ...players.filter((p) => !p.played || !p.stints.length).map((p) => ({ id: p.id, name: p.name, label: dnpLabel(p.reason, p.reasonDetail) })),
    ...inactive.map((p) => ({ id: p.id, name: p.name, label: dnpLabel(p.reason, p.reasonDetail, true) })),
  ];
  const band = (
    <>
      <i className="gc-band" style={{ top: geo.laneTopPx, height: geo.barPx }} />
      {ticks.map((x) =>
        x.t === periodStart(x.period) ? (
          x.period > 1 && <i key={x.t} className="gc-divider" style={{ left: x.t * k, top: geo.laneTopPx, height: geo.barPx }} />
        ) : (
          <i key={x.t} className="gc-grid" style={{ left: x.t * k, top: geo.laneTopPx, height: geo.barPx }} />
        ),
      )}
      {blowout.map(([a, b]) => (
        <i key={`b${a}`} className="gc-blowout" style={{ left: a * k, width: (b - a) * k, top: geo.laneTopPx, height: geo.barPx }} />
      ))}
    </>
  );
  const Name = ({ id, name }: { id: number; name: string }) => {
    const short = names.get(id) ?? name;
    // Very long single words (Wembanyama, Antetokounmpo) get a smaller font on phone instead of a mid-word break.
    const longWord = Math.max(...short.split(/[\s-]+/).map((w) => w.length)) > 10;
    return (
      <span className="gc-name" title={name}>
        <PlayerLink id={id} team={team.tri} season={seasonOf(g.id)}>
          <span className="full">{name}</span>
          <span className={`short${longWord ? ' long' : ''}`}>{short}</span>
        </PlayerLink>
      </span>
    );
  };
  return (
    <section className="gc-team" data-testid="game-team">
      <div className="gc-team-head">
        <div className="gc-sticky gc-team-title">
          <TeamLogo teamId={team.id} tri={team.tri} />
          <strong>
            <TeamLink team={team.tri} season={seasonOf(g.id)}>
              {teamName(team.tri)}
            </TeamLink>
          </strong>
          <span className={`ha-tag ${side}`} data-testid="home-away-tag" title={side === 'home' ? 'Home team' : 'Away team'}>
            {side === 'home' ? 'HOME' : 'AWAY'}
          </span>
          <span className="gc-team-score">{team.score}</span>
        </div>
      </div>
      {!compact && <div className="gc-legend-row">
        <div className="gc-sticky gc-legend" data-testid="trouble-legend">
          {trouble ? (
            <>
              <span className="gc-legend-title">Foul Trouble:</span>
              <span>
                <i className="lvl-ok" /> No trouble
              </span>
              <span>
                <i className="lvl-caution" /> Caution
              </span>
              <span>
                <i className="lvl-trouble" /> Foul trouble
              </span>
              <span className="muted">(thresholds adjust per quarter)</span>
            </>
          ) : (
            <span className="muted">Foul-trouble colors off</span>
          )}
        </div>
      </div>}
      {axis && <div className="gc-row gc-axis">
        <div className="gc-left gc-sticky gc-colhead">
          <span className="gc-name">Player</span>
          <span className="gc-min">MIN</span>
        </div>
        <div className="gc-track" style={{ width: W }}>
          {Array.from({ length: g.periods }, (_, i) => (
            <span key={i} className="gc-qname" style={{ left: periodStart(i + 1) * k, width: (periodEnd(i + 1) - periodStart(i + 1)) * k }}>
              {periodName(i + 1)}
            </span>
          ))}
          {ticks.map((x) => (
            <span key={x.t} className="gc-clock" style={{ left: x.t * k }}>
              {x.label}
            </span>
          ))}
        </div>
        <div className="gc-pf gc-sticky-r gc-colhead">PF</div>
      </div>}
      {starters.map((p) => (
        <PlayerRow key={p.id} p={p} g={g} W={W} k={k} trouble={trouble} points={points} compact={compact} band={band} show={show} leave={leave} usual={usual?.get(p.id) ?? null} name={<Name id={p.id} name={p.name} />} />
      ))}
      {bench.length > 0 && <div className="gc-bench-divider" aria-hidden />}
      {bench.map((p) => (
        <PlayerRow key={p.id} p={p} g={g} W={W} k={k} trouble={trouble} points={points} compact={compact} band={band} show={show} leave={leave} usual={usual?.get(p.id) ?? null} name={<Name id={p.id} name={p.name} />} />
      ))}
      {compact && dnp.length > 0 && (
        <button type="button" className="gc-dnp-fold" aria-expanded={dnpOpen} onClick={(e) => (e.stopPropagation(), setDnpOpen(!dnpOpen))} data-testid="dnp-fold">
          {dnpOpen ? '▾' : '▸'} Did not play: {dnp.length}{' '}
          {!dnpOpen &&
            dnp.map((p) => (
              <span key={p.id} className="gc-fold-p">
                {names.get(p.id) ?? p.name} <span className={`dnp-tag mini ${p.label.kind}`}>{p.label.kind === 'cd' ? 'CD' : p.label.kind === 'injury' ? 'OUT' : p.label.tag}</span>
              </span>
            ))}
        </button>
      )}
      {(!compact || dnpOpen) && dnp.map((p) => (
        <div className="gc-row gc-dnp" key={p.id} data-testid="dnp-row" data-kind={p.label.kind}>
          <div className="gc-left gc-sticky">
            <Headshot id={p.id} name={p.name} />
            <Name id={p.id} name={p.name} />
            <span className="gc-min muted">—</span>
          </div>
          <div className="gc-track" style={{ width: W }}>
            {/* The reason, readable without hovering: kind tag + the source's detail. */}
            <span className="gc-dnp-reason" data-testid="dnp-reason">
              <span className={`dnp-tag ${p.label.kind}`} data-testid="dnp-tag">
                {p.label.tag}
              </span>
              {p.label.detail && <span className="dnp-detail">{p.label.detail}</span>}
            </span>
          </div>
          <div className="gc-pf gc-sticky-r" />
        </div>
      ))}
    </section>
  );
}

function PlayerRow({
  p,
  g,
  W,
  k,
  usual,
  trouble,
  points,
  compact,
  band,
  show,
  leave,
  name,
}: {
  p: PlayerGame;
  g: Game;
  W: number;
  k: number;
  usual: Usual | null;
  trouble: boolean;
  points: boolean;
  compact: boolean;
  band: React.ReactNode;
  show: (text: string) => (e: React.PointerEvent | React.MouseEvent) => void;
  leave: () => void;
  name: React.ReactNode;
}) {
  const geo: ChartGeo = compact ? CHART_COMPACT : CHART;
  const r: RowLayout = useMemo(() => layoutRow(p, g.periods, W, { trouble, points, compact }), [p, g.periods, W, trouble, points, compact]);
  const y = { top: 0, bar: geo.laneTopPx, bottom: geo.laneTopPx + geo.barPx };
  return (
    <div className="gc-row" data-testid="gc-player-row" data-player={p.id}>
      <div className="gc-left gc-sticky">
        <Headshot id={p.id} name={p.name} />
        {name}
        <span className="gc-min" data-testid="gc-min">
          {formatMin(totalPlayed(p))}
        </span>
      </div>
      <div className="gc-track" style={{ width: W, height: r.height }}>
        {band}
        {/* Usual stints: behind the bars, never taking pointer events or space. */}
        {usual?.stints.map((u) => (
          <i
            key={`u${u.start}`}
            className="gc-usual"
            style={{ left: u.start * k, width: (u.end - u.start) * k, top: geo.laneTopPx - 2, height: geo.barPx + 4 }}
            data-testid="usual-stint"
            data-start={u.start}
            data-end={u.end}
          />
        ))}
        {r.bars.map((b, i) => (
          <div
            key={i}
            className="gc-bar"
            style={{ left: b.x, width: b.w, top: y.bar, height: geo.barPx }}
            data-testid="stint"
            data-start={b.st[0]}
            data-end={b.st[1]}
            {...(g.stintPts ? { 'data-pts': p.ptsS?.[p.stints.indexOf(b.st)] ?? 0 } : {})}
          >
            {b.segments.map((s, j) => (
              <i key={j} className={`gc-seg ${trouble ? `lvl-${s.level}` : 'lvl-neutral'}`} style={{ left: s.x - b.x, width: s.w }} />
            ))}
          </div>
        ))}
        {r.bars.map((b, i) => (
          <span
            key={`l${i}`}
            className={`gc-label${b.label.inside ? ' in' : ` out lane-${b.label.lane}`}`}
            style={{ left: b.label.x, width: b.label.w, top: y[b.label.lane], height: b.label.lane === 'bar' ? geo.barPx : geo.laneTopPx }}
            data-testid="stint-label"
            data-inside={b.label.inside}
            data-lane={b.label.lane}
          >
            {b.label.text}
          </span>
        ))}
        {r.ticks.map((t) => {
          const text = foulReadout(p.name, t);
          return (
            <span key={`t${t.n}`}>
              <i className="gc-foul-arrow" style={{ left: t.x, top: geo.laneTopPx - 5 }} />
              <button
                type="button"
                className="gc-foul-n"
                style={{ left: t.label.x, width: t.label.w, height: geo.laneTopPx - 4 }}
                data-testid="foul-tick"
                data-n={t.n}
                data-t={t.t}
                aria-label={text}
                onPointerEnter={show(text)}
                onPointerLeave={leave}
                onFocus={(e) => {
                  const r2 = e.currentTarget.getBoundingClientRect();
                  show(text)({ clientX: r2.left, clientY: r2.top } as React.MouseEvent);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  show(text)(e);
                }}
              >
                {t.n}
              </button>
            </span>
          );
        })}
        {r.badges.map((b) => (
          <span
            key={`q${b.period}`}
            className="gc-pfq"
            style={{ left: b.box.x, width: b.box.w, height: geo.laneTopPx - 3 }}
            data-testid="pf-badge"
            title={`${b.n} foul${b.n > 1 ? 's' : ''} in ${periodName(b.period)}`}
            onClick={(e) => {
              e.stopPropagation();
              show(`${b.n} foul${b.n > 1 ? 's' : ''} in ${periodName(b.period)}`)(e);
            }}
          >
            {b.n}
          </span>
        ))}
      </div>
      <div className="gc-pf gc-sticky-r" data-testid="gc-pf">
        {p.pf}
      </div>
    </div>
  );
}
