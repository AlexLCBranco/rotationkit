// Raw NBA responses → compact Game. Pure: no I/O.
// Stints are rebuilt from CDN play-by-play (Path B); gamerotation is only a cross-check (see compareStints).

import type { RawGame, RawRotation } from './raw.ts';
import { toEvents, type Ev, type RawStint } from './pbp.ts';
import { stintsFromPbp, type PlayerRef } from './stintsPbp.ts';
import type { Game, InactivePlayer, PlayerFoul, PlayerGame, Stint, TeamInfo } from './types.ts';
import { parseIsoDuration, periodAt, periodEnd, r1 } from './time.ts';
import { blowoutIntervals } from './patterns.ts';

/** Foul subTypes that count toward a player's personal fouls (PF). Technicals do not. */
export const PF_FOUL_SUBTYPES = new Set(['personal', 'offensive']);

export function rotationStints(rot: RawRotation, homeId: number, awayId: number): RawStint[] {
  const out: RawStint[] = [];
  for (const set of rot.resultSets) {
    const h = (k: string) => {
      const i = set.headers.indexOf(k);
      if (i < 0) throw new Error(`gamerotation ${set.name} missing column ${k}`);
      return i;
    };
    const [iTeam, iPerson, iIn, iOut] = [h('TEAM_ID'), h('PERSON_ID'), h('IN_TIME_REAL'), h('OUT_TIME_REAL')];
    for (const row of set.rowSet) {
      const team = Number(row[iTeam]);
      const side = team === homeId ? 'home' : team === awayId ? 'away' : undefined;
      if (!side) throw new Error(`gamerotation team ${team} is neither home nor away`);
      // IN_TIME_REAL / OUT_TIME_REAL are tenths of a second since tip-off.
      out.push({ player: Number(row[iPerson]), side, start: r1(Number(row[iIn]) / 10), end: r1(Number(row[iOut]) / 10) });
    }
  }
  return out;
}

/** Split [start, end] at period boundaries. */
export function splitByPeriod(start: number, end: number): { period: number; start: number; end: number }[] {
  if (start === end) return [{ period: periodAt(start), start, end }];
  const pieces = [];
  let s = start;
  while (s < end) {
    const p = periodAt(s + 0.05);
    const e = Math.min(end, periodEnd(p));
    pieces.push({ period: p, start: s, end: e });
    s = e;
  }
  return pieces;
}

/**
 * Foul description from play-by-play fields only (subType, descriptor, and an offensive-foul turnover logged
 * at the same clock by the same player). Unknown descriptors are shown as they come.
 */
export function foulLabel(e: Ev, evs: Ev[]): string {
  const sub = e.a.subType ?? '';
  const d = (e.a.descriptor ?? '').trim();
  const pretty = (x: string) => x.replace(/-/g, ' ');
  const flagrant = /^flagrant-type-(\d)$/.exec(d);
  let label: string;
  if (flagrant) label = `flagrant foul (type ${flagrant[1]})`;
  else if (sub === 'offensive') label = d ? `offensive foul — ${pretty(d)}` : 'offensive foul';
  else if (sub === 'personal') label = d ? `${pretty(d)} foul` : 'personal foul';
  else label = [sub, d].filter(Boolean).map(pretty).join(' ') + ' foul';
  const turnover = evs.some(
    (x) => x.period === e.period && x.t === e.t && x.a.actionType === 'turnover' && x.a.personId === e.a.personId && /offensive foul/i.test(x.a.subType ?? ''),
  );
  return turnover ? `${label} (turnover)` : label;
}

function namesOf(p: { familyName?: string; nameI?: string }) {
  const r: { last?: string; nameI?: string } = {};
  if (p.familyName?.trim()) r.last = p.familyName.trim();
  if (p.nameI?.trim()) r.nameI = p.nameI.trim();
  return r;
}

function reasonOf(p: { notPlayingReason?: string; notPlayingDescription?: string }) {
  const r: { reason?: string; reasonDetail?: string } = {};
  if (p.notPlayingReason?.trim()) r.reason = p.notPlayingReason.trim();
  if (p.notPlayingDescription?.trim()) r.reasonDetail = p.notPlayingDescription.trim();
  return r;
}

