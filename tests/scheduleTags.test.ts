import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dayNumber, restLabel, scheduleTags } from '../src/domain/scheduleTags.ts';
import type { ScheduleLike } from '../src/domain/rest.ts';
import { parseSchedule } from '../src/shared/nba-schedule/parse.ts';

let n = 0;
/** Team AAA's games on these Eastern dates (alternating home/away, other opponents). */
const sched = (dates: string[], team = 'AAA'): ScheduleLike[] =>
  dates.map((date, i) => ({ id: `00225${String(++n).padStart(5, '0')}`, date, home: i % 2 ? team : `O${i}`, away: i % 2 ? `O${i}` : team }));
const tagsOf = (s: ScheduleLike[]) => {
  const t = scheduleTags(s, 'AAA');
  return s.map((g) => t.get(g.id)!);
};
const brief = (s: ScheduleLike[]) =>
  tagsOf(s).map((t) => [t.b2b1 ? 'B2B 1' : '', t.b2b2 ? 'B2B 2' : '', t.threeInFourPosition ?? 0, restLabel(t.restDays)].join('|'));

describe('scheduleTags', () => {
  it('simple back-to-back', () => {
    expect(brief(sched(['2025-11-01', '2025-11-02', '2025-11-05']))).toEqual(['B2B 1||0|', '|B2B 2|0|0d', '||0|2d+']);
  });
  it('3 games in 4 days with the gap in the middle', () => {
    // 1st, (day off), 2nd, 3rd → days 0, 2, 3.
    const t = tagsOf(sched(['2025-11-01', '2025-11-03', '2025-11-04', '2025-11-08']));
    expect(t.map((x) => x.threeInFourPosition)).toEqual([1, 2, 3, null]);
    expect(t.map((x) => [x.b2b1, x.b2b2])).toEqual([[false, false], [true, false], [false, true], [false, false]]);
    expect(t.map((x) => restLabel(x.restDays))).toEqual([null, '1d', '0d', '2d+']);
  });
  it('3 games in 4 days with the gap at the end', () => {
    // days 0, 1, 3.
    const t = tagsOf(sched(['2025-11-01', '2025-11-02', '2025-11-04']));
    expect(t.map((x) => x.threeInFourPosition)).toEqual([1, 2, 3]);
    expect(t[2]!.threeInFour).toHaveLength(1);
  });
  it('3 games in 5 days is not a 3-in-4', () => {
    expect(tagsOf(sched(['2025-11-01', '2025-11-03', '2025-11-05'])).map((x) => x.threeInFourPosition)).toEqual([null, null, null]);
  });
  it('4 games in 5 days: overlapping sets → highest position, all sets listed', () => {
    // days 0, 1, 3, 4 → sets (0,1,3) and (1,3,4).
    const s = sched(['2025-11-01', '2025-11-02', '2025-11-04', '2025-11-05']);
    const t = tagsOf(s);
    expect(t.map((x) => x.threeInFourPosition)).toEqual([1, 2, 3, 3]);
    expect(t[1]!.threeInFour.map((x) => x.position)).toEqual([2, 1]);
    expect(t[2]!.threeInFour.map((x) => x.position)).toEqual([3, 2]);
    expect(t[2]!.threeInFour.map((x) => x.dates)).toEqual([
      ['2025-11-01', '2025-11-02', '2025-11-04'],
      ['2025-11-02', '2025-11-04', '2025-11-05'],
    ]);
    expect(t[2]!.threeInFour[1]!.ids).toEqual([s[1]!.id, s[2]!.id, s[3]!.id]);
    // B2B and 3-in-4 together.
    expect([t[3]!.b2b2, t[3]!.threeInFourPosition]).toEqual([true, 3]);
  });
  it('season opener: no rest label, no B2B 2; the preseason does not count', () => {
    const s = [{ id: '0012500001', date: '2025-10-20', home: 'AAA', away: 'BBB' }, ...sched(['2025-10-21', '2025-10-22'])];
    const t = scheduleTags(s, 'AAA');
    expect(t.has('0012500001')).toBe(false);
    expect(t.get(s[1]!.id)).toMatchObject({ b2b2: false, restDays: null, b2b1: true });
  });
  it('All-Star break: a long gap breaks every tag; the All-Star game itself does not count', () => {
    const s = [...sched(['2026-02-12', '2026-02-19']), { id: '0032500001', date: '2026-02-15', home: 'AAA', away: 'BBB' }];
    const t = scheduleTags(s, 'AAA');
    expect(t.has('0032500001')).toBe(false);
    expect(t.get(s[1]!.id)).toMatchObject({ b2b1: false, b2b2: false, threeInFourPosition: null, restDays: 6 });
    expect(restLabel(6)).toBe('2d+');
  });
  it('month and year boundaries', () => {
    expect(brief(sched(['2025-11-30', '2025-12-01']))).toEqual(['B2B 1||0|', '|B2B 2|0|0d']);
    expect(brief(sched(['2025-12-31', '2026-01-01', '2026-01-03']))).toEqual(['B2B 1||1|', '|B2B 2|2|0d', '||3|1d']);
    expect(brief(sched(['2028-02-28', '2028-02-29', '2028-03-01']))).toEqual(['B2B 1||1|', 'B2B 1|B2B 2|2|0d', '|B2B 2|3|0d']); // leap year
    expect(dayNumber('2026-03-01') - dayNumber('2026-02-28')).toBe(1);
  });
  it('late Pacific game: the Eastern date is used, not the UTC date', () => {
    // 7:30 pm PT Jan 14 = 10:30 pm ET Jan 14 = 03:30 UTC Jan 15. Next game: 3 pm ET Jan 16 (20:00 UTC Jan 16).
    // Eastern: Jan 14 → Jan 16 = one day off. UTC dates (Jan 15 → Jan 16) would wrongly make it a back-to-back.
    const raw = (id: string, et: string, utc: string, home: string, away: string) => ({
      gameId: id, gameStatus: 3, gameStatusText: 'Final', gameDateEst: `${et.slice(0, 10)}T00:00:00Z`, gameDateTimeEst: et, gameDateTimeUTC: utc,
      homeTeam: { teamId: 1, teamTricode: home }, awayTeam: { teamId: 2, teamTricode: away },
    });
    const feed = { leagueSchedule: { seasonYear: '2025-26', leagueId: '00', gameDates: [{ games: [
      raw('0022500901', '2026-01-14T22:30:00Z', '2026-01-15T03:30:00Z', 'LAL', 'AAA'),
      raw('0022500902', '2026-01-16T15:00:00Z', '2026-01-16T20:00:00Z', 'AAA', 'BBB'),
    ] }] } };
    const games = parseSchedule(feed).games;
    const et = games.map((g) => ({ id: g.gameId, date: g.dateEt, home: g.homeTeam.teamTricode, away: g.awayTeam.teamTricode }));
    expect(et.map((e) => e.date)).toEqual(['2026-01-14', '2026-01-16']);
    expect(scheduleTags(et, 'AAA').get('0022500901')).toMatchObject({ b2b1: false });
    expect(scheduleTags(et, 'AAA').get('0022500902')).toMatchObject({ b2b2: false, restDays: 1 });
    const utc = games.map((g) => ({ id: g.gameId, date: g.gameDateTimeUTC.slice(0, 10), home: g.homeTeam.teamTricode, away: g.awayTeam.teamTricode }));
    expect(scheduleTags(utc, 'AAA').get('0022500902')).toMatchObject({ b2b2: true }); // the wrong answer UTC would give
  });
});

