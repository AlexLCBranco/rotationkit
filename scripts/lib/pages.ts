// RK-14: one real page per game, per player (per team he played for) and per team, written at build time next to the
// team bundles (never committed). Each is the built index.html with its own <title>, description, canonical address
// and Open Graph / Twitter tags, so a pasted link previews as that game / player / team and search engines see one
// page each, without running JavaScript. Plus sitemap.xml and robots.txt.
//   game/<gameId>.html            → /game/<gameId>
//   player/<TEAM>/<playerId>.html → /player/<TEAM>/<playerId>
//   team/<TEAM>.html              → /team/<TEAM>
// The host serves "/game/123" from "game/123.html" (Vercel cleanUrls; vite preview does the same).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shortDate } from '../../src/app/labels.ts';
import { SITE_NAME, SITE_URL } from '../../src/app/site.ts';
import { TEAM_CODES, teamName } from '../../src/app/teams.ts';
import { gameTitle, playerTitle, teamTitle } from '../../src/app/title.ts';
import { gameKind, KIND_TAG } from '../../src/domain/gameSet.ts';
import { buildPlayerIndex } from '../../src/domain/players.ts';
import type { GameIndexEntry } from '../../src/domain/types.ts';
import { readSeasonGames, seasonsIn } from './generated.ts';
import { withHead, type HeadInfo } from './head.ts';

export interface PageInfo extends HeadInfo {
  /** Path on the site ("/game/0022500020"); the file is that path + ".html". */
  path: string;
  title: string;
  description: string;
}

const longDate = (iso: string) => `${shortDate(iso)}, ${iso.slice(0, 4)}`;

export function gamePage(e: GameIndexEntry): PageInfo {
  const kind = KIND_TAG[gameKind(e.id)];
  return {
    path: `/game/${e.id}`,
    title: gameTitle(e),
    description: `${teamName(e.away)} ${e.as}, ${teamName(e.home)} ${e.hs} on ${longDate(e.date)}${kind ? ` (${kind.tag.toLowerCase()})` : ''}: who was on the court and when, minute by minute, with fouls and lineups.`,
  };
}

export const playerPage = (id: number, name: string, team: string): PageInfo => ({
  path: `/player/${team}/${id}`,
  title: playerTitle(name, team),
  description: `${name} (${teamName(team)}): when he is on the court in every game, his usual minutes, when he sits and the games he missed.`,
});

export const teamPage = (team: string, season: string): PageInfo => ({
  path: `/team/${team}`,
  title: teamTitle(team, season),
  description: `${teamName(team)}, ${season}: the usual rotation. Who plays when, minutes per game, closers, and how it changes without a player.`,
});

/** Every generated page: all games of all seasons, every player-team pair of every season, the 30 teams. */
export function allPages(dataDir: string): PageInfo[] {
  const seasons = seasonsIn(dataDir);
  const current = seasons.at(-1) ?? '';
  const games: PageInfo[] = [];
  // A player's name is the one from the latest season he appears in.
  const players = new Map<string, PageInfo>();
  for (const season of seasons) {
    const index = JSON.parse(readFileSync(join(dataDir, season, 'index.json'), 'utf8')) as GameIndexEntry[];
    for (const e of index) games.push(gamePage(e));
    for (const [id, name, teams] of buildPlayerIndex(readSeasonGames(dataDir, season))) for (const t of teams) players.set(`${t}/${id}`, playerPage(id, name, t));
  }
  return [...TEAM_CODES.map((t) => teamPage(t, current)), ...games, ...[...players.values()].sort((a, b) => a.path.localeCompare(b.path))];
}

/** Output files (path under dist/ → text) for the built index.html. */
export function pageFiles(indexHtml: string, pages: PageInfo[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of pages) out[`${p.path.slice(1)}.html`] = withHead(indexHtml, p);
  out['sitemap.xml'] = sitemap(pages);
  out['robots.txt'] = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
  return out;
}

/** The start page, "How to read this" and every generated page. */
export function sitemap(pages: PageInfo[]): string {
  const urls = ['/', '/help', ...pages.map((p) => p.path)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- ${SITE_NAME} -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${SITE_URL}${u}</loc></url>`).join('\n')}\n</urlset>\n`;
}
