// RK-13: play-in, playoff and NBA Cup final games — kinds from the game id, the two sets averages are taken over
// (never mixed), the pipeline pieces, and the backfill's id checks. Real committed data where it exists; games of the
// other kinds are real fixture games with their id rewritten (only the id: it alone decides the kind).

import { describe, expect, it } from 'vitest';
import { loadSeason } from './data.ts';
import { loadFixtureGame, loadRawFixture } from './fixtures.ts';
import { basedOn } from '../src/app/labels.ts';
import { format, parse } from '../src/app/route.ts';
import { carryFilters } from '../src/app/links.ts';
import { gameKind, hasPostseason, inSet, isShownKind, KIND_TAG, setOf } from '../src/domain/gameSet.ts';
import { buildQuartersFile } from '../src/domain/leaders.ts';
import { DEFAULT_FILTERS, selectGames, withSet } from '../src/domain/patterns.ts';
import { scheduleTags } from '../src/domain/scheduleTags.ts';
import { seasonOf } from '../src/domain/season.ts';
import { usualSelection } from '../src/domain/usual.ts';
import type { Game } from '../src/domain/types.ts';
import { mergeFinalGames } from '../scripts/lib/data.ts';
import { cupFinalCandidates, foundGame, playInCandidates, playoffProblems, playoffSeries, type FoundGame } from '../scripts/lib/postseason.ts';

const S = '2025-26';
const season = loadSeason(S);
const regularOf = (team: string) => season.filter((g) => gameKind(g.id) === 'regular' && (g.home.tri === team || g.away.tri === team));
/** A real game under another id and date (same teams, same everything else). */
const as = (g: Game, id: string, date: string): Game => ({ ...structuredClone(g), id, date });

describe('kinds and sets', () => {
  it('the kind is the id prefix', () => {
    expect(gameKind('0022500001')).toBe('regular');
    expect(gameKind('0042500101')).toBe('playoffs');
    expect(gameKind('0052500001')).toBe('play-in');
    expect(gameKind('0062500001')).toBe('cup-final');
    expect(gameKind('0012500001')).toBe('other'); // preseason
    expect(gameKind('0032500001')).toBe('other'); // All-Star
    expect(['0022500001', '0042500101', '0052500001', '0062500001'].every(isShownKind)).toBe(true);
    expect(isShownKind('0012500001')).toBe(false);
  });
  it('regular = 002 only; postseason = play-in + playoffs; the Cup final is in neither', () => {
    expect(inSet('0022500001')).toBe(true);
    expect(inSet('0042500101')).toBe(false);
    expect(inSet('0042500101', 'post')).toBe(true);
    expect(inSet('0052500001', 'post')).toBe(true);
    expect(inSet('0022500001', 'post')).toBe(false);
    expect([inSet('0062500001'), inSet('0062500001', 'post'), setOf('0062500001')]).toEqual([false, false, null]);
    expect([setOf('0022500001'), setOf('0052500001'), setOf('0042500101')]).toEqual(['regular', 'post', 'post']);
    expect(hasPostseason(['0022500001', '0062500001'])).toBe(false);
    expect(hasPostseason(['0022500001', '0052500001'])).toBe(true);
    expect(seasonOf('0042500101')).toBe(S);
  });
  it('every game in the data is of a shown kind', () => {
    for (const s of [S, '2026-27']) expect(loadSeason(s).filter((g) => !isShownKind(g.id)).map((g) => g.id)).toEqual([]);
  });
  it('tags: PLAY-IN, PLAYOFFS, CUP FINAL; none on a regular-season game', () => {
    expect(KIND_TAG[gameKind('0052500001')]!.tag).toBe('PLAY-IN');
    expect(KIND_TAG[gameKind('0042500101')]!.tag).toBe('PLAYOFFS');
    expect(KIND_TAG[gameKind('0062500001')]!.tag).toBe('CUP FINAL');
    expect(KIND_TAG[gameKind('0022500001')]).toBeUndefined();
  });
});

