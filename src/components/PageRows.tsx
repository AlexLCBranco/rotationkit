// RK-8: the page rows under the pinned header (NAV_PATTERN.md §2): What (the thing looked at) as chips or a
// scrolling strip, never a <select>; How as a small switch; then the page's own controls. They scroll away with the
// page; a page without a What or a How skips that row. Styles copied from footykit FK-65 (src/components/nav.css).

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { TEAM_CODES, teamName } from '../app/teams.ts';
import { TEAM_BY_TRI } from '../data/teams.ts';
import { TeamLogo } from './Headshot.tsx';
import { loadIndex } from '../app/data.ts';
import { useAsync } from '../app/hooks.ts';
import { hasPostseason, type GameSet } from '../domain/gameSet.ts';

export type Option<T> = [value: T, text: ReactNode, tip?: string, label?: string];

/** A segmented switch (How). */
export function Switch<T extends string | number>({ value, options, onChange, label, testId, idPrefix }: { value: T; options: Option<T>[]; onChange: (v: T) => void; label: string; testId?: string; idPrefix?: string }) {
  return (
    <div className="rk-switch" role="tablist" aria-label={label} data-testid={testId}>
      {options.map(([v, text, tip]) => (
        <button
          key={String(v)}
          type="button"
          role="tab"
          aria-selected={value === v}
          className={`rk-switch-btn${value === v ? ' on' : ''}`}
          data-text={typeof text === 'string' ? text : undefined}
          title={tip}
          data-value={v}
          data-testid={idPrefix ? `${idPrefix}-${v}` : undefined}
          onClick={() => value !== v && onChange(v)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** What: every option visible as a chip, the chosen one highlighted. `strip`: one scrolling line with the chosen
 * one scrolled into view (without moving the page). */
export function Chips<T extends string | number>({ value, options, onChange, label, testId, strip = false, extra }: { value: T; options: Option<T>[]; onChange: (v: T) => void; label: string; testId?: string; strip?: boolean; extra?: Record<string, string> }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    const on = el?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!strip || !el || !on) return;
    const fit = () => {
      const left = on.offsetLeft - el.offsetLeft;
      if (left < el.scrollLeft || left + on.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = left - el.clientWidth / 2 + on.offsetWidth / 2;
    };
    fit();
    // again when the strip gets narrower or wider (a neighbour appearing, the window resized)
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [strip, value]);
  return (
    <div ref={box} className={`rk-chips${strip ? ' rk-chips-strip' : ''}`} role="radiogroup" aria-label={label} data-testid={testId} {...extra}>
      {options.map(([v, text, tip, aria]) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={value === v}
          aria-label={aria}
          className={`rk-chip${value === v ? ' on' : ''}`}
          title={tip}
          data-value={v}
          data-text={typeof text === 'string' ? text : undefined}
          onClick={() => value !== v && onChange(v)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function SeasonChips({ seasons, season, onChange }: { seasons: string[]; season: string; onChange: (s: string) => void }) {
  return <Chips label="Season" testId="season-chips" value={season} options={[...seasons].reverse().map((s) => [s, s, `The ${s} season`])} onChange={onChange} />;
}

/** RK-13: "Regular season | Postseason" next to the season chips. Only for a season that has postseason games
 * (play-in or playoffs) in the data; picking one switches every average on the page to that set of games. */
export function SetChips({ season, value, onChange }: { season: string; value: GameSet; onChange: (s: GameSet) => void }) {
  const index = useAsync(() => loadIndex(season), [season]);
  const has = index.status === 'ok' && hasPostseason(index.value.map((e) => e.id));
  if (!has && value !== 'post') return null;
  return (
    <Chips
      label="Games counted"
      testId="set-chips"
      value={value}
      options={[
        ['regular', 'Regular season', 'Count regular-season games only'],
        ['post', 'Postseason', 'Count play-in and playoff games only'],
      ]}
      onChange={onChange}
    />
  );
}

const teamChip = (t: string): Option<string> => {
  const team = TEAM_BY_TRI.get(t);
  return [
    t,
    <>
      {team && <TeamLogo teamId={team.id} tri={t} />}
      {t}
    </>,
    teamName(t),
    teamName(t),
  ];
};

/** All 30 teams as a strip (logo + three-letter code; the full name on hover and for screen readers). `none`: a first
 * chip meaning "no team" (value ''). */
export function TeamStrip({ team, onChange, label = 'Team', testId = 'team-picker', none, skip }: { team: string | null; onChange: (t: string) => void; label?: string; testId?: string; none?: [string, string]; skip?: string }) {
  const options: Option<string>[] = [...(none ? [['', none[0], none[1]] as Option<string>] : []), ...TEAM_CODES.filter((t) => t !== skip).map(teamChip)];
  return <Chips strip label={label} testId={testId} value={team ?? ''} options={options} onChange={onChange} extra={{ 'data-team': team ?? '' }} />;
}

/** A labelled part of the rows. `grow`: takes the rest of the line (a strip), dropping to its own line when the line
 * has no room left for it (phones). */
export const Row = ({ label, children, wide = false, grow = false, testId }: { label: string; children: ReactNode; wide?: boolean; grow?: boolean; testId?: string }) => (
  <div className={`rk-prow${wide ? ' rk-prow-wide' : ''}${grow ? ' rk-prow-grow' : ''}`} data-testid={testId}>
    <span className="rk-prow-label">{label}</span>
    {children}
  </div>
);

/** The rows: `line` (What + How + small controls on one wrapping line), then each of `wide` on its own line. */
export function PageRows({ line, wide = [] }: { line: ReactNode; wide?: ReactNode[] }) {
  return (
    <div className="rk-prows" data-testid="page-rows">
      <div className="rk-prows-line">{line}</div>
      {wide.map((w, i) => (
        <div key={i} className="rk-prows-line">
          {w}
        </div>
      ))}
    </div>
  );
}
