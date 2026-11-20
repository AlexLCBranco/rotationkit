// RK-8: the shared layout's navigation (backlogkit's NAV_PATTERN.md), pure so it is unit-tested (tests/nav.test.ts).
// Where = the app's main places (header tabs); the breadcrumb = the path to the current screen, each part with its
// siblings; How = how the place is looked at (Games: whole game | 4th quarter; Leaders: minutes & points | full Q4s).

import { shortDate } from './labels.ts';
import { DEFAULT_FULLQ4, DEFAULT_LEADERS, type Route } from './route.ts';
import { tabRoute } from './tabs.ts';
import { TEAM_CODES, teamName } from './teams.ts';
import { seasonOf } from '../domain/season.ts';
import type { GameIndexEntry } from '../domain/types.ts';

export type Where = 'games' | 'day' | 'averages' | 'leaders';

/** The header's places: id, label, hover text. Q4 is a How of Games, Full Q4 a How of Leaders, the player page lives
 * under Averages. */
export const WHERE: [Where, string, string][] = [
  ['games', 'Games', "One game's rotations, with the team's game list"],
  ['day', 'By day', 'Every game of one day'],
  ['averages', 'Averages', "A team's usual rotation over many games, and its players' pages"],
  ['leaders', 'Leaders', 'League-wide 4th-quarter and second-half leaders, and full 4th quarters'],
];

export function whereOf(r: Route): Where {
  if (r.view === 'game') return 'games';
  if (r.view === 'day') return 'day';
  if (r.view === 'leaders' || r.view === 'fullq4') return 'leaders';
  return 'averages';
}

/** The context a header jump keeps: team, season, filters, the open game and the By day date it came from. */
export interface NavContext {
  team: string | null;
  season: string;
  filters: Route['filters'];
  game?: string | undefined;
  day?: string | null | undefined;
}

/** The season shown (a game's season comes from its id). */
export const seasonShown = (r: Route, fallback: string) => (r.view === 'game' && r.game !== 'latest' ? seasonOf(r.game) : (r.season ?? fallback));

export function navContext(r: Route, season: string, rememberedTeam: string | null): NavContext {
  const team = r.view === 'playerName' ? rememberedTeam : (r.team ?? rememberedTeam);
  return {
    team,
    season: seasonShown(r, season),
    filters: r.filters,
    ...(r.view === 'game' && r.game !== 'latest' ? { game: r.game } : {}),
    ...(r.view === 'game' ? { day: r.day ?? null } : {}),
  };
}

/** Where a place tab goes from here. Games keeps the open game (back from Q4 = the whole game). */
export function whereRoute(w: Where, c: NavContext): Route {
  if (w === 'games') return tabRoute('games', c);
  return tabRoute(w, { ...c, game: undefined });
}

// ---------- How ----------
export type GameHow = 'games' | 'q4';
export const GAME_HOWS: [GameHow, string, string][] = [
  ['games', 'Whole game', 'Every quarter of the game'],
  ['q4', '4th quarter', 'The 4th quarter and overtime only, with every lineup change in words'],
];
export type LeadersHow = 'leaders' | 'fullq4';
export const LEADERS_HOWS: [LeadersHow, string, string][] = [
  ['leaders', 'Minutes & points', '4th-quarter or second-half minutes and points per game'],
  ['fullq4', 'Full 4th quarters', 'Who played the whole 4th quarter, season count'],
];

export function leadersHowRoute(r: Extract<Route, { view: 'leaders' | 'fullq4' }>, h: LeadersHow): Route {
  const base = { team: r.team, season: r.season, filters: r.filters };
  return h === 'fullq4' ? { view: 'fullq4', ...base, fullq4: r.view === 'fullq4' ? r.fullq4 : DEFAULT_FULLQ4 } : { view: 'leaders', ...base, leaders: r.view === 'leaders' ? r.leaders : DEFAULT_LEADERS };
}

// ---------- Same screen, another season / team ----------
export function withSeason(r: Route, s: string): Route {
  if (r.view === 'game') return { ...r, game: 'latest', season: s, day: null };
  if (r.view === 'day') return { ...r, season: s, day: { ...r.day, date: null } };
  return { ...r, season: s } as Route;
}

export function withTeam(r: Route, t: string, season: string): Route {
  if (r.view === 'game') return { ...r, game: 'latest', team: t, season, day: null };
  if (r.view === 'team') return { ...r, team: t, season, vs: r.vs === t ? null : (r.vs ?? null) };
  return { view: 'team', team: t, season, filters: r.filters };
}

// ---------- Breadcrumb ----------
export interface CrumbItem {
  label: string;
  route: Route;
  on: boolean;
}
export interface Crumb {
  label: string;
  /** Siblings to jump to; none → the part is plain text. */
  items: CrumbItem[];
}

