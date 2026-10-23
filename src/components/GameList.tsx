// Always-visible game list (left sidebar of the main screen), laid out like a game log: every finished game of the
// team in the season, oldest at top. Click a row → that game; ↑ / ↓ while the list is focused → previous / next.

import { useEffect, useMemo, useRef, useState } from 'react';
import { teamName } from '../app/teams.ts';
import type { ScheduleTags } from '../domain/scheduleTags.ts';
import { TeamLogo } from './Headshot.tsx';
import { ScheduleChips, ScheduleLegend } from './ScheduleChips.tsx';

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
}

/** m/d/yyyy */
const usDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}/${d.slice(0, 4)}`;

interface Props {
  /** Oldest first. */
  games: ListGame[];
  selected: string | null;
  onSelect: (id: string) => void;
  seasons: string[];
  season: string;
  onSeason: (s: string) => void;
  onCollapse: () => void;
}

export function GameList({ games, selected, onSelect, seasons, season, onSeason, onCollapse }: Props) {
  const [q, setQ] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? games.filter((g) => g.opp.toLowerCase().includes(s) || teamName(g.opp).toLowerCase().includes(s)) : games;
  }, [games, q]);
  // Keep the selected row in view (on load, on selection change, after filtering) — scrolls the list only.
  useEffect(() => {
    const box = scroller.current;
    const row = box?.querySelector<HTMLElement>('tr[aria-selected=true]');
    if (!box || !row) return;
    const head = box.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    const top = row.offsetTop - head;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight;
  }, [selected, shown]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const i = shown.findIndex((g) => g.id === selected);
    const next = i < 0 ? shown.at(e.key === 'ArrowUp' ? -1 : 0) : shown[i + (e.key === 'ArrowUp' ? -1 : 1)];
    if (next) onSelect(next.id);
  };
  return (
    <aside className="gl" data-testid="game-list">
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
          <button className="gl-collapse" onClick={onCollapse} title="Hide the game list" aria-label="Hide the game list" data-testid="list-collapse">
            ⟨
          </button>
        </div>
        <ScheduleLegend />
      </div>
      <div className="gl-scroll" ref={scroller} tabIndex={0} onKeyDown={onKey} aria-label="Games (↑ ↓ to move)" data-testid="game-list-rows">
        <table className="gl-table">
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
                    {g.team}
                  </td>
                  <td className="muted gl-at">{g.home ? 'vs' : '@'}</td>
                  <td className="gl-team">
                    <TeamLogo teamId={g.oppId} tri={g.opp} />
                    {g.opp}
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
                    <ScheduleChips tags={g.tags} rest={false} />
                  </td>
                  <td className="rest-days" data-testid="list-rest">
                    <ScheduleChips tags={g.tags} chips={false} />
                  </td>
                </tr>
              );
            })}
            {!shown.length && (
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

