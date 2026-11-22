// Data update logic (the 11:00 UTC run and the hourly runs, RK-12): incremental detection, summary/commit message, gating, the status file (success + failure paths).

import { describe, expect, it } from 'vitest';
import { runUpdate, stepCommand, STEPS, type Deps } from '../scripts/ci-update.ts';
import { commitMessage, gamesToFetch, modifiedGameIds, newGamesSummary, refetchSelection, scheduleChanges, unexpectedFailures } from '../scripts/lib/data.ts';
import { checkShape } from '../scripts/lib/cache.ts';
import { finished, parseSchedule, regularSeason } from '../src/shared/nba-schedule/parse.ts';
import { nextStatus } from '../src/domain/updateStatus.ts';
import { scheduleTags } from '../src/domain/scheduleTags.ts';
import type { UpdateStatus } from '../src/domain/updateStatus.ts';
import { readStatus, STATUS_FILE, writeStatus } from '../scripts/lib/status.ts';
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GameIndexEntry, ScheduleEntry } from '../src/domain/types.ts';

const e = (id: string, date: string): GameIndexEntry => ({ id, date, home: 'AAA', away: 'BBB', hs: 100, as: 90, hid: 1, aid: 2, periods: 4 });

describe('incremental detection', () => {
  const schedule = ['0022600001', '0022600002', '0022600003', '0022600004'].map((gameId) => ({ gameId }));
  it('fetches only games that are neither in data/ nor in the raw cache', () => {
    const inData = new Set(['0022600001', '0022600002']);
    expect(gamesToFetch(schedule, inData, () => false).map((g) => g.gameId)).toEqual(['0022600003', '0022600004']);
    expect(gamesToFetch(schedule, inData, (id) => id === '0022600003').map((g) => g.gameId)).toEqual(['0022600004']);
  });
  it('a fresh runner with no cache and everything committed fetches nothing', () => {
    expect(gamesToFetch(schedule, new Set(schedule.map((g) => g.gameId)), () => false)).toEqual([]);
  });
});

describe('summary and commit message', () => {
  it('counts new games and the latest date', () => {
    const s = newGamesSummary([e('1', '2026-10-21')], [e('1', '2026-10-21'), e('2', '2026-10-22'), e('3', '2026-10-23')]);
    expect(s).toEqual({ n: 2, through: '2026-10-23' });
    expect(commitMessage(s)).toBe('data: 2 new games through 2026-10-23');
    expect(commitMessage({ n: 1, through: '2026-10-23' })).toBe('data: 1 new game through 2026-10-23');
  });
});

describe('known issues gate', () => {
  it('only unlisted failing games fail the run', () => {
    expect(unexpectedFailures(['0022500093', '0022500374'], { '0022500093': 'x', '0022500374': 'y' })).toEqual([]);
    expect(unexpectedFailures(['0022600999', '0022500093'], { '0022500093': 'x' })).toEqual(['0022600999']);
  });
});

// Hand-made schedule: AAA plays Nov 1, Nov 2 (B2B), Nov 5.
const SCHED: ScheduleEntry[] = [
  { id: '0022600001', date: '2026-11-01', home: 'AAA', away: 'BBB', status: 'final' },
  { id: '0022600002', date: '2026-11-02', home: 'CCC', away: 'AAA', status: 'scheduled' },
  { id: '0022600003', date: '2026-11-05', home: 'AAA', away: 'DDD', status: 'scheduled' },
];
// Game 2 is postponed to Nov 4 (no new finished game that day).
const MOVED = SCHED.map((g) => (g.id === '0022600002' ? { ...g, date: '2026-11-04' } : g));

