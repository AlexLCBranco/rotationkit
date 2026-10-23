// Compact normalized game format, committed as data/games/<gameId>.json.
// All times are seconds elapsed since tip-off (OT periods included).

/** [t, period, description] — period is explicit because a foul at 12:00 of Q2 has the same t as Q1 0:00. */
export type PlayerFoul = [t: number, period: number, type: string];

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
  /** Family name and NBA short name ("F. Wagner"), when the source has them. */
  last?: string;
  nameI?: string;
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
  /** Personal fouls in order: [t, period, description from play-by-play]. Absent when PF = 0. */
  fouls?: PlayerFoul[];
}

/** Player with the team but inactive for the game (official list). */
export interface InactivePlayer {
  id: number;
  name: string;
  last?: string;
  nameI?: string;
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
  /** Running score after each change: [t, home, away] pairs, t ascending. Starts at [0, 0, 0]. */
  score: [number, number, number][];
  /** How stint reconstruction handled unusual cases, or what it could not resolve. */
  stintNotes?: string[];
  /** Data-quality notes for checks this game fails (absent = passes everything). Stints/minutes still used. */
  quality?: QualityNote[];
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
  /** NBA team ids (for logos). */
  hid: number;
  aid: number;
  periods: number;
  /** Game has data-quality notes. */
  flagged?: true;
}

export interface QualityNote {
  check: string;
  player?: string;
  detail: string;
  /** Which side looks wrong: the box score, or unresolved (sources disagree, no tie-breaker). */
  verdict: 'box-score' | 'unresolved';
  why: string;
}

/** data/<season>/schedule.json: every game in the schedule feed (incl. unplayed), for deep links. */
export interface ScheduleEntry {
  id: string;
  date: string;
  /** "" while a knockout opponent is still to be decided. */
  home: string;
  away: string;
  status: 'scheduled' | 'live' | 'final' | 'unknown';
  label?: string;
}
