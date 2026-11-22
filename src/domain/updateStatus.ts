// Outcome of the data update, committed as data/update-status.json (by the 11:00 UTC run always; by an hourly run
// only when it added games, failed, or recovered from a failure), and
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
  /** RK-12: ids of the games added since the last 11:00 UTC run; that run re-fetches them (late corrections) and
   * empties the list. Absent = none. */
  pending?: string[];
}

/** `pending`: the new list; left out = keep the previous one. */
export type RunResult = { at: string; runId?: string | null; pending?: string[] } & ({ ok: true } | { ok: false; step: string; error: string });

export function nextStatus(prev: UpdateStatus | null, run: RunResult): UpdateStatus {
  const runId = run.runId ?? null;
  const list = run.pending ?? prev?.pending ?? [];
  const pending = list.length ? { pending: list } : {};
  if (run.ok) return { lastRun: run.at, result: 'ok', failingStep: null, error: null, lastSuccess: run.at, failingSince: null, runId, ...pending };
  return {
    lastRun: run.at,
    result: 'failed',
    failingStep: run.step,
    error: run.error,
    lastSuccess: prev?.lastSuccess ?? null,
    failingSince: prev?.result === 'failed' && prev.failingSince ? prev.failingSince : run.at,
    runId,
    ...pending,
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
