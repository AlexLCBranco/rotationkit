// Games tab, By day: day list and order, closers at the end of regulation, full-Q4 marks, coach's-decision DNPs,
// the day's Q4 minutes leaders (ties at 10th), previous / next game keeping the side, and the route.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadSeason, sweepGames, WHOLE_DATA_TIMEOUT } from './data.ts';
import { parse, format } from '../src/app/route.ts';
import { dnpLabel } from '../src/app/dnp.ts';
import { onCourtAt } from '../src/domain/gameChart.ts';
import { reachesQ4, q4Seconds } from '../src/domain/fullQ4.ts';
import type { QuartersFile } from '../src/domain/leaders.ts';
import { cardSide, dayNeighbours, dayQ4Leaders, regulationClosers, slateDates, slateDay, tipLabel, type SlateGame } from '../src/domain/slate.ts';
import { periodEnd, REG_PERIODS } from '../src/domain/time.ts';
import type { GameIndexEntry, ScheduleEntry } from '../src/domain/types.ts';

const json = <T>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;

describe('day list and order', () => {
  const idx = (id: string, date: string): GameIndexEntry => ({ id, date, home: 'ORL', away: 'MIA', hs: 100, as: 90, hid: 1, aid: 2, periods: 4 });
  const sch = (id: string, date: string, extra: Partial<ScheduleEntry> = {}): ScheduleEntry => ({ id, date, home: 'BOS', away: 'NYK', status: 'scheduled', ...extra });
  it('finished from the index, the rest from the schedule; tip-time order, TBD last; preseason and All-Star left out', () => {
    const index = [idx('0022600010', '2026-11-01'), idx('0022600011', '2026-11-01')];
    const schedule = [
      sch('0022600010', '2026-11-01', { status: 'final', tip: '2026-11-02T00:30:00Z' }),
      sch('0022600011', '2026-11-01', { status: 'final', tip: '2026-11-01T23:00:00Z' }),
      sch('0022600012', '2026-11-01', { tip: '2026-11-02T03:00:00Z' }),
      sch('0022600013', '2026-11-01'),
      sch('0012600001', '2026-11-01', { tip: '2026-11-01T20:00:00Z' }),
      sch('0022600014', '2026-11-03', { home: '' }),
    ];
    const day = slateDay(index, schedule, '2026-11-01');
    expect(day.map((g) => [g.id, g.finished])).toEqual([
      ['0022600011', true],
      ['0022600010', true],
      ['0022600012', false],
      ['0022600013', false],
    ]);
    expect(slateDates(index, schedule)).toEqual({ dates: ['2026-11-01'], latestFinished: '2026-11-01' });
    // No schedule (no cached feed): id order.
    expect(slateDay(index, null, '2026-11-01').map((g) => g.id)).toEqual(['0022600010', '0022600011']);
  });
  it('tip time in Eastern time', () => {
    expect(tipLabel('2026-11-02T00:30:00Z')).toBe('7:30 PM ET');
    expect(tipLabel(undefined)).toBe('Time TBD');
  });
  it('previous / next game keeps the side of the selected team, else home', () => {
    const day = [
      { id: 'a', home: 'ORL', away: 'MIA' },
      { id: 'b', home: 'BOS', away: 'NYK' },
      { id: 'c', home: 'LAL', away: 'GSW' },
    ] as SlateGame[];
    expect(dayNeighbours(day, 'b', 'NYK')).toEqual({ prev: { id: 'a', team: 'MIA' }, next: { id: 'c', team: 'GSW' } });
    expect(dayNeighbours(day, 'b', 'BOS')).toEqual({ prev: { id: 'a', team: 'ORL' }, next: { id: 'c', team: 'LAL' } });
    expect(dayNeighbours(day, 'a', null)).toEqual({ next: { id: 'b', team: 'BOS' } });
    expect(dayNeighbours(day, 'x', 'BOS')).toEqual({});
  });
});

describe('cards on the committed data', () => {
  {
    it(
      `every game: five closers per team = on court at 48:00 (before any OT); full-Q4 marks; CD DNPs = the game page's label`,
      () => {
        for (const g of sweepGames()) {
          for (const t of [g.home.tri, g.away.tri]) {
            const s = cardSide(g, t);
            expect([g.id, t, s.closers.length]).toEqual([g.id, t, 5]);
            if (g.periods === REG_PERIODS) expect(s.closers.map((p) => p.id).sort()).toEqual(onCourtAt(g, t, periodEnd(REG_PERIODS)).map((p) => p.id).sort());
            for (const c of s.closers) expect(c.fullQ4).toBe(reachesQ4(q4Seconds(g.players.find((p) => p.id === c.id)!, g.periods), 'full'));
            const cd = [...g.players.filter((p) => p.team === t && !(p.played && p.stints.length)).map((p) => [p.id, dnpLabel(p.reason, p.reasonDetail).kind] as const), ...(g.inactive ?? []).filter((p) => p.team === t).map((p) => [p.id, dnpLabel(p.reason, p.reasonDetail, true).kind] as const)]
              .filter(([, k]) => k === 'cd')
              .map(([id]) => id);
            expect(s.cd.map((p) => p.id).sort()).toEqual([...new Set(cd)].sort());
          }
        }
      },
      WHOLE_DATA_TIMEOUT,
    );
  }
  it('regulation closers in an OT game are the players on court when Q4 ended', () => {
    const g = loadSeason('2025-26').find((x) => x.periods > REG_PERIODS)!;
    for (const t of [g.home.tri, g.away.tri]) for (const p of regulationClosers(g, t)) expect(p.stints.some(([, e]) => e === periodEnd(REG_PERIODS))).toBe(true);
  });
});

