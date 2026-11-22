// RK-14 on a phone: path addresses load the right view, old hash links land on them, back / forward work.

import { test, expect } from '@playwright/test';
import { index, noSidewaysScroll, settle } from './helpers.ts';
import { SITE_NAME } from '../src/app/site.ts';

const e = index('2025-26').find((x) => x.id === '0022500020')!;

test('phone: a game, a player and a team open from their own address; no sideways scroll', async ({ page }) => {
  await page.goto('/game/0022500020?t=IND&s=2025-26');
  await settle(page);
  await expect(page.locator('h1')).toContainText(`ATL ${e.as} @ IND ${e.hs}`);
  await expect(page).toHaveTitle(`ATL ${e.as}, IND ${e.hs} · Oct 31, 2025 · rotations | ${SITE_NAME}`);
  await noSidewaysScroll(page, 'game');
  await page.goto('/player/ORL/1631094?s=2025-26');
  await settle(page);
  await expect(page.getByTestId('player-bar')).toContainText('Banchero');
  await noSidewaysScroll(page, 'player');
  await page.goto('/team/ORL?s=2025-26');
  await settle(page);
  await expect(page.getByTestId('team-picker')).toHaveAttribute('data-team', 'ORL');
  await noSidewaysScroll(page, 'team');
});

test('phone: old hash and ?game= links land on the new address', async ({ page }) => {
  await page.goto('/#/game/0022500020?t=IND&s=2025-26');
  await settle(page);
  await expect(page).toHaveURL(/\/game\/0022500020\?s=2025-26&t=IND$/);
  await expect(page.locator('h1')).toContainText(`ATL ${e.as} @ IND ${e.hs}`);
  await page.goto('/?game=0022500020');
  await settle(page);
  await expect(page).toHaveURL(/\/game\/0022500020\?s=2025-26/);
  await page.goto('/#/team/ORL?s=2025-26&w=5');
  await expect(page).toHaveURL(/\/team\/ORL\?s=2025-26&w=5$/);
});

test('phone: taps move without loading a page; back and forward keep the view', async ({ page }) => {
  await page.goto('/team/ORL?s=2025-26');
  await settle(page);
  await page.evaluate(() => ((window as unknown as { __same: boolean }).__same = true));
  await page.getByTestId('tab-leaders').tap();
  await expect(page).toHaveURL(/\/leaders\?/);
  await page.getByTestId('tab-day').tap();
  await expect(page).toHaveURL(/\/games\?view=day/);
  expect(await page.evaluate(() => (window as unknown as { __same?: boolean }).__same)).toBe(true);
  await page.goBack();
  await expect(page).toHaveURL(/\/leaders\?/);
  await expect(page.getByTestId('tab-leaders')).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(page).toHaveURL(/\/team\/ORL\?s=2025-26$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/leaders\?/);
});
