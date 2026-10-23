// Rest days before each game, per team, from a season schedule.
// 'b2b' = second night of a back-to-back (previous game the day before); 'rest1' = one day off;
// 'rest2' = two or more days off, or no previous game (season opener). Preseason games are ignored.

export type Rest = 'b2b' | 'rest1' | 'rest2';
export type RestFilter = 'b2b' | 'rested';

export interface ScheduleLike {
  id: string;
  date: string; // YYYY-MM-DD (US Eastern)
  home: string;
  away: string;
}

const dayNumber = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000;

export interface RestInfo {
  rest: Rest;
  /** Days since the previous game (1 = back-to-back); null for the team's first game. */
  days: number | null;
}

export function restForTeam(schedule: ScheduleLike[], team: string): Map<string, RestInfo> {
  const games = schedule
    .filter((g) => (g.home === team || g.away === team) && !g.id.startsWith('001'))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const out = new Map<string, RestInfo>();
  let prev: string | null = null;
  for (const g of games) {
    const days = prev === null ? null : dayNumber(g.date) - dayNumber(prev);
    out.set(g.id, { rest: days === 1 ? 'b2b' : days === 2 ? 'rest1' : 'rest2', days });
    prev = g.date;
  }
  return out;
}

export const matchesRest = (r: Rest | undefined, f: RestFilter) => (f === 'b2b' ? r === 'b2b' : r === 'rest1' || r === 'rest2');

export const REST_WORDS: Record<RestFilter, string> = {
  b2b: 'on the second night of a back-to-back',
  rested: 'with 1+ days of rest',
};
