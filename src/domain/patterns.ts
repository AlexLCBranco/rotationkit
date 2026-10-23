// Pattern engine: on-court probability across games, with window / venue / blowout / with-without filters.
// Pure functions over normalized games of ONE season (mixing seasons throws).

import { PATTERN_CONFIG, type BlowoutConfig } from './config.ts';
import { availabilityFor, buildAppearances, type AppearanceIndex } from './availability.ts';
import { seasonOf } from './season.ts';
import { gameLength, periodEnd, periodStart, REGULATION_LEN } from './time.ts';
import type { Game, PlayerGame } from './types.ts';

export type Window = 5 | 10 | 'season';
export type Venue = 'all' | 'home' | 'away';

export interface WithWithout {
  player: number;
  mode: 'with' | 'without';
}

export interface Filters {
  window: Window;
  venue: Venue;
  /** Exclude blowout time (default ON in the UI). */
  blowout: boolean;
  withWithout?: WithWithout;
}

export const DEFAULT_FILTERS: Filters = { window: 'season', venue: 'all', blowout: true };

type Interval = [number, number];

/** Time excluded as blowout: Q4/OT, |margin| ≥ threshold, under N seconds left in the period. */
export function blowoutIntervals(g: Game, cfg: BlowoutConfig = PATTERN_CONFIG.blowout): Interval[] {
  const out: Interval[] = [];
  const marginAt = (i: number) => g.margin[i]![1];
  for (let p = cfg.fromPeriod; p <= g.periods; p++) {
    const [w0, w1] = [Math.max(periodStart(p), periodEnd(p) - cfg.underSecondsLeft), periodEnd(p)];
    // Margin segments [t_i, t_{i+1}) overlapping the window.
    for (let i = 0; i < g.margin.length; i++) {
      const a = Math.max(g.margin[i]![0], w0);
      const b = Math.min(i + 1 < g.margin.length ? g.margin[i + 1]![0] : Infinity, w1);
      if (b > a && Math.abs(marginAt(i)) >= cfg.margin) {
        const last = out[out.length - 1];
        if (last && last[1] === a) last[1] = b;
        else out.push([a, b]);
      }
    }
  }
  return out;
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const overlapAll = (a0: number, a1: number, xs: Interval[]) => xs.reduce((s, [b0, b1]) => s + overlap(a0, a1, b0, b1), 0);

export interface Selection {
  season: string;
  team: string;
  filters: Filters;
  /** Selected games, oldest first. */
  games: Game[];
  /** Team games in the season before the window was applied (after venue / with-without). */
  candidates: number;
  withWithout?: {
    player: number;
    name: string;
    withGames: number;
    withoutGames: number;
    /** Games where he was not with the team (before arriving / after leaving): in neither group. */
    notWithTeam: number;
    /** True if any "without" game is decided by the appearance rule instead of an official list. */
    withoutEstimated: boolean;
  };
}

/**
 * Choose the games for a team: season games of that team (one season only), then venue, then
 * with/without, then the last-N window. Every step's count is exposed.
 */
export function selectGames(allGames: Game[], season: string, team: string, filters: Filters, idx?: AppearanceIndex): Selection {
  const seasonGames = allGames.filter((g) => seasonOf(g.id) === season);
  let games = seasonGames
    .filter((g) => g.home.tri === team || g.away.tri === team)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  if (filters.venue !== 'all') games = games.filter((g) => (filters.venue === 'home' ? g.home.tri : g.away.tri) === team);

  let ww: Selection['withWithout'];
  if (filters.withWithout) {
    const { player, mode } = filters.withWithout;
    const ix = idx ?? buildAppearances(seasonGames);
    const withG: Game[] = [];
    const withoutG: Game[] = [];
    let notWith = 0;
    let estimated = false;
    for (const g of games) {
      const a = availabilityFor(ix, g, team, player, true);
      if (a.status === 'played') withG.push(g);
      else if (a.status === 'dnp' || a.status === 'out') {
        withoutG.push(g);
        if (a.source === 'rule') estimated = true;
      } else notWith++;
    }
    const name =
      seasonGames.flatMap((g) => g.players).find((p) => p.id === player)?.name ??
      seasonGames.flatMap((g) => g.inactive ?? []).find((p) => p.id === player)?.name ??
      String(player);
    ww = { player, name, withGames: withG.length, withoutGames: withoutG.length, notWithTeam: notWith, withoutEstimated: estimated };
    games = mode === 'with' ? withG : withoutG;
  }
  const candidates = games.length;
  if (filters.window !== 'season') games = games.slice(-filters.window);
  return { season, team, filters, games, candidates, ...(ww ? { withWithout: ww } : {}) };
}

export interface PlayerPattern {
  id: number;
  name: string;
  /** Games in the selection he played in. */
  gamesPlayed: number;
  /** Average minutes per game played (seconds), full game incl. OT, blowout time removed if the filter is on. */
  avgMin: number;
  /** Average box-score minutes per game played (seconds), unfiltered. */
  avgBoxMin: number;
  /** Per regulation bucket: share of eligible time on court, over games he played (0..1); null if no eligible time. */
  onCourt: (number | null)[];
  /** Per bucket: games (of those he played) where he was on court at the bucket midpoint. */
  onAtMid: number[];
  /** Per bucket: games he played where the bucket midpoint is not excluded (denominator for onAtMid). */
  eligibleAtMid: number[];
}

export interface TeamPattern {
  selection: Selection;
  bucketSeconds: number;
  buckets: number;
  /** Games in the selection (= "based on N games"). */
  games: number;
  /** Per bucket: selected games whose midpoint is excluded as blowout. */
  blowoutAtMid: number[];
  players: PlayerPattern[];
}

export function teamPattern(sel: Selection, bucketSeconds: number = PATTERN_CONFIG.bucketSeconds, cfg: BlowoutConfig = PATTERN_CONFIG.blowout): TeamPattern {
  const n = Math.ceil(REGULATION_LEN / bucketSeconds);
  const bStart = (b: number) => b * bucketSeconds;
  const bEnd = (b: number) => Math.min(REGULATION_LEN, (b + 1) * bucketSeconds);
  const mid = (b: number) => (bStart(b) + bEnd(b)) / 2;

  type Acc = { p: PlayerGame; games: number; minSum: number; boxSum: number; on: number[]; elig: number[]; onMid: number[]; eligMid: number[] };
  const acc = new Map<number, Acc>();
  const blowoutAtMid = new Array<number>(n).fill(0);

  for (const g of sel.games) {
    const excl = sel.filters.blowout ? blowoutIntervals(g, cfg) : [];
    const exclMid = Array.from({ length: n }, (_, b) => excl.some(([a, c]) => a <= mid(b) && mid(b) < c));
    exclMid.forEach((x, b) => x && blowoutAtMid[b]!++);
    const eligible = Array.from({ length: n }, (_, b) => bEnd(b) - bStart(b) - overlapAll(bStart(b), bEnd(b), excl));
    const full = gameLength(g.periods);

    for (const p of g.players) {
      if (p.team !== sel.team || !p.played || !p.stints.length) continue;
      let a = acc.get(p.id);
      if (!a) {
        a = { p, games: 0, minSum: 0, boxSum: 0, on: new Array(n).fill(0), elig: new Array(n).fill(0), onMid: new Array(n).fill(0), eligMid: new Array(n).fill(0) };
        acc.set(p.id, a);
      }
      a.games++;
      a.boxSum += p.min;
      for (const [s, e] of p.stints) a.minSum += e - s - overlapAll(s, Math.min(e, full), excl);
      for (let b = 0; b < n; b++) {
        a.elig[b]! += eligible[b]!;
        let on = 0;
        for (const [s, e] of p.stints) on += overlap(s, e, bStart(b), bEnd(b)) - overlapAll(Math.max(s, bStart(b)), Math.min(e, bEnd(b)), excl);
        a.on[b]! += Math.max(0, on);
        if (!exclMid[b]) {
          a.eligMid[b]!++;
          if (p.stints.some(([s, e]) => s <= mid(b) && mid(b) < e)) a.onMid[b]!++;
        }
      }
    }
  }

  const players: PlayerPattern[] = [...acc.values()].map((a) => ({
    id: a.p.id,
    name: a.p.name,
    gamesPlayed: a.games,
    avgMin: a.minSum / a.games,
    avgBoxMin: a.boxSum / a.games,
    onCourt: a.on.map((x, b) => (a.elig[b]! > 0 ? x / a.elig[b]! : null)),
    onAtMid: a.onMid,
    eligibleAtMid: a.eligMid,
  }));
  players.sort((x, y) => y.avgMin - x.avgMin || x.name.localeCompare(y.name));
  return { selection: sel, bucketSeconds, buckets: n, games: sel.games.length, blowoutAtMid, players };
}

/** Player drill-down: his games in the selection with his stints (oldest first). */
export function playerGames(sel: Selection, playerId: number) {
  return sel.games.flatMap((g) => {
    const p = g.players.find((x) => x.id === playerId && x.team === sel.team);
    if (!p) return [];
    const home = g.home.tri === sel.team;
    return [{ gameId: g.id, date: g.date, opponent: home ? g.away.tri : g.home.tri, home, played: p.played, stints: p.stints, min: p.min, flagged: !!g.quality }];
  });
}

export interface QuarterAverages {
  id: number;
  name: string;
  gamesPlayed: number;
  /** Average seconds per game played: total and per period (index 0 = Q1; index 4 = all OT periods together). */
  min: number;
  minQ: number[];
  /** Average personal fouls per game played: total and per period (same indexing). */
  pf: number;
  pfQ: number[];
}

/**
 * Per-player averages over the selection's games he played. With the blowout filter on, minutes in excluded
 * (garbage) time are left out; fouls always count.
 */
export function quarterAverages(sel: Selection, cfg: BlowoutConfig = PATTERN_CONFIG.blowout): QuarterAverages[] {
  const acc = new Map<number, { name: string; gp: number; minQ: number[]; pfQ: number[] }>();
  for (const g of sel.games) {
    const excl = sel.filters.blowout ? blowoutIntervals(g, cfg) : [];
    for (const p of g.players) {
      if (p.team !== sel.team || !p.played || !p.stints.length) continue;
      const a = acc.get(p.id) ?? { name: p.name, gp: 0, minQ: [0, 0, 0, 0, 0], pfQ: [0, 0, 0, 0, 0] };
      acc.set(p.id, a);
      a.gp++;
      for (let q = 1; q <= g.periods; q++) {
        const [q0, q1] = [periodStart(q), periodEnd(q)];
        const i = Math.min(q, 5) - 1;
        for (const [s, e] of p.stints) {
          const [a0, a1] = [Math.max(s, q0), Math.min(e, q1)];
          if (a1 > a0) a.minQ[i]! += a1 - a0 - overlapAll(a0, a1, excl);
        }
      }
      // Fouls always count, including in garbage time: the blowout filter hides minutes only.
      for (const [, period] of p.fouls ?? []) a.pfQ[Math.min(period, 5) - 1]!++;
    }
  }
  return [...acc.entries()]
    .map(([id, a]) => ({
      id,
      name: a.name,
      gamesPlayed: a.gp,
      min: a.minQ.reduce((x, y) => x + y, 0) / a.gp,
      minQ: a.minQ.map((x) => x / a.gp),
      pf: a.pfQ.reduce((x, y) => x + y, 0) / a.gp,
      pfQ: a.pfQ.map((x) => x / a.gp),
    }))
    .sort((x, y) => y.min - x.min);
}

export interface SitEvent {
  period: number;
  kind: 'out' | 'in';
  /** Median elapsed time of the event over the games where it happened. */
  t: number;
  /** Median game clock, rounded to 10 s, e.g. "4:40". */
  clock: string;
  /** Games the event happened in (≥ minGames). */
  n: number;
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * "When does he sit?": per regulation quarter, his first sub-out before the quarter ends and his first entry
 * after the quarter starts, as the median game clock over the selection's games where it happened.
 * Only events seen in at least `minGames` games are returned. With the blowout filter on, substitutions in
 * excluded (garbage) time are ignored.
 */
export function sitPattern(sel: Selection, playerId: number, minGames = 3, cfg: BlowoutConfig = PATTERN_CONFIG.blowout): SitEvent[] {
  const times = new Map<string, number[]>();
  const push = (period: number, kind: 'out' | 'in', t: number) => {
    const k = `${period}:${kind}`;
    if (!times.has(k)) times.set(k, []);
    times.get(k)!.push(t);
  };
  for (const g of sel.games) {
    const p = g.players.find((x) => x.id === playerId && x.team === sel.team);
    if (!p?.played) continue;
    const excl = sel.filters.blowout ? blowoutIntervals(g, cfg) : [];
    const garbage = (t: number) => excl.some(([a, b]) => a <= t && t < b);
    for (let q = 1; q <= 4; q++) {
      const [q0, q1] = [periodStart(q), periodEnd(q)];
      const inQ = p.stints.filter(([s, e]) => e > s && s >= q0 && e <= q1).sort((a, b) => a[0] - b[0]);
      const out = inQ.find(([, e]) => e < q1);
      if (out && !garbage(out[1])) push(q, 'out', out[1]);
      const entry = inQ.find(([s]) => s > q0);
      if (entry && !garbage(entry[0])) push(q, 'in', entry[0]);
    }
  }
  const out: SitEvent[] = [];
  for (const [k, ts] of times) {
    if (ts.length < minGames) continue;
    const [period, kind] = [Number(k.split(':')[0]), k.split(':')[1] as 'out' | 'in'];
    const t = median(ts);
    const remaining = Math.round((periodEnd(period) - t) / 10) * 10;
    out.push({ period, kind, t, clock: `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`, n: ts.length });
  }
  return out.sort((a, b) => a.t - b.t);
}

export const describeSit = (evs: SitEvent[]) => evs.map((e) => `Q${e.period} ${e.kind} ~${e.clock} (${e.n})`).join(' · ');

export interface TrendPoint {
  gameId: string;
  date: string;
  opponent: string;
  home: boolean;
  /** Seconds played (0 when he did not play). */
  min: number;
  status: 'played' | 'dnp';
  reason?: string;
  /** Game had garbage time (time excluded by the blowout rule). */
  garbage: boolean;
}

/**
 * Minutes per game over the selection (oldest first). Games where he was with the team but did not play are
 * included as DNP (0); games when he was not with the team are left out. Average is over games played.
 */
export function minutesTrend(sel: Selection, playerId: number, idx: AppearanceIndex, cfg: BlowoutConfig = PATTERN_CONFIG.blowout) {
  const points: TrendPoint[] = [];
  for (const g of sel.games) {
    const a = availabilityFor(idx, g, sel.team, playerId, true);
    if (a.status === 'not-with-team') continue;
    const p = g.players.find((x) => x.id === playerId && x.team === sel.team);
    const played = a.status === 'played' && !!p && p.stints.length > 0;
    const inactive = g.inactive?.find((x) => x.id === playerId);
    const reason = played ? undefined : (p?.reason ?? inactive?.reason ?? (a.status === 'out' ? 'INACTIVE' : undefined));
    const home = g.home.tri === sel.team;
    points.push({
      gameId: g.id,
      date: g.date,
      opponent: home ? g.away.tri : g.home.tri,
      home,
      min: played ? p!.stints.reduce((x, [s, e]) => x + e - s, 0) : 0,
      status: played ? 'played' : 'dnp',
      ...(reason ? { reason } : {}),
      garbage: blowoutIntervals(g, cfg).length > 0,
    });
  }
  const played = points.filter((x) => x.status === 'played');
  const avg = played.length ? played.reduce((x, y) => x + y.min, 0) / played.length : null;
  return { points, avg };
}
