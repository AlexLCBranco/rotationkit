// #/player?name=<full name>: links from other apps (statmuse-builder) that only know the player's name.

import { test, expect, type Page } from '@playwright/test';

function trackErrors(page: Page) {
  const errors: string[] = [];
  // Headshots/logos come from cdn.nba.com and degrade to initials when they fail; their load errors don't count.
  page.on('console', (m) => m.type() === 'error' && !m.location().url.includes('cdn.nba.com') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('name without accents opens his page, URL replaced by #/player/<TEAM>/<id>, Back does not loop', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#/fullq4');
  await expect(page.locator('header').first()).toBeVisible();
  await page.goto(`/#/player?name=${encodeURIComponent('luka doncic')}`);
  await expect(page).toHaveURL(/#\/player\/LAL\/1629029$/);
  await expect(page.getByTestId('player-title')).toContainText('Luka Dončić');
  await expect(page.getByTestId('game-row').first()).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/fullq4$/);
  expect(errors).toEqual([]);
});

test('traded player without his "Jr." → his latest team; season and filters pass through', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`/#/player?name=${encodeURIComponent('Kevin McCullar')}&w=10&v=away`);
  await expect(page).toHaveURL(/#\/player\/TOR\/1641755\?w=10&v=away$/);
  await expect(page.getByTestId('player-title')).toContainText('Kevin McCullar Jr.');
  await page.goto(`/#/player?name=${encodeURIComponent('Kevin McCullar Jr.')}&s=2025-26`);
  await expect(page).toHaveURL(/#\/player\/NYK\/1641755\?s=2025-26$/);
  await expect(page.getByTestId('player-title')).toContainText('Kevin McCullar Jr.');
  expect(errors).toEqual([]);
});

test('unknown name shows the message and a link to the main screen', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`/#/player?name=${encodeURIComponent('Nobody Atall')}`);
  const box = page.getByTestId('player-name-unavailable');
  await expect(box).toContainText("No rotation data for 'Nobody Atall'");
  await expect(page).toHaveURL(/#\/player\?name=Nobody/);
  await box.getByRole('link', { name: 'Open rotationkit' }).click();
  await expect(page.getByTestId('game-team').first()).toBeVisible();
  expect(errors).toEqual([]);
});
