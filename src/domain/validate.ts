// Data-integrity checks for a normalized game. Pure; reports problems, never fixes them.

import type { Game } from './types.ts';
import { gameLength, periodAt, periodEnd, periodStart } from './time.ts';

export type CheckName = 'box-team-minutes' | 'box-team-plus-minus' | 'minutes' | 'five-on-court' | 'fouls' | 'plus-minus' | 'stint-bounds' | 'overlap' | 'dnp-stints' | 'played-no-stints';

export interface Issue {
  game: string;
  check: CheckName;
  player?: string;
  detail: string;
}

export const MINUTES_TOL = 1;

export function validateGame(g: Game): Issue[] {
  const issues: Issue[] = [];
  const add = (check: CheckName, detail: string, player?: { name: string; team: string }) =>
    issues.push({ game: g.id, check, detail, ...(player ? { player: `${player.name} (${player.team})` } : {}) });
  const end = gameLength(g.periods);

  for (const p of g.players) {
    if (!p.played) {
      if (p.stints.length) add('dnp-stints', `did not play but has ${p.stints.length} stints`, p);
      continue;
    }
    if (!p.stints.length) {
      add('played-no-stints', `played ${p.min}s per box score but has no stints`, p);
      continue;
    }
    const total = p.stints.reduce((s, [a, b]) => s + (b - a), 0);
    if (Math.abs(total - p.min) > MINUTES_TOL) add('minutes', `stints ${total.toFixed(1)}s vs box ${p.min}s`, p);

    const fouls = p.stints.reduce((s, st) => s + (st[3]?.length ?? 0), 0);
    if (fouls !== p.pf) add('fouls', `stint fouls ${fouls} vs box PF ${p.pf}`, p);

    const pm = p.stints.reduce((s, st) => s + st[2], 0);
    if (pm !== p.pm) add('plus-minus', `stint +/- ${pm} vs box ${p.pm}`, p);

    for (const [a, b] of p.stints) {
      const per = periodAt(a + 0.05);
      if (!(a <= b) || a < periodStart(per) || b > periodEnd(per) || b > end)
        add('stint-bounds', `stint [${a}, ${b}] outside period ${per} [${periodStart(per)}, ${periodEnd(per)}] or game end ${end}`, p);
    }
    for (let i = 1; i < p.stints.length; i++) {
      if (p.stints[i]![0] < p.stints[i - 1]![1]) add('overlap', `stint at ${p.stints[i]![0]} starts before previous ends at ${p.stints[i - 1]![1]}`, p);
    }
  }
  for (const f of g.orphanFouls) {
    const p = g.players.find((x) => x.id === f.player);
    add('fouls', `foul at ${f.t}s not inside any stint`, p ?? { name: String(f.player), team: '?' });
  }

  // Box-score self-consistency: when these fail, a player-level mismatch above is likely a box-score error.
  for (const [tri, margin] of [[g.home.tri, g.home.score - g.away.score], [g.away.tri, g.away.score - g.home.score]] as const) {
    const ps = g.players.filter((p) => p.team === tri);
    const min = ps.reduce((x, p) => x + p.min, 0);
    if (Math.abs(min - 5 * end) > 5 * MINUTES_TOL) add('box-team-minutes', `${tri}: box minutes total ${min.toFixed(1)}s, expected ${5 * end}s`);
    const pm = ps.reduce((x, p) => x + p.pm, 0);
    if (pm !== 5 * margin) add('box-team-plus-minus', `${tri}: box +/- total ${pm}, expected 5 × ${margin} = ${5 * margin}`);
  }

  // Exactly 5 on court per team over every positive-length interval of the game.
  for (const tri of [g.home.tri, g.away.tri]) {
    const delta = new Map<number, number>();
    for (const p of g.players) if (p.team === tri) for (const [a, b] of p.stints) {
      delta.set(a, (delta.get(a) ?? 0) + 1);
      delta.set(b, (delta.get(b) ?? 0) - 1);
    }
    delta.set(0, delta.get(0) ?? 0);
    delta.set(end, delta.get(end) ?? 0);
    const times = [...delta.keys()].sort((x, y) => x - y);
    let n = 0;
    let bad = 0;
    let first = '';
    for (let i = 0; i < times.length - 1; i++) {
      n += delta.get(times[i]!)!;
      const [t0, t1] = [times[i]!, times[i + 1]!];
      if (t1 > t0 && t0 < end && n !== 5) {
        bad += t1 - t0;
        first ||= `${n} on court from ${t0}s to ${t1}s`;
      }
    }
    if (bad > 0) add('five-on-court', `${tri}: ${bad.toFixed(1)}s total not 5 on court; first: ${first}`);
  }
  return issues;
}
