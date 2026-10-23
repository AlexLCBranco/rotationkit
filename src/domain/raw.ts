// Minimal shapes of the raw NBA responses (only the fields we read).

export interface RawBoxPlayer {
  personId: number;
  name: string;
  starter: string; // "1" | "0"
  played: string; // "1" | "0"
  status?: string;
  notPlayingReason?: string;
  notPlayingDescription?: string;
  statistics: {
    minutes: string;
    points: number;
    reboundsTotal: number;
    assists: number;
    foulsPersonal: number;
    plusMinusPoints: number;
  };
}

export interface RawBoxTeam {
  teamId: number;
  teamName: string;
  teamCity: string;
  teamTricode: string;
  score: number;
  players: RawBoxPlayer[];
}

export interface RawBoxscore {
  game: {
    gameId: string;
    gameEt: string;
    gameStatus: number;
    period: number;
    homeTeam: RawBoxTeam;
    awayTeam: RawBoxTeam;
  };
}

export interface RawAction {
  actionNumber: number;
  orderNumber: number;
  clock: string;
  period: number;
  teamTricode?: string;
  actionType: string;
  subType?: string;
  personId?: number;
  /** All players involved (actor, assist, fouled, …). */
  personIdsFilter?: number[];
  scoreHome: string;
  scoreAway: string;
}

export interface RawPlayByPlay {
  game: { gameId: string; actions: RawAction[] };
}

export interface RawRotation {
  resultSets: { name: string; headers: string[]; rowSet: (string | number | null)[][] }[];
}

export interface RawSummary {
  boxScoreSummary: {
    homeTeam: { teamTricode: string; players: { personId: number; name: string }[]; inactives?: unknown[] };
    awayTeam: { teamTricode: string; players: { personId: number; name: string }[]; inactives?: unknown[] };
  };
}

export interface RawGame {
  boxscore: RawBoxscore;
  playbyplay: RawPlayByPlay;
  /** Optional cross-check source (stats.nba.com). */
  gamerotation?: RawRotation;
  summary?: RawSummary;
}
