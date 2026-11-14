// Close games + Closers table; Game-by-game strips.

import { describe, expect, it } from 'vitest';
import { loadSeason } from './data.ts';
import { closersTable, isCloseGame } from '../src/domain/closers.ts';
import { lastGames, playerStrips } from '../src/domain/gameByGame.ts';
import { CLOSE_GAME } from '../src/domain/config.ts';
import { q4Rows, q4Stints } from '../src/domain/q4.ts';
import { buildAppearances } from '../src/domain/availability.ts';
import { selectGames, DEFAULT_FILTERS } from '../src/domain/patterns.ts';
import { REGULATION_LEN } from '../src/domain/time.ts';
import type { Game } from '../src/domain/types.ts';

const g0 = (margin: [number, number][], periods = 4) => ({ id: '0022600001', periods, margin }) as unknown as Game;

describe('close game rule (CLOSE_GAME: margin ≤ 5 at some point in the last 5:00 of Q4 or in OT)', () => {
  it('is in config', () => expect(CLOSE_GAME).toEqual({ margin: 5, lastSeconds: 300 }));
  it('hand-made timelines', () => {
    expect(isCloseGame(g0([[0, 0], [2000, 12]]))).toBe(false); // 12 all the way through the last 5:00
    expect(isCloseGame(g0([[0, 0], [2000, 12], [2600, 5], [2700, 9]]))).toBe(true); // 5 at 3:20 left
    expect(isCloseGame(g0([[0, 0], [2000, 12], [2570, 4], [2590, 9]]))).toBe(true); // 4 held across 5:00 left
    expect(isCloseGame(g0([[0, 0], [2000, 12], [2560, 4], [2579, 9]]))).toBe(false); // 4 only before 5:00 left
    expect(isCloseGame(g0([[0, 0], [2000, -6], [2879, -5]]))).toBe(true); // home by 5 at the end
    expect(isCloseGame(g0([[0, 0], [2000, 12], [2880, 0], [3000, 7]], 5))).toBe(true); // overtime
    // Out-of-order timeline (play-by-play log quirk) is read in time order.
    expect(isCloseGame(g0([[0, 0], [2700, 3], [2000, 12]]))).toBe(true);
  });
  it('real data: every overtime game is close; a share of games is close', () => {
    const games = loadSeason('2025-26');
    expect(games.filter((g) => g.periods > 4).every((g) => isCloseGame(g))).toBe(true);
    const share = games.filter((g) => isCloseGame(g)).length / games.length;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.8);
  });
});

describe('closers table', () => {
  const games = loadSeason('2025-26');
  const team = 'ORL';
  const sel = selectGames(games, '2025-26', team, DEFAULT_FILTERS);
  const { close, rows } = closersTable(sel.games, team);
  it('counts only close games of the selection; closer = on court at the final buzzer (Q4 tab rule)', () => {
    expect(close.length).toBe(sel.games.filter((g) => isCloseGame(g)).length);
    for (const r of rows) {
      const played = close.filter((g) => g.players.some((p) => p.id === r.id && p.team === team && p.played && p.stints.some(([s, e]) => e > s)));
      const closed = played.filter((g) => q4Rows(g, team).some((x) => x.p.id === r.id && x.closer));
      const q4 = played.reduce((x, g) => x + q4Stints(g.players.find((p) => p.id === r.id)!).reduce((y, [s, e]) => y + e - s, 0), 0) / played.length;
      expect([r.played, r.closed, r.share, Math.round(r.q4Min)]).toEqual([played.length, closed.length, closed.length / played.length, Math.round(q4)]);
    }
    // Exactly 5 closers per close game.
    expect(rows.reduce((x, r) => x + r.closed, 0)).toBe(5 * close.length);
  });
  it('sorted by times closed (then share, then Q4 minutes)', () => {
    for (let i = 1; i < rows.length; i++) {
      const [a, b] = [rows[i - 1]!, rows[i]!];
      expect(a.closed > b.closed || (a.closed === b.closed && (a.share > b.share || (a.share === b.share && a.q4Min >= b.q4Min)))).toBe(true);
    }
  });
  it('follows the selection (filters): last 10 home games only count those', () => {
    const s10 = selectGames(games, '2025-26', team, { ...DEFAULT_FILTERS, window: 10, venue: 'home' });
    const t = closersTable(s10.games, team);
    expect(t.close.every((g) => s10.games.includes(g) && g.home.tri === team)).toBe(true);
    expect(t.close.length).toBeLessThanOrEqual(10);
  });
});

describe('game by game', () => {
  const games = loadSeason('2025-26');
  const team = 'ORL';
  const sel = selectGames(games, '2025-26', team, DEFAULT_FILTERS);
  const idx = buildAppearances(games);
  it('the last 5 games of the selection, newest first', () => {
    const last = lastGames(sel.games);
    expect(last.map((g) => g.id)).toEqual(sel.games.slice(-5).reverse().map((g) => g.id));
    expect(lastGames(sel.games.slice(0, 3))).toHaveLength(3);
  });
  it('played: his actual regulation stints; missed: DNP / inactive reason or not with the team', () => {
    const last = sel.games.slice(-30);
    let missed = 0;
    for (const p of [1630532, 1631094, 1628976]) {
      for (const s of playerStrips(last, team, p, idx)) {
        const box = s.game.players.find((x) => x.id === p && x.team === team);
        if (box?.played && box.stints.length) {
          expect(s.played).toBe(true);
          expect(s.stints.map(([a, b]) => [a, b])).toEqual(box.stints.filter(([a, b]) => b > a && a < REGULATION_LEN).map(([a, b]) => [a, Math.min(b, REGULATION_LEN)]));
          expect(s.otSeconds).toBe(box.stints.reduce((x, [a, b]) => x + Math.max(0, b - Math.max(a, REGULATION_LEN)), 0));
        } else {
          expect(s.played).toBe(false);
          expect(s.stints).toEqual([]);
          expect(s.missed).toMatch(/^(DNP|Inactive|Not with the team)/);
          missed++;
        }
        expect(s.opp).toBe(s.home ? s.game.away.tri : s.game.home.tri);
      }
    }
    expect(missed).toBeGreaterThan(5);
  });
  it('Franz Wagner\'s injury games carry the box-score reason', () => {
    const strips = playerStrips(sel.games, team, 1630532, idx).filter((s) => !s.played);
    expect(strips.length).toBe(48);
    expect(strips.some((s) => /^Inactive — Injury/.test(s.missed!))).toBe(true);
  });
});
