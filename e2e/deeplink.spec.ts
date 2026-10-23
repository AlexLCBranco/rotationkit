// <BASE_URL>/?game=<NBA gameId> deep links.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Entry = { id: string; date: string; home: string; away: string; status: string };
const schedule = JSON.parse(readFileSync('data/2026-27/schedule.json', 'utf8')) as Entry[];
const played = new Set((JSON.parse(readFileSync('data/2026-27/index.json', 'utf8')) as { id: string }[]).map((g) => g.id));
// A real future regular-season game with both teams known.
const future = schedule.find((e) => e.status === 'scheduled' && e.id.startsWith('002') && e.home && e.away && !played.has(e.id))!;

function trackErrors(page: Page) {
  const errors: string[] = [];
  // Headshots/logos come from cdn.nba.com and degrade to initials when they fail; their load errors don't count.
  page.on('console', (m) => m.type() === 'error' && !m.location().url.includes('cdn.nba.com') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('?game=<finished game with data> opens that game chart', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?game=0022600001');
  await expect(page.locator('h1')).toContainText('BOS 113 @ DET 121');
  await expect(page.getByTestId('game-team')).toHaveCount(2);
  await expect(page).toHaveURL(/\/#\/game\/0022600001/);
  expect(new URL(page.url()).search).toBe('');
  expect(errors).toEqual([]);
});

test('?game=<2025-26 flagged game> opens the chart with its data note', async ({ page }) => {
  await page.goto('/?game=0022500093');
  await expect(page.getByTestId('quality-warning')).toBeVisible();
});

test('?game=<future game> shows the not-available message with matchup and date', async ({ page }) => {
  const errors = trackErrors(page);
  expect(future, 'a scheduled game exists in data/2026-27/schedule.json').toBeTruthy();
  await page.goto(`/?game=${future.id}`);
  await expect(page.getByTestId('deeplink-unavailable')).toContainText('Rotation data not available for this game yet');
  await expect(page.getByTestId('deeplink-matchup')).toContainText('@');
  await expect(page.getByTestId('deeplink-matchup')).toContainText(future.date.slice(0, 4));
  await expect(page.getByTestId('deeplink-matchup')).toContainText('has not been played yet');
  expect(errors).toEqual([]);
});

for (const bad of ['garbage', '0022699999', '12345', '0099999999', '']) {
  test(`?game=${bad || '(empty)'} shows the not-available message`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(`/?game=${encodeURIComponent(bad)}`);
    await expect(page.getByTestId('deeplink-unavailable')).toContainText('Rotation data not available for this game yet');
    await expect(page.getByRole('link', { name: 'Open rotationkit' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('?game=<unknown 2025-26 id> shows the message without console errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?game=0022599999');
  await expect(page.getByTestId('deeplink-unavailable')).toContainText('No game 0022599999');
  expect(errors).toEqual([]);
});
