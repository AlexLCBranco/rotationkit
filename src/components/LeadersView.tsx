// Leaders tab: who averages the most 4th-quarter (or second-half) minutes and points, over each team's last 5 /
// last 10 games or the season. A scatter (minutes × points per game, with quadrants: who closes, who scores) on top of
// a ranked table; hovering one highlights the other.

import { useMemo, useState } from 'react';
import { loadQuarters } from '../app/data.ts';
import { useAsync } from '../app/hooks.ts';
import { formatMin } from '../app/labels.ts';
import type { LeadersQuery, Nav, Route } from '../app/route.ts';
import { teamColor } from '../app/teams.ts';
import { LEADER_MIN_GAMES, leaders, type LeaderOpts, type LeaderRow, type LeaderWindow } from '../domain/leaders.ts';
import { formatUsg } from '../domain/usage.ts';
import { USG_TITLE } from '../app/labels.ts';
import type { Window } from '../domain/patterns.ts';
import { PATTERN_CONFIG } from '../domain/config.ts';
import { PageRows, Row, SeasonChips, Switch, TeamStrip } from './PageRows.tsx';
import { LEADERS_HOWS, leadersHowRoute } from '../app/nav.ts';
import { Headshot } from './Headshot.tsx';
import { PlayerLink, TeamLink, useLinkContext } from './Links.tsx';
import { playerHref } from '../app/links.ts';

interface Props {
  seasons: string[];
  season: string;
  team: string;
  route: Extract<Route, { view: 'leaders' }>;
  nav: Nav;
}

const TOP_LABELS = 12;
const B = PATTERN_CONFIG.blowout;
/** The blowout rule in words, from its settings. */
export const GARBAGE_RULE = `In the 4th quarter and overtime, with under ${B.underSecondsLeft / 60}:00 left in the period, while the margin is ${B.margin}+ (its minutes and the points scored in it). The 3rd quarter never counts as garbage time.`;
const TABLE_ROWS = 50;

