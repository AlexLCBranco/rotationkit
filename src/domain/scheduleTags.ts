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
  /** Full days off before this game (0 = back-to-back); null for the team's first game. */
  restDays: number | null;
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
      restDays: i > 0 ? day[i]! - day[i - 1]! - 1 : null,
    });
  });
  // Sets: three consecutive games whose first and last are at most 3 days apart (= within 4 calendar days).
  for (let i = 0; i + 2 < games.length; i++) {
    if (day[i + 2]! - day[i]! > 3) continue;
    const trio = [games[i]!, games[i + 1]!, games[i + 2]!];
    trio.forEach((g, k) => {
      const t = out.get(g.id)!;
      const position = (k + 1) as Position;
      t.threeInFour.push({ ids: trio.map((x) => x.id) as ThreeInFourSet['ids'], dates: trio.map((x) => x.date) as ThreeInFourSet['dates'], position });
      t.threeInFourPosition = Math.max(t.threeInFourPosition ?? 0, position) as Position;
    });
  }
  return out;
}

export const ORDINAL: Record<Position, string> = { 1: '1st', 2: '2nd', 3: '3rd' };

/** "0d" / "1d" / "2d+" (null → first game of the season). */
export const restLabel = (days: number | null) => (days === null ? null : days >= 2 ? '2d+' : `${days}d`);
