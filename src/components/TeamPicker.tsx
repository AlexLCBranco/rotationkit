// Team picker: button with the team's logo + name, opening a listbox grouped by conference and division.
// Ported from calendarkit (src/components/TeamPicker.tsx, AlexLCBranco/calendarkit) with its keyboard behavior;
// rotationkit differences: teams are passed as tricodes (the app's URL/state key), rotationkit's own TeamLogo, no
// compact (phone) mode, and the data/helpers it imports live in src/data/teams.ts.

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { DIVISIONS, PICKER_ORDER, TEAMS, TEAM_BY_ID, TEAM_BY_TRI, fullName, letterJump } from '../data/teams.ts';
import { TeamLogo } from './Headshot.tsx';

/** calendarkit's clampX (src/slate/tooltip.ts): keep a popup inside the window. */
const clampX = (x: number, w: number) => Math.max(8, Math.min(x, document.documentElement.clientWidth - w - 8));

/**
 * Team picker with logos: a button (logo + name) opening a listbox grouped by conference and division.
 * Keyboard: Enter/Space/↓ open; arrows move (←/→ jump a division), Home/End, a letter jumps to the next team
 * starting with it, Enter selects, Escape closes; focus returns to the button.
 */
export function TeamPicker({ team: tri, onChange, placeholder = 'Pick a team', label = 'Team', testId = 'team-picker' }: { team: string | null; onChange: (tri: string) => void; placeholder?: string; label?: string; testId?: string }) {
  const teamId = tri ? TEAM_BY_TRI.get(tri)?.id : undefined;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(teamId ?? PICKER_ORDER[0]!.id);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const team = teamId === undefined ? undefined : TEAM_BY_ID.get(teamId);
  const id = `ck-team-${useId()}`;

  const openList = () => {
    const r = btn.current!.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 4 });
    setActive(teamId ?? PICKER_ORDER[0]!.id);
    setOpen(true);
  };
  const close = (focus = true) => {
    setOpen(false);
    if (focus) btn.current?.focus();
  };
  const pick = (t: number) => {
    close();
    if (t !== teamId) onChange(TEAM_BY_ID.get(t)!.tricode);
  };
  useLayoutEffect(() => {
    const el = list.current;
    if (!open || !el) return;
    el.style.left = `${clampX(pos.left, el.offsetWidth)}px`;
    el.focus();
  }, [open, pos]);
  useLayoutEffect(() => {
    if (open) list.current?.querySelector(`[data-team-id="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => !list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node) && close(false);
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  const move = (by: number) => {
    const i = PICKER_ORDER.findIndex((t) => t.id === active);
    setActive(PICKER_ORDER[Math.max(0, Math.min(PICKER_ORDER.length - 1, i + by))]!.id);
  };
  const onListKey = (e: KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      ArrowRight: () => move(5),
      ArrowLeft: () => move(-5),
      Home: () => setActive(PICKER_ORDER[0]!.id),
      End: () => setActive(PICKER_ORDER.at(-1)!.id),
      Enter: () => pick(active),
      ' ': () => pick(active),
      Escape: () => close(),
      Tab: () => close(),
    };
    if (keys[e.key]) {
      if (e.key !== 'Tab') e.preventDefault();
      keys[e.key]!();
    } else if (/^[a-z]$/i.test(e.key)) {
      // next team (after the active one) whose city or name starts with the letter
      const hit = letterJump(active, e.key);
      if (hit) setActive(hit.id);
    }
  };

  return (
    <div className="ck-picker">
      <span id={`${id}-label`} className="ck-sr">
        {label}
      </span>
      <button
        ref={btn}
        type="button"
        id={`${id}-button`}
        className="ck-picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-button`}
        data-testid={testId}
        data-team={tri ?? ''}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            openList();
          }
        }}
      >
        {team && <TeamLogo teamId={team.id} tri={team.tricode} />}
        <span className="ck-picker-name">{!team ? placeholder : fullName(team)}</span>
        <span className="ck-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div
          ref={list}
          className="ck-picker-list"
          role="listbox"
          aria-label="Teams"
          tabIndex={-1}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onListKey}
          style={{ top: pos.top }}
          data-testid={`${testId}-list`}
        >
          {DIVISIONS.map(({ conference, division }) => (
            <div key={division} role="group" aria-labelledby={`${id}-${division}`} className="ck-picker-group">
              <div id={`${id}-${division}`} className="ck-picker-head" role="presentation">
                {conference} · {division}
              </div>
              {TEAMS.filter((t) => t.division === division).map((t) => (
                <div
                  key={t.id}
                  id={`${id}-${t.id}`}
                  role="option"
                  aria-selected={t.id === teamId}
                  data-team-id={t.id}
                  data-tri={t.tricode}
                  className={`ck-picker-option${t.id === active ? ' ck-picker-active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(t.id)}
                  // only a pointer that really moves takes the highlight: when the list opens (or scrolls) under a
                  // resting pointer, Chrome sends that option a mouseover/mouseenter with no movement, which would
                  // overwrite a keyboard choice made just before (calendarkit round 6)
                  onMouseMove={(e) => (e.movementX || e.movementY) && setActive(t.id)}
                >
                  <TeamLogo teamId={t.id} tri={t.tricode} />
                  {fullName(t)}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