/**
 * Which of the scorer's stints a scoring event belongs to (index into `list`, -1 = none).
 * 1. By log order, as fouls are: the stint whose in / out events bracket the event.
 * 2. Same clock as a substitution but logged after the scorer's own exit (free throws shot after a substitution at
 *    that moment): the stint that ends at that clock in that period — he was on court when the foul happened —
 *    else one starting at that clock.
 */
export function stintIndexFor(list: Stint[], bounds: (s: Stint) => [number, number] | undefined, x: { t: number; period: number; i: number }): number {
  const inPeriod = (st: Stint) => periodAt(st[0] + (st[1] > st[0] ? 0.05 : 0)) === x.period;
  const byOrder = list.findIndex((st) => {
    const b = bounds(st);
    return b !== undefined && inPeriod(st) && b[0] < x.i && x.i < b[1];
  });
  if (byOrder >= 0) return byOrder;
  const ending = list.findIndex((st) => inPeriod(st) && st[1] === x.t);
  if (ending >= 0) return ending;
  return list.findIndex((st) => inPeriod(st) && st[0] === x.t);
}

export function normalizeGame(raw: RawGame): Game {
  const bg = raw.boxscore.game;
  const team = (t: typeof bg.homeTeam): TeamInfo => ({ id: t.teamId, tri: t.teamTricode, name: t.teamName, city: t.teamCity, score: t.score });
  const home = team(bg.homeTeam);
  const away = team(bg.awayTeam);
  const triOf = { home: home.tri, away: away.tri };

  // Play-by-play in true order, with elapsed time and running score.
  const evs: Ev[] = toEvents(raw.playbyplay.game.actions);

  const before = (period: number, t: number, inclusive: boolean) => {
    let found: Ev | undefined;
    for (const e of evs) {
      if (e.period < period || (e.period === period && (inclusive ? e.t <= t : e.t < t))) found = e;
    }
    return found;
  };

  /**
   * Running score at a stint boundary (substitutions only happen in dead balls).
   * At a substitution event, NBA credits free throws to the players on court when the foul happened:
   * same-second free throws logged after the substitution count before it if their foul (the latest
   * same-second foul of its kind: technical for technical free throws, otherwise non-technical) was logged
   * before it. Without a substitution event (period start/end) all same-second events fall outside an
   * entering stint and inside an exiting one, so both sides of a boundary use the same cut.
   */
  const scoreAt = (sub: Ev | undefined, period: number, t: number, kind: 'in' | 'out') => {
    if (!sub) {
      const e = before(period, t, kind === 'out');
      return { home: e?.home ?? 0, away: e?.away ?? 0 };
    }
    let { home, away } = sub;
    let lastFoul: Ev | undefined;
    let lastTech: Ev | undefined;
    for (let i = 0; i < evs.length; i++) {
      const x = evs[i]!;
      if (x.period !== sub.period || x.t !== sub.t) continue;
      if (x.a.actionType === 'foul') {
        if (x.a.subType === 'technical') lastTech = x;
        else lastFoul = x;
      }
      if (x.i <= sub.i) continue;
      const prev = evs[i - 1]!;
      const foul = x.a.descriptor === 'technical' ? lastTech : lastFoul;
      if (x.a.actionType === 'freethrow' && foul !== undefined && foul.i < sub.i) {
        home += x.home - prev.home;
        away += x.away - prev.away;
      }
    }
    return { home, away };
  };

  // Box scores of some seasons also list inactive players (status INACTIVE, with reason); those go to `inactive`.
  const isInactive = (p: (typeof bg.homeTeam.players)[number]) => p.status === 'INACTIVE';
  const box = new Map<number, { side: 'home' | 'away'; p: (typeof bg.homeTeam.players)[number] }>();
  const boxInactive: InactivePlayer[] = [];
  for (const side of ['home', 'away'] as const) {
    for (const p of bg[`${side}Team`].players) {
      if (isInactive(p)) boxInactive.push({ id: p.personId, name: p.name, ...namesOf(p), team: triOf[side], ...reasonOf(p) });
      else box.set(p.personId, { side, p });
    }
  }

  const stintsBy = new Map<number, Stint[]>();
  const refs = new Map<number, PlayerRef>();
  for (const [id, { side, p }] of box) refs.set(id, { side, starter: p.starter === '1', min: p.played === '1' ? parseIsoDuration(p.statistics.minutes) : 0 });
  const rebuilt = stintsFromPbp(evs, refs, bg.period);
  // Event-order bounds of each stint, so fouls at the same clock as a substitution land in the right stint.
  const orderBounds = new Map<Stint, [number, number]>();
  const firstIdx = new Map<number, number>();
  const lastIdx = new Map<number, number>();
  for (const e of evs) {
    if (!firstIdx.has(e.period)) firstIdx.set(e.period, e.i);
    lastIdx.set(e.period, e.i);
  }
  for (const rs of rebuilt.stints) {
    const period = periodAt(rs.start + (rs.end > rs.start ? 0.05 : 0));
    const s0 = scoreAt(rs.inEv, period, rs.start, 'in');
    const s1 = scoreAt(rs.outEv, period, rs.end, 'out');
    const sign = rs.side === 'home' ? 1 : -1;
    const stint: Stint = [rs.start, rs.end, sign * (s1.home - s1.away - (s0.home - s0.away))];
    orderBounds.set(stint, [rs.inEv?.i ?? (firstIdx.get(period) ?? 0) - 0.5, rs.outEv?.i ?? (lastIdx.get(period) ?? 0) + 0.5]);
    if (!stintsBy.has(rs.player)) stintsBy.set(rs.player, []);
    stintsBy.get(rs.player)!.push(stint);
  }
  for (const list of stintsBy.values()) list.sort((x, y) => x[0] - y[0] || x[1] - y[1]);

  // Personal fouls → the stint they happened in (by event order), and the player's foul list with type.
  const orphanFouls: Game['orphanFouls'] = [];
  const foulsBy = new Map<number, PlayerFoul[]>();
  for (const e of evs) {
    const a = e.a;
    if (a.actionType !== 'foul' || !a.personId || !PF_FOUL_SUBTYPES.has(a.subType ?? '')) continue;
    const list = stintsBy.get(a.personId) ?? [];
    const st = list.find((s) => {
      const [lo, hi] = orderBounds.get(s)!;
      return lo < e.i && e.i < hi;
    });
    if (st) (st[3] ??= []).push(e.t);
    else if (box.has(a.personId)) orphanFouls.push({ player: a.personId, t: e.t });
    if (box.has(a.personId)) {
      if (!foulsBy.has(a.personId)) foulsBy.set(a.personId, []);
      foulsBy.get(a.personId)!.push([e.t, e.period, foulLabel(e, evs)]);
    }
  }

  // Zero-length stints only matter when they carry +/- or a foul, or are the player's only appearance
  // (checked in for 0 seconds: the box score still counts him as having played).
  for (const [id, list] of stintsBy) {
    const kept = list.filter((st) => st[1] > st[0] || st[2] !== 0 || st[3]?.length);
    stintsBy.set(id, kept.length ? kept : list.slice(0, 1));
  }

  // Points per period from the play-by-play's made shots and free throws (box score has game totals only).
  const POINTS: Record<string, number> = { '2pt': 2, '3pt': 3, freethrow: 1 };
  const ptsBy = new Map<number, number[]>();
  const scoring: { id: number; t: number; period: number; pts: number; i: number }[] = [];
  for (const e of evs) {
    const a = e.a;
    const pts = POINTS[a.actionType];
    if (!pts || a.shotResult !== 'Made' || !a.personId || !box.has(a.personId)) continue;
    if (!ptsBy.has(a.personId)) ptsBy.set(a.personId, new Array<number>(bg.period).fill(0));
    const row = ptsBy.get(a.personId)!;
    while (row.length < e.period) row.push(0);
    row[e.period - 1]! += pts;
    scoring.push({ id: a.personId, t: e.t, period: e.period, pts, i: e.i });
  }

  // Points per stint (same made shots and free throws as ptsQ), parallel to the player's stints.
  const ptsSBy = new Map<number, number[]>();
  const unplaced: string[] = [];
  for (const x of scoring) {
    const list = stintsBy.get(x.id) ?? [];
    const k = stintIndexFor(list, (st) => orderBounds.get(st), x);
    if (k < 0) {
      unplaced.push(`${x.pts} pt by ${x.id} at ${x.t}s`);
      continue;
    }
    const row = ptsSBy.get(x.id) ?? new Array<number>(list.length).fill(0);
    row[k]! += x.pts;
    ptsSBy.set(x.id, row);
  }
  if (unplaced.length) rebuilt.notes.push(`points outside every stint of the scorer (not in ptsS): ${unplaced.join('; ')}`);

  const players: PlayerGame[] = [...box.values()].map(({ side, p }) => {
    return {
      id: p.personId,
      name: p.name,
      ...namesOf(p),
      team: triOf[side],
      starter: p.starter === '1',
      played: p.played === '1',
      min: r1(parseIsoDuration(p.statistics.minutes)),
      pts: p.statistics.points,
      reb: p.statistics.reboundsTotal,
      ast: p.statistics.assists,
      pf: p.statistics.foulsPersonal,
      pm: p.statistics.plusMinusPoints,
      ...reasonOf(p),
      stints: stintsBy.get(p.personId) ?? [],
      ...(foulsBy.has(p.personId) ? { fouls: foulsBy.get(p.personId)! } : {}),
      ...(ptsBy.has(p.personId) ? { ptsQ: ptsBy.get(p.personId)! } : {}),
      ...(ptsSBy.has(p.personId) ? { ptsS: ptsSBy.get(p.personId)! } : {}),
    };
  });

  let inactive: InactivePlayer[] | null = null;
  let inactiveSource: Game['inactiveSource'];
  const sum = raw.summary?.boxScoreSummary;
  if (boxInactive.length) {
    inactive = boxInactive;
    inactiveSource = 'box';
  } else if (sum?.homeTeam?.players?.length && sum.awayTeam?.players?.length) {
    // Roster list counts only when both teams have one.
    inactive = [];
    inactiveSource = 'roster';
    for (const side of ['home', 'away'] as const) {
      for (const p of sum[`${side}Team`].players) {
        if (!box.has(p.personId)) inactive.push({ id: p.personId, name: p.name, ...namesOf(p), team: triOf[side] });
      }
    }
  }

  const margin: [number, number][] = [[0, 0]];
  for (const e of evs) {
    const m = e.home - e.away;
    const last = margin[margin.length - 1]!;
    if (m === last[1]) continue;
    if (e.t === last[0]) last[1] = m;
    else margin.push([e.t, m]);
  }

  // Running score after each change: [t, home, away]; same-second changes keep the last score.
  const score: [number, number, number][] = [[0, 0, 0]];
  for (const e of evs) {
    const last = score[score.length - 1]!;
    if (e.home === last[1] && e.away === last[2]) continue;
    if (e.t === last[0]) [last[1], last[2]] = [e.home, e.away];
    else score.push([e.t, e.home, e.away]);
  }

  const g: Game = {
    id: bg.gameId,
    date: bg.gameEt.slice(0, 10),
    home,
    away,
    periods: bg.period,
    players,
    inactive,
    ...(rebuilt.notes.length ? { stintNotes: rebuilt.notes } : {}),
    ...(inactiveSource ? { inactiveSource } : {}),
    margin,
    score,
    orphanFouls,
    stintPts: true,
  };

  // Points scored in garbage time (blowout rule), per period. A basket at the moment the margin reaches the
  // threshold is not garbage (it made the blowout); later ones while it holds are (interval (a, b]).
  const gt = blowoutIntervals(g);
  if (gt.length) {
    for (const x of scoring) {
      if (!gt.some(([a, b]) => x.t > a && x.t <= b)) continue;
      const p = players.find((pl) => pl.id === x.id)!;
      p.ptsGT ??= new Array<number>(bg.period).fill(0);
      p.ptsGT[x.period - 1]! += x.pts;
    }
  }
  return g;
}

