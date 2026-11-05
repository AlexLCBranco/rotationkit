// Outcome of the daily data update, committed as data/update-status.json on every run (also failed ones), and
// the app's "data is stale" banner logic. Pure: no Node or browser APIs (also run by plain `node` in CI).

export interface UpdateStatus {
  /** ISO time of the latest run. */
  lastRun: string;
  result: 'ok' | 'failed';
  /** Step that failed in the latest run (null when ok). */
  failingStep: string | null;
  error: string | null;
  /** ISO time of the latest successful run (null if none yet). */
  lastSuccess: string | null;
  /** ISO time of the first failed run of the current failing streak (null when ok). */
  failingSince: string | null;
  /** GitHub Actions run id of the latest run (lets the workflow's fallback step see whether it was recorded). */
  runId: string | null;
}

export type RunResult = { at: string; runId?: string | null } & ({ ok: true } | { ok: false; step: string; error: string });

export function nextStatus(prev: UpdateStatus | null, run: RunResult): UpdateStatus {
  const runId = run.runId ?? null;
  if (run.ok) return { lastRun: run.at, result: 'ok', failingStep: null, error: null, lastSuccess: run.at, failingSince: null, runId };
  return {
    lastRun: run.at,
    result: 'failed',
    failingStep: run.step,
    error: run.error,
    lastSuccess: prev?.lastSuccess ?? null,
    failingSince: prev?.result === 'failed' && prev.failingSince ? prev.failingSince : run.at,
    runId,
  };
}

/** Hours after which data counts as stale even without a recorded failure (e.g. the job stopped running). */
export const STALE_AFTER_HOURS = 36;

export interface StaleBanner {
  reason: 'failed' | 'stale';
  lastSuccess: string | null;
  /** First failed run of the streak; for 'stale' without a failure, the last run time. */
  since: string | null;
}

/** null = everything fine (or no status file yet). */
export function staleBanner(s: UpdateStatus | null, now: Date, hours = STALE_AFTER_HOURS): StaleBanner | null {
  if (!s) return null;
  if (s.result === 'failed') return { reason: 'failed', lastSuccess: s.lastSuccess, since: s.failingSince ?? s.lastRun };
  const last = s.lastSuccess ? Date.parse(s.lastSuccess) : NaN;
  if (Number.isNaN(last) || now.getTime() - last > hours * 3_600_000) return { reason: 'stale', lastSuccess: s.lastSuccess, since: s.lastRun };
  return null;
}
