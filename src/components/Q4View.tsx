// Q4 tab: the 4th quarter + overtime of the selected game, both teams on ONE shared time axis (away on top, home
// below), sized to fit the window without scrolling. Same bars, duration labels, foul ticks and foul-trouble colors
// as the Games chart (layoutRow with `from` = start of Q4). Hover: one line across both teams + both lineups at that
// moment (cursorInfo, the lineup cursor's logic); click pins it.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatMin } from '../app/labels.ts';
import { teamName } from '../app/teams.ts';
import { axisTicks, clockLabel, cursorInfo, layoutRow, periodName, troubleLevel, type RowLayout } from '../domain/gameChart.ts';
import { blowoutIntervals } from '../domain/patterns.ts';
import { Q4_START, q4Geometry, q4RowHeight, q4Rows, type Q4Row } from '../domain/q4.ts';
import { gameLength, periodAt, periodEnd, periodStart } from '../domain/time.ts';
import type { Game } from '../domain/types.ts';
import { q4Story } from '../domain/q4Story.ts';
import { useGameNames } from './GamePanels.tsx';
import { TeamLogo } from './Headshot.tsx';
import { PlayerLink, TeamLink } from './Links.tsx';
import { Q4_MARGIN_STRIP_PX, MarginLabel, MarginSvg } from './MarginStrip.tsx';
import { seasonOf } from '../domain/season.ts';

/** Left columns: player | Q4 MIN | fouls entering Q4 | fouls in Q4/OT. */
const LEFT = 292;
const RIGHT_PAD = 6;
const AXIS_PX = 26;
const TEAM_HEAD_PX = 24;
const BOTTOM_MARGIN = 10;

function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, top: 0, vh: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, top: el.getBoundingClientRect().top + scrollY, vh: innerHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      removeEventListener('resize', measure);
    };
  }, []);
  return [ref, box] as const;
}

interface Cursor {
  t: number;
  pinned: boolean;
  y: number;
}

