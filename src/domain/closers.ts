// Averages "Closers" table: over the selection's close games (CLOSE_GAME in config.ts), who plays them and who is on
// court at the final buzzer (the Q4 tab's closer: on court at the end of the game, `q4Rows`).

import { CLOSE_GAME } from './config.ts';
import { q4Rows, q4Stints } from './q4.ts';
import { gameLength, periodEnd, REG_PERIODS } from './time.ts';
import type { Game } from './types.ts';

/** Margin ≤ cfg.margin at some moment of the last cfg.lastSeconds of Q4 or of any overtime (stored margin timeline). */
export function isCloseGame(g: Game, cfg = CLOSE_GAME): boolean {
  const from = periodEnd(REG_PERIODS) - cfg.lastSeconds;
  const end = gameLength(g.periods);
  const tl = [...g.margin].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < tl.length; i++) {
    const [t, m] = tl[i]!;
    const next = tl[i + 1]?.[0] ?? Infinity;
    // The margin m holds over [t, next); does that overlap [from, end]?
    if (next > from && t <= end && Math.abs(m) <= cfg.margin) return true;
  }
  return false;
}

export interface CloserRow {
  id: number;
  name: string;
  /** Close games he played (on court at least once). */
  played: number;
  /** Of those, on court at the final buzzer. */
  closed: number;
  /** closed / played. */
  share: number;
  /** Average Q4 + OT seconds on court in the close games he played. */
  q4Min: number;
}

/** Rows for one team over some games (the view's selection); sorted by times closed, then share, then Q4 minutes. */
export function closersTable(games: Game[], team: string, cfg = CLOSE_GAME): { close: Game[]; rows: CloserRow[] } {
  const close = games.filter((g) => (g.home.tri === team || g.away.tri === team) && isCloseGame(g, cfg));
  const acc = new Map<number, { name: string; played: number; closed: number; q4: number }>();
  for (const g of close) {
    const closers = new Set(q4Rows(g, team).filter((r) => r.closer).map((r) => r.p.id));
    for (const p of g.players) {
      if (p.team !== team || !p.played || !p.stints.some(([s, e]) => e > s)) continue;
      const a = acc.get(p.id) ?? { name: p.name, played: 0, closed: 0, q4: 0 };
      a.played++;
      if (closers.has(p.id)) a.closed++;
      a.q4 += q4Stints(p).reduce((x, [s, e]) => x + e - s, 0);
      acc.set(p.id, a);
    }
  }
  const rows = [...acc.entries()].map(([id, a]) => ({ id, name: a.name, played: a.played, closed: a.closed, share: a.closed / a.played, q4Min: a.q4 / a.played }));
  rows.sort((a, b) => b.closed - a.closed || b.share - a.share || b.q4Min - a.q4Min || a.name.localeCompare(b.name));
  return { close, rows };
}
