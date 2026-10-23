// Single-game rotation chart: one scroll box for both teams (name + MIN frozen left, PF frozen right),
// stints with always-visible durations, numbered foul ticks, per-quarter PF badges, foul-trouble colors,
// clock ticks, blowout shading and a lineup cursor.

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatMin, reasonText } from '../app/labels.ts';
import { teamName } from '../app/teams.ts';
import { CHART } from '../domain/config.ts';
import { axisTicks, clockLabel, foulReadout, layoutRow, periodName, timelineWidth, type RowLayout } from '../domain/gameChart.ts';
import { blowoutIntervals } from '../domain/patterns.ts';
import { gameLength, periodEnd, periodStart } from '../domain/time.ts';
import type { Game, PlayerGame, Stint, TeamInfo } from '../domain/types.ts';
import { signed } from '../app/labels.ts';
import { Headshot, TeamLogo } from './Headshot.tsx';
import { shortNames } from '../app/names.ts';

export interface Cursor {
  t: number;
  pinned: boolean;
}

/** Frozen column widths (must match styles.css .gc-left / .gc-pf). */
export const COLS = { desktop: { left: 230, pf: 40 }, phone: { left: 136, pf: 32 } } as const;

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

const describe = (s: Stint) => {
  const fouls = s[3]?.length ? ` · ${s[3].length} foul${s[3].length > 1 ? 's' : ''}` : '';
  return `In ${clockLabel(s[0], true)} → out ${clockLabel(s[1])} · ${formatMin(s[1] - s[0])} · +/- ${signed(s[2])}${fouls}`;
};

interface Props {
  g: Game;
  trouble: boolean;
  cursor: Cursor | null;
  setCursor: (c: Cursor | null) => void;
  setInfo: (s: string | null) => void;
}

