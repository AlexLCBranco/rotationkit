// Links from a game's score line to the same game elsewhere. The date is always the NBA's US-Eastern game date
// (Game.date comes from the box score's gameEt), also for games that end after midnight UTC.

/** hoopsjunkie.io game page. Ported from calendarkit's gameLinkUrl (src/slate/links.ts): same rule, verified there
 *  on the live site 2026-10-29: /games/<ET date>/<away>-vs-<home>, lowercase tricodes. */
export const HOOPSJUNKIE_BASE_URL = 'https://hoopsjunkie.io';

export function hoopsjunkieUrl(g: { date: string; away: { tri: string }; home: { tri: string } }, base = HOOPSJUNKIE_BASE_URL): string {
  return `${base.replace(/\/+$/, '')}/games/${g.date}/${g.away.tri.toLowerCase()}-vs-${g.home.tri.toLowerCase()}`;
}

/** calendarkit's league list view on that game's day, with the game selected (calendarkit honors date/game once its
 *  own change lands; until then the link opens on today). */
export const CALENDARKIT_BASE_URL = 'https://gauntlet-home.vercel.app';

export function calendarkitUrl(g: { id: string; date: string }, base = CALENDARKIT_BASE_URL): string {
  const q = new URLSearchParams({ view: 'league', layout: 'list', date: g.date, game: g.id });
  return `${base.replace(/\/+$/, '')}/calendar?${q}`;
}