export function LeadersView({ seasons, season, route, nav }: Props) {
  const q = route.leaders;
  const window: LeaderWindow = route.filters.window as Window;
  const file = useAsync(() => loadQuarters(season), [season]);
  const set = (patch: Partial<LeadersQuery>, w?: Window, s?: string) =>
    nav({ ...route, season: s ?? season, filters: { ...route.filters, window: w ?? route.filters.window }, leaders: { ...q, ...patch } });
  const rows = useMemo(
    () => (file.status === 'ok' ? leaders(file.value, { part: q.part, ot: q.ot, window, team: q.only, sort: q.sort, noGarbage: q.noGarbage }) : []),
    [file, q.part, q.ot, window, q.only, q.sort, q.noGarbage],
  );
  const [hover, setHover] = useState<number | null>(null);
  const partName = q.part === 'q4' ? '4th quarter' : 'Second half';
  const need = window === 'season' ? `${Math.round(LEADER_MIN_GAMES.seasonShare * 100)}% of the team's games` : `${LEADER_MIN_GAMES[window]} of the last ${window}`;
  const seg = <T extends string | number>(label: string, value: T, options: [T, string][], on: (v: T) => void) => (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={String(v)} aria-pressed={value === v} onClick={() => on(v)}>
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <div className="page wide">
      <PageRows
        line={
          <>
            <Row label="What">
              <SeasonChips seasons={seasons} season={season} onChange={(s) => set({}, undefined, s)} />
            </Row>
            <Row label="How">
              <Switch label="How" testId="how" idPrefix="how" value="leaders" options={LEADERS_HOWS} onChange={(h) => nav(leadersHowRoute({ ...route, season }, h))} />
            </Row>
            <Row label="Team" grow>
              <TeamStrip team={q.only} onChange={(t) => set({ only: t || null })} label="Only this team" testId="leaders-team" none={['All teams', "Every team's players"]} />
            </Row>
          </>
        }
      />
      <div className="filters ld-filters">
        {seg('Part of the game', q.part, [['q4', '4th quarter'], ['h2', 'Second half']], (v) => set({ part: v }))}
        <label className="toggle">
          <input type="checkbox" checked={q.ot} onChange={(e) => set({ ot: e.target.checked })} />
          <span>Include overtime</span>
        </label>
        <label className="toggle" title={GARBAGE_RULE}>
          <input type="checkbox" checked={q.noGarbage} onChange={(e) => set({ noGarbage: e.target.checked })} />
          <span>Hide garbage time</span>
        </label>
                {seg('Games', window as Window, [[5, 'Last 5'], [10, 'Last 10'], ['season', 'Season']], (v) => set({}, v))}
        {seg('Rank by', q.sort, [['min', 'Minutes'], ['pts', 'Points'], ['usg', 'USG%']], (v) => set({ sort: v }))}
      </div>
      <p className="muted ld-note" data-testid="leaders-note">
        {partName}
        {q.ot ? ' + overtime' : ''} · per game played · {window === 'season' ? `the ${season} season` : `each team's last ${window} games`} · players with at least {need} ·{' '}
        {rows.length} players.{' '}
        {q.noGarbage ? (
          <span data-testid="garbage-note">
            Garbage time left out: {GARBAGE_RULE.charAt(0).toLowerCase() + GARBAGE_RULE.slice(1)}
          </span>
        ) : (
          <span data-testid="garbage-note">Garbage time included.</span>
        )}
      </p>
      {file.status === 'loading' && <p className="muted">Loading…</p>}
      {file.status === 'error' && <p className="error">Could not load: {file.error}</p>}
      {file.status === 'ok' && rows.length === 0 && <p className="muted">No player has enough games for this choice yet.</p>}
      {rows.length > 0 && (
        <div className="ld-layout">
          <Scatter rows={rows} sort={q.sort} hover={hover} setHover={setHover} partName={partName} maxMin={(q.part === 'q4' ? 12 : 24) * 60} />
          <Table rows={rows.slice(0, TABLE_ROWS)} sort={q.sort} hover={hover} setHover={setHover} onSort={(s) => set({ sort: s })} />
        </div>
      )}
    </div>
  );
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[Math.floor((s.length - 1) / 2)]! + s[Math.ceil((s.length - 1) / 2)]!) / 2 : 0;
};

