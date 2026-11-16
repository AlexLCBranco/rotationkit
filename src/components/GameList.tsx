// Always-visible game list (left sidebar of the main screen), laid out like a game log: every finished game of the
// team in the season, oldest at top. Click a row → that game; ↑ / ↓ while the list is focused → previous / next.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { remember } from '../app/hooks.ts';
import { teamName } from '../app/teams.ts';
import type { ScheduleTags } from '../domain/scheduleTags.ts';
import { TeamLogo } from './Headshot.tsx';
import { ScheduleChips, ScheduleLegend } from './ScheduleChips.tsx';
import { BroadcastTags } from './GameBadge.tsx';
import type { CupRound } from '../domain/types.ts';
import { TeamLink } from './Links.tsx';

export interface ListGame {
  id: string;
  date: string;
  team: string;
  teamId: number;
  opp: string;
  oppId: number;
  home: boolean;
  us: number;
  them: number;
  flagged: boolean;
  tags: ScheduleTags | undefined;
  tv?: string[] | undefined;
  cup?: CupRound | undefined;
}

/** How many not-yet-played games to show under the list. */
export const UPCOMING_GAMES = 3;

/** A scheduled game (no data yet): shown dimmed under the played games, not openable. */
export interface UpcomingGame {
  id: string;
  date: string;
  team: string;
  teamId: number;
  /** "" while a knockout opponent is still to be decided. */
  opp: string;
  oppId: number;
  home: boolean;
  status: 'scheduled' | 'live' | 'final' | 'unknown';
  label?: string;
  tags: ScheduleTags | undefined;
  tv?: string[] | undefined;
  cup?: CupRound | undefined;
}

/**
 * The panel's width (px): the default is the widest it gets; it can only be dragged narrower. The columns are sized from
 * their measured text (the font is the system's, so widths differ between machines): the minimum is what date | team |
 * @/vs | opponent | W/L need; under `narrow` (badges would get less than LIST_MIN_TAGS px) badges and rest days hide.
 */
export const LIST_MAX_WIDTH = 500;
/** Used until the columns are measured. */
const FALLBACK = { min: 334, narrow: 410 };
export const LIST_MIN_TAGS = 30;
/** Cell padding (4 + 4) + 1 px for rounding. */
const CELL_PAD = 9;
const WIDTH_KEY = 'rk.listWidth';
const clampWidth = (w: number, min: number) => Math.round(Math.min(LIST_MAX_WIDTH, Math.max(min, w)));
const savedWidth = () => {
  const w = Number(remember(WIDTH_KEY));
  return Number.isFinite(w) && w > 0 ? Math.min(LIST_MAX_WIDTH, Math.round(w)) : LIST_MAX_WIDTH;
};
interface Fit {
  /** Width per column (index 5, the badges, takes what is left). */
  cols: number[];
  min: number;
  narrow: number;
}

