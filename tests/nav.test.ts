// RK-8: the shared layout's navigation logic (src/app/nav.ts) and the header's page history (src/app/pageHistory.ts).

import { describe, expect, it } from 'vitest';
import { crumbs, goEntries, goFind, leadersHowRoute, navContext, whereOf, whereRoute, withSeason, withTeam, WHERE } from '../src/app/nav.ts';
import { step } from '../src/app/pageHistory.ts';
import { DEFAULT_FULLQ4, DEFAULT_LEADERS, format, parse, type Route } from '../src/app/route.ts';
import { DEFAULT_FILTERS } from '../src/domain/patterns.ts';
import type { GameIndexEntry } from '../src/domain/types.ts';

const SEASONS = ['2025-26', '2026-27'];
const f = DEFAULT_FILTERS;
const entry = (id: string, date: string, away: string, home: string) => ({ id, date, away, home, hid: 0, aid: 0, hs: 100, as: 99 }) as unknown as GameIndexEntry;
const INDEX = [entry('0022500001', '2025-10-21', 'BOS', 'ORL'), entry('0022500002', '2025-10-22', 'ORL', 'MIA'), entry('0022500003', '2025-10-22', 'LAL', 'GSW')];

describe('places (Where)', () => {
  it('at most 5 places, every screen belongs to one', () => {
    expect(WHERE.length).toBeLessThanOrEqual(5);
    const at = (hash: string) => whereOf(parse(hash));
    expect(at('#/game/0022500001?t=ORL')).toBe('games');
    expect(at('#/q4/0022500001')).toBe('games');
    expect(at('#/games?view=day&date=2025-11-10')).toBe('day');
    expect(at('#/team/ORL')).toBe('averages');
    expect(at('#/player/ORL/1630532')).toBe('averages');
    expect(at('#/player?name=Luka')).toBe('averages');
    expect(at('#/leaders')).toBe('leaders');
    expect(at('#/fullq4')).toBe('leaders');
    expect(at('#/help?sec=usg')).toBe('help');
    expect(at('')).toBe('games');
  });
  it('a place keeps team, season and filters; Games keeps the open game (back from Q4 = whole game)', () => {
    const r = parse('#/q4/0022500001?t=ORL&s=2025-26&w=10');
    const c = navContext(r, '2026-27', null);
    expect(format(whereRoute('games', c))).toBe('#/game/0022500001?s=2025-26&w=10&t=ORL');
    expect(format(whereRoute('averages', c))).toBe('#/team/ORL?s=2025-26&w=10');
    expect(format(whereRoute('leaders', c))).toBe('#/leaders?s=2025-26&w=10&t=ORL');
    expect(format(whereRoute('day', c))).toBe('#/games?view=day&s=2025-26&w=10&t=ORL');
  });
  it('the remembered team fills in when the screen has none', () => {
    const c = navContext(parse('#/leaders?s=2025-26'), '2025-26', 'BOS');
    expect(format(whereRoute('averages', c))).toBe('#/team/BOS?s=2025-26');
  });
});

describe('How', () => {
  it('Leaders ↔ Full 4th quarters keep season and team, and each side its own settings', () => {
    const l = parse('#/leaders?s=2025-26&part=h2&t=ORL') as Extract<Route, { view: 'leaders' }>;
    const fq = leadersHowRoute(l, 'fullq4');
    expect(fq).toEqual({ view: 'fullq4', team: 'ORL', season: '2025-26', filters: l.filters, fullq4: DEFAULT_FULLQ4 });
    expect(leadersHowRoute(fq as Extract<Route, { view: 'fullq4' }>, 'leaders')).toMatchObject({ view: 'leaders', leaders: DEFAULT_LEADERS });
  });
});

