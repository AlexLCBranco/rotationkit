// Single-game rotation chart, laid out like fantasyteamadvice.com/nba/rotations: per team a logo + name header,
// foul-trouble legend, PLAYER | MIN | Q1–Q4 (+OT) | PF, one compact row per player with stints on a dark track.
// Improvements: every stint shows its duration, numbered foul ticks with type/quarter/clock, per-quarter PF
// badges, clock ticks, blowout shading, a floating tooltip, and a lineup cursor (hover; click/tap to pin).
// Name + MIN are frozen on the left and PF on the right; the timeline scrolls sideways inside its own box when
// the screen is narrower than the minimum scale.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatMin, reasonText, signed } from '../app/labels.ts';
import { shortNames } from '../app/names.ts';
import { teamName } from '../app/teams.ts';
import { CHART } from '../domain/config.ts';
import type { ReadoutSettings } from '../app/readoutSettings.ts';
import {
  axisTicks, clockLabel, foulReadout, hoverReadout, layoutRow, periodName, scoreAt, timelineWidth, type HoverReadout, type LineupSegment, type RowLayout,
} from '../domain/gameChart.ts';
import { blowoutIntervals } from '../domain/patterns.ts';
import { gameLength, periodEnd, periodStart } from '../domain/time.ts';
import type { Game, PlayerGame, Stint, TeamInfo } from '../domain/types.ts';
import { Headshot, TeamLogo } from './Headshot.tsx';

export interface Cursor {
  t: number;
  pinned: boolean;
}

/** Frozen column widths (must match styles.css .gc-left / .gc-pf). */
export const COLS = { desktop: { left: 230, pf: 40 }, phone: { left: 160, pf: 32 } } as const;

