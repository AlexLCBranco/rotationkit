import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { loadIndex } from '../app/data.ts';
import { format } from '../app/route.ts';
import { teamName } from '../app/teams.ts';
import { DEFAULT_FILTERS } from '../domain/patterns.ts';
import { seasonOf } from '../domain/season.ts';
import { HelpLink } from './HelpLink.tsx';
import { useLinkContext } from './Links.tsx';
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
 * stretch in words, then one square per day — a game day with the opponent's logo and "vs LAL" / "@ DEN" (RK-15: a
 * game that is in our data links to its rotation page here, this team first; a game not played yet or not in our data
 * is a plain square), a rest day empty with a dashed edge, tonight ringed — the day of the month under each.
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
  // Which of the stretch's games are in our data (the season's index: already loaded by the page, memoized).
  const season = seasonOf(m.games[0]!.id);
  // Only once the pop-up opens (a games list has dozens of chips: nothing to do for a closed one).
  const [inData, setInData] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!open) return;
    let live = true;
    void loadIndex(season).then((ix) => live && setInData(new Set(ix.map((e) => e.id))), () => undefined);
    return () => void (live = false);
  }, [open, season]);
  const filters = useLinkContext()?.filters ?? DEFAULT_FILTERS;
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
        onBlur={(e) => {
          // a tap on a game square inside the pop-up moves the focus there: let the link open first
          if (pop.current?.contains(e.relatedTarget as Node | null)) return later();
          keep();
          setOpen(false);
        }}
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
                      (() => {
                        const us = game.opp === game.home ? game.away : game.home;
                        const words = `${teamName(us)} ${game.at === '@' ? 'at' : 'vs'} ${teamName(game.opp)}`;
                        const inner = (
                          <>
                            {logo && <img src={logo} alt="" width={16} height={16} onError={(e) => (e.currentTarget.style.display = 'none')} />}
                            <span className="tif-match">
                              {game.at} {game.opp}
                            </span>
                          </>
                        );
                        return inData.has(game.id) ? (
                          <a
                            className="tif-sq"
                            href={format({ view: 'game', game: game.id, team: us, season: seasonOf(game.id), filters })}
                            title={`${words}. Open this game's rotations`}
                            aria-label={`${words}. Open this game's rotations`}
                            data-testid="tip-game"
                            data-id={game.id}
                          >
                            {inner}
                          </a>
                        ) : (
                          <span className="tif-sq" title={`${words}. Not played yet, or not in our data yet`} aria-label={`${words}. Not played yet, or not in our data yet`} data-testid="tip-game" data-id={game.id}>
                            {inner}
                          </span>
                        );
                      })()
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
      <HelpLink section="schedule" />
    </div>
  );
}
