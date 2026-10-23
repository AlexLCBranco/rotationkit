// Game picker: every finished game of the team in the season, newest first, with result, schedule chips and
// ⚠ for flagged games. Filter by opponent (tricode or name).

import { useEffect, useMemo, useRef, useState } from 'react';
import { shortDate } from '../app/labels.ts';
import { teamName } from '../app/teams.ts';
import type { ScheduleTags } from '../domain/scheduleTags.ts';
import { TeamLogo } from './Headshot.tsx';
import { ScheduleChips, ScheduleLegend } from './ScheduleChips.tsx';

export interface PickerGame {
  id: string;
  date: string;
  opp: string;
  oppId: number;
  home: boolean;
  us: number;
  them: number;
  flagged: boolean;
  tags: ScheduleTags | undefined;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekday = (d: string) => WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()]!;

function Row({ g }: { g: PickerGame }) {
  const won = g.us > g.them;
  return (
    <>
      <span className="gp-date">
        <span className="muted">{weekday(g.date)}</span> {shortDate(g.date)}
      </span>
      <span className="gp-opp">
        <span className="muted">{g.home ? 'vs' : '@'}</span>
        <TeamLogo teamId={g.oppId} tri={g.opp} />
        {g.opp}
      </span>
      <span className={`gp-result ${won ? 'win' : 'loss'}`} data-testid="picker-result">
        {won ? 'W' : 'L'} {g.us}–{g.them}
      </span>
      <ScheduleChips tags={g.tags} />
      {g.flagged && (
        <span className="gp-flag" title="This game has a data note" data-testid="flag">
          ⚠
        </span>
      )}
    </>
  );
}

export function GamePicker({ games, selected, onSelect }: { games: PickerGame[]; selected: string | null; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const down = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('mousedown', down);
    addEventListener('keydown', key);
    return () => {
      removeEventListener('mousedown', down);
      removeEventListener('keydown', key);
    };
  }, [open]);
  // Scroll the current game into view when the list opens.
  useEffect(() => {
    if (open) box.current?.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
  }, [open]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? games.filter((g) => g.opp.toLowerCase().includes(s) || teamName(g.opp).toLowerCase().includes(s)) : games;
  }, [games, q]);
  const current = games.find((g) => g.id === selected);
  return (
    <div className="gp" ref={box}>
      <button className="gp-button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="game-picker">
        {current ? <Row g={current} /> : <span className="muted">Pick a game</span>}
        <span className="gp-caret">▾</span>
      </button>
      {open && (
        <div className="gp-panel" data-testid="game-picker-panel">
          <div className="gp-head">
            <input
              ref={search}
              type="search"
              placeholder="Filter by opponent (e.g. BOS or Celtics)"
              aria-label="Filter by opponent"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <span className="muted">
              {shown.length} of {games.length} games · newest first
            </span>
            <ScheduleLegend />
          </div>
          <ul className="gp-list" role="listbox" aria-label="Games">
            {shown.map((g) => (
              <li key={g.id}>
                <button
                  className="gp-item"
                  role="option"
                  aria-selected={g.id === selected}
                  onClick={() => {
                    setOpen(false);
                    setQ('');
                    onSelect(g.id);
                  }}
                  data-testid="picker-item"
                  data-id={g.id}
                  data-opp={g.opp}
                  data-date={g.date}
                >
                  <Row g={g} />
                </button>
              </li>
            ))}
            {!shown.length && <li className="muted gp-empty">No games against “{q}”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
