// RK-6: team roster on the player page (desktop). Phone: e2e/phone.spec.ts.

import { test, expect } from '@playwright/test';

const NESMITH = 1630174; // IND
const SIAKAM = 1627783; // IND
const HARDEN = 201935; // LAC → CLE in 2025-26

test('roster panel: the team and its players, the current player highlighted, left of the chart', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/#/player/IND/${NESMITH}?s=2025-26`);
  const panel = page.getByTestId('roster');
  await expect(panel).toHaveAttribute('data-team', 'IND');
  await expect(panel.getByTestId('team-link').first()).toHaveText('Indiana Pacers');
  const players = panel.getByTestId('roster-player');
  await expect.poll(() => players.count()).toBeGreaterThan(10);
  await expect(panel.locator(`[data-testid=roster-player][data-player="${SIAKAM}"]`)).toBeVisible();
  await expect(panel.locator('[aria-current=true]')).toHaveAttribute('data-player', String(NESMITH));
  await expect(panel.locator('[aria-current=true]')).toHaveCount(1);
  // Beside the rows, not above them: the panel's top is above the first game row and it sits to its left.
  const pb = (await panel.boundingBox())!;
  const grid = (await page.getByTestId('player-grid').boundingBox())!;
  expect(pb.x + pb.width).toBeLessThan(grid.x);
  expect(grid.width).toBeGreaterThan(1000); // at 1280 px the chart keeps most of its width
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test('roster panel: a teammate opens his page with the filters kept; the team name opens the team page', async ({ page }) => {
  await page.goto(`/#/player/IND/${NESMITH}?s=2025-26&w=10&v=home&rest=b2b&b=0`);
  const panel = page.getByTestId('roster');
  await expect(panel.locator(`[data-testid=roster-player][data-player="${SIAKAM}"]`)).toBeVisible();
  await panel.locator(`[data-testid=roster-player][data-player="${SIAKAM}"] a`).click();
  await expect(page).toHaveURL(new RegExp(`#/player/IND/${SIAKAM}\\?`));
  const q = new URL(page.url().replace('#', '')).searchParams;
  expect([q.get('s'), q.get('w'), q.get('v'), q.get('rest'), q.get('b')]).toEqual(['2025-26', '10', 'home', 'b2b', '0']);
  await expect(page.getByTestId('player-title')).toContainText('Pascal Siakam');
  await expect(panel.locator('[aria-current=true]')).toHaveAttribute('data-player', String(SIAKAM));
  await panel.getByTestId('team-link').first().click();
  await expect(page).toHaveURL(/#\/team\/IND\?/);
});

test('roster panel: a player with two teams in the season shows his latest team, the other as a link', async ({ page }) => {
  await page.goto(`/#/player/LAC/${HARDEN}?s=2025-26`);
  const panel = page.getByTestId('roster');
  await expect(panel).toHaveAttribute('data-team', 'CLE');
  await expect(panel.locator('[aria-current=true]')).toHaveAttribute('data-player', String(HARDEN));
  await expect(panel.getByTestId('roster-others').getByTestId('team-link')).toHaveAttribute('data-team', 'LAC');
});