export function Q4View({ g, trouble, setTrouble }: { g: Game; trouble: boolean; setTrouble: (b: boolean) => void }) {
  const [boxRef, box] = useBox<HTMLDivElement>();
  const names = useGameNames(g);
  const end = gameLength(g.periods);
  const total = end - Q4_START;
  const W = Math.max(0, box.w - LEFT - RIGHT_PAD);
  const k = W / total;
  const teams = [g.away, g.home];
  const rows = useMemo(() => teams.map((t) => q4Rows(g, t.tri)), [g]); // eslint-disable-line react-hooks/exhaustive-deps
  const layouts = useMemo(
    () => rows.map((rs) => rs.map((r) => layoutRow(r.p, g.periods, W, { trouble, from: Q4_START }))),
    [rows, g.periods, W, trouble],
  );
  const n = rows[0]!.length + rows[1]!.length;
  const bottomRows = layouts.flat().filter((l) => l.usesBottom).length;
  // Rows are border-box: their 1 px border is inside the row height (measured), so it is not added here.
  const fixed = Q4_MARGIN_STRIP_PX + 1 + AXIS_PX + 2 * TEAM_HEAD_PX;
  const fit = q4RowHeight(n, bottomRows, box.vh - box.top - BOTTOM_MARGIN, fixed);
  const geo = q4Geometry(fit.rowPx);
  const ticks = useMemo(() => axisTicks(g.periods).filter((x) => x.t >= Q4_START), [g.periods]);
  const blowout = useMemo(() => blowoutIntervals(g).filter(([, b]) => b > Q4_START), [g]);
  const x = (t: number) => (t - Q4_START) * k;

  const [cursor, setCursor] = useState<Cursor | null>(null);
  useEffect(() => setCursor(null), [g.id]);
  const story = useMemo(() => q4Story(g, names), [g, names]);
  // Hovering a sentence shows its moment on the chart and lights up the players it names.
  const [focus, setFocus] = useState<number | null>(null);
  const lit = useMemo(() => new Set(focus === null ? [] : story[focus]!.players), [focus, story]);
  const contentRef = useRef<HTMLDivElement>(null);
  const tAt = (clientX: number) => {
    const r = contentRef.current!.getBoundingClientRect();
    const px = clientX - r.left - LEFT;
    return px < 0 || px > W ? null : Q4_START + Math.max(0, Math.min(total, px / k));
  };

  return (
    <>
      <div className="gc-controls q4-controls">
        <label className="toggle">
          <input type="checkbox" checked={trouble} onChange={(e) => setTrouble(e.target.checked)} />
          <span>Foul trouble colors</span>
        </label>
        <span className="muted">
          4th quarter{g.periods > 4 ? ' + overtime' : ''} only · closers first · hover for both lineups, click to pin
        </span>
      </div>
      <div className="q4-wrap">
      <div
        className="q4-box"
        ref={boxRef}
        data-testid="q4-chart"
        data-row-px={fit.rowPx}
        data-fits={fit.fits}
        style={{ ['--q4-top' as string]: `${geo.top}px`, ['--q4-bar' as string]: `${geo.bar}px` }}
      >
        <div
          className="q4-content"
          ref={contentRef}
          onPointerMove={(e) => {
            if (e.pointerType !== 'mouse' || cursor?.pinned) return;
            const t = tAt(e.clientX);
            setCursor(t === null ? null : { t, pinned: false, y: e.clientY });
          }}
          onPointerLeave={(e) => e.pointerType === 'mouse' && !cursor?.pinned && setCursor(null)}
          onClick={(e) => {
            const t = tAt(e.clientX);
            if (t === null) return;
            setCursor(cursor?.pinned ? { t, pinned: false, y: e.clientY } : { t, pinned: true, y: e.clientY });
          }}
        >
          <div className="q4-row q4-margin-row" style={{ height: Q4_MARGIN_STRIP_PX + 1 }} data-testid="margin-row">
            <div className="q4-left">
              <MarginLabel g={g} />
            </div>
            <div className="q4-track" style={{ width: W }}>
              <MarginSvg g={g} from={Q4_START} width={W} height={Q4_MARGIN_STRIP_PX} />
            </div>
          </div>
          <div className="q4-row q4-axis" style={{ height: AXIS_PX }}>
            <div className="q4-left q4-colhead">
              <span className="q4-name">Player</span>
              <span className="q4-num" title="Minutes in Q4 + OT">
                MIN
              </span>
              <span className="q4-num" title="Fouls entering Q4">
                PF in
              </span>
              <span className="q4-num" title="Fouls in Q4 / OT">
                Q4 PF
              </span>
            </div>
            <div className="q4-track" style={{ width: W }}>
              {Array.from({ length: g.periods - 3 }, (_, i) => i + 4).map((q) => (
                <span key={q} className="gc-qname" style={{ left: x(periodStart(q)), width: (periodEnd(q) - periodStart(q)) * k }}>
                  {periodName(q)}
                </span>
              ))}
              {ticks.map((t) => (
                <span key={t.t} className="gc-clock" style={{ left: x(t.t) }}>
                  {t.label}
                </span>
              ))}
            </div>
          </div>
          {teams.map((team, ti) => (
            <section key={team.tri} className="q4-team" data-testid="q4-team" data-team={team.tri}>
              <div className="q4-team-head" style={{ height: TEAM_HEAD_PX }}>
                <TeamLogo teamId={team.id} tri={team.tri} />
                <strong>
                  <TeamLink team={team.tri} season={seasonOf(g.id)}>
                    {teamName(team.tri)}
                  </TeamLink>
                </strong>
                <span className="muted">{ti === 0 ? 'away' : 'home'}</span>
              </div>
              {rows[ti]!.map((r, i) => (
                <Row key={r.p.id} r={r} l={layouts[ti]![i]!} season={seasonOf(g.id)} name={names.get(r.p.id) ?? r.p.name} W={W} x={x} geo={geo} ticks={ticks} blowout={blowout} trouble={trouble} lit={lit.has(r.p.id)} />
              ))}
            </section>
          ))}
          {cursor && (
            <div className="q4-cursor" style={{ left: LEFT + x(cursor.t), top: 0 }} data-testid="q4-cursor-line" data-t={cursor.t}>
              <span className="gc-cursor-handle">{clockLabel(cursor.t, cursor.t < end)}</span>
            </div>
          )}
        </div>
        {cursor && <LineupCard g={g} t={cursor.t} pinned={cursor.pinned} lineX={LEFT + x(cursor.t)} y={cursor.y} names={names} onClose={() => setCursor(null)} />}
      </div>
      <aside className="q4-story" data-testid="q4-story" aria-label="Every lineup change, in words" style={{ maxHeight: Math.max(240, box.vh - box.top - BOTTOM_MARGIN) }}>
        <h3>Every change</h3>
        <p className="muted q4-story-hint">Hover a sentence to see the moment on the chart; click to pin it.</p>
        <p className="q4-story-text">
          {story.map((x, i) => (
            <span
              key={i}
              className={`q4-sentence kind-${x.kind}${focus === i ? ' active' : ''}`}
              data-testid="q4-sentence"
              data-t={x.t}
              data-kind={x.kind}
              data-players={x.players.join(' ')}
              onPointerEnter={(e) => {
                setFocus(i);
                if (!cursor?.pinned) setCursor({ t: x.t, pinned: false, y: e.clientY });
              }}
              onPointerLeave={() => {
                setFocus(null);
                if (!cursor?.pinned) setCursor(null);
              }}
              onClick={(e) => setCursor({ t: x.t, pinned: true, y: e.clientY })}
            >
              {x.text}{' '}
            </span>
          ))}
        </p>
      </aside>
      </div>
    </>
  );
}