describe('selection: one set only', () => {
  it('2025-26 default selection is unchanged: the 82 regular-season games of each team, whatever else is in the data', () => {
    for (const team of ['ORL', 'BOS', 'LAL', 'OKC', 'ATL']) {
      const sel = selectGames(season, S, team, DEFAULT_FILTERS);
      expect(sel.games, team).toHaveLength(82);
      expect(sel.games.map((g) => g.id)).toEqual(regularOf(team).map((g) => g.id));
      expect(sel.games.every((g) => g.id.startsWith('002'))).toBe(true);
    }
  });
  it('the postseason set of the real data holds only 004 / 005 ids', () => {
    for (const team of ['ORL', 'BOS', 'LAL', 'OKC', 'ATL', 'NYK', 'DEN']) {
      const sel = selectGames(season, S, team, { ...DEFAULT_FILTERS, set: 'post' });
      expect(sel.games.every((g) => /^00[45]/.test(g.id)), team).toBe(true);
    }
  });
  // ORL's real season plus a play-in game, three playoff games and a Cup final (real ORL games under other ids).
  const orl = regularOf('ORL');
  const extra = [as(orl[20]!, '0062500001', '2025-12-16'), as(orl[78]!, '0052500001', '2026-04-14'), as(orl[79]!, '0042500111', '2026-04-18'), as(orl[80]!, '0042500112', '2026-04-20'), as(orl[81]!, '0042500113', '2026-04-23')];
  // (built on the regular season alone, so real postseason games in the data cannot clash with these ids)
  const mixed = [...season.filter((g) => gameKind(g.id) === 'regular'), ...extra];
  it('with postseason games in the data: the default stays the same 82', () => {
    const sel = selectGames(mixed, S, 'ORL', DEFAULT_FILTERS);
    expect(sel.games.map((g) => g.id)).toEqual(selectGames(season, S, 'ORL', DEFAULT_FILTERS).games.map((g) => g.id));
    expect(selectGames(mixed, S, 'ORL', { ...DEFAULT_FILTERS, window: 5 }).games.every((g) => g.id.startsWith('002'))).toBe(true);
  });
  it('postseason = play-in + playoffs, oldest first; the Cup final is in neither set', () => {
    const post = selectGames(mixed, S, 'ORL', { ...DEFAULT_FILTERS, set: 'post' });
    expect(post.games.map((g) => g.id)).toEqual(['0052500001', '0042500111', '0042500112', '0042500113']);
    expect(selectGames(mixed, S, 'ORL', { ...DEFAULT_FILTERS, set: 'post', window: 5 }).candidates).toBe(4);
    for (const set of [undefined, 'post'] as const) expect(selectGames(mixed, S, 'ORL', { ...DEFAULT_FILTERS, ...(set ? { set } : {}) }).games.some((g) => g.id === '0062500001')).toBe(false);
  });
  it('"Usual" of a game looks at earlier games of its own set; the Cup final has none', () => {
    const [cupFinal, playIn, g1, g2, g3] = extra as [Game, Game, Game, Game, Game];
    const team = mixed.filter((g) => g.home.tri === 'ORL' || g.away.tri === 'ORL');
    expect(usualSelection(team, g3, 'ORL').games.map((g) => g.id)).toEqual([playIn.id, g1.id, g2.id]);
    expect(usualSelection(team, cupFinal, 'ORL').games).toEqual([]);
    const reg = usualSelection(team, orl[81]!, 'ORL').games;
    expect(reg).toHaveLength(10);
    expect(reg.every((g) => g.id.startsWith('002'))).toBe(true);
  });
  it('Leaders / Full Q4 read the season file one set at a time', () => {
    const file = buildQuartersFile(mixed.filter((g) => g.home.tri === 'ORL' || g.away.tri === 'ORL'));
    expect(file.games.filter((g) => inSet(g[0])).length).toBe(82);
    expect(file.games.filter((g) => inSet(g[0], 'post')).map((g) => g[0]).sort()).toEqual(['0042500111', '0042500112', '0042500113', '0052500001']);
  });
  it('schedule chips count postseason games like any other game (decided from the code: only preseason and All-Star are left out)', () => {
    const sched = mixed.filter((g) => g.home.tri === 'ORL' || g.away.tri === 'ORL').map((g) => ({ id: g.id, date: g.date, home: g.home.tri, away: g.away.tri, status: 'final' as const }));
    const tags = scheduleTags(sched, 'ORL');
    expect(tags.get('0042500112')!.restDays).toBe(1); // Apr 18 → Apr 20
    expect(tags.get('0042500113')!.restDays).toBe(2); // Apr 20 → Apr 23
    expect(tags.get('0052500001')).toBeDefined();
  });
});

describe('the set lives in the URL and in the "based on" label', () => {
  it('gs=post round-trips; absent = regular season; links carry it', () => {
    const r = parse('#/team/ORL?s=2025-26&gs=post&w=10');
    expect(r.filters.set).toBe('post');
    expect(format(r)).toBe('#/team/ORL?s=2025-26&w=10&gs=post');
    expect(parse('#/team/ORL?s=2025-26').filters.set).toBeUndefined();
    expect(format(parse('#/team/ORL?s=2025-26&gs=nonsense'))).toBe('#/team/ORL?s=2025-26');
    expect(carryFilters({ season: S, filters: r.filters, team: 'ORL' }, 'BOS').set).toBe('post');
    expect(withSet(r.filters, 'regular')).not.toHaveProperty('set');
    expect(withSet(DEFAULT_FILTERS, 'post').set).toBe('post');
  });
  it('"based on N games" always says which set', () => {
    expect(basedOn(82)).toBe('based on 82 games · regular season');
    expect(basedOn(1, 'post')).toBe('based on 1 game · postseason (play-in + playoffs)');
  });
});