describe('schedule changes', () => {
  it('counts added, removed and changed entries', () => {
    expect(scheduleChanges(SCHED, SCHED)).toBe(0);
    expect(scheduleChanges(SCHED, MOVED)).toBe(1);
    expect(scheduleChanges(SCHED, SCHED.slice(1))).toBe(1);
    expect(scheduleChanges(SCHED.slice(1), SCHED)).toBe(1);
    expect(scheduleChanges(SCHED, SCHED.map((g) => ({ ...g, status: 'final' as const })))).toBe(2);
  });
  it('the moved game fixes its tags: no more B2B, Nov 4–5 becomes one', () => {
    const before = scheduleTags(SCHED, 'AAA');
    const after = scheduleTags(MOVED, 'AAA');
    expect([before.get('0022600001')!.b2b1, before.get('0022600002')!.b2b2]).toEqual([true, true]);
    expect([after.get('0022600001')!.b2b1, after.get('0022600002')!.b2b2, after.get('0022600002')!.b2b1, after.get('0022600003')!.b2b2]).toEqual([false, false, true, true]);
  });
});

describe('runUpdate', () => {
  const NOW = '2026-11-05T11:03:00.000Z';
  function fake(failAt?: string, newGames = 2, schedAfter: ScheduleEntry[] = SCHED, prev: UpdateStatus | null = null, changed: string[] = []) {
    const ran: string[] = [];
    let after = false;
    const written: UpdateStatus[] = [];
    let status = prev;
    const deps: Deps = {
      run: (cmd) => {
        ran.push(cmd);
        if (failAt && (cmd === failAt || cmd.endsWith(` ${failAt}`))) throw new Error('exit code 1');
        if (cmd.startsWith('npm run normalize')) after = true;
      },
      schedules: () => (after ? schedAfter : SCHED),
      changedGames: () => (after ? changed : []),
      indexes: () => (after ? [e('1', '2026-10-21'), ...Array.from({ length: newGames }, (_, i) => e(`n${i}`, `2026-10-2${2 + i}`))] : [e('1', '2026-10-21')]),
      log: () => {},
      now: () => NOW,
      runId: () => '42',
      readStatus: () => status,
      writeStatus: (st) => {
        written.push(st);
        status = st;
      },
    };
    return { deps, ran, written };
  }
  const gitCmds = (ran: string[]) => ran.filter((c) => c.startsWith('git '));
  /** The commands of the steps when this run added games n0 and n1 (the fake's default). */
  const CMDS = STEPS.map((s) => stepCommand(s, ['n0', 'n1']));
  const OK = { lastRun: NOW, result: 'ok', failingStep: null, error: null, lastSuccess: NOW, failingSince: null, runId: '42' };

  it('the CDN probe is the first step (a blocked CDN is recorded like any failure)', () => {
    expect(STEPS[0]).toBe('npx tsx scripts/probe-cdn.ts');
  });

  it('success with new games: all steps, status "ok" written, then data (incl. the status file) committed and pushed', () => {
    const { deps, ran, written } = fake();
    expect(runUpdate(deps, { commit: true })).toEqual({ status: 'committed', message: 'data: 2 new games through 2026-10-23' });
    expect(ran).toEqual([...CMDS, "git add data ':!data/*/validation.json'", 'git commit -m "data: 2 new games through 2026-10-23"', 'git push']);
    expect(written).toEqual([{ ...OK, pending: ['n0', 'n1'] }]);
  });

  it.each(STEPS)('a failure at "%s": no later step; status "failed" written; ONLY the status file is committed', (step) => {
    const prev = { ...OK, lastRun: '2026-11-04T11:02:00.000Z', lastSuccess: '2026-11-04T11:02:00.000Z', runId: '41' };
    const { deps, ran, written } = fake(step, 2, SCHED, prev as UpdateStatus);
    const out = runUpdate(deps, { commit: true });
    expect(out).toMatchObject({ status: 'failed', step });
    expect(ran.filter((c) => !c.startsWith('git '))).toEqual(CMDS.slice(0, STEPS.indexOf(step) + 1));
    expect(written).toEqual([
      { lastRun: NOW, result: 'failed', failingStep: step, error: 'exit code 1', lastSuccess: '2026-11-04T11:02:00.000Z', failingSince: NOW, runId: '42' },
    ]);
    expect(gitCmds(ran)).toEqual([`git add ${STATUS_FILE}`, `git commit -m "data: update FAILED at ${step.replace(/"/g, "'")}" -- ${STATUS_FILE}`, 'git push']);
    expect(gitCmds(ran).some((c) => c.includes("git add data '") || c === 'git add data')).toBe(false);
  });

  it('a failing streak keeps its first failure date', () => {
    const prev = { lastRun: '2026-11-04T11:00:00.000Z', result: 'failed', failingStep: 'npm test', error: 'x', lastSuccess: '2026-10-24T11:00:00.000Z', failingSince: '2026-10-25T11:00:00.000Z', runId: '41' };
    const { deps, written } = fake('npm test', 2, SCHED, prev as UpdateStatus);
    runUpdate(deps, { commit: true });
    expect(written[0]).toMatchObject({ result: 'failed', failingSince: '2026-10-25T11:00:00.000Z', lastSuccess: '2026-10-24T11:00:00.000Z' });
  });

  it('if even the status commit fails, the run still reports the original failure', () => {
    const { deps } = fake('npm test');
    const run = deps.run;
    deps.run = (cmd) => {
      if (cmd === 'git push') throw new Error('push rejected');
      run(cmd);
    };
    expect(runUpdate(deps, { commit: true })).toMatchObject({ status: 'failed', step: 'npm test' });
  });

  it('the test step checks only the games this run added (the whole-season sweeps run on pull requests)', () => {
    expect(CMDS.at(-1)).toBe('RK_TEST_GAMES=n0,n1 npm test');
    expect(CMDS.slice(0, -1)).toEqual(STEPS.slice(0, -1));
    const { deps, ran } = fake(undefined, 0);
    runUpdate(deps, { commit: false });
    expect(ran.at(-1)).toBe('RK_TEST_GAMES= npm test');
  });

  it('no new games and an unchanged schedule → status "ok" committed alone (quiet days are not stale)', () => {
    const { deps, ran, written } = fake(undefined, 0);
    expect(runUpdate(deps, { commit: true })).toEqual({ status: 'no-changes' });
    expect(written).toEqual([OK]);
    expect(gitCmds(ran)).toEqual([`git add ${STATUS_FILE}`, `git commit -m "data: update status (ok, nothing new)" -- ${STATUS_FILE}`, 'git push']);
  });

  it('no new games but a rescheduled game → commits the schedule update', () => {
    const { deps, ran } = fake(undefined, 0, MOVED);
    expect(runUpdate(deps, { commit: true })).toEqual({ status: 'committed', message: 'data: schedule update (1 game changed)' });
    expect(ran.slice(-3)).toEqual(["git add data ':!data/*/validation.json'", 'git commit -m "data: schedule update (1 game changed)"', 'git push']);
  });

  it('new games and schedule changes → the new-games message', () => {
    const { deps } = fake(undefined, 2, MOVED);
    expect(runUpdate(deps, { commit: true })).toMatchObject({ status: 'committed', message: 'data: 2 new games through 2026-10-23' });
  });

  it('dry run (branch pushes) never commits and never writes the status file', () => {
    for (const failAt of [undefined, 'npm test']) {
      const { deps, ran, written } = fake(failAt);
      expect(runUpdate(deps, { commit: false }).status).toBe(failAt ? 'failed' : 'dry-run');
      expect(gitCmds(ran)).toEqual([]);
      expect(written).toEqual([]);
    }
  });
});