function Row({
  r,
  l,
  season,
  name,
  W,
  x,
  geo,
  ticks,
  blowout,
  trouble,
  lit,
}: {
  r: Q4Row;
  l: RowLayout;
  season: string;
  name: string;
  W: number;
  x: (t: number) => number;
  geo: ReturnType<typeof q4Geometry>;
  ticks: { t: number; period: number }[];
  blowout: [number, number][];
  trouble: boolean;
  lit: boolean;
}) {
  const h = geo.row + (l.usesBottom ? geo.bottom : 0);
  const y = { top: 0, bar: geo.top, bottom: geo.top + geo.bar };
  const level = (pf: number, period: number) => troubleLevel(period, pf);
  return (
    <div className={`q4-row${lit ? ' lit' : ''}`} style={{ height: h }} data-testid="q4-row" data-player={r.p.id} data-closer={r.closer} data-min={r.min}>
      <div className="q4-left">
        <span className="q4-name" title={r.p.name}>
          {r.closer && <i className="q4-closer" title="On court at the final buzzer" />}
          <PlayerLink id={r.p.id} team={r.p.team} season={season}>
            {name}
          </PlayerLink>
        </span>
        <span className="q4-num q4-min" data-testid="q4-min">
          {formatMin(r.min)}
        </span>
        <span className={`q4-num q4-pf lvl-text-${trouble ? level(r.foulsBefore, 4) : 'ok'}`} data-testid="q4-pf-before" title="Fouls entering Q4">
          {r.foulsBefore}
        </span>
        <span className="q4-num q4-pf" data-testid="q4-pf-in" title="Fouls in Q4 / OT">
          {r.foulsIn || '—'}
        </span>
      </div>
      <div className="q4-track" style={{ width: W, height: h }}>
        <i className="gc-band" style={{ top: y.bar, height: geo.bar }} />
        {ticks.map((t) =>
          t.t === periodStart(t.period) ? (
            t.period > 4 && <i key={t.t} className="gc-divider" style={{ left: x(t.t), top: y.bar, height: geo.bar }} />
          ) : (
            <i key={t.t} className="gc-grid" style={{ left: x(t.t), top: y.bar, height: geo.bar }} />
          ),
        )}
        {blowout.map(([a, b]) => (
          <i key={a} className="gc-blowout" style={{ left: x(Math.max(a, Q4_START)), width: x(b) - x(Math.max(a, Q4_START)), top: y.bar, height: geo.bar }} />
        ))}
        {l.bars.map((b, i) => (
          <div key={i} className="gc-bar" style={{ left: b.x, width: b.w, top: y.bar, height: geo.bar }} data-testid="q4-stint" data-start={b.st[0]} data-end={b.st[1]}>
            {b.segments.map((s, j) => (
              <i key={j} className={`gc-seg ${trouble ? `lvl-${s.level}` : 'lvl-neutral'}`} style={{ left: s.x - b.x, width: s.w }} />
            ))}
          </div>
        ))}
        {l.bars.map((b, i) => (
          <span
            key={`l${i}`}
            className={`gc-label q4-label${b.label.inside ? ' in' : ` out lane-${b.label.lane}`}`}
            style={{ left: b.label.x, width: b.label.w, top: y[b.label.lane], height: b.label.lane === 'bar' ? geo.bar : b.label.lane === 'top' ? geo.top : geo.bottom }}
            data-testid="q4-stint-label"
            data-inside={b.label.inside}
          >
            {b.label.text}
          </span>
        ))}
        {l.ticks.map((t) => (
          <span key={`t${t.n}`}>
            <i className="gc-foul-arrow" style={{ left: t.x, top: geo.top - 5 }} />
            <span className="gc-foul-n q4-foul-n" style={{ left: t.label.x, width: t.label.w, height: geo.top - 3 }} data-testid="q4-foul-tick" data-n={t.n} title={`Foul #${t.n} · ${clockLabel(t.t)}`}>
              {t.n}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Both 5-man lineups at the cursor moment, beside the line, kept inside the window. */
function LineupCard({ g, t, pinned, lineX, y, names, onClose }: { g: Game; t: number; pinned: boolean; lineX: number; y: number; names: Map<number, string>; onClose: () => void }) {
  const c = cursorInfo(g, t);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.parentElement!.getBoundingClientRect();
    const { width: w, height: h } = el.getBoundingClientRect();
    const m = 8;
    let left = box.left + lineX + 14;
    if (left + w > innerWidth - m) left = box.left + lineX - w - 14;
    left = Math.max(m, Math.min(left, innerWidth - w - m));
    const top = Math.max(m, Math.min(y - h / 2, innerHeight - h - m));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = 'visible';
  });
  const p = periodAt(c.t + 0.05);
  return (
    <div className="gc-tip at-viewport rd q4-card" ref={ref} data-testid="q4-cursor-card" data-t={c.t} style={{ visibility: 'hidden', pointerEvents: pinned ? 'auto' : 'none' }}>
      <div className="rd-head">
        {c.clock} ·{' '}
        <TeamLink team={g.away.tri} season={seasonOf(g.id)}>
          {g.away.tri}
        </TeamLink>{' '}
        {c.score[1]}–{c.score[0]}{' '}
        <TeamLink team={g.home.tri} season={seasonOf(g.id)}>
          {g.home.tri}
        </TeamLink>
        {pinned && (
          <>
            <span className="muted"> · pinned </span>
            <button className="link q4-unpin" onClick={onClose}>
              Close
            </button>
          </>
        )}
      </div>
      {c.teams.map((tm) => (
        <div key={tm.team} className="rd-lineup" data-testid="q4-lineup" data-team={tm.team}>
          <TeamLink team={tm.team} season={seasonOf(g.id)} className="rd-tri">
            {tm.team}
          </TeamLink>
          {tm.players.map((x) => (
            <span key={x.p.id} className={`rd-p lvl-text-${troubleLevel(p, x.fouls)}`} data-testid="q4-lineup-player" data-player={x.p.id} data-fouls={x.fouls}>
              <PlayerLink id={x.p.id} team={x.p.team} season={seasonOf(g.id)}>
                {names.get(x.p.id) ?? x.p.name}
              </PlayerLink>
              {x.fouls > 0 && <span className="rd-pf">{x.fouls}</span>}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
