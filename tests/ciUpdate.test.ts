// Daily update logic: incremental detection, summary/commit message, gating, no commit on failure.

import { describe, expect, it } from 'vitest';
import { runUpdate, STEPS, type Deps } from '../scripts/ci-update.ts';
import { commitMessage, gamesToFetch, newGamesSummary, unexpectedFailures } from '../scripts/lib/data.ts';
import type { GameIndexEntry } from '../src/domain/types.ts';

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

describe('runUpdate', () => {
  function fake(failAt?: string, newGames = 2) {
    const ran: string[] = [];
    let after = false;
    const deps: Deps = {
      run: (cmd) => {
        ran.push(cmd);
        if (cmd === failAt) throw new Error('exit code 1');
        if (cmd.startsWith('npm run normalize')) after = true;
      },
      indexes: () => (after ? [e('1', '2026-10-21'), ...Array.from({ length: newGames }, (_, i) => e(`n${i}`, `2026-10-2${2 + i}`))] : [e('1', '2026-10-21')]),
      log: () => {},
    };
    return { deps, ran };
  }

  it('runs all steps in order, then commits and pushes with the summary message', () => {
    const { deps, ran } = fake();
    expect(runUpdate(deps, { commit: true })).toEqual({ status: 'committed', message: 'data: 2 new games through 2026-10-23' });
    expect(ran).toEqual([...STEPS, "git add data ':!data/*/validation.json'", 'git commit -m "data: 2 new games through 2026-10-23"', 'git push']);
  });

  it.each(STEPS)('a failure at "%s" stops the run: no later step, no git command', (step) => {
    const { deps, ran } = fake(step);
    const out = runUpdate(deps, { commit: true });
    expect(out).toMatchObject({ status: 'failed', step });
    expect(ran.at(-1)).toBe(step);
    expect(ran.some((c) => c.startsWith('git '))).toBe(false);
  });

  it('no new games → no commit', () => {
    const { deps, ran } = fake(undefined, 0);
    expect(runUpdate(deps, { commit: true })).toEqual({ status: 'no-new-games' });
    expect(ran.some((c) => c.startsWith('git '))).toBe(false);
  });

  it('dry run (branch pushes) never commits', () => {
    const { deps, ran } = fake();
    expect(runUpdate(deps, { commit: false })).toMatchObject({ status: 'dry-run' });
    expect(ran.some((c) => c.startsWith('git '))).toBe(false);
  });

  it('validate-all fails on a new (unlisted) data problem → nothing committed', () => {
    const { deps, ran } = fake('npm run validate-all');
    expect(runUpdate(deps, { commit: true }).status).toBe('failed');
    expect(ran).not.toContain('git push');
  });
});