describe('scheduleTags on real 2025-26 data', () => {
  const schedule = JSON.parse(readFileSync('data/2025-26/schedule.json', 'utf8')) as ScheduleLike[];
  // Independent source for dates: the box-score Eastern date of each game we hold.
  const index = JSON.parse(readFileSync('data/2025-26/index.json', 'utf8')) as ScheduleLike[];
  const teams = [...new Set(index.flatMap((g) => [g.home, g.away]))];
  it('every B2B 2 game has a team game on the previous Eastern date; every B2B 1 one on the next', () => {
    let b2b = 0;
    for (const team of teams) {
      const dates = new Set(index.filter((g) => g.home === team || g.away === team).map((g) => g.date));
      for (const g of index.filter((x) => x.home === team || x.away === team)) {
        const t = scheduleTags(schedule, team).get(g.id)!;
        const prev = new Date((dayNumber(g.date) - 1) * 86_400_000).toISOString().slice(0, 10);
        const next = new Date((dayNumber(g.date) + 1) * 86_400_000).toISOString().slice(0, 10);
        expect(t.b2b2, `${team} ${g.id}`).toBe(dates.has(prev));
        expect(t.b2b1, `${team} ${g.id}`).toBe(dates.has(next));
        if (t.b2b2) b2b++;
      }
    }
    expect(b2b).toBeGreaterThan(200); // ~14 per team
  });
  it('every 3-in-4 set really has 3 games of the team within 4 days', () => {
    let sets = 0;
    for (const team of teams) {
      const byId = new Map(index.filter((g) => g.home === team || g.away === team).map((g) => [g.id, g]));
      for (const [id, t] of scheduleTags(schedule, team)) {
        for (const s of t.threeInFour) {
          expect(s.ids).toContain(id);
          expect(s.ids[s.position - 1]).toBe(id);
          const ds = s.ids.map((x) => byId.get(x)!.date);
          expect(ds).toEqual(s.dates);
          expect(new Set(ds).size).toBe(3);
          expect(dayNumber(ds[2]!) - dayNumber(ds[0]!)).toBeLessThanOrEqual(3);
          sets++;
        }
        if (t.threeInFour.length) expect(t.threeInFourPosition).toBe(Math.max(...t.threeInFour.map((s) => s.position)));
      }
    }
    expect(sets).toBeGreaterThan(100);
  });
});
