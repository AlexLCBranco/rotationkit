// Per-season player index for the header search (data/<season>/players.json, generated at build time by the Vite
// data plugin from the committed game files; not committed) and the teams of a traded player.

import { buildAppearances, type AppearanceIndex } from './availability.ts';
import type { Game } from './types.ts';

/** [id, full name, teams in the season ordered by last appearance: the last one is his most recent team]. */
export type PlayerIndexEntry = [id: number, name: string, teams: string[]];

/**
 * A player's teams in a season, from the appearance index (box-score listings, the same data the with/without rule
 * uses): each team once, ordered by his last appearance for it, so the most recent team is last.
 */
export function teamsOf(idx: AppearanceIndex, player: number): string[] {
  const last = new Map<string, number>();
  (idx.get(player) ?? []).forEach((a, i) => last.set(a.team, i));
  return [...last.entries()].sort((a, b) => a[1] - b[1]).map(([t]) => t);
}

/** Everyone listed in a box score of the season (played or not), sorted by name. */
export function buildPlayerIndex(games: Game[]): PlayerIndexEntry[] {
  const idx = buildAppearances(games);
  const names = new Map<number, { name: string; date: string }>();
  // The name from his latest game (the NBA occasionally corrects a spelling).
  for (const g of games) for (const p of g.players) if (!names.has(p.id) || names.get(p.id)!.date <= g.date) names.set(p.id, { name: p.name, date: g.date });
  return [...idx.keys()].map((id): PlayerIndexEntry => [id, names.get(id)!.name, teamsOf(idx, id)]).sort((a, b) => a[1].localeCompare(b[1]) || a[0] - b[0]);
}

/** Lowercase, accents removed ("Jokić" → "jokic"), punctuation dropped, hyphens as spaces. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[øœæßłđ]/g, (c) => ({ ø: 'o', œ: 'oe', æ: 'ae', ß: 'ss', ł: 'l', đ: 'd' })[c]!)
    .replace(/[-‐–]/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SearchHit {
  id: number;
  name: string;
  /** Teams in that season, most recent last. */
  teams: string[];
  season: string;
}

/**
 * How well a name matches (lower is better), or null: 0 = the name starts with the query, 1 = every query word starts
 * a word of the name, 2 = the query appears anywhere in the name, 3 = initials ("sga" → Shai Gilgeous-Alexander).
 */
export function matchScore(name: string, query: string): number | null {
  const q = fold(query);
  if (!q) return null;
  const n = fold(name);
  if (n.startsWith(q)) return 0;
  const words = n.split(' ');
  const qw = q.split(' ');
  if (qw.every((w) => words.some((x) => x.startsWith(w)))) return 1;
  if (n.includes(q) || n.replace(/ /g, '').includes(q.replace(/ /g, ''))) return 2;
  if (q.length >= 2 && !q.includes(' ') && words.map((w) => w[0]).join('').startsWith(q)) return 3;
  return null;
}

/**
 * Up to `limit` players matching the query over all seasons' indexes. Players of `season` come first, then the best
 * match, then the name. A player appears once: with his entry in `season` if he has one, else his latest season.
 */
export function searchPlayers(bySeason: Record<string, PlayerIndexEntry[]>, query: string, season: string, limit = 8): SearchHit[] {
  const best = new Map<number, { hit: SearchHit; score: number }>();
  for (const s of Object.keys(bySeason).sort()) {
    for (const [id, name, teams] of bySeason[s]!) {
      const score = matchScore(name, query);
      if (score === null) continue;
      const prev = best.get(id);
      // Keep the selected season's entry; otherwise the latest season (seasons are visited oldest first).
      if (prev && prev.hit.season === season) continue;
      best.set(id, { hit: { id, name, teams, season: s }, score });
    }
  }
  return [...best.values()]
    .sort((a, b) => Number(b.hit.season === season) - Number(a.hit.season === season) || a.score - b.score || a.hit.name.localeCompare(b.hit.name))
    .slice(0, limit)
    .map((x) => x.hit);
}
