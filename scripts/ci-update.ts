// Daily data update (run by .github/workflows/data-update.yml, also runnable locally).
//   fetch-season --cdn-only --strict → normalize → validate-all → tests → commit + push (only with --commit)
// Any failing step stops the run with a non-zero exit, before anything is committed.
// Usage: npx tsx scripts/ci-update.ts [--commit]

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { commitMessage, dataSeasons, newGamesSummary, readIndex } from './lib/data.ts';
import type { GameIndexEntry } from '../src/domain/types.ts';

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
  log: (msg: string) => void;
}

export type Outcome = { status: 'failed'; step: string; error: string } | { status: 'no-new-games' } | { status: 'committed' | 'dry-run'; message: string };

export function runUpdate(deps: Deps, opts: { commit: boolean }): Outcome {
  const before = deps.indexes();
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
  if (summary.n === 0) return { status: 'no-new-games' };
  const message = commitMessage(summary);
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
    log: (m) => console.log(m),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const outcome = runUpdate(realDeps(), { commit: process.argv.includes('--commit') });
  console.log('\n' + JSON.stringify(outcome));
  if (outcome.status === 'failed') {
    console.error(`Data update FAILED at "${outcome.step}" (${outcome.error}). Nothing was committed.`);
    process.exitCode = 1;
  } else if (outcome.status === 'no-new-games') console.log('No new games; nothing to commit.');
  else console.log(`${outcome.status === 'committed' ? 'Committed and pushed' : 'Dry run (not committed)'}: ${outcome.message}`);
}