export function GameChart({ g, trouble, cursor, setCursor, setInfo }: Props) {
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

  const tAt = (clientX: number) => {
    const r = contentRef.current!.getBoundingClientRect();
    const x = clientX - r.left - cols.left;
    return x < 0 || x > W ? null : Math.max(0, Math.min(total, x / k));
  };

  const sections = [g.away, g.home];
  return (
    <div className="gc-box" ref={boxRef} data-testid="game-chart">
      <div
        className="gc-content"
        ref={contentRef}
        style={{ width: cols.left + W + cols.pf }}
        onPointerMove={(e) => {
          if (dragging.current || (e.pointerType === 'mouse' && !cursor?.pinned)) {
            const t = tAt(e.clientX);
            if (t !== null) setCursor({ t, pinned: dragging.current || !!cursor?.pinned });
          }
        }}
        onPointerUp={() => (dragging.current = false)}
        onClick={(e) => {
          const t = tAt(e.clientX);
          if (t === null) return;
          // Mouse: click pins/unpins. Touch: tap moves the pinned cursor there.
          if (cursor?.pinned && e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType === 'mouse') setCursor({ t, pinned: false });
          else setCursor({ t, pinned: true });
        }}
      >
        {sections.map((team) => (
          <TeamRows key={team.tri} g={g} team={team} W={W} k={k} blowout={blowout} ticks={ticks} trouble={trouble} setInfo={setInfo} />
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
  setInfo,
}: {
  g: Game;
  team: TeamInfo;
  W: number;
  k: number;
  blowout: [number, number][];
  ticks: { t: number; label: string; period: number }[];
  trouble: boolean;
  setInfo: (s: string | null) => void;
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
  const grid = (
    <>
      {ticks.map((x) => (
        <i key={x.t} className={x.t === periodStart(x.period) && x.period > 1 ? 'gc-divider' : 'gc-grid'} style={{ left: x.t * k }} />
      ))}
      {blowout.map(([a, b]) => (
        <i key={`b${a}`} className="gc-blowout" style={{ left: a * k, width: (b - a) * k }} />
      ))}
    </>
  );
  return (
    <section className="gc-team" data-testid="game-team">
      <div className="gc-team-head">
        <div className="gc-left gc-sticky">
          <TeamLogo teamId={team.id} tri={team.tri} />
          <strong>{teamName(team.tri)}</strong>
          <span className="gc-score">{team.score}</span>
        </div>
      </div>
      <div className="gc-row gc-axis">
        <div className="gc-left gc-sticky gc-colhead">
          <span>Player</span>
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
        <PlayerRow key={p.id} p={p} g={g} W={W} trouble={trouble} grid={grid} setInfo={setInfo} short={names.get(p.id) ?? p.name} />
      ))}
      {bench.length > 0 && <div className="gc-bench-divider" aria-hidden />}
      {bench.map((p) => (
        <PlayerRow key={p.id} p={p} g={g} W={W} trouble={trouble} grid={grid} setInfo={setInfo} short={names.get(p.id) ?? p.name} />
      ))}
      {dnp.map((p) => (
        <div className="gc-row gc-dnp" key={p.id} data-testid="dnp-row">
          <div className="gc-left gc-sticky">
            <Headshot id={p.id} name={p.name} />
            <span className="gc-name" title={p.name}>
              <span className="full">{p.name}</span>
              <span className="short">{names.get(p.id) ?? p.name}</span>
            </span>
            <span className="gc-min muted">—</span>
          </div>
          <div className="gc-track" style={{ width: W }} />
          <div className="gc-pf gc-sticky-r">
            <button
              className="dnp-badge"
              title={p.reason ?? 'Did not play'}
              onClick={(e) => (e.stopPropagation(), setInfo(`${p.name} — did not play${p.reason ? `: ${p.reason}` : ''}`))}
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
  grid,
  setInfo,
  short,
}: {
  p: PlayerGame;
  g: Game;
  W: number;
  trouble: boolean;
  grid: React.ReactNode;
  setInfo: (s: string | null) => void;
  short: string;
}) {
  const r: RowLayout = useMemo(() => layoutRow(p, g.periods, W, { trouble }), [p, g.periods, W, trouble]);
  const y = { top: 0, bar: CHART.laneTopPx, bottom: CHART.laneTopPx + CHART.barPx };
  return (
    <div className="gc-row" data-testid="gc-player-row" data-player={p.id}>
      <div className="gc-left gc-sticky">
        <Headshot id={p.id} name={p.name} />
        <span className={`gc-name${p.starter ? ' starter' : ''}`} title={p.name}>
          <span className="full">{p.name}</span>
          <span className="short">{short}</span>
        </span>
        <span className="gc-min" data-testid="gc-min">
          {formatMin(totalPlayed(p))}
        </span>
      </div>
      <div className="gc-track" style={{ width: W, height: r.height }}>
        {grid}
        {r.bars.map((b, i) => (
          <div
            key={i}
            className="gc-bar"
            style={{ left: b.x, width: b.w, top: y.bar, height: CHART.barPx }}
            data-testid="stint"
            data-start={b.st[0]}
            data-end={b.st[1]}
            onPointerEnter={() => setInfo(`${p.name} · ${describe(b.st)}`)}
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
        {r.ticks.map((t) => (
          <span key={`t${t.n}`}>
            <i className="gc-foul-line" style={{ left: t.x, top: CHART.laneTopPx - 5 }} />
            <button
              type="button"
              className="gc-foul-n"
              style={{ left: t.label.x, width: t.label.w }}
              data-testid="foul-tick"
              data-n={t.n}
              data-t={t.t}
              aria-label={foulReadout(p.name, t)}
              onPointerEnter={() => setInfo(foulReadout(p.name, t))}
              onFocus={() => setInfo(foulReadout(p.name, t))}
              onClick={(e) => {
                e.stopPropagation();
                setInfo(foulReadout(p.name, t));
              }}
            >
              {t.n}
            </button>
          </span>
        ))}
        {r.badges.map((b) => (
          <span key={`q${b.period}`} className="gc-pfq" style={{ left: b.box.x, width: b.box.w }} data-testid="pf-badge" title={`${b.n} foul${b.n > 1 ? 's' : ''} in ${periodName(b.period)}`}>
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