// ---------- RK-12: games show up the same night ----------
describe('RK-12: only final games are ever added', () => {
  it('the season list keeps finished regular-season games only (schedule feed fixture)', () => {
    const s = parseSchedule(JSON.parse(readFileSync('src/shared/nba-schedule/fixture.json', 'utf8')));
    const all = regularSeason(s);
    const done = finished(all);
    expect(all.some((g) => g.status !== 'final')).toBe(true); // the fixture has unplayed games…
    expect(done.length).toBeGreaterThan(0);
    expect(done.every((g) => g.gameStatus === 3 && g.status === 'final')).toBe(true); // …and none of them is listed
  });
  it('a box score that is not final is refused, so a live game is never cached or normalized', () => {
    expect(checkShape('boxscore', { game: { gameStatus: 3 } })).toBeUndefined();
    expect(checkShape('boxscore', { game: { gameStatus: 2 } })).toMatch(/expected 3 \(final\)/);
    expect(checkShape('boxscore', { game: { gameStatus: 1 } })).toMatch(/expected 3 \(final\)/);
    expect(checkShape('playbyplay', { game: { actions: [] } })).toBe('playbyplay has no actions');
  });
});

describe('RK-12: hourly runs and the 11:00 re-fetch', () => {
  const NOW = '2026-11-05T03:00:00.000Z';
  const OKP: UpdateStatus = { lastRun: '2026-11-04T11:02:00.000Z', result: 'ok', failingStep: null, error: null, lastSuccess: '2026-11-04T11:02:00.000Z', failingSince: null, runId: '7' };
  function fake(o: { newGames?: number; sched?: ScheduleEntry[]; prev?: UpdateStatus | null; changed?: string[] } = {}) {
    const ran: string[] = [];
    let after = false;
    const written: UpdateStatus[] = [];
    let status = o.prev === undefined ? OKP : o.prev;
    const deps: Deps = {
      run: (cmd) => {
        ran.push(cmd);
        if (cmd.startsWith('npm run normalize')) after = true;
      },
      schedules: () => (after ? (o.sched ?? SCHED) : SCHED),
      indexes: () => (after ? [e('1', '2026-10-21'), ...Array.from({ length: o.newGames ?? 0 }, (_, i) => e(`n${i}`, `2026-10-2${2 + i}`))] : [e('1', '2026-10-21')]),
      changedGames: () => (after ? (o.changed ?? []) : []),
      log: () => {},
      now: () => NOW,
      runId: () => '43',
      readStatus: () => status,
      writeStatus: (st) => {
        written.push(st);
        status = st;
      },
    };
    return { deps, ran, written };
  }
  const git = (ran: string[]) => ran.filter((c) => c.startsWith('git '));

  it('hourly, no new data → stops after normalize: no validation, no tests, NO commit, status file untouched', () => {
    const { deps, ran, written } = fake();
    expect(runUpdate(deps, { commit: true, hourly: true })).toEqual({ status: 'no-changes' });
    expect(ran).toEqual(['npx tsx scripts/probe-cdn.ts', 'npm run fetch-season -- --cdn-only --strict', 'npm run normalize']);
    expect(git(ran)).toEqual([]);
    expect(written).toEqual([]);
  });
  it('hourly, no new data, but the last recorded run had failed → records the recovery (only the status file)', () => {
    const prev = nextStatus(OKP, { ok: false, at: '2026-11-05T02:00:00.000Z', step: 'npm test', error: 'x' });
    const { deps, ran, written } = fake({ prev });
    expect(runUpdate(deps, { commit: true, hourly: true })).toEqual({ status: 'no-changes' });
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ result: 'ok', failingSince: null });
    expect(git(ran)).toEqual([`git add ${STATUS_FILE}`, `git commit -m "data: update status (ok again, nothing new)" -- ${STATUS_FILE}`, 'git push']);
  });
  it('hourly with new games → every step, commit, and their ids join the pending list (never a re-fetch)', () => {
    const { deps, ran, written } = fake({ newGames: 2, prev: { ...OKP, pending: ['p1'] } });
    expect(runUpdate(deps, { commit: true, hourly: true })).toEqual({ status: 'committed', message: 'data: 2 new games through 2026-10-23' });
    expect(ran.slice(0, 5)).toEqual(['npx tsx scripts/probe-cdn.ts', 'npm run fetch-season -- --cdn-only --strict', 'npm run normalize', 'npm run validate-all', 'RK_TEST_GAMES=n0,n1 npm test']);
    expect(written.at(-1)!.pending).toEqual(['p1', 'n0', 'n1']);
  });
  it('hourly, schedule change only → committed (tags fix themselves the same night)', () => {
    const { deps } = fake({ sched: MOVED });
    expect(runUpdate(deps, { commit: true, hourly: true })).toEqual({ status: 'committed', message: 'data: schedule update (1 game changed)' });
  });
  it('11:00 run: re-fetches exactly the pending games, tests them too, then empties the list', () => {
    const { deps, ran, written } = fake({ prev: { ...OKP, pending: ['0022600101', '0022600102'] } });
    expect(runUpdate(deps, { commit: true })).toEqual({ status: 'no-changes' });
    expect(ran[1]).toBe('npm run fetch-season -- --cdn-only --strict --refetch 0022600101,0022600102');
    expect(ran[4]).toBe('RK_TEST_GAMES=0022600101,0022600102 npm test');
    expect(written.at(-1)).not.toHaveProperty('pending');
    // nothing changed, but the 11:00 run is recorded (the stale banner counts from it)
    expect(git(ran)).toEqual([`git add ${STATUS_FILE}`, `git commit -m "data: update status (ok, nothing new)" -- ${STATUS_FILE}`, 'git push']);
  });
  it('11:00 run: a game the re-fetch changed is committed', () => {
    const { deps, ran } = fake({ prev: { ...OKP, pending: ['1'] }, changed: ['1'] });
    expect(runUpdate(deps, { commit: true })).toEqual({ status: 'committed', message: 'data: 1 game corrected (re-fetched)' });
    expect(ran.slice(-3)).toEqual(["git add data ':!data/*/validation.json'", 'git commit -m "data: 1 game corrected (re-fetched)"', 'git push']);
    const both = fake({ prev: { ...OKP, pending: ['1'] }, changed: ['1'], newGames: 1 });
    expect(runUpdate(both.deps, { commit: true })).toMatchObject({ message: 'data: 1 new game through 2026-10-22, 1 corrected' });
    // the 11:00 run's own new game waits for tomorrow's re-fetch
    expect(both.written.at(-1)!.pending).toEqual(['n0']);
  });
  it('a failed 11:00 run keeps the pending list for the next one', () => {
    const { deps, written } = fake({ prev: { ...OKP, pending: ['0022600101'] } });
    const run = deps.run;
    deps.run = (cmd) => {
      if (cmd.startsWith('npm run fetch-season')) throw new Error('exit code 1');
      run(cmd);
    };
    expect(runUpdate(deps, { commit: true })).toMatchObject({ status: 'failed' });
    expect(written.at(-1)).toMatchObject({ result: 'failed', pending: ['0022600101'] });
  });
  it('re-fetch selection: pending games that are finished games of the season, not ones fetched for the first time now', () => {
    const season = ['0022600101', '0022600102', '0022600103'];
    expect(refetchSelection(['0022600102', '0022600101', '0022600102'], season)).toEqual(['0022600101', '0022600102']);
    expect(refetchSelection(['0022600101', '0022500999'], season)).toEqual(['0022600101']); // another season's id is ignored
    expect(refetchSelection(['0022600101', '0022600103'], season, new Set(['0022600103']))).toEqual(['0022600101']);
    expect(refetchSelection([], season)).toEqual([]);
  });
  it('changed game files are read from git status (modified only; new files are new games)', () => {
    const out = [' M data/2026-27/games/0022600101.json', '?? data/2026-27/games/0022600200.json', ' M data/2026-27/index.json', 'M  data/2026-27/games/0022600102.json'].join('\n');
    expect(modifiedGameIds(out)).toEqual(['0022600101', '0022600102']);
  });
  it('the workflow: 11:00 UTC kept, hourly 01:00–08:00 UTC added, one concurrency group, hourly runs flagged', () => {
    const yml = readFileSync('.github/workflows/data-update.yml', 'utf8');
    expect(yml).toContain("- cron: '0 11 * * *'");
    expect(yml).toContain("- cron: '0 1-8 * * *'");
    expect(yml).toMatch(/^name: Data update$/m);
    expect(yml).toMatch(/concurrency:\n  group: data-update\n  cancel-in-progress: false/);
    expect(yml).toContain('github.event.schedule }}" = "0 1-8 * * *"');
    expect(yml).toContain('ci-update.ts --commit --hourly');
  });
});

