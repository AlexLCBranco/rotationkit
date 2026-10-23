// Compact normalized game format, committed as data/games/<gameId>.json.
// All times are seconds elapsed since tip-off (OT periods included).

/** [start, end, plusMinus, foulTimes?] — always inside a single period. */
export type Stint = [start: number, end: number, pm: number, fouls?: number[]];

export interface TeamInfo {
  id: number;
  tri: string;
  name: string;
  city: string;
  score: number;
}

export interface PlayerGame {
  id: number;
  name: string;
  team: string; // tricode
  starter: boolean;
  played: boolean;
  /** Box-score minutes, in seconds. */
  min: number;
  pts: number;
  reb: number;
  ast: number;
  pf: number;
  pm: number;
  /** Not-playing reason code + detail when the box score has them, e.g. "DND_INJURY", "Left Ankle; Sprain". */
  reason?: string;
  reasonDetail?: string;
  stints: Stint[];
}

/** Player with the team but inactive for the game (official list). */
export interface InactivePlayer {
  id: number;
  name: string;
  team: string;
  /** e.g. "INACTIVE_INJURY", "INACTIVE_GLEAGUE_TWOWAY" (box-score source only). */
  reason?: string;
  reasonDetail?: string;
}

export interface Game {
  id: string;
  date: string; // YYYY-MM-DD, US Eastern
  home: TeamInfo;
  away: TeamInfo;
  periods: number;
  players: PlayerGame[];
  /**
   * Official inactive list: from the box score (status INACTIVE, with reasons) when it has one, else from
   * the boxscoresummaryv3 roster list (no reasons). null = no official list; the appearance rule applies.
   */
  inactive: InactivePlayer[] | null;
  inactiveSource?: 'box' | 'roster';
  /** Score margin (home minus away) after each change: [t, margin] pairs, t ascending. Starts at [0, 0]. */
  margin: [number, number][];
  /** How stint reconstruction handled unusual cases, or what it could not resolve. */
  stintNotes?: string[];
  /** Personal fouls that could not be matched to one of the player's stints (should be empty). */
  orphanFouls: { player: number; t: number }[];
}

export interface GameIndexEntry {
  id: string;
  date: string;
  home: string;
  away: string;
  hs: number;
  as: number;
  periods: number;
}