/** m/d/yyyy */
const usDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}/${d.slice(0, 4)}`;

interface Props {
  /** Oldest first. */
  games: ListGame[];
  /** Next scheduled games, oldest first. */
  upcoming?: UpcomingGame[];
  selected: string | null;
  onSelect: (id: string) => void;
  seasons: string[];
  season: string;
  onSeason: (s: string) => void;
  onCollapse: () => void;
  /** Link to the matchup view for an upcoming game (Averages, this team vs that opponent, last 10). */
  matchupHref?: (opp: string) => string;
}

export function GameList({ games, upcoming = [], selected, onSelect, seasons, season, onSeason, onCollapse, matchupHref }: Props) {
  const [q, setQ] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  // Drag the right border to resize (narrower only); remembered; double-click or ↺ restores the default width.
  const table = useRef<HTMLTableElement>(null);
  const [fit, setFit] = useState<Fit | null>(null);
  const measured = useRef<{ key: string; cols: number[] } | null>(null);
  const min = fit?.min ?? FALLBACK.min;
  const [chosen, setWidth] = useState(savedWidth);
  const width = clampWidth(chosen, min);
  const narrow = width < (fit?.narrow ?? FALLBACK.narrow);
  // Measure each column's widest text (ranges ignore clipping and hidden cells), then size the columns from it.
  useLayoutEffect(() => {
    const t = table.current;
    if (!t) return;
    const w = [0, 0, 0, 0, 0, 0, 0];
    const r = document.createRange();
    for (const tr of t.rows)
      [...tr.cells].forEach((c, i) => {
        if (i === 5 || c.colSpan > 1) return;
        r.selectNodeContents(c);
        w[i] = Math.max(w[i]!, Math.ceil(r.getBoundingClientRect().width));
      });
    // A measurement can only come out short (clipped text), never long: for the same rows, widths only grow.
    const key = `${shown.map((g) => g.id).join()}|${next.map((g) => g.id).join()}`;
    const prev = measured.current?.key === key ? measured.current.cols : null;
    const cols = w.map((x, i) => Math.max(x + CELL_PAD, prev?.[i] ?? 0));
    measured.current = { key, cols };
    const base = cols.slice(0, 5).reduce((a, b) => a + b, 0) + 2; // + the panel's borders
    const nextFit: Fit = { cols, min: Math.min(LIST_MAX_WIDTH, base), narrow: base + cols[6]! + LIST_MIN_TAGS };
    setFit((f) => (f && f.min === nextFit.min && f.narrow === nextFit.narrow && f.cols.every((x, i) => x === cols[i]) ? f : nextFit));
  });
  const setSaved = (w: number) => {
    const c = clampWidth(w, min);
    setWidth(c);
    remember(WIDTH_KEY, String(c));
  };
  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('gl-resizing');
    const move = (ev: PointerEvent) => setWidth(clampWidth(w0 + ev.clientX - x0, min));
    const up = (ev: PointerEvent) => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.body.classList.remove('gl-resizing');
      setSaved(w0 + ev.clientX - x0);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? games.filter((g) => g.opp.toLowerCase().includes(s) || teamName(g.opp).toLowerCase().includes(s)) : games;
  }, [games, q]);
  const next = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? upcoming.filter((g) => g.opp && (g.opp.toLowerCase().includes(s) || teamName(g.opp).toLowerCase().includes(s))) : upcoming;
  }, [upcoming, q]);
  // Keep the selected row in view (on load, on selection change, after filtering) — scrolls the list only.
  useEffect(() => {
    const box = scroller.current;
    const row = box?.querySelector<HTMLElement>('tr[aria-selected=true]');
    if (!box || !row) return;
    const head = box.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    const top = row.offsetTop - head;
    // The latest game: show the upcoming games under it too (as far as they fit with the selected row in view).
    const last = box.querySelector<HTMLElement>('tr.gl-upcoming:last-of-type');
    const bottom = selected === shown.at(-1)?.id && last ? Math.min(last.offsetTop + last.offsetHeight, top + box.clientHeight) : row.offsetTop + row.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
  }, [selected, shown, next]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const i = shown.findIndex((g) => g.id === selected);
    const next = i < 0 ? shown.at(e.key === 'ArrowUp' ? -1 : 0) : shown[i + (e.key === 'ArrowUp' ? -1 : 1)];
    if (next) onSelect(next.id);
  };
  return (
    <aside className={`gl${narrow ? ' gl-narrow' : ''}`} data-testid="game-list" style={{ width }} data-min={min} data-narrow-below={fit?.narrow ?? FALLBACK.narrow}>
      <div
        className="gl-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the game list (double-click: default width)"
        title="Drag to resize · double-click for the default width"
        aria-valuenow={width}
        aria-valuemin={min}
        aria-valuemax={LIST_MAX_WIDTH}
        onPointerDown={startDrag}
        onDoubleClick={() => setSaved(LIST_MAX_WIDTH)}
        data-testid="list-resize"
      />
      <div className="gl-top">
        <div className="gl-bar">
          <label className="field">
            <span>Season</span>
            <select value={season} aria-label="Season" onChange={(e) => onSeason(e.target.value)}>
              {[...seasons].reverse().map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <input
            className="gl-search"
            type="search"
            placeholder="Opponent (BOS, Celtics)"
            aria-label="Filter by opponent"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {width < LIST_MAX_WIDTH && (
            <button className="gl-collapse" onClick={() => setSaved(LIST_MAX_WIDTH)} title="Default width" aria-label="Restore the default width" data-testid="list-reset">
              ↔
            </button>
          )}
          <button className="gl-collapse" onClick={onCollapse} title="Hide the game list" aria-label="Hide the game list" data-testid="list-collapse">
            ⟨
          </button>
        </div>
        <ScheduleLegend />
      </div>
      <div className="gl-scroll" ref={scroller} tabIndex={0} onKeyDown={onKey} aria-label="Games (↑ ↓ to move)" data-testid="game-list-rows">
        <table className="gl-table" ref={table}>
          <colgroup>
            {['gl-c-date', 'gl-c-team', 'gl-c-at', 'gl-c-team', 'gl-c-result', '', 'gl-c-rest'].map((c, i) => (
              <col key={i} className={c || undefined} style={i === 5 || !fit ? undefined : { width: i === 6 && narrow ? 0 : fit.cols[i] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th>DATE</th>
              <th>TM</th>
              <th />
              <th>OPP</th>
              <th />
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((g) => {
              const won = g.us > g.them;
              return (
                <tr
                  key={g.id}
                  aria-selected={g.id === selected}
                  onClick={() => onSelect(g.id)}
                  data-testid="list-row"
                  data-id={g.id}
                  data-opp={g.opp}
                >
                  <td>
                    <a
                      className="gl-date"
                      href={`#/game/${g.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        onSelect(g.id);
                      }}
                    >
                      {usDate(g.date)}
                    </a>
                  </td>
                  <td className="gl-team">
                    <TeamLogo teamId={g.teamId} tri={g.team} />
                    <TeamLink team={g.team} season={season}>
                      {g.team}
                    </TeamLink>
                  </td>
                  <td className="muted gl-at">{g.home ? 'vs' : '@'}</td>
                  <td className="gl-team">
                    <TeamLogo teamId={g.oppId} tri={g.opp} />
                    <TeamLink team={g.opp} season={season}>
                      {g.opp}
                    </TeamLink>
                  </td>
                  <td className={`gl-result ${won ? 'win' : 'loss'}`} data-testid="list-result">
                    {won ? 'W' : 'L'} {g.us}–{g.them}
                    {g.flagged && (
                      <span className="gp-flag" title="This game has a data note" data-testid="flag">
                        {' '}
                        ⚠
                      </span>
                    )}
                  </td>
                  <td className="gl-tags">
                    <span className="gl-tags-in">
                      <ScheduleChips tags={g.tags} rest={false} />
                      <BroadcastTags tv={g.tv} cup={g.cup} />
                    </span>
                  </td>
                  <td className="rest-days" data-testid="list-rest">
                    <ScheduleChips tags={g.tags} chips={false} />
                  </td>
                </tr>
              );
            })}
            {next.map((g, i) => (
              <tr
                key={g.id}
                className={`gl-upcoming${i === 0 ? ' first' : ''}${g.opp && matchupHref ? ' open' : ''}`}
                title={
                  (g.status === 'live' ? 'In progress — the chart appears once the game is final and the daily update has run' : 'Not played yet') +
                  (g.opp && matchupHref ? `. Click for the matchup: ${g.team} vs ${g.opp}, last 10 games.` : '')
                }
                onClick={() => g.opp && matchupHref && (location.hash = matchupHref(g.opp))}
                data-testid="upcoming-row"
                data-id={g.id}
                data-opp={g.opp}
              >
                <td className="gl-date-future">
                  {g.opp && matchupHref ? (
                    <a className="gl-date-future" href={matchupHref(g.opp)} onClick={(e) => e.stopPropagation()} data-testid="upcoming-matchup">
                      {usDate(g.date)}
                    </a>
                  ) : (
                    usDate(g.date)
                  )}
                </td>
                <td className="gl-team">
                  <TeamLogo teamId={g.teamId} tri={g.team} />
                  <TeamLink team={g.team} season={season}>
                    {g.team}
                  </TeamLink>
                </td>
                <td className="muted gl-at">{g.home ? 'vs' : '@'}</td>
                <td className="gl-team">
                  {g.opp ? (
                    <>
                      <TeamLogo teamId={g.oppId} tri={g.opp} />
                      <TeamLink team={g.opp} season={season}>
                        {g.opp}
                      </TeamLink>
                    </>
                  ) : (
                    <span className="muted">TBD</span>
                  )}
                </td>
                <td className="gl-result-future" data-testid="upcoming-status">
                  {g.status === 'live' ? 'live' : 'upcoming'}
                </td>
                <td className="gl-tags">
                  <span className="gl-tags-in">
                    <ScheduleChips tags={g.tags} rest={false} />
                    <BroadcastTags tv={g.tv} cup={g.cup} />
                  </span>
                </td>
                <td className="rest-days">
                  <ScheduleChips tags={g.tags} chips={false} />
                </td>
              </tr>
            ))}
            {!shown.length && !next.length && (
              <tr>
                <td colSpan={7} className="muted gl-empty">
                  No games against “{q}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </aside>
  );
}

