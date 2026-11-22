// RK-13 on a phone: the tag on a postseason game and the "Regular season | Postseason" chip, no sideways scroll.
// Runs on the real postseason games in data/ (2025-26); skipped while there are none.

import { test, expect } from '@playwright/test';
import { index, noSidewaysScroll, settle } from './helpers.ts';

const S = '2025-26';
const all = index(S);
const post = all.filter((e) => /^00[45]/.test(e.id));
const g = post.at(-1);
const TEAM = g?.home ?? '';

test.describe('RK-13 phone', () => {
  test.skip(post.length === 0, 'no postseason games in data/ yet (the backfill adds them)');

  test('phone: a postseason game shows its tag; no sideways scroll', async ({ page }, info) => {
    await page.goto(`/game/${g!.id}?t=${TEAM}`);
    await settle(page);
    await expect(page.locator('h1').getByTestId('kind-tag')).toBeVisible();
    await expect(page.getByTestId('gc-player-row').first()).toBeVisible();
    await noSidewaysScroll(page, 'postseason game');
    await page.screenshot({ path: `screenshots/phone/postseason-game-${info.project.name}.png` });
  });

  test('phone: the chip switches Averages to the postseason and back; no sideways scroll', async ({ page }, info) => {
    const mine = post.filter((e) => e.home === TEAM || e.away === TEAM).length;
    await page.goto(`/team/${TEAM}?s=${S}`);
    await settle(page);
    const chips = page.getByTestId('set-chips');
    await expect(chips).toBeVisible();
    await chips.getByRole('radio', { name: 'Postseason' }).tap();
    await expect(page.getByTestId('selection-label')).toContainText(`based on ${mine} game${mine === 1 ? '' : 's'} · postseason (play-in + playoffs)`);
    await noSidewaysScroll(page, 'averages, postseason');
    await page.screenshot({ path: `screenshots/phone/postseason-averages-${info.project.name}.png` });
    await chips.getByRole('radio', { name: 'Regular season' }).tap();
    await expect(page.getByTestId('selection-label')).toContainText('· regular season');
    for (const url of [`/leaders?s=${S}&gs=post`, `/fullq4?s=${S}&gs=post`]) {
      await page.goto(url);
      await settle(page);
      await expect(page.getByTestId('set-chips').locator('[aria-checked=true]')).toHaveText('Postseason');
      await noSidewaysScroll(page, url);
    }
  });
});
