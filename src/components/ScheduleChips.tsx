import { shortDate } from '../app/labels.ts';
import { ORDINAL, restLabel, type ScheduleTags } from '../domain/scheduleTags.ts';

/** Compact schedule chips for one team's game: B2B 1 / B2B 2 / 3-in-4 · Nth, then days of rest (muted). */
export function ScheduleChips({ tags, chips = true, rest: showRest = true }: { tags: ScheduleTags | undefined; chips?: boolean; rest?: boolean }) {
  if (!tags) return null;
  const rest = restLabel(tags.restDays);
  const sets = tags.threeInFour
    .map((s) => `${s.dates.map(shortDate).join(', ')} (${ORDINAL[s.position]} game)`)
    .join('\n');
  return (
    <span className="sched-chips">
      {chips && tags.b2b1 && (
        <span className="chip-tag b2b1" title="First night of a back-to-back: plays again the next day" data-testid="tag-b2b1">
          B2B 1
        </span>
      )}
      {chips && tags.b2b2 && (
        <span className="chip-tag b2b2" title="Second night of a back-to-back: played the day before" data-testid="tag-b2b2">
          B2B 2
        </span>
      )}
      {chips && tags.threeInFourPosition && (
        <span
          className={`chip-tag tif pos-${tags.threeInFourPosition}`}
          title={`3 games in 4 days — ${tags.threeInFour.length === 1 ? 'set' : `${tags.threeInFour.length} sets`}:\n${sets}`}
          data-testid="tag-3in4"
          data-position={tags.threeInFourPosition}
          data-sets={tags.threeInFour.length}
        >
          3-in-4 · {ORDINAL[tags.threeInFourPosition]}
        </span>
      )}
      {showRest && (
        <span className="rest-days" title={rest ? 'Days of rest before this game' : 'First game of the season'} data-testid="tag-rest">
          {rest ?? 'opener'}
        </span>
      )}
    </span>
  );
}

export function ScheduleLegend() {
  return (
    <div className="sched-legend" data-testid="tag-legend">
      <span>
        <span className="chip-tag b2b1">B2B 1</span> plays again next day
      </span>
      <span>
        <span className="chip-tag b2b2">B2B 2</span> played the day before
      </span>
      <span>
        <span className="chip-tag tif pos-3">3-in-4 · 1st/2nd/3rd</span> game of 3 in 4 days
      </span>
      <span>
        <span className="rest-days">0d 1d 2d+</span> days of rest
      </span>
    </div>
  );
}
