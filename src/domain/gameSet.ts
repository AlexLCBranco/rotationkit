// RK-13: which kind of game an NBA game id is, and the two sets of games that averages are taken over.
// The kind is the id's first three digits (the same table as src/shared/nba-schedule/parse.ts):
//   002 regular season (includes NBA Cup group and knockout games) · 004 playoffs · 005 play-in · 006 NBA Cup final.
// Averages, Leaders, Usual, Closers, Full Q4 counts, "when does he sit?" and USG% are taken over ONE set, never both:
//   regular    = regular-season games (the default, as before RK-13)
//   post       = play-in + playoffs of that season
// The Cup final is in neither set (it does not count in NBA season stats): it is only viewable as a single game.

export type GameKind = 'regular' | 'playoffs' | 'play-in' | 'cup-final' | 'other';
export type GameSet = 'regular' | 'post';

const KIND: Record<string, GameKind> = { '002': 'regular', '004': 'playoffs', '005': 'play-in', '006': 'cup-final' };

export const gameKind = (id: string): GameKind => KIND[id.slice(0, 3)] ?? 'other';

/** The kinds the pipeline fetches and the app shows. */
export const isShownKind = (id: string) => gameKind(id) !== 'other';

export function inSet(id: string, set: GameSet = 'regular'): boolean {
  const k = gameKind(id);
  return set === 'post' ? k === 'playoffs' || k === 'play-in' : k === 'regular';
}

/** Does this season have postseason games (the "Regular season | Postseason" chip only shows then)? */
export const hasPostseason = (ids: Iterable<string>) => {
  for (const id of ids) if (inSet(id, 'post')) return true;
  return false;
};

/** The set a single game belongs to (null: the Cup final and anything else). */
export const setOf = (id: string): GameSet | null => (inSet(id, 'regular') ? 'regular' : inSet(id, 'post') ? 'post' : null);

/** Words for "based on N games": always says which set. */
export const SET_WORDS: Record<GameSet, string> = { regular: 'regular season', post: 'postseason (play-in + playoffs)' };

/** The tag on a postseason or Cup final game (none on a regular-season game). */
export const KIND_TAG: Partial<Record<GameKind, { tag: string; tip: string }>> = {
  'play-in': { tag: 'PLAY-IN', tip: 'Play-in game: the last playoff places are decided here. It does not count in regular-season averages.' },
  playoffs: { tag: 'PLAYOFFS', tip: 'Playoff game. It does not count in regular-season averages.' },
  'cup-final': { tag: 'CUP FINAL', tip: 'NBA Cup final. It counts in no averages: not regular season, not postseason.' },
};
