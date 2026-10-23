// Daily data update (run by .github/workflows/data-update.yml, also runnable locally).
//   fetch-season --cdn-only --strict → normalize → validate-all → tests → commit + push (only with --commit)
// Commits when there are new finished games OR the schedule changed (fetch-season downloads the feed every run).
// Any failing step stops the run with a non-zero exit, before anything is committed.
// Usage: npx tsx scripts/ci-update.ts [--commit]

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { commitMessage, dataSeasons, newGamesSummary, readIndex, readSchedule, scheduleChanges, scheduleCommitMessage } from './lib/data.ts';
import type { GameIndexEntry, ScheduleEntry } from '../src/domain/types.ts';

export const STEPS = [
  'npm run fetch-season -- --cdn-only --strict',
  'npm run normalize',
  'npm run validate-all',
  'npm test',
] as const;

export interface Deps {
  /** Run a shell command; throw if it fails. */
  run: (cmd: string) => void;
  /** Read all committed game indexes (all seasons). */
  indexes: () => GameIndexEntry[];
  /** Read all committed schedules (all seasons). The feed is downloaded and schedule.json rewritten every run. */
  schedules: () => ScheduleEntry[];
  log: (msg: string) => void;
}

export type Outcome = { status: 'failed'; step: string; error: string } | { status: 'no-changes' } | { status: 'committed' | 'dry-run'; message: string };

export function runUpdate(deps: Deps, opts: { commit: boolean }): Outcome {
  const before = deps.indexes();
  const schedBefore = deps.schedules();
  for (const step of STEPS) {
    deps.log(`\n▶ ${step}`);
    try {
      deps.run(step);
    } catch (e) {
      // Leave the working tree as it is; nothing is staged or committed.
      return { status: 'failed', step, error: (e as Error).message };
    }
  }
  const summary = newGamesSummary(before, deps.indexes());
  // A schedule change alone (postponed / rescheduled game) is committed too, so B2B / 3-in-4 tags fix themselves.
  const changed = scheduleChanges(schedBefore, deps.schedules());
  if (summary.n === 0 && changed === 0) return { status: 'no-changes' };
  const message = summary.n > 0 ? commitMessage(summary) : scheduleCommitMessage(changed);
  if (!opts.commit) return { status: 'dry-run', message };
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
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const outcome = runUpdate(realDeps(), { commit: process.argv.includes('--commit') });
  console.log('\n' + JSON.stringify(outcome));
  if (outcome.status === 'failed') {
    console.error(`Data update FAILED at "${outcome.step}" (${outcome.error}). Nothing was committed.`);
    process.exitCode = 1;
  } else if (outcome.status === 'no-changes') console.log('No new games and no schedule changes; nothing to commit.');
  else console.log(`${outcome.status === 'committed' ? 'Committed and pushed' : 'Dry run (not committed)'}: ${outcome.message}`);
}
