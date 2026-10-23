import type { Filters as F, Venue, Window } from '../domain/patterns.ts';

interface Props {
  seasons: string[];
  season: string;
  filters: F;
  /** Team-mates for the with/without picker (id → short name), sorted for display. */
  teammates?: { id: number; label: string }[];
  onSeason: (s: string) => void;
  onFilters: (f: F) => void;
}

const WINDOWS: [Window, string][] = [[5, 'Last 5'], [10, 'Last 10'], ['season', 'Season']];
const VENUES: [Venue, string][] = [['all', 'All'], ['home', 'Home'], ['away', 'Away']];

export function Filters({ seasons, season, filters, teammates, onSeason, onFilters }: Props) {
  const ww = filters.withWithout;
  return (
    <div className="filters">
      <label className="field">
        <span>Season</span>
        <select value={season} onChange={(e) => onSeason(e.target.value)} aria-label="Season">
          {[...seasons].reverse().map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
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
          <select
            aria-label="With or without"
            value={ww?.mode ?? ''}
            onChange={(e) => {
              const mode = e.target.value as 'with' | 'without' | '';
              if (!mode) {
                const { withWithout: _, ...rest } = filters;
                onFilters(rest);
              } else onFilters({ ...filters, withWithout: { player: ww?.player ?? teammates[0]!.id, mode } });
            }}
          >
            <option value="">All games</option>
            <option value="with">With…</option>
            <option value="without">Without…</option>
          </select>
          {ww && (
            <select aria-label="Player" value={ww.player} onChange={(e) => onFilters({ ...filters, withWithout: { ...ww, player: Number(e.target.value) } })}>
              {!teammates.some((t) => t.id === ww.player) && <option value={ww.player}>(not on roster this season)</option>}
              {teammates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </div>
  );
}
