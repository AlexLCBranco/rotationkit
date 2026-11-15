// #/player?name=<full name>: find a player by his full name in the per-season player indexes (players.json), for apps
// that only know the name (e.g. statmuse-builder, from ESPN rosters). Exact name match only, never a guess.

import { fold, type PlayerIndexEntry } from './players.ts';

const SUFFIX = /^(jr|sr|ii|iii|iv)$/;

/**
 * Comparison key of a full name: case, accents, periods, apostrophes and hyphens ignored (`fold`), trailing suffixes
 * (Jr., Sr., II, III, IV) dropped, spaces removed ("P. J. Tucker" = "PJ Tucker"). A suffix is only dropped while two
 * words remain.
 */
export function nameKey(name: string): string {
  const words = fold(name).split(' ').filter(Boolean);
  while (words.length > 2 && SUFFIX.test(words[words.length - 1]!)) words.pop();
  return words.join('');
}

export interface NameCandidate {
  id: number;
  /** His name as the data spells it. */
  name: string;
  /** The season of the entry used: the preferred season if he has data there, else his latest season. */
  season: string;
  /** His most recent team in that season. */
  team: string;
}

/**
 * Every player whose full name matches, each once: his entry in `preferred` if he has one, else his latest season.
 * Ordered by recency: preferred season first, then newest season first.
 */
export function nameCandidates(bySeason: Record<string, PlayerIndexEntry[]>, query: string, preferred?: string | null): NameCandidate[] {
  const key = nameKey(query);
  if (!key) return [];
  const best = new Map<number, NameCandidate>();
  for (const season of Object.keys(bySeason).sort()) {
    for (const [id, name, teams] of bySeason[season]!) {
      const team = teams[teams.length - 1];
      if (!team || nameKey(name) !== key) continue;
      if (best.get(id)?.season === preferred) continue; // keep the preferred season's entry
      best.set(id, { id, name, season, team });
    }
  }
  const rank = (c: NameCandidate) => (c.season === preferred ? 1 : 0);
  return [...best.values()].sort((a, b) => rank(b) - rank(a) || b.season.localeCompare(a.season) || b.id - a.id);
}

/** The candidates tied on season with the first one: only these need their last appearance compared. */
export function tiedCandidates(cands: NameCandidate[]): NameCandidate[] {
  return cands.filter((c) => c.season === cands[0]?.season);
}

/**
 * The player to open: among the candidates of the top season, the one with the most recent appearance
 * (`lastSeen` = sortable "date gameId" of his last box-score listing in that season); ties → the higher (newer) id.
 * Null when nothing matched.
 */
export function pickCandidate(cands: NameCandidate[], lastSeen: (c: NameCandidate) => string | undefined): NameCandidate | null {
  const tied = tiedCandidates(cands);
  if (tied.length <= 1) return tied[0] ?? null;
  return [...tied].sort((a, b) => (lastSeen(b) ?? '').localeCompare(lastSeen(a) ?? '') || b.id - a.id)[0]!;
}
