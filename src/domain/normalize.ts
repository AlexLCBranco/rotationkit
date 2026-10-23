// Raw NBA responses → compact Game. Pure: no I/O.
// Stints are rebuilt from CDN play-by-play (Path B); gamerotation is only a cross-check (see compareStints).

import type { RawGame, RawRotation } from './raw.ts';
import { toEvents, type Ev, type RawStint } from './pbp.ts';
import { stintsFromPbp, type PlayerRef } from './stintsPbp.ts';
import type { Game, InactivePlayer, PlayerGame, Stint, TeamInfo } from './types.ts';
import { parseIsoDuration, periodAt, periodEnd, r1 } from './time.ts';

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

function reasonOf(p: { notPlayingReason?: string; notPlayingDescription?: string }) {
  const r: { reason?: string; reasonDetail?: string } = {};
  if (p.notPlayingReason?.trim()) r.reason = p.notPlayingReason.trim();
  if (p.notPlayingDescription?.trim()) r.reasonDetail = p.notPlayingDescription.trim();
  return r;
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
      if (isInactive(p)) boxInactive.push({ id: p.personId, name: p.name, team: triOf[side], ...reasonOf(p) });
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

  // Personal fouls → the stint they happened in (by event order).
  const orphanFouls: Game['orphanFouls'] = [];
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
  }

  const players: PlayerGame[] = [...box.values()].map(({ side, p }) => {
    return {
      id: p.personId,
      name: p.name,
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
        if (!box.has(p.personId)) inactive.push({ id: p.personId, name: p.name, team: triOf[side] });
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

  return {
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
    orphanFouls,
  };
}

