import type { Filters as F, Venue, Window } from '../domain/patterns.ts';
import { Chips, Switch, type Option } from './PageRows.tsx';

interface Props {
  filters: F;
  /** Team-mates for the with/without picker (id → short name), sorted for display. */
  teammates?: { id: number; label: string }[];
  onFilters: (f: F) => void;
}

const WINDOWS: [Window, string][] = [[5, 'Last 5'], [10, 'Last 10'], ['season', 'Season']];
const VENUES: [Venue, string][] = [['all', 'All'], ['home', 'Home'], ['away', 'Away']];

export function Filters({ filters, teammates, onFilters }: Props) {
  const ww = filters.withWithout;
  return (
    <div className="filters">
      <div className="seg" role="group" aria-label="Game window">
        {WINDOWS.map(([w, label]) => (
          <button key={String(w)} aria-pressed={filters.window === w} onClick={() => onFilters({ ...filters, window: w })}>
            {label}
          </button>
        ))}
      </div>
      <div className="seg" role="group" aria-label="Home or away">
        {VENUES.map(([v, label]) => (
          <button key={v} aria-pressed={filters.venue === v} onClick={() => onFilters({ ...filters, venue: v })}>
            {label}
          </button>
        ))}
      </div>
      <div className="seg" role="group" aria-label="Rest">
        {([[undefined, 'Any rest'], ['b2b', 'Back-to-back'], ['rested', 'Rested']] as const).map(([r, label]) => (
          <button
            key={label}
            aria-pressed={filters.rest === r}
            onClick={() => {
              const { rest: _, ...rest } = filters;
              onFilters(r ? { ...rest, rest: r } : rest);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="toggle">
        <input type="checkbox" checked={filters.blowout} onChange={(e) => onFilters({ ...filters, blowout: e.target.checked })} />
        <span>Hide blowout time</span>
      </label>
      {teammates && (
        <div className="ww">
          <Switch
            label="With or without"
            testId="ww-mode"
            value={ww?.mode ?? ''}
            options={[
              ['', 'All games', 'Every game, whoever played'],
              ['with', 'With…', 'Only games a team-mate played'],
              ['without', 'Without…', 'Only games a team-mate missed while with the team'],
            ]}
            onChange={(mode) => {
              if (!mode) {
                const { withWithout: _, ...rest } = filters;
                onFilters(rest);
              } else onFilters({ ...filters, withWithout: { player: ww?.player ?? teammates[0]!.id, mode } });
            }}
          />
          {ww && (
            <Chips
              label="Player"
              testId="ww-player"
              value={ww.player}
              options={[
                ...(teammates.some((t) => t.id === ww.player) ? [] : [[ww.player, '(not on roster this season)'] as Option<number>]),
                ...teammates.map((t): Option<number> => [t.id, t.label]),
              ]}
              onChange={(id) => onFilters({ ...filters, withWithout: { ...ww, player: id } })}
            />
          )}
        </div>
      )}
    </div>
  );
}
