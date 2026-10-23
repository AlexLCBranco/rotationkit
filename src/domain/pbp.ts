// Play-by-play events in true order with elapsed time and running score.

import type { RawAction } from './raw.ts';
import { elapsedAt, parseIsoDuration, r1 } from './time.ts';

export interface Ev {
  i: number;
  period: number;
  t: number;
  home: number;
  away: number;
  a: RawAction;
}

export function toEvents(actions: RawAction[]): Ev[] {
  return [...actions]
    .sort((x, y) => x.orderNumber - y.orderNumber)
    .map((a, i) => ({ i, a, period: a.period, t: r1(elapsedAt(a.period, parseIsoDuration(a.clock))), home: Number(a.scoreHome), away: Number(a.scoreAway) }));
}

/** Stint before splitting/scoring: one player, one side, [start, end] in elapsed seconds. */
export interface RawStint {
  player: number;
  side: 'home' | 'away';
  start: number;
  end: number;
}
