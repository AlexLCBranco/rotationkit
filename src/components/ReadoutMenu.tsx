// ⚙ in the chart toolbar: what the hover readout shows (remembered).

import { useEffect, useRef, useState } from 'react';
import type { ReadoutSettings } from '../app/readoutSettings.ts';

const LINEUPS: [ReadoutSettings['lineups'], string][] = [
  ['both', 'Both teams'],
  ['mine', 'Hovered player’s team only'],
  ['off', 'Off'],
];

/** `barsOnly`: the player page has no lineup readout, only the points-on-bars option. */
export function ReadoutMenu({ value, onChange, barsOnly = false }: { value: ReadoutSettings; onChange: (s: ReadoutSettings) => void; barsOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('mousedown', down);
    addEventListener('keydown', key);
    return () => {
      removeEventListener('mousedown', down);
      removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div className="rd-menu" ref={box}>
      <button className="rd-gear" aria-expanded={open} onClick={() => setOpen(!open)} title="What the hover readout shows" data-testid="readout-settings">
        ⚙ Readout
      </button>
      {open && (
        <div className="rd-panel" data-testid="readout-settings-panel">
          {!barsOnly && (
            <>
              <fieldset>
                <legend>Lineups at the hovered moment</legend>
                {LINEUPS.map(([v, label]) => (
                  <label key={v}>
                    <input type="radio" name="rd-lineups" checked={value.lineups === v} onChange={() => onChange({ ...value, lineups: v })} />
                    {label}
                  </label>
                ))}
              </fieldset>
              <label>
                <input type="checkbox" checked={value.stint} onChange={(e) => onChange({ ...value, stint: e.target.checked })} />
                Stint details
              </label>
              <label>
                <input type="checkbox" checked={value.fouls} onChange={(e) => onChange({ ...value, fouls: e.target.checked })} />
                Foul counts
              </label>
            </>
          )}
          <label>
            <input type="checkbox" checked={value.barPoints} onChange={(e) => onChange({ ...value, barPoints: e.target.checked })} data-testid="bar-points-toggle" />
            Points on the bars (“12:00 · 8p”)
          </label>
        </div>
      )}
    </div>
  );
}
