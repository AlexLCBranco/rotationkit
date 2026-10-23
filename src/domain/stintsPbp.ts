// Path B: rebuild stints from play-by-play (period starters + substitution events).
//
// Approach (as in common open-source "players on court" tools built on NBA play-by-play):
// - Period 1 starters come from the box score.
// - For later periods, a player is a starter if his first involvement in the period is anything other than
//   "substitution in" (an action, being fouled/assisting, or "substitution out").
// - Players on court for a full period without any recorded event are found from the box score: when a
//   period has fewer than 5 starters, the missing ones must be players with no event in that period whose
//   box-score minutes still need a full period. If that is not unambiguous, the period is left short and
//   reported (the 5-on-court check then fails) — never guessed.
// - Then substitutions are replayed in order; everyone on court is closed out at period end.

import type { Ev, RawStint } from './pbp.ts';
import { periodEnd, periodLength, periodStart, r1 } from './time.ts';

/** Actions that can name a player who is not on court; they are not evidence of being on court. */
const NOT_ON_COURT_EVIDENCE = (e: Ev) =>
  (e.a.actionType === 'foul' && e.a.subType === 'technical') ||
  e.a.actionType === 'ejection' ||
  (e.a.actionType === 'violation' && e.a.subType === 'delay-of-game');

const MIN_TOL = 1;

export interface PlayerRef {
  side: 'home' | 'away';
  starter: boolean;
  /** Box-score seconds played. */
  min: number;
}

export interface PbpStints {
  stints: RawStint[];
  /** How unusual situations were resolved, or what could not be resolved. */
  notes: string[];
}

export function stintsFromPbp(evs: Ev[], players: Map<number, PlayerRef>, periods: number): PbpStints {
  const notes: string[] = [];
  const ids = (e: Ev) => (e.a.personIdsFilter?.length ? e.a.personIdsFilter : e.a.personId ? [e.a.personId] : []);

  type PeriodInfo = { period: number; side: 'home' | 'away'; starters: Set<number>; noEvent: Set<number> };
  const infos: PeriodInfo[] = [];
  for (let p = 1; p <= periods; p++) {
    const first = new Map<number, 'starter' | 'bench'>();
    for (const e of evs) {
      if (e.period !== p) continue;
      if (e.a.actionType === 'substitution') {
        const id = e.a.personId;
        if (id && players.has(id) && !first.has(id)) first.set(id, e.a.subType === 'in' ? 'bench' : 'starter');
        continue;
      }
      if (NOT_ON_COURT_EVIDENCE(e)) continue;
      for (const id of ids(e)) if (players.has(id) && !first.has(id)) first.set(id, 'starter');
    }
    for (const side of ['home', 'away'] as const) {
      const sidePlayers = [...players].filter(([, r]) => r.side === side && r.min > 0);
      if (!sidePlayers.length) continue;
      let starters: Set<number>;
      if (p === 1) {
        starters = new Set(sidePlayers.filter(([, r]) => r.starter).map(([id]) => id));
        const inferred = sidePlayers.filter(([id]) => first.get(id) === 'starter').map(([id]) => id);
        for (const id of inferred) if (!starters.has(id)) notes.push(`P1 ${side}: ${id} acted before subbing in but is not a box-score starter`);
      } else {
        starters = new Set(sidePlayers.filter(([id]) => first.get(id) === 'starter').map(([id]) => id));
      }
      const noEvent = new Set(sidePlayers.filter(([id]) => !first.has(id)).map(([id]) => id));
      infos.push({ period: p, side, starters, noEvent });
    }
  }

  const replay = (info: PeriodInfo): { stints: RawStint[]; problems: string[] } => {
    const problems: string[] = [];
    const on = new Map<number, { t: number; ev?: Ev }>();
    for (const id of info.starters) on.set(id, { t: periodStart(info.period) });
    const stints: RawStint[] = [];
    const close = (id: number, t: number, outEv?: Ev) => {
      const { t: s, ev: inEv } = on.get(id)!;
      on.delete(id);
      // Zero-length stints (in and out at the same clock) are kept: free throws from a foul committed while
      // the player was on can still count for him. Not at period start, where a "sub out" records a
      // between-periods change (keeping those makes +/- worse across a season).
      if (t > s || (t === s && s > periodStart(info.period)))
        stints.push({ player: id, side: info.side, start: s, end: r1(t), ...(inEv ? { inEv } : {}), ...(outEv ? { outEv } : {}) });
    };
    for (const e of evs) {
      if (e.period !== info.period || e.a.actionType !== 'substitution') continue;
      const id = e.a.personId;
      if (!id || players.get(id)?.side !== info.side) continue;
      if (e.a.subType === 'out') {
        if (on.has(id)) close(id, e.t, e);
        else problems.push(`P${info.period} ${info.side}: sub out of ${id} at ${e.t}s who is not on court`);
      } else if (e.a.subType === 'in') {
        if (on.has(id)) problems.push(`P${info.period} ${info.side}: sub in of ${id} at ${e.t}s who is already on court`);
        else on.set(id, { t: e.t, ev: e });
      }
    }
    for (const id of [...on.keys()]) close(id, periodEnd(info.period));
    return { stints, problems };
  };

  // First pass with the starters we could see; then resolve short periods from box-score minutes.
  const played = new Map<number, number>();
  const firstPass = infos.map((info) => ({ info, ...replay(info) }));
  for (const r of firstPass) for (const s of r.stints) played.set(s.player, (played.get(s.player) ?? 0) + s.end - s.start);

  const out: RawStint[] = [];
  for (const r of firstPass) {
    let { stints, problems } = r;
    const { info } = r;
    if (info.starters.size > 5) {
      problems.push(`P${info.period} ${info.side}: ${info.starters.size} players look like period starters`);
    } else if (info.starters.size < 5) {
      const need = 5 - info.starters.size;
      const len = periodLength(info.period);
      const residual = (id: number) => players.get(id)!.min - (played.get(id) ?? 0);
      const fits = [...info.noEvent].filter((id) => residual(id) >= len - MIN_TOL);
      if (fits.length === need) {
        for (const id of fits) {
          info.starters.add(id);
          played.set(id, (played.get(id) ?? 0) + len);
        }
        ({ stints, problems } = replay(info));
        notes.push(`P${info.period} ${info.side}: ${fits.join(', ')} played the full period with no event (from box-score minutes)`);
      } else {
        problems.push(`P${info.period} ${info.side}: ${info.starters.size} starters found, ${fits.length} candidates for ${need} missing (unresolved)`);
      }
    }
    notes.push(...problems);
    out.push(...stints);
  }
  return { stints: out, notes };
}
