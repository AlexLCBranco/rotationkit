// Cross-check: Path B stints (play-by-play) vs gamerotation stints (stats.nba.com), per player.

import type { RawRotation } from './raw.ts';
import type { Game } from './types.ts';
import { rotationStints, splitByPeriod } from './normalize.ts';

export interface StintDiff {
  player: string;
  pbp: [number, number][];
  rotation: [number, number][];
}

/** Times must agree within this (both sources have 0.1s resolution). */
const TOL = 0.05;

export function compareStints(g: Game, rot: RawRotation): StintDiff[] {
  const fromRot = new Map<number, [number, number][]>();
  for (const s of rotationStints(rot, g.home.id, g.away.id)) {
    for (const piece of splitByPeriod(s.start, s.end)) {
      if (!fromRot.has(s.player)) fromRot.set(s.player, []);
      fromRot.get(s.player)!.push([piece.start, piece.end]);
    }
  }
  const diffs: StintDiff[] = [];
  const ids = new Set([...fromRot.keys(), ...g.players.filter((p) => p.stints.length).map((p) => p.id)]);
  for (const id of ids) {
    const p = g.players.find((x) => x.id === id);
    const a = (p?.stints ?? []).map(([s, e]) => [s, e] as [number, number]);
    const b = (fromRot.get(id) ?? []).sort((x, y) => x[0] - y[0]);
    const same = a.length === b.length && a.every((x, i) => Math.abs(x[0] - b[i]![0]) <= TOL && Math.abs(x[1] - b[i]![1]) <= TOL);
    if (!same) diffs.push({ player: p ? `${p.name} (${p.team})` : String(id), pbp: a, rotation: b });
  }
  return diffs;
}