function usePhone() {
  const q = '(max-width: 640px)';
  const [phone, setPhone] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setPhone(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}

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

/** "Maxey: in Q1 12:00 → out Q1 6:12 · 5:48 · +/- +4", or "Maxey (off court)". */
export const stintLine = (name: string, s: Stint | null) => {
  if (!s) return `${name} (off court)`;
  const fouls = s[3]?.length ? ` · ${s[3].length} foul${s[3].length > 1 ? 's' : ''}` : '';
  return `${name}: in ${clockLabel(s[0], true)} → out ${clockLabel(s[1])} · ${formatMin(s[1] - s[0])} · +/- ${signed(s[2])}${fouls}`;
};

function ReadoutCard({ r, names, settings }: { r: HoverReadout; names: Map<number, string>; settings: ReadoutSettings }) {
  const [mine, theirs] = r.teams as [HoverReadout['teams'][number], HoverReadout['teams'][number]];
  const name = (p: PlayerGame) => names.get(p.id) ?? p.name;
  const lineup = (t: HoverReadout['teams'][number], muted: boolean) => (
    <div className={`rd-lineup${muted ? ' opp' : ''}`} data-testid="readout-lineup" data-team={t.team}>
      <span className="rd-tri">{t.team}</span>
      {t.players.map((x) => (
        <span key={x.p.id} className={`rd-p${x.me ? ' me' : ''}`} data-testid="readout-player" data-player={x.p.id} data-fouls={x.fouls}>
          {name(x.p)}
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
        {r.clock} · {mine.team} {mine.score}–{theirs.score} {theirs.team}
      </div>
      {settings.lineups !== 'off' && lineup(mine, false)}
      {settings.lineups === 'both' && lineup(theirs, true)}
      {settings.stint && (
        <div className="rd-stint" data-testid="readout-stint">
          {stintLine(name(r.player), r.stint)}
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
}

export function GameChart({ g, trouble, cursor, setCursor, names, segments, readout }: Props) {
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
  // Place the card: beside the pointer, above the hovered row (below if no room), always inside the window.
  const tipRef = useRef<HTMLDivElement>(null);
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
    <div className="gc-box" ref={boxRef} data-testid="game-chart">
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
        {[g.away, g.home].map((team) => (
          <TeamRows
            key={team.tri}
            g={g}
            team={team}
            W={W}
            k={k}
            blowout={blowout}
            ticks={ticks}
            trouble={trouble}
            show={show}
            leave={() => (item.current = null)}
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
              <ReadoutCard r={hoverReadout(g, tip.content.id, tip.content.t, segments)} names={names} settings={readout} />
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
  W,
  k,
  blowout,
  ticks,
  trouble,
  show,
  leave,
}: {
  g: Game;
  team: TeamInfo;
  W: number;
  k: number;
  blowout: [number, number][];
  ticks: { t: number; label: string; period: number }[];
  trouble: boolean;
  show: (text: string) => (e: React.PointerEvent | React.MouseEvent) => void;
  leave: () => void;
}) {
  const players = g.players.filter((p) => p.team === team.tri);
  const inactive = (g.inactive ?? []).filter((p) => p.team === team.tri);
  const names = useMemo(() => shortNames([...players, ...inactive]), [g, team.tri]); // eslint-disable-line react-hooks/exhaustive-deps
  const played = players.filter((p) => p.played && p.stints.length);
  const starters = played.filter((p) => p.starter).sort((a, b) => totalPlayed(b) - totalPlayed(a));
  const bench = played.filter((p) => !p.starter).sort((a, b) => totalPlayed(b) - totalPlayed(a));
  const dnp = [
    ...players.filter((p) => !p.played || !p.stints.length).map((p) => ({ id: p.id, name: p.name, reason: reasonText(p.reason, p.reasonDetail) })),
    ...inactive.map((p) => ({ id: p.id, name: p.name, reason: reasonText(p.reason, p.reasonDetail) ?? 'Inactive' })),
  ];
  const band = (
    <>
      <i className="gc-band" style={{ top: CHART.laneTopPx, height: CHART.barPx }} />
      {ticks.map((x) =>
        x.t === periodStart(x.period) ? (
          x.period > 1 && <i key={x.t} className="gc-divider" style={{ left: x.t * k, top: CHART.laneTopPx, height: CHART.barPx }} />
        ) : (
          <i key={x.t} className="gc-grid" style={{ left: x.t * k, top: CHART.laneTopPx, height: CHART.barPx }} />
        ),
      )}
      {blowout.map(([a, b]) => (
        <i key={`b${a}`} className="gc-blowout" style={{ left: a * k, width: (b - a) * k, top: CHART.laneTopPx, height: CHART.barPx }} />
      ))}
    </>
  );
  const Name = ({ id, name }: { id: number; name: string }) => {
    const short = names.get(id) ?? name;
    // Very long single words (Wembanyama, Antetokounmpo) get a smaller font on phone instead of a mid-word break.
    const longWord = Math.max(...short.split(/[\s-]+/).map((w) => w.length)) > 10;
    return (
      <span className="gc-name" title={name}>
        <span className="full">{name}</span>
        <span className={`short${longWord ? ' long' : ''}`}>{short}</span>
      </span>
    );
  };
  return (
    <section className="gc-team" data-testid="game-team">
      <div className="gc-team-head">
        <div className="gc-sticky gc-team-title">
          <TeamLogo teamId={team.id} tri={team.tri} />
          <strong>{teamName(team.tri)}</strong>
        </div>
      </div>
      <div className="gc-legend-row">
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
      </div>
      <div className="gc-row gc-axis">
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
      </div>
      {starters.map((p) => (
        <PlayerRow key={p.id} p={p} g={g} W={W} trouble={trouble} band={band} show={show} leave={leave} name={<Name id={p.id} name={p.name} />} />
      ))}
      {bench.length > 0 && <div className="gc-bench-divider" aria-hidden />}
      {bench.map((p) => (
        <PlayerRow key={p.id} p={p} g={g} W={W} trouble={trouble} band={band} show={show} leave={leave} name={<Name id={p.id} name={p.name} />} />
      ))}
      {dnp.map((p) => (
        <div className="gc-row gc-dnp" key={p.id} data-testid="dnp-row">
          <div className="gc-left gc-sticky">
            <Headshot id={p.id} name={p.name} />
            <Name id={p.id} name={p.name} />
            <span className="gc-min muted">—</span>
          </div>
          <div className="gc-track" style={{ width: W }}>
            <i className="gc-band" style={{ top: 7, height: CHART.barPx }} />
          </div>
          <div className="gc-pf gc-sticky-r">
            <button
              className="dnp-badge"
              title={p.reason ?? 'Did not play'}
              onPointerEnter={show(`${p.name} — did not play${p.reason ? `: ${p.reason}` : ''}`)}
              onPointerLeave={leave}
              onClick={(e) => {
                e.stopPropagation();
                show(`${p.name} — did not play${p.reason ? `: ${p.reason}` : ''}`)(e);
              }}
            >
              DNP
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

function PlayerRow({
  p,
  g,
  W,
  trouble,
  band,
  show,
  leave,
  name,
}: {
  p: PlayerGame;
  g: Game;
  W: number;
  trouble: boolean;
  band: React.ReactNode;
  show: (text: string) => (e: React.PointerEvent | React.MouseEvent) => void;
  leave: () => void;
  name: React.ReactNode;
}) {
  const r: RowLayout = useMemo(() => layoutRow(p, g.periods, W, { trouble }), [p, g.periods, W, trouble]);
  const y = { top: 0, bar: CHART.laneTopPx, bottom: CHART.laneTopPx + CHART.barPx };
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
        {r.bars.map((b, i) => (
          <div
            key={i}
            className="gc-bar"
            style={{ left: b.x, width: b.w, top: y.bar, height: CHART.barPx }}
            data-testid="stint"
            data-start={b.st[0]}
            data-end={b.st[1]}
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
            style={{ left: b.label.x, width: b.label.w, top: y[b.label.lane], height: b.label.lane === 'bar' ? CHART.barPx : CHART.laneTopPx }}
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
              <i className="gc-foul-arrow" style={{ left: t.x, top: CHART.laneTopPx - 5 }} />
              <button
                type="button"
                className="gc-foul-n"
                style={{ left: t.label.x, width: t.label.w, height: CHART.laneTopPx - 4 }}
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
            style={{ left: b.box.x, width: b.box.w, height: CHART.laneTopPx - 3 }}
            data-testid="pf-badge"
            title={`${b.n} foul${b.n > 1 ? 's' : ''} in ${periodName(b.period)}`}
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
