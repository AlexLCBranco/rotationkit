// Day picker shared by the Games tab's By day view (formerly Full Q4's by-date section): ◀ ▶ jump to the previous /
// next day with games, a date input, and "No games on X; showing Y" when the asked date has none.
// arrowKeys: ← / → change the day too (not while typing in a field or with a modifier held).

import { useEffect } from 'react';
import { GARBAGE_RULE } from './LeadersView.tsx';
import { HelpLink } from './HelpLink.tsx';

interface Props {
  /** Days with games, ascending. */
  dates: string[];
  /** Day shown (null = none). */
  date: string | null;
  /** Day the URL asked for (the note shows when it differs from `date`). */
  asked: string | null;
  onDate: (d: string) => void;
  arrowKeys?: boolean;
  testPrefix?: string;
}

export function DateBar({ dates, date, asked, onDate, arrowKeys = false, testPrefix = 'db' }: Props) {
  const i = date ? dates.indexOf(date) : -1;
  const prev = i > 0 ? dates[i - 1] : undefined;
  const next = i >= 0 && i < dates.length - 1 ? dates[i + 1] : undefined;
  useEffect(() => {
    if (!arrowKeys) return;
    const on = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName))) return;
      const to = e.key === 'ArrowLeft' ? prev : next;
      if (!to) return;
      e.preventDefault();
      onDate(to);
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [arrowKeys, prev, next, onDate]);
  return (
    <div className="fq-datebar">
      <button className="gp-arrow" disabled={!prev} onClick={() => prev && onDate(prev)} aria-label="Previous day" title="Previous day with games (←)" data-testid={`${testPrefix}-prev`}>
        ◀
      </button>
      <input
        type="date"
        aria-label="Date"
        data-testid={`${testPrefix}-date`}
        value={date ?? ''}
        min={dates[0]}
        max={dates[dates.length - 1]}
        onChange={(e) => e.target.value && onDate(e.target.value)}
      />
      <button className="gp-arrow" disabled={!next} onClick={() => next && onDate(next)} aria-label="Next day" title="Next day with games (→)" data-testid={`${testPrefix}-next`}>
        ▶
      </button>
      {asked && date !== asked && (
        <span className="muted" data-testid={`${testPrefix}-note`}>
          No games on {asked}; showing {date}.
        </span>
      )}
    </div>
  );
}

/** Full Q4's blowout toggle (one rule: games with 4th-quarter garbage time by the blowout rule are left out). */
export function NoBlowoutsToggle({ checked, onChange, label = 'Exclude blowouts' }: { checked: boolean; onChange: (b: boolean) => void; label?: string }) {
  return (
    <label className="toggle" title={`Leaves out games with garbage time in the 4th quarter: ${GARBAGE_RULE}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
      <HelpLink section="garbage" />
    </label>
  );
}
