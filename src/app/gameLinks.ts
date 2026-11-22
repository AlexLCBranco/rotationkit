// The link from a game's score line to the same game in calendarkit. The date is always the NBA's US-Eastern game date
// (Game.date comes from the box score's gameEt), also for games that end after midnight UTC.

/** calendarkit's league list view on that game's day, with the game selected (calendarkit honors date/game once its
 *  own change lands; until then the link opens on today). */
export const CALENDARKIT_BASE_URL = 'https://gauntlet-home.vercel.app';

export function calendarkitUrl(g: { id: string; date: string }, base = CALENDARKIT_BASE_URL): string {
  const q = new URLSearchParams({ view: 'league', layout: 'list', date: g.date, game: g.id });
  return `${base.replace(/\/+$/, '')}/calendar?${q}`;
}
