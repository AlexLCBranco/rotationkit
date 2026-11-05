// The Q4 tab's paragraph: every lineup change of Q4 + OT, in words, without clock times (each sentence carries its
// moment `t` so the UI can show it on the chart instead). Only facts from the data: who came in for whom, the score
// at that moment, a player's foul count, whether it was his first time on court in the game. No guessed reasons.

import { cursorInfo, foulsAt, onCourtAt, scoreAt, troubleLevel } from './gameChart.ts';
import { Q4_START } from './q4.ts';
import { gameLength, periodAt, periodStart, REG_PERIODS } from './time.ts';
import type { Game, PlayerGame } from './types.ts';

export interface StorySentence {
  /** Moment the sentence is about (elapsed seconds); the lineups right after any change at that moment. */
  t: number;
  kind: 'start' | 'sub' | 'period' | 'end';
  /** Team of a 'sub' sentence (start/period/end sentences cover both teams). */
  team: string | null;
  /** Players who came in / went out (per team, for 'sub' and 'period'). */
  ins: Record<string, number[]>;
  outs: Record<string, number[]>;
  /** Every player the sentence names. */
  players: number[];
  text: string;
}

const ORD = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/** "ATL up 112–108" / "tied at 100" / "ORL up 99–97", from the away/home score. */
export function scoreWords(g: Game, t: number): string {
  const [h, a] = scoreAt(g, t);
  if (h === a) return `tied at ${h}`;
  return h > a ? `${g.home.tri} up ${h}–${a}` : `${g.away.tri} up ${a}–${h}`;
}

const ids = (ps: PlayerGame[]) => ps.map((p) => p.id);
/** On court right after everything that happened at moment t (onCourtAt's rule: in at s ≤ t < out). */
const lineupAt = (g: Game, team: string, t: number) => ids(onCourtAt(g, team, t));
/** On court just before moment t. */
const lineupBefore = (g: Game, team: string, t: number) => g.players.filter((p) => p.team === team && p.stints.some(([s, e]) => e > s && s < t && t <= e)).map((p) => p.id);

export function q4Story(g: Game, names: Map<number, string>): StorySentence[] {
  const name = (id: number) => names.get(id) ?? g.players.find((p) => p.id === id)?.name ?? String(id);
  const byId = new Map(g.players.map((p) => [p.id, p]));
  const teams = [g.away.tri, g.home.tri];
  const end = gameLength(g.periods);
  const out: StorySentence[] = [];
  const lineupText = (team: string, t: number) => list(cursorInfo(g, t).teams.find((x) => x.team === team)!.players.map((x) => name(x.p.id)));

  // Q4 opener.
  out.push({
    t: Q4_START,
    kind: 'start',
    team: null,
    ins: {},
    outs: {},
    players: teams.flatMap((tm) => lineupAt(g, tm, Q4_START)),
    text: `The 4th quarter started ${scoreWords(g, Q4_START)}: ${g.away.tri} with ${lineupText(g.away.tri, Q4_START)}; ${g.home.tri} with ${lineupText(g.home.tri, Q4_START)}.`,
  });

  // Every moment a lineup changes (stint starts/ends), in order.
  const moments = new Set<number>();
  for (const p of g.players) for (const [s, e] of p.stints) if (e > s) for (const x of [s, e]) if (x > Q4_START && x < end) moments.add(x);
  let n = 0;
  for (const t of [...moments].sort((a, b) => a - b)) {
    const isPeriodStart = t === periodStart(periodAt(t + 0.05));
    const change = teams.map((team) => {
      const before = new Set(lineupBefore(g, team, t));
      const after = new Set(lineupAt(g, team, t));
      return { team, ins: [...after].filter((x) => !before.has(x)), outs: [...before].filter((x) => !after.has(x)) };
    });
    if (isPeriodStart) {
      // Overtime: the period's opening lineups, and who changed since the end of the previous period.
      const p = periodAt(t + 0.05);
      const label = p === REG_PERIODS + 1 ? 'Overtime' : `The ${ORD(p - REG_PERIODS)} overtime`;
      const prevTied = p === REG_PERIODS + 1 ? `Regulation ended ${scoreWords(g, t)}. ` : `It went to another overtime ${scoreWords(g, t)}. `;
      const diff = change
        .filter((c) => c.ins.length)
        .map((c) => `${c.team} sent out ${list(c.ins.map(name))} for ${list(c.outs.map(name))}`);
      out.push({
        t,
        kind: 'period',
        team: null,
        ins: Object.fromEntries(change.map((c) => [c.team, c.ins])),
        outs: Object.fromEntries(change.map((c) => [c.team, c.outs])),
        players: teams.flatMap((tm) => lineupAt(g, tm, t)),
        text: `${prevTied}${label} began with ${g.away.tri}: ${lineupText(g.away.tri, t)}; ${g.home.tri}: ${lineupText(g.home.tri, t)}${diff.length ? ` (${diff.join('; ')})` : ''}.`,
      });
      continue;
    }
    for (const c of change) {
      if (!c.ins.length && !c.outs.length) continue;
      const period = periodAt(t + 0.05);
      const why: string[] = [];
      for (const id of c.outs) {
        const p = byId.get(id)!;
        const f = foulsAt(p, t);
        if ((p.fouls ?? []).some(([ft]) => ft === t)) why.push(`${name(id)} had just picked up his ${ORD(f)} foul`);
        else if (troubleLevel(period, f) === 'trouble') why.push(`${name(id)} sat with ${f} fouls`);
      }
      for (const id of c.ins) {
        const p = byId.get(id)!;
        const f = foulsAt(p, t);
        if (!p.stints.some(([s, e]) => e > s && s < t)) why.push(`${name(id)}'s first minutes of the game`);
        else if (troubleLevel(period, f) !== 'ok') why.push(`${name(id)} came back carrying ${f} fouls`);
      }
      const [i, o] = [list(c.ins.map(name)), list(c.outs.map(name))];
      const verb =
        c.ins.length && c.outs.length
          ? [`${c.team} brought ${i} in for ${o}`, `${c.team}: ${i} replaced ${o}`, `${c.team} took out ${o} for ${i}`][n++ % 3]!
          : c.ins.length
            ? `${c.team}: ${i} checked in`
            : `${c.team}: ${o} went out`;
      out.push({
        t,
        kind: 'sub',
        team: c.team,
        ins: { [c.team]: c.ins },
        outs: { [c.team]: c.outs },
        players: [...c.ins, ...c.outs],
        text: `${verb}${why.length ? ` (${why.join('; ')})` : ''}, ${scoreWords(g, t)}.`,
      });
    }
  }

  // Closers.
  const [h, a] = scoreAt(g, end);
  const winner = h > a ? `${g.home.tri} won ${h}–${a}` : `${g.away.tri} won ${a}–${h}`;
  out.push({
    t: end,
    kind: 'end',
    team: null,
    ins: {},
    outs: {},
    players: teams.flatMap((tm) => lineupAt(g, tm, end)),
    text: `At the buzzer ${g.away.tri} had ${lineupText(g.away.tri, end)} on the floor; ${g.home.tri} had ${lineupText(g.home.tri, end)}. ${winner}.`,
  });
  return out;
}
