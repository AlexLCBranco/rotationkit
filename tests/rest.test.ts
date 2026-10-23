// Rest classification: hand-made schedules + real 2025-26 back-to-backs.

import { describe, expect, it } from 'vitest';
import { restForTeam, matchesRest, type ScheduleLike } from '../src/domain/rest.ts';
import { DEFAULT_FILTERS, selectGames } from '../src/domain/patterns.ts';
import { loadSeason } from './data.ts';

const g = (id: string, date: string, home: string, away: string): ScheduleLike => ({ id, date, home, away });

describe('restForTeam (hand-made schedule)', () => {
  const schedule = [
    g('0012600001', '2026-10-20', 'AAA', 'BBB'), // preseason the day before the opener: ignored
    g('0022600001', '2026-10-21', 'AAA', 'CCC'), // season opener
    g('0022600002', '2026-10-22', 'DDD', 'AAA'), // next day → back-to-back
    g('0022600003', '2026-10-24', 'AAA', 'EEE'), // one day off
    g('0022600004', '2026-10-27', 'AAA', 'FFF'), // two days off
    g('0022600005', '2026-10-31', 'GGG', 'AAA'), // three days off
    g('0022600006', '2026-11-01', 'AAA', 'HHH'), // across a month boundary → back-to-back
    g('0022600007', '2027-02-12', 'AAA', 'III'), // last game before the All-Star break
    g('0022600008', '2027-02-19', 'JJJ', 'AAA'), // after the break: 7 days
    g('0022600009', '2027-02-20', 'AAA', 'KKK'), // back-to-back right after the break
    g('0062600001', '2026-12-15', 'AAA', 'LLL'), // NBA Cup final (counts as a game played)
    g('0022600010', '2026-12-16', 'AAA', 'MMM'), // day after the Cup final → back-to-back
  ];
  const r = restForTeam(schedule, 'AAA');
  it.each([
    ['0022600001', 'rest2', null],
    ['0022600002', 'b2b', 1],
    ['0022600003', 'rest1', 2],
    ['0022600004', 'rest2', 3],
    ['0022600005', 'rest2', 4],
    ['0022600006', 'b2b', 1],
    ['0062600001', 'rest2', 44],
    ['0022600010', 'b2b', 1],
    ['0022600008', 'rest2', 7],
    ['0022600009', 'b2b', 1],
  ] as const)('%s → %s (%s days)', (id, rest, days) => expect(r.get(id)).toEqual({ rest, days }));
  it('preseason games get no classification', () => expect(r.has('0012600001')).toBe(false));
  it('filters: back-to-back vs rested', () => {
    expect(matchesRest('b2b', 'b2b')).toBe(true);
    expect(matchesRest('rest1', 'rested')).toBe(true);
    expect(matchesRest('rest2', 'rested')).toBe(true);
    expect(matchesRest('b2b', 'rested')).toBe(false);
  });
});

describe('real 2025-26', () => {
  const games = loadSeason('2025-26');
  const schedule = games.map((x) => ({ id: x.id, date: x.date, home: x.home.tri, away: x.away.tri }));
  const teams = [...new Set(schedule.flatMap((x) => [x.home, x.away]))];
  it('every back-to-back is a game the calendar day after the previous one; counts per team are plausible', () => {
    const counts: Record<string, number> = {};
    for (const t of teams) {
      const r = restForTeam(schedule, t);
      const mine = schedule.filter((x) => x.home === t || x.away === t).sort((a, b) => a.date.localeCompare(b.date));
      expect(new Set(mine.map((x) => x.date)).size).toBe(mine.length); // never two games on one day
      mine.forEach((x, i) => {
        if (r.get(x.id)!.rest !== 'b2b') return;
        const prev = new Date(mine[i - 1]!.date + 'T00:00:00Z');
        prev.setUTCDate(prev.getUTCDate() + 1);
        expect(prev.toISOString().slice(0, 10)).toBe(x.date);
      });
      counts[t] = [...r.values()].filter((x) => x.rest === 'b2b').length;
    }
    for (const n of Object.values(counts)) expect(n).toBeGreaterThanOrEqual(10), expect(n).toBeLessThanOrEqual(20);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThan(300);
  });
  it('rest filter in the selection chain, with "based on N"', () => {
    const rest = restForTeam(schedule, 'ORL');
    const all = selectGames(games, '2025-26', 'ORL', DEFAULT_FILTERS, undefined, rest);
    const b2b = selectGames(games, '2025-26', 'ORL', { ...DEFAULT_FILTERS, rest: 'b2b' }, undefined, rest);
    const rested = selectGames(games, '2025-26', 'ORL', { ...DEFAULT_FILTERS, rest: 'rested' }, undefined, rest);
    expect(b2b.games.length + rested.games.length).toBe(all.games.length);
    expect(b2b.games.every((x) => rest.get(x.id)!.rest === 'b2b')).toBe(true);
    const last5 = selectGames(games, '2025-26', 'ORL', { ...DEFAULT_FILTERS, rest: 'b2b', window: 5 }, undefined, rest);
    expect(last5.games).toEqual(b2b.games.slice(-5));
  });
});