describe('breadcrumb', () => {
  it('game: place › season › team › game › how; each part lists its siblings', () => {
    const r = parse('#/game/0022500002?t=ORL&s=2025-26');
    const c = crumbs(r, '2025-26', { seasons: SEASONS, index: INDEX, rememberedTeam: null });
    expect(c.map((x) => x.label)).toEqual(['Games', '2025-26', 'Orlando Magic', 'Oct 22 · ORL @ MIA', 'Whole game']);
    expect(c[0]!.items.map((i) => i.label)).toEqual(['Games', 'By day', 'Averages', 'Leaders', 'How to read this']);
    expect(c[1]!.items.map((i) => [i.label, i.on])).toEqual([['2026-27', false], ['2025-26', true]]);
    expect(c[2]!.items).toHaveLength(30);
    // the team's games, newest first; picking one opens it
    expect(c[3]!.items.map((i) => i.label)).toEqual(['Oct 22 · ORL @ MIA', 'Oct 21 · BOS @ ORL']);
    expect(format(c[3]!.items[1]!.route)).toBe('#/game/0022500001?s=2025-26&t=ORL');
    expect(format(c[4]!.items[1]!.route)).toBe('#/q4/0022500002?s=2025-26&t=ORL');
    // another season or team → that team's latest game
    expect(format(c[1]!.items[0]!.route)).toBe('#/game/latest?s=2026-27&t=ORL');
    expect(format(c[2]!.items.find((i) => i.label === 'Boston Celtics')!.route)).toBe('#/game/latest?s=2025-26&t=BOS');
  });
  it('player page: Averages › season › team › name (plain text)', () => {
    const c = crumbs(parse('#/player/ORL/1630532?s=2025-26&w=5'), '2025-26', { seasons: SEASONS, playerName: 'Franz Wagner', rememberedTeam: null });
    expect(c.map((x) => x.label)).toEqual(['Averages', '2025-26', 'Orlando Magic', 'Franz Wagner']);
    expect(c[3]!.items).toEqual([]);
    expect(format(c[1]!.items[0]!.route)).toBe('#/player/ORL/1630532?s=2026-27&w=5');
    expect(format(c[2]!.items.find((i) => i.label === 'Miami Heat')!.route)).toBe('#/team/MIA?s=2025-26&w=5');
  });
  it('By day, Leaders, Full Q4, matchup', () => {
    const d = { seasons: SEASONS, rememberedTeam: null };
    expect(crumbs(parse('#/games?view=day&date=2025-11-10&s=2025-26'), '2025-26', d).map((x) => x.label)).toEqual(['By day', '2025-26', 'Nov 10, 2025']);
    // another season: the latest day of that season
    expect(format(crumbs(parse('#/games?view=day&date=2025-11-10&s=2025-26'), '2025-26', d)[1]!.items[0]!.route)).toBe('#/games?view=day&s=2026-27');
    expect(crumbs(parse('#/leaders?s=2025-26'), '2025-26', d).map((x) => x.label)).toEqual(['Leaders', '2025-26', 'Minutes & points']);
    expect(crumbs(parse('#/fullq4?s=2025-26'), '2025-26', d).map((x) => x.label)).toEqual(['Leaders', '2025-26', 'Full 4th quarters']);
    expect(crumbs(parse('#/team/ORL?s=2025-26&vs=BOS'), '2025-26', d).map((x) => x.label)).toEqual(['Averages', '2025-26', 'Orlando Magic', 'vs Boston Celtics']);
  });
  it('withSeason / withTeam keep the screen', () => {
    expect(format(withSeason(parse('#/team/ORL?s=2025-26&vs=BOS'), '2026-27'))).toBe('#/team/ORL?s=2026-27&vs=BOS');
    // picking the matchup opponent as the team drops the matchup
    expect(format(withTeam(parse('#/team/ORL?s=2025-26&vs=BOS'), 'BOS', '2025-26'))).toBe('#/team/BOS?s=2025-26');
  });
});

describe('Go anywhere', () => {
  const entries = goEntries({ team: 'ORL', season: '2025-26', filters: f });
  const labels = (q: string) => goFind(entries, q).map((e) => e.label);
  it('teams by code, city or name, with a place word; places by their words', () => {
    expect(labels('bos')).toEqual(['Boston Celtics · games', 'Boston Celtics · averages']);
    expect(labels('rotations bos')).toEqual(['Boston Celtics · games']);
    expect(labels('celtics averages')).toEqual(['Boston Celtics · averages']);
    expect(labels('golden state')).toEqual(['Golden State Warriors · games', 'Golden State Warriors · averages']);
    expect(labels('leaders')[0]).toBe('Leaders');
    expect(labels('full q4')[0]).toBe('Full 4th quarters');
    expect(labels('')).toEqual([]);
    // player names find no team or place
    for (const q of ['jok', 'nikola', 'harden', 'gilgeous', 'wembanyama']) expect(labels(q)).toEqual([]);
  });
  it('a team entry opens its latest game / its averages for the season shown', () => {
    const [g, a] = goFind(entries, 'bos');
    expect(format(g!.route)).toBe('#/game/latest?s=2025-26&t=BOS');
    expect(format(a!.route)).toBe('#/team/BOS?s=2025-26');
  });
});

describe('page history (header back / forward)', () => {
  const h0 = { stack: ['#/a'], i: 0 };
  it('app navigation pushes (cutting what was ahead), a URL fix-up replaces', () => {
    const h1 = step(h0, '#/b', 'push');
    expect(h1).toEqual({ stack: ['#/a', '#/b'], i: 1 });
    expect(step(h1, '#/b2', 'replace')).toEqual({ stack: ['#/a', '#/b2'], i: 1 });
    const back = step(h1, '#/a', 'browser');
    expect(back).toEqual({ stack: ['#/a', '#/b'], i: 0 });
    expect(step(back, '#/b', 'browser')).toEqual({ stack: ['#/a', '#/b'], i: 1 });
    expect(step(back, '#/c', 'push')).toEqual({ stack: ['#/a', '#/c'], i: 1 });
  });
  it('a link or a typed URL is a new page; the same URL changes nothing', () => {
    expect(step(h0, '#/z', 'browser')).toEqual({ stack: ['#/a', '#/z'], i: 1 });
    expect(step(h0, '#/a', 'push')).toBe(h0);
  });
});
