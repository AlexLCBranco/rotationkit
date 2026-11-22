// Data update (run by .github/workflows/data-update.yml, also runnable locally).
//   probe-cdn → fetch-season --cdn-only --strict → normalize → validate-all → tests → commit + push (only with --commit)
// Two kinds of run (RK-12):
//   - the 11:00 UTC run (and a manual run): every step, always. It also downloads again the games added since the
//     previous 11:00 run (data/update-status.json `pending`), so late box-score / play-by-play corrections are
//     picked up; a game the re-fetch changed is committed. It records its outcome even when nothing changed
//     (the app's stale banner counts from the last recorded success).
//   - an hourly run (--hourly, 01:00–08:00 UTC): when the fetch found no new finished game and the schedule did not
//     change, it stops right after normalize and commits NOTHING (no deploy). With new games it does every step and
//     commits like the 11:00 run, adding their ids to `pending`.
// The test step runs the fixtures and every unit test, but the whole-season sweeps (WHOLE_DATA_TIMEOUT suites) only
// over the games this run added or re-fetched (RK_TEST_GAMES, see tests/data.ts); the full sweeps run on every push
// to main (Checks workflow).
// With --commit a failing step stops the run with a non-zero exit and ONLY the status file is committed (no game data).
// Usage: npx tsx scripts/ci-update.ts [--commit] [--hourly]

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  commitMessage, correctedCommitMessage, dataSeasons, modifiedGameIds, newGamesSummary, readIndex, readSchedule, scheduleChanges, scheduleCommitMessage,
} from './lib/data.ts';
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
type Step = (typeof STEPS)[number];

/** The shell command of a step: the test step gets the ids of the games this run added or re-fetched; the fetch
 * step the ids to download again. */
export function stepCommand(step: Step, newIds: string[], refetch: string[] = []): string {
  if (step === 'npm test') return `RK_TEST_GAMES=${[...newIds, ...refetch].join(',')} npm test`;
  if (step === 'npm run fetch-season -- --cdn-only --strict' && refetch.length) return `${step} --refetch ${refetch.join(',')}`;
  return step;
}

export interface Deps {
  /** Run a shell command; throw if it fails. */
  run: (cmd: string) => void;
  /** Read all committed game indexes (all seasons). */
  indexes: () => GameIndexEntry[];
  /** Read all committed schedules (all seasons). The feed is downloaded and schedule.json rewritten every run. */
  schedules: () => ScheduleEntry[];
  /** Ids of already-committed game files that this run changed (git). */
  changedGames: () => string[];
  log: (msg: string) => void;
  /** Current time (ISO) and the GitHub Actions run id, for the status file. */
  now: () => string;
  runId: () => string | null;
  readStatus: () => UpdateStatus | null;
  writeStatus: (s: UpdateStatus) => void;
}

export type Outcome = { status: 'failed'; step: string; error: string } | { status: 'no-changes' } | { status: 'committed' | 'dry-run'; message: string };

export function runUpdate(deps: Deps, opts: { commit: boolean; hourly?: boolean }): Outcome {
  const before = deps.indexes();
  const schedBefore = deps.schedules();
  const prev = deps.readStatus();
  const pendingBefore = prev?.pending ?? [];
  // Only the 11:00 run downloads games again.
  const refetch = opts.hourly ? [] : [...pendingBefore];
  const record = (r: { ok: true; pending: string[] } | { ok: false; step: string; error: string }) =>
    deps.writeStatus(nextStatus(deps.readStatus(), { ...r, at: deps.now(), runId: deps.runId() }));
  const had = new Set(before.map((g) => g.id));
  const added = () => deps.indexes().filter((g) => !had.has(g.id)).map((g) => g.id);
  const commitStatus = (message: string) => {
    deps.run(`git add ${STATUS_FILE}`);
    deps.run(`git commit -m "${message}" -- ${STATUS_FILE}`);
    deps.run('git push');
  };
  for (const step of STEPS) {
    deps.log(`\n▶ ${step}`);
    try {
      // After normalize the index holds this run's new games; only the test step needs them.
      deps.run(stepCommand(step, step === 'npm test' ? added() : [], refetch));
    } catch (e) {
      const error = (e as Error).message;
      // Nothing of this run's data is staged or committed; only the failure is recorded, so the site learns of it.
      if (opts.commit) {
        record({ ok: false, step, error });
        try {
          commitStatus(`data: update FAILED at ${step.replace(/"/g, "'")}`);
        } catch (e2) {
          deps.log(`Could not commit the status file: ${(e2 as Error).message}`);
        }
      }
      return { status: 'failed', step, error };
    }
    // An hourly run with nothing new ends here: no validation, no tests, no commit, no deploy.
    if (opts.hourly && step === 'npm run normalize' && added().length === 0 && scheduleChanges(schedBefore, deps.schedules()) === 0) {
      deps.log('Nothing new: no finished game to add and the schedule is unchanged.');
      // Only a recovery is worth a commit: the failure banner must not stay up until 11:00.
      if (opts.commit && prev?.result === 'failed') {
        record({ ok: true, pending: pendingBefore });
        commitStatus('data: update status (ok again, nothing new)');
      }
      return { status: 'no-changes' };
    }
  }
  const summary = newGamesSummary(before, deps.indexes());
  // A schedule change alone (postponed / rescheduled game) is committed too, so B2B / 3-in-4 tags fix themselves.
  const changed = scheduleChanges(schedBefore, deps.schedules());
  // Committed games that the re-fetch changed (a late correction).
  const corrected = deps.changedGames().filter((id) => had.has(id)).length;
  const nothing = summary.n === 0 && changed === 0 && corrected === 0;
  const message =
    summary.n > 0 ? commitMessage(summary) + (corrected ? `, ${corrected} corrected` : '') : corrected ? correctedCommitMessage(corrected) : scheduleCommitMessage(changed);
  if (!opts.commit) return nothing ? { status: 'no-changes' } : { status: 'dry-run', message };
  // The 11:00 run has re-fetched the list: it starts again from this run's own games (they came in after the
  // deadline for today's re-fetch). An hourly run adds its games to the list.
  record({ ok: true, pending: opts.hourly ? [...pendingBefore, ...added()] : added() });
  if (nothing) {
    // Nothing new, but the successful 11:00 run is recorded (otherwise quiet days would look stale).
    commitStatus('data: update status (ok, nothing new)');
    return { status: 'no-changes' };
  }
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
    changedGames: () => modifiedGameIds(spawnSync('git', ['status', '--porcelain', '--', 'data'], { encoding: 'utf8' }).stdout ?? ''),
    log: (m) => console.log(m),
    now: () => new Date().toISOString(),
    runId: () => process.env.GITHUB_RUN_ID ?? null,
    readStatus,
    writeStatus,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const outcome = runUpdate(realDeps(), { commit: process.argv.includes('--commit'), hourly: process.argv.includes('--hourly') });
  console.log('\n' + JSON.stringify(outcome));
  if (outcome.status === 'failed') {
    console.error(`Data update FAILED at "${outcome.step}" (${outcome.error}). No game data was committed.`);
    process.exitCode = 1;
  } else if (outcome.status === 'no-changes') console.log('No new games and no schedule changes.');
  else console.log(`${outcome.status === 'committed' ? 'Committed and pushed' : 'Dry run (not committed)'}: ${outcome.message}`);
}