describe('Q4 minutes leaders of the day', () => {
  const p = (id: number, side: 0 | 1, q4: number, gt = 0) => (gt ? [id, side, [0, 0, 0, q4], [0, 0, 0, 0], [0, 0, 0, gt], [0, 0, 0, 0]] : [id, side, [0, 0, 0, q4], [0, 0, 0, 0]]);
  const names = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [i + 1, [`P${String(i + 1).padStart(2, '0')}`, '']]));
  const f = {
    names,
    games: [
      ['g1', '2026-11-01', 'ORL', 'MIA', [p(1, 0, 720), p(2, 0, 700), p(3, 1, 690), p(4, 1, 680), p(5, 0, 670), p(6, 1, 660), p(7, 0, 650)]],
      ['g2', '2026-11-01', 'BOS', 'NYK', [p(8, 0, 640), p(9, 1, 630), p(10, 0, 620), p(11, 1, 620), p(12, 0, 620), p(13, 1, 0), p(14, 0, 300, 100)]],
      ['g3', '2026-11-02', 'BOS', 'NYK', [p(1, 0, 720)]],
    ],
  } as unknown as QuartersFile;
  it('top 10 by regulation Q4 seconds, everyone tied at 10th shown, competition ranks', () => {
    const r = dayQ4Leaders(f, '2026-11-01', false);
    expect(r.map((x) => [x.rank, x.id, x.team, x.game])).toEqual([
      [1, 1, 'ORL', 'g1'],
      [2, 2, 'ORL', 'g1'],
      [3, 3, 'MIA', 'g1'],
      [4, 4, 'MIA', 'g1'],
      [5, 5, 'ORL', 'g1'],
      [6, 6, 'MIA', 'g1'],
      [7, 7, 'ORL', 'g1'],
      [8, 8, 'BOS', 'g2'],
      [9, 9, 'NYK', 'g2'],
      [10, 10, 'BOS', 'g2'],
      [10, 11, 'NYK', 'g2'],
      [10, 12, 'BOS', 'g2'],
    ]);
  });
  it('No blowouts leaves out games with 4th-quarter garbage time', () => {
    const r = dayQ4Leaders(f, '2026-11-01', true);
    expect(r.every((x) => x.game === 'g1')).toBe(true);
    expect(r).toHaveLength(7);
  });
  it('on the committed data: same Q4 seconds as quarters.json, sorted, at least 10 rows on a full day', () => {
    const q = json<QuartersFile>('data/2025-26/quarters.json');
    const date = q.games[600]![1];
    const r = dayQ4Leaders(q, date, false);
    expect(r.length).toBeGreaterThanOrEqual(10);
    for (let i = 1; i < r.length; i++) expect(r[i - 1]!.q4).toBeGreaterThanOrEqual(r[i]!.q4);
    expect(r.filter((x) => x.rank === r[r.length - 1]!.rank).every((x) => x.q4 === r[9]!.q4)).toBe(true);
  });
});

describe('route', () => {
  it('By day: #/games?view=day&date=…, round-trips; plain #/games is By team', () => {
    const r = parse('#/games?view=day&date=2026-11-12&s=2026-27&nb=1');
    expect(r).toMatchObject({ view: 'day', season: '2026-27', day: { date: '2026-11-12', noBlowouts: true } });
    expect(format(r)).toBe('/games?view=day&date=2026-11-12&s=2026-27&nb=1');
    expect(parse(format(r))).toEqual(r);
    expect(parse('#/games?view=day&date=bad')).toMatchObject({ view: 'day', day: { date: null } });
    expect(parse('#/games')).toMatchObject({ view: 'game', game: 'latest' });
  });
  it('game page opened from By day keeps the day', () => {
    const r = parse('#/game/0022600100?t=ORL&s=2026-27&day=2026-11-12');
    expect(r).toMatchObject({ view: 'game', game: '0022600100', team: 'ORL', day: '2026-11-12' });
    expect(parse(format(r))).toEqual(r);
    expect(format({ ...r, day: null } as typeof r)).not.toContain('day=');
  });
});