/** Minutes × points per game. Dashed lines at the median split it into four corners. */
function Scatter({
  rows,
  sort,
  hover,
  setHover,
  maxMin,
  partName,
}: {
  rows: LeaderRow[];
  sort: LeaderOpts['sort'];
  hover: number | null;
  setHover: (id: number | null) => void;
  maxMin: number;
  partName: string;
}) {
  const links = useLinkContext();
  const href = (r: LeaderRow) => (links ? playerHref(links, { id: r.id, team: r.team }) : undefined);
  const W = 560;
  const H = 420;
  const pad = { l: 44, r: 14, t: 14, b: 38 };
  const maxPts = Math.max(4, Math.ceil(Math.max(...rows.map((r) => r.pts)) + 0.5));
  const xMax = Math.min(maxMin, Math.ceil(Math.max(...rows.map((r) => r.min)) / 60 + 1) * 60);
  const x = (m: number) => pad.l + (m / xMax) * (W - pad.l - pad.r);
  const y = (p: number) => H - pad.b - (p / maxPts) * (H - pad.t - pad.b);
  const mx = median(rows.map((r) => r.min));
  const my = median(rows.map((r) => r.pts));
  const top = new Set(rows.slice(0, TOP_LABELS).map((r) => r.id));
  const h = rows.find((r) => r.id === hover);
  const labels = useMemo(
    () => placeLabels(rows.filter((r) => top.has(r.id)).map((r) => ({ id: r.id, text: r.short, cx: x(r.min), cy: y(r.pts) })), { w: W, h: H, l: pad.l, t: pad.t, r: pad.r, b: pad.b }),
    [rows, xMax, maxPts], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const minTicks = Array.from({ length: Math.floor(xMax / 60 / (xMax > 900 ? 4 : 2)) + 1 }, (_, i) => i * (xMax > 900 ? 4 : 2) * 60);
  const ptsTicks = Array.from({ length: Math.floor(maxPts / (maxPts > 12 ? 4 : 2)) + 1 }, (_, i) => i * (maxPts > 12 ? 4 : 2));
  return (
    <figure className="ld-scatter" data-testid="leaders-scatter">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${partName} minutes and points per game`}>
        {minTicks.map((t) => (
          <g key={`x${t}`}>
            <line x1={x(t)} x2={x(t)} y1={pad.t} y2={H - pad.b} className="ld-grid" />
            <text x={x(t)} y={H - pad.b + 14} className="ld-tick" textAnchor="middle">
              {t / 60}
            </text>
          </g>
        ))}
        {ptsTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="ld-grid" />
            <text x={pad.l - 6} y={y(t) + 4} className="ld-tick" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        <text x={(pad.l + W - pad.r) / 2} y={H - 6} className="ld-axis" textAnchor="middle">
          minutes per game
        </text>
        <text x={12} y={(pad.t + H - pad.b) / 2} className="ld-axis" textAnchor="middle" transform={`rotate(-90 12 ${(pad.t + H - pad.b) / 2})`}>
          points per game
        </text>
        <line x1={x(mx)} x2={x(mx)} y1={pad.t} y2={H - pad.b} className="ld-median" />
        <line x1={pad.l} x2={W - pad.r} y1={y(my)} y2={y(my)} className="ld-median" />
        <text x={W - pad.r - 4} y={pad.t + 12} className="ld-corner" textAnchor="end">
          plays it and scores
        </text>
        <text x={W - pad.r - 4} y={H - pad.b - 6} className="ld-corner" textAnchor="end">
          plays it, scores less
        </text>
        <text x={pad.l + 6} y={pad.t + 12} className="ld-corner">
          scores in short minutes
        </text>
        {rows.map((r) => (
          <a key={r.id} href={href(r)} className="plain-link" data-testid="leaders-dot-link">
          <circle
            key={r.id}
            cx={x(r.min)}
            cy={y(r.pts)}
            r={r.id === hover ? 7 : top.has(r.id) ? 5 : 3}
            className={`ld-dot${top.has(r.id) ? ' top' : ''}${r.id === hover ? ' hover' : ''}`}
            style={top.has(r.id) || r.id === hover ? { fill: teamColor(r.team) } : undefined}
            data-testid="leaders-dot"
            data-player={r.id}
            onPointerEnter={() => setHover(r.id)}
            onPointerLeave={() => setHover(null)}
          />
          </a>
        ))}
        {labels.map((l) => (
          <g key={`l${l.id}`}>
            {l.line && <line x1={l.dx} y1={l.dy} x2={l.lx} y2={l.ly} className="ld-leader" />}
            <a href={href(rows.find((r) => r.id === l.id)!)} className="plain-link">
              <text x={l.x} y={l.y} className="ld-label" data-testid="leaders-label" data-player={l.id}>
                {l.text}
              </text>
            </a>
          </g>
        ))}
        {h && (
          <g className="ld-tip" transform={`translate(${Math.min(x(h.min) + 10, W - 190)} ${Math.max(y(h.pts) - 44, 4)})`} data-testid="leaders-tip">
            <rect width="182" height="40" rx="5" />
            <text x="8" y="16">
              {h.name} ({h.team})
            </text>
            <text x="8" y="32">
              {formatMin(h.min)} min · {h.pts.toFixed(1)} pts · {h.gp} games
            </text>
          </g>
        )}
      </svg>
      <figcaption className="muted">
        Each dot is a player; the top {TOP_LABELS} by {sort === 'min' ? 'minutes' : sort === 'pts' ? 'points' : 'usage rate'} are named. Dashed lines = median. Click a dot for his page.
      </figcaption>
    </figure>
  );
}

function Table({
  rows,
  sort,
  hover,
  setHover,
  onSort,
}: {
  rows: LeaderRow[];
  sort: LeaderOpts['sort'];
  hover: number | null;
  setHover: (id: number | null) => void;
  onSort: (s: LeaderOpts['sort']) => void;
}) {
  const th = (key: LeaderOpts['sort'], label: string, title?: string) => (
    <th className={`num sortable${sort === key ? ' sorted' : ''}`} aria-sort={sort === key ? 'descending' : 'none'} title={title}>
      <button className="link" onClick={() => onSort(key)}>
        {label}
      </button>
    </th>
  );
  return (
    <div className="table-wrap ld-table">
      <table className="tbl" data-testid="leaders-table">
        <thead>
          <tr>
            <th className="num">#</th>
            <th className="name-col">Player</th>
            <th>Team</th>
            <th className="num" title="Games he played in the window / team games in the window">
              GP
            </th>
            {th('min', 'MIN')}
            {th('pts', 'PTS')}
            <th className="num" title="Points per 12 minutes played in this part of the game">
              PTS/12
            </th>
            {th('usg', 'USG%', USG_TITLE)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.id}
              className={r.id === hover ? 'hover' : undefined}
              onPointerEnter={() => setHover(r.id)}
              onPointerLeave={() => setHover(null)}
              data-testid="leaders-row"
              data-player={r.id}
              data-min={r.min}
              data-pts={r.pts}
            >
              <td className="num muted">{i + 1}</td>
              <td className="ld-player">
                <Headshot id={r.id} name={r.name} />
                <PlayerLink id={r.id} team={r.team} className="ld-name">
                  {r.name}
                </PlayerLink>
              </td>
              <td>
                <span className="swatch" style={{ background: teamColor(r.team) }} />{' '}
                <TeamLink team={r.team}>{r.team}</TeamLink>
              </td>
              <td className="num">
                {r.gp}
                <span className="muted">/{r.of}</span>
              </td>
              <td className="num">
                <strong>{formatMin(r.min)}</strong>
              </td>
              <td className="num">
                <strong>{r.pts.toFixed(1)}</strong>
              </td>
              <td className="num muted">{r.per12 === null ? '—' : r.per12.toFixed(1)}</td>
              <td className="num" data-testid="leaders-usg">
                {formatUsg(r.usg)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Placed {
  id: number;
  text: string;
  x: number;
  y: number;
  /** Leader line from the dot to the label when the label had to move away. */
  line: boolean;
  dx: number;
  dy: number;
  lx: number;
  ly: number;
}
type Box = [number, number, number, number];
const overlaps = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** Greedy label placement: spots around the dot, then rings further out (with a leader line); never overlapping
 *  another label or a labelled dot, always inside the plot. Labels that cannot be placed are left out. */
export function placeLabels(items: { id: number; text: string; cx: number; cy: number }[], plot: { w: number; h: number; l: number; t: number; r: number; b: number }): Placed[] {
  const taken: Box[] = items.map((d) => [d.cx - 6, d.cy - 6, d.cx + 6, d.cy + 6]);
  const out: Placed[] = [];
  for (const d of items) {
    const w = d.text.length * 6.3 + 2;
    const hgt = 12;
    let best: Placed | null = null;
    for (const ring of [1, 2, 3, 4, 5, 6]) {
      const r = 8 * ring;
      const spots: [number, number][] = [
        [d.cx + r, d.cy + 4], [d.cx - r - w, d.cy + 4], [d.cx - w / 2, d.cy - r], [d.cx - w / 2, d.cy + r + hgt],
        [d.cx + r, d.cy - r], [d.cx + r, d.cy + r + hgt], [d.cx - r - w, d.cy - r], [d.cx - r - w, d.cy + r + hgt],
      ];
      for (const [x, y] of spots) {
        const box: Box = [x - 1, y - hgt + 2, x + w + 1, y + 3];
        if (box[0] < plot.l || box[2] > plot.w - plot.r || box[1] < plot.t || box[3] > plot.h - plot.b) continue;
        if (taken.some((b) => overlaps(b, box))) continue;
        const near = ring === 1;
        best = { id: d.id, text: d.text, x, y, line: !near, dx: d.cx, dy: d.cy, lx: Math.max(x, Math.min(d.cx, x + w)), ly: y - 4 };
        taken.push(box);
        break;
      }
      if (best) break;
    }
    if (best) out.push(best);
  }
  return out;
}
