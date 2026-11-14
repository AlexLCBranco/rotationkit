// Points per stint for game files committed before they existed: taken from a fresh normalization of the same raw
// responses, ONLY when its stints are identical to the committed ones (same players, same start/end). Nothing else in
// the committed file changes.

import type { Game } from '../../src/domain/types.ts';

/** The committed game with `ptsS` / `stintPts` added, or a reason why not. */
export function addStintPoints(committed: Game, fresh: Game): { game: Game } | { skip: string } {
  if (committed.id !== fresh.id) return { skip: 'different game' };
  if (!fresh.stintPts) return { skip: 'fresh normalization has no points per stint' };
  const by = new Map(fresh.players.map((p) => [p.id, p]));
  const players = [];
  for (const p of committed.players) {
    const f = by.get(p.id);
    const same = f && f.stints.length === p.stints.length && f.stints.every((s, i) => s[0] === p.stints[i]![0] && s[1] === p.stints[i]![1]);
    if (!same) return { skip: `stints of ${p.name} differ from the committed file` };
    const { ptsS: _drop, ...rest } = p;
    void _drop;
    players.push(f.ptsS ? { ...rest, ptsS: f.ptsS } : rest);
  }
  return { game: { ...committed, players, stintPts: true } };
}
