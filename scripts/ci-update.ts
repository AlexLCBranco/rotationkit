// Daily data update (run by .github/workflows/data-update.yml, also runnable locally).
//   probe-cdn → fetch-season --cdn-only --strict → normalize → validate-all → tests → commit + push (only with --commit)
// The test step runs the fixtures and every unit test, but the whole-season sweeps (WHOLE_DATA_TIMEOUT suites) only
// over the games this run added (RK_TEST_GAMES, see tests/data.ts); the full sweeps run on every pull request.
// Commits when there are new finished games OR the schedule changed (fetch-season downloads the feed every run).
// With --commit every run also records its outcome in data/update-status.json (the app warns when data is stale):
//   - success: the status file is committed with the data (alone when nothing else changed);
//   - a failing step stops the run with a non-zero exit and ONLY the status file is committed (no game data).
// Usage: npx tsx scripts/ci-update.ts [--commit]

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { commitMessage, dataSeasons, newGamesSummary, readIndex, readSchedule, scheduleChanges, scheduleCommitMessage } from './lib/data.ts';
import type { GameIndexEntry, ScheduleEntry } from '../src/domain/types.ts';
import { nextStatus, type UpdateStatus } from '../src/domain/updateStatus.ts';
import { readStatus, STATUS_FILE, writeStatus } from './lib/status.ts';

export const STEPS = [
  'npx tsx scripts/probe-cdn.ts',
  'npm run fetch-season -- --cdn-only --strict',
  'npm run normalize',
  'npm run validate-all',
  'npm test',
] as const;

/** The shell command of a step: the test step gets the ids of the games this run added. */
export function stepCommand(step: (typeof STEPS)[number], newIds: string[]): string {
  return step === 'npm test' ? `RK_TEST_GAMES=${newIds.join(',')} npm test` : step;
}

export interface Deps {
  /** Run a shell command; throw if it fails. */
  run: (cmd: string) => void;
  /** Read all committed game indexes (all seasons). */
  indexes: () => GameIndexEntry[];
  /** Read all committed schedules (all seasons). The feed is downloaded and schedule.json rewritten every run. */
  schedules: () => ScheduleEntry[];
  log: (msg: string) => void;
  /** Current time (ISO) and the GitHub Actions run id, for the status file. */
  now: () => string;
  runId: () => string | null;
  readStatus: () => UpdateStatus | null;
  writeStatus: (s: UpdateStatus) => void;
}

export type Outcome = { status: 'failed'; step: string; error: string } | { status: 'no-changes' } | { status: 'committed' | 'dry-run'; message: string };

export function runUpdate(deps: Deps, opts: { commit: boolean }): Outcome {
  const before = deps.indexes();
  const schedBefore = deps.schedules();
  const record = (r: { ok: true } | { ok: false; step: string; error: string }) =>
    deps.writeStatus(nextStatus(deps.readStatus(), { ...r, at: deps.now(), runId: deps.runId() }));
  const had = new Set(before.map((g) => g.id));
  for (const step of STEPS) {
    deps.log(`\n▶ ${step}`);
    try {
      // After normalize the index holds this run's new games; only the test step needs them.
      deps.run(step === 'npm test' ? stepCommand(step, deps.indexes().filter((g) => !had.has(g.id)).map((g) => g.id)) : step);
    } catch (e) {
      const error = (e as Error).message;
      // Nothing of this run's data is staged or committed; only the failure is recorded, so the site learns of it.
      if (opts.commit) {
        record({ ok: false, step, error });
        try {
          deps.run(`git add ${STATUS_FILE}`);
          deps.run(`git commit -m "data: update FAILED at ${step.replace(/"/g, "'")}" -- ${STATUS_FILE}`);
          deps.run('git push');
        } catch (e2) {
          deps.log(`Could not commit the status file: ${(e2 as Error).message}`);
        }
      }
      return { status: 'failed', step, error };
    }
  }
  const summary = newGamesSummary(before, deps.indexes());
  // A schedule change alone (postponed / rescheduled game) is committed too, so B2B / 3-in-4 tags fix themselves.
  const changed = scheduleChanges(schedBefore, deps.schedules());
  if (!opts.commit) return summary.n === 0 && changed === 0 ? { status: 'no-changes' } : { status: 'dry-run', message: summary.n > 0 ? commitMessage(summary) : scheduleCommitMessage(changed) };
  record({ ok: true });
  if (summary.n === 0 && changed === 0) {
    // Nothing new, but the successful run is recorded (otherwise quiet days would look stale).
    deps.run(`git add ${STATUS_FILE}`);
    deps.run(`git commit -m "data: update status (ok, nothing new)" -- ${STATUS_FILE}`);
    deps.run('git push');
    return { status: 'no-changes' };
  }
  const message = summary.n > 0 ? commitMessage(summary) : scheduleCommitMessage(changed);
  // validation.json stays as produced by full local runs (the runner has no raw data for cross-checks).
  deps.run("git add data ':!data/*/validation.json'");
  deps.run(`git commit -m "${message}"`);
  deps.run('git push');
  return { status: 'committed', message };
}

function realDeps(): Deps {
  return {
    run: (cmd) => {
      const r = spawnSync(cmd, { shell: true, stdio: 'inherit' });
      if (r.status !== 0) throw new Error(`exit code ${r.status ?? r.signal}`);
    },
    indexes: () => dataSeasons().flatMap((s) => readIndex(s)),
    schedules: () => dataSeasons().flatMap((s) => readSchedule(s)),
    log: (m) => console.log(m),
    now: () => new Date().toISOString(),
    runId: () => process.env.GITHUB_RUN_ID ?? null,
    readStatus,
    writeStatus,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const outcome = runUpdate(realDeps(), { commit: process.argv.includes('--commit') });
  console.log('\n' + JSON.stringify(outcome));
  if (outcome.status === 'failed') {
    console.error(`Data update FAILED at "${outcome.step}" (${outcome.error}). No game data was committed.`);
    process.exitCode = 1;
  } else if (outcome.status === 'no-changes') console.log('No new games and no schedule changes.');
  else console.log(`${outcome.status === 'committed' ? 'Committed and pushed' : 'Dry run (not committed)'}: ${outcome.message}`);
}
