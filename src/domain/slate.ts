// Games by day (Games tab, "By day"): a whole night's games, tip-time order, with each team's closers (on court at
// the end of regulation), the full-Q4 mark (same rule as Full Q4), coach's-decision DNPs, and the day's Q4 minutes
// leaders (regulation 4th quarter, from quarters.json, same numbers as Full Q4).

import { dnpLabel } from '../app/dnp.ts';
import { hasQ4Garbage, q4Seconds, reachesQ4 } from './fullQ4.ts';
import type { QuartersFile } from './leaders.ts';
import { periodEnd, periodStart, REG_PERIODS } from './time.ts';
import type { Game, GameIndexEntry, PlayerGame, ScheduleEntry } from './types.ts';

/** Preseason (001) and All-Star (003) games never show on the slate (same as the game list's upcoming games). */
const slateGame = (id: string) => !id.startsWith('001') && !id.startsWith('003');

export interface SlateGame {
  id: string;
  date: string;
  home: string;
  away: string;
  /** Tip-off, UTC ISO, from schedule.json (absent: TBD or no cached feed for the season). */
  tip?: string;
  /** In index.json: rotation data exists, the card opens the game. */
  finished: boolean;
  /** Schedule status (an unfinished game can already be final in the feed before its data is added). */
  status: ScheduleEntry['status'];
  entry?: GameIndexEntry;
  tv?: string[];
  cup?: ScheduleEntry['cup'];
  /** The schedule feed's own label (round, game number), when it gave one. */
  label?: string;
}

/** Tip-time order; games without a time after those with one; then game id. */
const byTip = (a: SlateGame, b: SlateGame) => (a.tip && b.tip ? a.tip.localeCompare(b.tip) : a.tip ? -1 : b.tip ? 1 : 0) || a.id.localeCompare(b.id);

/** Every slate game of one date: finished ones from the index, the rest from the schedule; tip-time order. */
export function slateDay(index: GameIndexEntry[], schedule: ScheduleEntry[] | null, date: string): SlateGame[] {
  const sched = new Map((schedule ?? []).map((e) => [e.id, e]));
  const out = new Map<string, SlateGame>();
  for (const e of index) {
    if (e.date !== date || !slateGame(e.id)) continue;
    const s = sched.get(e.id);
    out.set(e.id, { id: e.id, date, home: e.home, away: e.away, ...(s?.tip ? { tip: s.tip } : {}), finished: true, status: 'final', entry: e, ...(e.tv ? { tv: e.tv } : {}), ...(e.cup ? { cup: e.cup } : {}), ...(s?.label ? { label: s.label } : {}) });
  }
  for (const s of schedule ?? []) {
    if (s.date !== date || !slateGame(s.id) || out.has(s.id) || !s.home || !s.away) continue;
    out.set(s.id, { id: s.id, date, home: s.home, away: s.away, ...(s.tip ? { tip: s.tip } : {}), finished: false, status: s.status, ...(s.tv ? { tv: s.tv } : {}), ...(s.cup ? { cup: s.cup } : {}), ...(s.label ? { label: s.label } : {}) });
  }
  return [...out.values()].sort(byTip);
}

/** Dates with slate games (finished or scheduled), ascending; and the latest date with a finished game. */
export function slateDates(index: GameIndexEntry[], schedule: ScheduleEntry[] | null): { dates: string[]; latestFinished: string | null } {
  const finished = index.filter((e) => slateGame(e.id)).map((e) => e.date);
  const scheduled = (schedule ?? []).filter((e) => slateGame(e.id) && e.home && e.away).map((e) => e.date);
  const dates = [...new Set([...finished, ...scheduled])].sort();
  return { dates, latestFinished: finished.length ? finished.reduce((a, b) => (b > a ? b : a)) : null };
}

/** The day's finished games in tip-time order (game page "previous / next game" when arriving from By day). */
export const finishedOfDay = (index: GameIndexEntry[], schedule: ScheduleEntry[] | null, date: string) => slateDay(index, schedule, date).filter((g) => g.finished);

