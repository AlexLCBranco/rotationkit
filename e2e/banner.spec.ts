// Stale-data banner (desktop): driven by data/update-status.json, served here by a route stub.

import { test, expect, type Page } from '@playwright/test';

const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
const serve = (page: Page, body: unknown | null) =>
  page.route('**/data/update-status.json', (r) => (body === null ? r.fulfill({ status: 404, body: '' }) : r.fulfill({ json: body })));

test('no banner when the last run succeeded recently', async ({ page }) => {
  await serve(page, { lastRun: iso(3), result: 'ok', failingStep: null, error: null, lastSuccess: iso(3), failingSince: null, runId: '1' });
  await page.goto('/#/games');
  await expect(page.getByTestId('game-list')).toBeVisible();
  await expect(page.getByTestId('stale-banner')).toHaveCount(0);
});

test('no banner and no error when there is no status file yet', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await serve(page, null);
  await page.goto('/#/games');
  await expect(page.getByTestId('game-list')).toBeVisible();
  await expect(page.getByTestId('stale-banner')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('banner when the last run failed: last update date + failing since, on every tab', async ({ page }) => {
  await serve(page, { lastRun: iso(4), result: 'failed', failingStep: 'npm test', error: 'exit code 1', lastSuccess: '2026-10-23T11:02:00Z', failingSince: '2026-10-24T11:01:00Z', runId: '9' });
  await page.goto('/');
  const b = page.getByTestId('stale-banner');
  await expect(b).toHaveAttribute('data-reason', 'failed');
  await expect(b).toContainText('Data last updated Oct 23, 2026');
  await expect(b).toContainText('update failing since Oct 24, 2026');
  await expect(b).toContainText('“npm test”');
  // At the very top of the page.
  expect((await b.boundingBox())!.y).toBeLessThan(2);
  await page.getByTestId('tab-averages').click();
  await expect(page.getByTestId('stale-banner')).toBeVisible();
});

test('banner when the last success is older than 36 hours', async ({ page }) => {
  await serve(page, { lastRun: iso(40), result: 'ok', failingStep: null, error: null, lastSuccess: iso(40), failingSince: null, runId: '1' });
  await page.goto('/');
  await expect(page.getByTestId('stale-banner')).toHaveAttribute('data-reason', 'stale');
  await expect(page.getByTestId('stale-banner')).toContainText('no successful update since then');
});
