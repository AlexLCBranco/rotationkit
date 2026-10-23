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
