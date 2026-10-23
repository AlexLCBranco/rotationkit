// Game-time helpers. Internal time = seconds elapsed since tip-off.

export const REG_PERIODS = 4;
export const REG_PERIOD_LEN = 720;
export const OT_PERIOD_LEN = 300;
export const REGULATION_LEN = REG_PERIODS * REG_PERIOD_LEN;

export const periodLength = (p: number) => (p <= REG_PERIODS ? REG_PERIOD_LEN : OT_PERIOD_LEN);

export const periodStart = (p: number) =>
  p <= REG_PERIODS ? (p - 1) * REG_PERIOD_LEN : REGULATION_LEN + (p - 1 - REG_PERIODS) * OT_PERIOD_LEN;

export const periodEnd = (p: number) => periodStart(p) + periodLength(p);

export const gameLength = (periods: number) => periodEnd(periods);

/** Period containing elapsed time t; a time exactly on a boundary belongs to the earlier period. */
export function periodAt(t: number): number {
  if (t <= REGULATION_LEN) return Math.max(1, Math.ceil(t / REG_PERIOD_LEN));
  return REG_PERIODS + Math.ceil((t - REGULATION_LEN) / OT_PERIOD_LEN);
}

/** Parse ISO-8601 durations like "PT08M11.00S" to seconds. Empty/invalid → 0. */
export function parseIsoDuration(s: string | undefined | null): number {
  const m = /^PT(?:(\d+)M)?(?:([\d.]+)S)?$/.exec(s ?? '');
  if (!m) return 0;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
}

/** Elapsed seconds for a period + remaining game clock. */
export const elapsedAt = (period: number, clockRemaining: number) => periodEnd(period) - clockRemaining;

/** Round to 0.1s to avoid float noise. */
export const r1 = (x: number) => Math.round(x * 10) / 10;

/** Format elapsed seconds as "Q2 6:00" (clock remaining in the period). */
export function formatGameTime(t: number): string {
  const p = periodAt(t);
  const rem = periodEnd(p) - t;
  const label = p <= REG_PERIODS ? `Q${p}` : p === REG_PERIODS + 1 ? 'OT' : `${p - REG_PERIODS}OT`;
  return `${label} ${formatClock(rem)}`;
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
