// The last players opened (player page visits), shown by the header search when its box is empty.
// localStorage `rk.recent`; every read and write is wrapped in try/catch (private mode, blocked storage).

export interface RecentPlayer {
  id: number;
  name: string;
  team: string;
  season: string;
}

const KEY = 'rk.recent';
export const RECENT_MAX = 5;

export function recentPlayers(): RecentPlayer[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as RecentPlayer[]).filter((x) => x && typeof x.id === 'number' && typeof x.name === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** Most recent first; a player appears once (his latest visit). */
export function rememberPlayer(p: RecentPlayer): void {
  try {
    const list = [p, ...recentPlayers().filter((x) => x.id !== p.id)].slice(0, RECENT_MAX);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable: nothing is remembered.
  }
}