/** Previous / next finished game of the day, keeping the side (home / away) of the selected team; else home. */
export function dayNeighbours(day: SlateGame[], id: string, team: string | null): { prev?: { id: string; team: string }; next?: { id: string; team: string } } {
  const i = day.findIndex((g) => g.id === id);
  if (i < 0) return {};
  const side = team && day[i]!.away === team ? 'away' : 'home';
  const at = (g: SlateGame | undefined) => (g ? { id: g.id, team: g[side] } : undefined);
  const prev = at(day[i - 1]);
  const next = at(day[i + 1]);
  return { ...(prev ? { prev } : {}), ...(next ? { next } : {}) };
}

export interface CardPlayer {
  id: number;
  name: string;
  /** Played the whole regulation 4th quarter (Full Q4 rule, 12:00). */
  fullQ4: boolean;
}
export interface CardSide {
  team: string;
  /** On court at the end of regulation (the closers), most Q4 minutes first. */
  closers: CardPlayer[];
  /** Coach's-decision DNPs (the game page's "DNP – CD" label, from the source's *_COACH codes only). */
  cd: { id: number; name: string; tag: string; detail?: string }[];
}

/** Players on court at the end of regulation (stints never cross a period line, so: a Q4 stint ending at 48:00). */
export function regulationClosers(g: Game, team: string): PlayerGame[] {
  const [start, end] = [periodStart(REG_PERIODS), periodEnd(REG_PERIODS)];
  return g.players.filter((p) => p.team === team && p.played && p.stints.some(([s, e]) => s >= start && e === end && e > s));
}

export function cardSide(g: Game, team: string): CardSide {
  const closers = regulationClosers(g, team)
    .map((p) => ({ p, q4: q4Seconds(p, g.periods) }))
    .sort((a, b) => b.q4 - a.q4 || a.p.name.localeCompare(b.p.name))
    .map(({ p, q4 }) => ({ id: p.id, name: p.name, fullQ4: reachesQ4(q4, 'full') }));
  const cd: CardSide['cd'] = [];
  for (const p of g.players) {
    if (p.team !== team || (p.played && p.stints.length)) continue; // same rows as the game page's DNP rows
    const l = dnpLabel(p.reason, p.reasonDetail);
    if (l.kind === 'cd') cd.push({ id: p.id, name: p.name, tag: l.tag, ...(l.detail ? { detail: l.detail } : {}) });
  }
  for (const p of g.inactive ?? []) {
    if (p.team !== team || cd.some((x) => x.id === p.id)) continue;
    const l = dnpLabel(p.reason, p.reasonDetail, true);
    if (l.kind === 'cd') cd.push({ id: p.id, name: p.name, tag: l.tag, ...(l.detail ? { detail: l.detail } : {}) });
  }
  return { team, closers, cd };
}

export const DAY_LEADERS = 10;

export interface DayLeader {
  /** Standard competition rank (1, 2, 2, 4…). */
  rank: number;
  id: number;
  name: string;
  team: string;
  game: string;
  /** Regulation 4th-quarter seconds. */
  q4: number;
}

/**
 * Top players by regulation 4th-quarter minutes over one date's games; everyone tied with the 10th is shown.
 * noBlowouts: games with 4th-quarter garbage time (Full Q4's "Exclude blowouts" rule) are left out.
 */
export function dayQ4Leaders(file: QuartersFile, date: string, noBlowouts: boolean, n = DAY_LEADERS): DayLeader[] {
  const rows: Omit<DayLeader, 'rank'>[] = [];
  for (const g of file.games) {
    if (g[1] !== date || (noBlowouts && hasQ4Garbage(g))) continue;
    for (const p of g[4]) {
      const q4 = p[2][REG_PERIODS - 1] ?? 0;
      if (q4 > 0) rows.push({ id: p[0], name: file.names[p[0]]?.[0] ?? String(p[0]), team: p[1] === 0 ? g[2] : g[3], game: g[0], q4 });
    }
  }
  rows.sort((a, b) => b.q4 - a.q4 || a.name.localeCompare(b.name));
  const cut = rows[n - 1]?.q4;
  const kept = cut === undefined ? rows : rows.filter((r) => r.q4 >= cut);
  return kept.map((r) => ({ ...r, rank: rows.findIndex((x) => x.q4 === r.q4) + 1 }));
}

/** "7:30 PM ET" from a UTC ISO time (NBA dates and times are US Eastern). */
export function tipLabel(tip: string | undefined): string {
  if (!tip) return 'Time TBD';
  const d = new Date(tip);
  if (Number.isNaN(d.getTime())) return 'Time TBD';
  return `${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET`;
}
