// Tunable pattern-engine settings. Change values here only.

export const PATTERN_CONFIG = {
  /** Heat-strip bucket size in seconds (regulation 48:00 → 96 buckets). */
  bucketSeconds: 30,
  blowout: {
    /** Absolute score margin at or above which time counts as blowout. */
    margin: 20,
    /** Only when less than this much time (s) is left in the period. */
    underSecondsLeft: 360,
    /** First period the rule applies to (4 = Q4; all OT periods are included). */
    fromPeriod: 4,
  },
} as const;

export type BlowoutConfig = typeof PATTERN_CONFIG.blowout;

/** Foul-trouble coloring on the single-game chart. Per period: fouls at which a player is in caution / trouble. */
export const FOUL_TROUBLE: Record<'1' | '2' | '3' | '4', { caution: number | null; trouble: number }> = {
  '1': { caution: 2, trouble: 3 },
  '2': { caution: 3, trouble: 4 },
  '3': { caution: 4, trouble: 5 },
  /** Also used for every OT period. */
  '4': { caution: 4, trouble: 5 },
};

/** Game-type badge from the final margin (same cut-offs as the reference chart). */
export const GAME_TYPE = { blowoutMargin: 15, comfortableMargin: 10 } as const;

/** Single-game chart geometry. */
export const CHART = {
  /** Minimum timeline scale; at 18 px/min a 2:00 stint is 36 px, enough for an "m:ss" label inside. */
  minPxPerMinute: 18,
  /** Stints at least this long carry their duration inside the bar; shorter ones beside/above/below. */
  insideLabelMinSeconds: 120,
  /** Reserved width per character of the 12 px monospace labels (0.6 em ≈ 7.2 px, plus margin). */
  labelCharPx: 7.4,
  labelPadPx: 2,
  tickCharPx: 6.6,
  laneTopPx: 15,
  barPx: 24,
  laneBottomPx: 14,
} as const;
