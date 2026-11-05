import { describe, expect, it } from 'vitest';
import { nextStatus, staleBanner, STALE_AFTER_HOURS, type UpdateStatus } from '../src/domain/updateStatus.ts';

const ok = (at: string): UpdateStatus => ({ lastRun: at, result: 'ok', failingStep: null, error: null, lastSuccess: at, failingSince: null, runId: '1' });
const now = new Date('2026-11-05T15:00:00Z');

describe('stale-data banner', () => {
  it('no banner when the last run succeeded recently (also right at 36 h)', () => {
    expect(staleBanner(ok('2026-11-05T11:02:00Z'), now)).toBeNull();
    expect(staleBanner(ok(new Date(now.getTime() - STALE_AFTER_HOURS * 3_600_000).toISOString()), now)).toBeNull();
  });
  it('no banner before the first recorded run (no status file)', () => {
    expect(staleBanner(null, now)).toBeNull();
  });
  it('banner when the last run failed, even if the last success is recent', () => {
    const s = nextStatus(ok('2026-11-04T11:00:00Z'), { ok: false, at: '2026-11-05T11:00:00Z', step: 'npm test', error: 'exit code 1' });
    expect(staleBanner(s, now)).toEqual({ reason: 'failed', lastSuccess: '2026-11-04T11:00:00Z', since: '2026-11-05T11:00:00Z' });
  });
  it('banner when the last success is older than 36 h without a recorded failure (the job stopped running)', () => {
    expect(staleBanner(ok('2026-11-03T14:59:00Z'), now)).toEqual({ reason: 'stale', lastSuccess: '2026-11-03T14:59:00Z', since: '2026-11-03T14:59:00Z' });
  });
  it('the 12-day outage of Oct 24 – Nov 4 would have shown from the first failed morning', () => {
    let s: UpdateStatus | null = ok('2026-10-23T11:00:00Z');
    for (let d = 24; d <= 31; d++) s = nextStatus(s, { ok: false, at: `2026-10-${d}T11:00:00Z`, step: 'npm run validate-all', error: 'exit code 1' });
    expect(staleBanner(s, new Date('2026-10-24T12:00:00Z'))?.reason).toBe('failed');
    expect(staleBanner(s, new Date('2026-11-01T12:00:00Z'))).toEqual({ reason: 'failed', lastSuccess: '2026-10-23T11:00:00Z', since: '2026-10-24T11:00:00Z' });
    // The first success clears it.
    s = nextStatus(s, { ok: true, at: '2026-11-04T23:59:00Z' });
    expect(staleBanner(s, new Date('2026-11-05T12:00:00Z'))).toBeNull();
    expect(s).toMatchObject({ result: 'ok', failingSince: null, failingStep: null });
  });
  it('no successful run ever and the last run failed', () => {
    const s = nextStatus(null, { ok: false, at: '2026-11-05T11:00:00Z', step: 'workflow setup', error: 'x' });
    expect(staleBanner(s, now)).toEqual({ reason: 'failed', lastSuccess: null, since: '2026-11-05T11:00:00Z' });
  });
});
