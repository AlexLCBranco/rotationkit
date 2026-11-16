// Schedule tags per team game: back-to-backs, 3-in-4 sets and days of rest, from a season schedule.
// Dates are US Eastern calendar dates (`ScheduleEntry.date` comes from the feed's Eastern date / the box
// score's gameEt), never UTC: a 10:30 pm ET tip in Los Angeles is the next day in UTC.
// Counted games: everything but preseason (001…) and the All-Star game (003…). Scheduled (unplayed) games count
// too, so the latest finished game already shows "B2B 1" when the team plays tomorrow.

import type { ScheduleLike } from './rest.ts';

export type Position = 1 | 2 | 3;

export interface ThreeInFourSet {
  /** The three games' ids and Eastern dates, oldest first. */
  ids: [string, string, string];
  dates: [string, string, string];
  /** This game's place in the set. */
  position: Position;
}

export interface ScheduleTags {
  /** The team plays again the next day (first night of a back-to-back). */
  b2b1: boolean;
  /** The team played the day before (second night of a back-to-back). */
  b2b2: boolean;
  /** Every set of 3 consecutive team games within 4 consecutive days that includes this game. */
  threeInFour: ThreeInFourSet[];
  /** Highest position over those sets (most fatigue-relevant), or null. */
  threeInFourPosition: Position | null;
  /** The merged stretch this game is in (overlapping sets chained into one), or null when in no set. */
  merged: MergedThreeInFour | null;
  /** Full days off before this game (0 = back-to-back); null for the team's first game. */
  restDays: number | null;
}

/** One game of a merged stretch, from the team's side (for the pop-up's day strip). */
export interface StretchGame {
  id: string;
  date: string;
  at: 'vs' | '@';
  opp: string;
  away: string;
  home: string;
}

/**
 * The team's 3-in-4 sets that overlap (share a game), chained, as one stretch: "4in6" = 4 games in the 6 days
 * from the first to the last (inclusive), and this game's place in it. A set that overlaps no other is its own stretch.
 * Same rule and wording as calendarkit (src/data/scheduleTags.ts at 7a1c7f7, MergedThreeInFour).
 */
export interface MergedThreeInFour {
  /** The stretch's games' ids and Eastern dates, oldest first. */
  ids: string[];
  dates: string[];
  games: StretchGame[];
  /** Days from the first game to the last, inclusive. */
  days: number;
  /** This game's place in the stretch (1 = first). */
  position: number;
}

export const dayNumber = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000;

const counts = (id: string) => !id.startsWith('001') && !id.startsWith('003');

export function scheduleTags(schedule: ScheduleLike[], team: string): Map<string, ScheduleTags> {
  const games = schedule
    .filter((g) => (g.home === team || g.away === team) && counts(g.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const day = games.map((g) => dayNumber(g.date));
  const out = new Map<string, ScheduleTags>();
  games.forEach((g, i) => {
    out.set(g.id, {
      b2b1: i + 1 < games.length && day[i + 1]! - day[i]! === 1,
      b2b2: i > 0 && day[i]! - day[i - 1]! === 1,
      threeInFour: [],
      threeInFourPosition: null,
      merged: null,
      restDays: i > 0 ? day[i]! - day[i - 1]! - 1 : null,
    });
  });
  // Sets: three consecutive games whose first and last are at most 3 days apart (= within 4 calendar days).
  const starts: number[] = []; // the first game of every set
  for (let i = 0; i + 2 < games.length; i++) {
    if (day[i + 2]! - day[i]! > 3) continue;
    starts.push(i);
    const trio = [games[i]!, games[i + 1]!, games[i + 2]!];
    trio.forEach((g, k) => {
      const t = out.get(g.id)!;
      const position = (k + 1) as Position;
      t.threeInFour.push({ ids: trio.map((x) => x.id) as ThreeInFourSet['ids'], dates: trio.map((x) => x.date) as ThreeInFourSet['dates'], position });
      t.threeInFourPosition = Math.max(t.threeInFourPosition ?? 0, position) as Position;
    });
  }
  // Sets of consecutive games overlap exactly when their first games are at most 2 apart; a run of such sets (chained:
  // A overlaps B, B overlaps C) is one stretch, from the first set's first game to the last set's last game.
  for (let a = 0; a < starts.length; ) {
    let b = a;
    while (b + 1 < starts.length && starts[b + 1]! - starts[b]! <= 2) b++;
    const stretch = games.slice(starts[a], starts[b]! + 3);
    const ids = stretch.map((g) => g.id);
    const dates = stretch.map((g) => g.date);
    const sg: StretchGame[] = stretch.map((g) => ({ id: g.id, date: g.date, at: g.home === team ? 'vs' : '@', opp: g.home === team ? g.away : g.home, away: g.away, home: g.home }));
    const days = dayNumber(dates.at(-1)!) - dayNumber(dates[0]!) + 1;
    stretch.forEach((g, k) => (out.get(g.id)!.merged = { ids, dates, games: sg, days, position: k + 1 }));
    a = b + 1;
  }
  return out;
}

export const ORDINAL: Record<Position, string> = { 1: '1st', 2: '2nd', 3: '3rd' };

/** "0d" / "1d" / "2d+" (null → first game of the season). */
export const restLabel = (days: number | null) => (days === null ? null : days >= 2 ? '2d+' : `${days}d`);

// Merged-stretch labels, as calendarkit words them (src/data/scheduleTags.ts at 7a1c7f7).

/** "1st", "2nd", "3rd", "4th" … (stretches run to 7 games in the 2026-27 season). */
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

/** The merged stretch's label: "4in6" (games in days, first to last game inclusive). */
export const mergedLabel = (m: MergedThreeInFour) => `${m.ids.length}in${m.days}`;

/** The chip: "4in6 · 2nd" — the stretch, then this game's place in it. */
export const mergedChip = (m: MergedThreeInFour) => `${mergedLabel(m)} · ${ordinal(m.position)}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const md = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

/** Pop-up line: "4 games in 6 days (Oct 28 – Nov 2), tonight the 2nd". */
export const mergedTip = (m: MergedThreeInFour) => `${m.ids.length} games in ${m.days} days (${md(m.dates[0]!)} – ${md(m.dates.at(-1)!)}), tonight the ${ordinal(m.position)}`;

export type StripKind = 'game' | 'rest' | 'tonight';

/** The pop-up's day strip: every day from the stretch's first game to its last — a game day, a rest day or tonight. */
export function mergedDays(m: MergedThreeInFour): { date: string; kind: StripKind; game?: StretchGame }[] {
  const byDate = new Map(m.games.map((g) => [g.date, g]));
  const tonight = m.dates[m.position - 1];
  const out: { date: string; kind: StripKind; game?: StretchGame }[] = [];
  const first = dayNumber(m.dates[0]!);
  const last = dayNumber(m.dates.at(-1)!);
  for (let n = first; n <= last; n++) {
    const date = new Date(n * 86_400_000).toISOString().slice(0, 10);
    const game = byDate.get(date);
    out.push({ date, kind: date === tonight ? 'tonight' : game ? 'game' : 'rest', ...(game ? { game } : {}) });
  }
  return out;
}
