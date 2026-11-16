import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { hoopsjunkieUrl } from '../app/gameLinks.ts';
import { TEAM_BY_TRI } from '../data/teams.ts';
import { mergedChip, mergedDays, mergedLabel, mergedTip, restLabel, type MergedThreeInFour, type ScheduleTags } from '../domain/scheduleTags.ts';

/** Compact schedule chips for one team's game: B2B 1 / B2B 2 / the merged 3-in-4 stretch ("4in6 · 2nd"), then days of rest (muted). */
export function ScheduleChips({ tags, chips = true, rest: showRest = true }: { tags: ScheduleTags | undefined; chips?: boolean; rest?: boolean }) {
  if (!tags) return null;
  const rest = restLabel(tags.restDays);
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
      {chips && tags.merged && <StretchChip m={tags.merged} sets={tags.threeInFour.length} />}
      {showRest && (
        <span className="rest-days" title={rest ? 'Days of rest before this game' : 'First game of the season'} data-testid="tag-rest">
          {rest ?? 'opener'}
        </span>
      )}
    </span>
  );
}

/** How long the pop-up stays after the pointer leaves the chip, so the pointer can reach a game square (calendarkit's STRIP_CLOSE_MS). */
export const STRIP_CLOSE_MS = 180;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const logoUrl = (tri: string) => {
  const id = TEAM_BY_TRI.get(tri)?.id;
  return id ? `https://cdn.nba.com/logos/nba/${id}/global/L/logo.svg` : undefined;
};

/**
 * The merged 3-in-4 chip ("4in6 · 2nd", calendarkit's Fatigue chip) with calendarkit's hover / focus pop-up: the
 * stretch in words, then one square per day — a game day with the opponent's logo and "vs LAL" / "@ DEN" (a link to the
 * game on hoopsjunkie), a rest day empty with a dashed edge, tonight ringed — the day of the month under each.
 */
function StretchChip({ m, sets }: { m: MergedThreeInFour; sets: number }) {
  const chip = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const closer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [open, setOpen] = useState(false);
  const keep = () => clearTimeout(closer.current);
  const later = () => {
    keep();
    closer.current = setTimeout(() => setOpen(false), STRIP_CLOSE_MS);
  };
  const show = () => (keep(), setOpen(true));
  const text = `${mergedChip(m)}: ${mergedTip(m)}`;
  useLayoutEffect(() => {
    const el = pop.current;
    const c = chip.current;
    if (!open || !el || !c) return;
    const r = c.getBoundingClientRect();
    const w = el.offsetWidth;
    el.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, document.documentElement.clientWidth - w - 8))}px`;
    const above = r.top - el.offsetHeight - 6;
    el.style.top = `${above >= 4 ? above : r.bottom + 6}px`;
  });
  useEffect(() => {
    if (!open) return;
    const onScroll = () => (keep(), setOpen(false));
    window.addEventListener('scroll', onScroll, true);
    return () => (window.removeEventListener('scroll', onScroll, true), keep());
  }, [open]);
  const days = mergedDays(m);
  return (
    <>
      <span
        ref={chip}
        className={`chip-tif tif-pos-${Math.min(3, m.position)}`}
        data-testid="tag-3in4"
        data-position={m.position}
        data-stretch={`${mergedLabel(m)}/${m.position}`}
        data-sets={sets}
        aria-label={text}
        tabIndex={0}
        onMouseEnter={show}
        onMouseLeave={later}
        onFocus={show}
        onBlur={() => (keep(), setOpen(false))}
      >
        {mergedChip(m)}
      </span>
      {open &&
        createPortal(
          <div ref={pop} className="tif-pop" role="tooltip" data-testid="tif-pop" onMouseEnter={keep} onMouseLeave={later}>
            {text}
            <div className="tif-days" data-testid="tip-days">
              {days.map(({ date, kind, game }, i) => {
                const day = Number(date.slice(8, 10));
                const logo = game && logoUrl(game.opp);
                return (
                  <span key={date} className={`tif-day tif-${kind}`} data-date={date} data-kind={kind} data-testid="tip-day">
                    {game ? (
                      <a
                        className="tif-sq"
                        href={hoopsjunkieUrl({ date: game.date, away: { tri: game.away }, home: { tri: game.home } })}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open on hoopsjunkie"
                        aria-label={`${game.at === '@' ? 'at' : 'vs'} ${game.opp}. Open on hoopsjunkie`}
                        data-testid="tip-game"
                      >
                        {logo && <img src={logo} alt="" width={16} height={16} onError={(e) => (e.currentTarget.style.display = 'none')} />}
                        <span className="tif-match">
                          {game.at} {game.opp}
                        </span>
                      </a>
                    ) : (
                      <i className="tif-sq" aria-label="rest day" />
                    )}
                    <span className="tif-num">{i === 0 || day === 1 ? `${MONTHS[Number(date.slice(5, 7)) - 1]} ${day}` : day}</span>
                  </span>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
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
        <span className="chip-tif tif-pos-2">3in4 · 2nd</span> 3 games in 4 days, tonight the 2nd
      </span>
      <span>
        <span className="rest-days">0d 1d 2d+</span> days of rest
      </span>
    </div>
  );
}