describe('status file on disk + the workflow fallback (record-failure)', () => {
  it('writes and reads back; a broken file reads as "no status"', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rk-status-'));
    const f = join(dir, 's.json');
    writeStatus(OK_STATUS, f);
    expect(readStatus(f)).toEqual(OK_STATUS);
    writeFileSync(f, '{oops');
    expect(readStatus(f)).toBeNull();
    expect(readStatus(join(dir, 'missing.json'))).toBeNull();
  });

  it('record-failure.ts (plain node, no packages) records a setup failure and commits only the status file', () => {
    // A throwaway git repo with a bare remote, so the script's commit + push really run.
    const dir = mkdtempSync(join(tmpdir(), 'rk-fallback-'));
    const remote = join(dir, 'remote.git');
    const work = join(dir, 'work');
    const sh = (cmd: string, cwd = work) => execSync(cmd, { cwd, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).toString();
    execSync(`git init -q --bare ${remote} && git init -q -b main ${work}`);
    mkdirSync(join(work, 'data'));
    mkdirSync(join(work, 'scripts/lib'), { recursive: true });
    mkdirSync(join(work, 'src/domain'), { recursive: true });
    cpSync('scripts/record-failure.ts', join(work, 'scripts/record-failure.ts'));
    cpSync('scripts/lib/status.ts', join(work, 'scripts/lib/status.ts'));
    cpSync('src/domain/updateStatus.ts', join(work, 'src/domain/updateStatus.ts'));
    writeFileSync(join(work, 'data/update-status.json'), JSON.stringify(OK_STATUS));
    writeFileSync(join(work, 'data/other.json'), '1');
    sh(`git add -A && git commit -qm init && git remote add origin ${remote} && git push -q -u origin main`);
    writeFileSync(join(work, 'data/other.json'), '2'); // a half-done change that must NOT be committed
    const run = (id: string) => sh(`node --experimental-strip-types --no-warnings scripts/record-failure.ts`, work).toString() + id;
    process.env.GITHUB_RUN_ID = '99';
    try {
      run('99');
      const st = JSON.parse(readFileSync(join(work, 'data/update-status.json'), 'utf8'));
      expect(st).toMatchObject({ result: 'failed', failingStep: 'workflow setup', lastSuccess: OK_STATUS.lastSuccess, runId: '99' });
      expect(sh('git show --stat --format=%s HEAD')).toContain('data: update FAILED at workflow setup');
      expect(sh('git show --name-only --format= HEAD').trim()).toBe('data/update-status.json');
      expect(sh('git status --porcelain')).toContain('data/other.json');
      expect(sh('git log --oneline origin/main').split('\n').filter(Boolean)).toHaveLength(2);
      // Same run already recorded (by ci-update) → nothing new.
      run('99');
      expect(sh('git log --oneline').split('\n').filter(Boolean)).toHaveLength(2);
    } finally {
      delete process.env.GITHUB_RUN_ID;
    }
  });
});

const OK_STATUS: UpdateStatus = { lastRun: '2026-11-04T11:02:00.000Z', result: 'ok', failingStep: null, error: null, lastSuccess: '2026-11-04T11:02:00.000Z', failingSince: null, runId: '7' };