describe('pipeline', () => {
  it('a past season without a feed: backfilled games join its schedule as final, in date order; the rest is untouched', () => {
    const sched = [
      { id: '0022500001', date: '2025-10-21', home: 'OKC', away: 'HOU', status: 'final' as const },
      { id: '0022501200', date: '2026-04-12', home: 'POR', away: 'SAC', status: 'final' as const, tip: 'x' },
    ];
    const index = [
      { id: '0022500001', date: '2025-10-21', home: 'OKC', away: 'HOU' },
      { id: '0062500001', date: '2025-12-16', home: 'NYK', away: 'SAS' },
      { id: '0022501200', date: '2026-04-12', home: 'POR', away: 'SAC' },
      { id: '0052500001', date: '2026-04-14', home: 'ORL', away: 'ATL' },
    ] as never[];
    const out = mergeFinalGames(sched, index);
    expect(out.map((e) => e.id)).toEqual(['0022500001', '0062500001', '0022501200', '0052500001']);
    expect(out[2]).toBe(sched[1]);
    expect(out[3]).toEqual({ id: '0052500001', date: '2026-04-14', home: 'ORL', away: 'ATL', status: 'final' });
    expect(mergeFinalGames(sched, index.slice(0, 1))).toBe(sched);
  });
});

describe('backfill: candidates and checks (nothing is assumed to exist)', () => {
  it('candidate ids', () => {
    expect(cupFinalCandidates(S)).toEqual(['0062500001']);
    expect(playInCandidates(S)).toHaveLength(299);
    expect(playInCandidates(S)[0]).toBe('0052500001');
    expect(playInCandidates(S).at(-1)).toBe('0052500299');
    const series = playoffSeries(S);
    expect(series).toHaveLength(15);
    expect(series[0]!.prefix).toBe('004250010');
    expect(series.at(-1)!.prefix).toBe('004250040');
    expect(new Set(series.map((s) => s.prefix)).size).toBe(15);
  });
  it('a box score counts only when it is that very id, final, and played in that season', () => {
    const raw = loadRawFixture('0022500020').boxscore as { game: Record<string, unknown> };
    const g = loadFixtureGame('0022500020');
    expect(foundGame('0022500020', S, raw)).toEqual({ id: g.id, date: g.date, home: g.home.tri, away: g.away.tri, hs: g.home.score, as: g.away.score });
    expect(foundGame('0042500101', S, raw)).toMatch(/not 0042500101/);
    expect(foundGame('0022500020', '2024-25', raw)).toMatch(/not in the 2024-25 season/);
    expect(foundGame('0022500020', S, { game: { ...raw.game, gameStatus: 2 } })).toMatch(/expected 3 \(final\)/);
    expect(foundGame('0022500020', S, {})).toBe('no game in the response');
  });
  it('playoff checks: every series is two teams, numbered 1…n, and ends at 4 wins; 8 / 4 / 2 / 1 series per round', () => {
    const win = (prefix: string, n: number, home: string, away: string, homeWins: boolean): FoundGame => ({ id: `${prefix}${n}`, date: `2026-05-0${n}`, home, away, hs: homeWins ? 100 : 90, as: homeWins ? 90 : 100 });
    const sweep = (prefix: string, a: string, b: string) => [1, 2, 3, 4].map((n) => win(prefix, n, n <= 2 ? a : b, n <= 2 ? b : a, n <= 2));
    const all = playoffSeries(S).flatMap((s, i) => sweep(s.prefix, `A${i}`, `B${i}`));
    expect(playoffProblems(all)).toEqual([]);
    // a missing game 4: the series stops at 3 wins
    const short = all.filter((g) => g.id !== '0042500104');
    expect(playoffProblems(short)).toEqual(['series 004250010: the leader has 3 wins after 3 games (a finished series has 4)']);
    // a whole series missing
    expect(playoffProblems(all.filter((g) => !g.id.startsWith('004250040')))).toEqual(['round 4: 0 series found, 1 expected']);
    // a third team in a series
    expect(playoffProblems([...all.slice(0, 3), { ...all[3]!, home: 'ZZZ' }, ...all.slice(4)]).some((p) => p.includes('3 teams'))).toBe(true);
  });
});
