// Workflow fallback (`if: failure()`): when the run failed BEFORE ci-update could record it (npm ci, checkout,
// setup…), record the failure in data/update-status.json and commit only that file.
// Run with plain Node (no npm packages needed): node --experimental-strip-types scripts/record-failure.ts
// Does nothing if ci-update already recorded this run (same GITHUB_RUN_ID).

import { execSync } from 'node:child_process';
import { nextStatus } from '../src/domain/updateStatus.ts';
import { readStatus, STATUS_FILE, writeStatus } from './lib/status.ts';

const runId = process.env.GITHUB_RUN_ID ?? null;
const prev = readStatus();
if (prev && runId && prev.runId === runId) {
  console.log('This run is already recorded in the status file.');
} else {
  writeStatus(nextStatus(prev, { ok: false, at: new Date().toISOString(), runId, step: 'workflow setup', error: 'failed before the update steps ran (see the Actions log)' }));
  execSync(`git add ${STATUS_FILE} && git commit -m "data: update FAILED at workflow setup" -- ${STATUS_FILE} && git push`, { stdio: 'inherit' });
}