/** "Nov 12 · ORL @ BOS" */
export const gameLabel = (e: Pick<GameIndexEntry, 'date' | 'home' | 'away'>) => `${shortDate(e.date)} · ${e.away} @ ${e.home}`;

export interface CrumbData {
  seasons: string[];
  /** The season's index (game labels and the game part's siblings), when loaded. */
  index?: GameIndexEntry[] | undefined;
  /** The player page's name, when known. */
  playerName?: string | undefined;
  rememberedTeam: string | null;
}

export function crumbs(r: Route, season: string, d: CrumbData): Crumb[] {
  const c = navContext(r, season, d.rememberedTeam);
  const where = whereOf(r);
  const out: Crumb[] = [
    {
      label: WHERE.find((w) => w[0] === where)![1],
      items: WHERE.map(([w, label]) => ({ label, route: whereRoute(w, c), on: w === where })),
    },
  ];
  if (r.view === 'playerName') return out;
  out.push({ label: c.season, items: [...d.seasons].reverse().map((s) => ({ label: s, route: withSeason(r, s), on: s === c.season })) });
  const teamPart = (t: string) => ({ label: teamName(t), items: TEAM_CODES.map((x) => ({ label: teamName(x), route: withTeam(r, x, c.season), on: x === t })) });
  if (r.view === 'game') {
    if (r.team) out.push(teamPart(r.team));
    const entry = r.game !== 'latest' ? d.index?.find((e) => e.id === r.game) : undefined;
    if (entry) {
      const games = r.team ? d.index!.filter((e) => e.home === r.team || e.away === r.team) : [];
      out.push({ label: gameLabel(entry), items: [...games].reverse().map((e) => ({ label: gameLabel(e), route: { ...r, game: e.id, day: null }, on: e.id === entry.id })) });
    }
    const how = r.tab ?? 'games';
    out.push({ label: GAME_HOWS.find((h) => h[0] === how)![1], items: GAME_HOWS.map(([h, label]) => ({ label, route: { ...r, tab: h }, on: h === how })) });
  } else if (r.view === 'team' && r.team) {
    out.push(teamPart(r.team));
    if (r.vs && r.vs !== r.team) out.push({ label: `vs ${teamName(r.vs)}`, items: [] });
  } else if (r.view === 'player') {
    out.push(teamPart(r.team));
    out.push({ label: d.playerName ?? 'Player', items: [] });
  } else if (r.view === 'day') {
    if (r.day.date) out.push({ label: `${shortDate(r.day.date)}, ${r.day.date.slice(0, 4)}`, items: [] });
  } else if (r.view === 'leaders' || r.view === 'fullq4') {
    const how: LeadersHow = r.view;
    out.push({ label: LEADERS_HOWS.find((h) => h[0] === how)![1], items: LEADERS_HOWS.map(([h, label]) => ({ label, route: leadersHowRoute(r, h), on: h === how })) });
  }
  return out;
}

// ---------- Go anywhere: places and teams (players come from the player index) ----------
export interface GoEntry {
  label: string;
  kind: string;
  route: Route;
  /** Words matched against what is typed. */
  words: string[];
}

const words = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean);

export function goEntries(c: NavContext): GoEntry[] {
  const places: GoEntry[] = [
    { label: 'Games', kind: 'Place', route: whereRoute('games', c), words: words('games game rotations chart') },
    { label: 'By day', kind: 'Place', route: whereRoute('day', c), words: words('by day date slate today') },
    { label: 'Averages', kind: 'Place', route: whereRoute('averages', c), words: words('averages typical stints usual rotation') },
    { label: 'Leaders', kind: 'Place', route: whereRoute('leaders', c), words: words('leaders 4th quarter q4 second half minutes points') },
    { label: 'Full 4th quarters', kind: 'Place', route: tabRoute('fullq4', c), words: words('full q4 4th quarter whole fourth') },
  ];
  const teams = TEAM_CODES.flatMap((t): GoEntry[] => [
    { label: `${teamName(t)} · games`, kind: 'Team', route: { view: 'game', game: 'latest', team: t, season: c.season, filters: c.filters }, words: [...words(`${t} ${teamName(t)}`), ...words('games rotations rotation chart')] },
    { label: `${teamName(t)} · averages`, kind: 'Team', route: { view: 'team', team: t, season: c.season, filters: c.filters }, words: [...words(`${t} ${teamName(t)}`), ...words('averages typical usual')] },
  ]);
  return [...places, ...teams];
}

/** Entries where every typed word starts one of the entry's words; a team's own words must match at least once. */
export function goFind(entries: GoEntry[], q: string, limit = 6): GoEntry[] {
  const typed = words(q);
  if (!typed.length) return [];
  return entries.filter((e) => typed.every((t) => e.words.some((w) => w.startsWith(t)))).slice(0, limit);
}
