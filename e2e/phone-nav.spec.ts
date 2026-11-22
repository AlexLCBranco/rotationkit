// RK-8 on the phone (Pixel 7, 390 × 844; NAV_PATTERN.md §4 and §6): the header fits, every place is visible with
// its label under its icon (no hamburger), the breadcrumb shows its last two parts, search is an icon button; no
// page-level sideways scroll; the header stays at the top while scrolling; places and chips work by tap.
// Screenshots → screenshots/phone/nav-*.png.

import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const PAGES: [string, string][] = [
  ['games', '/#/game/0022500020?t=IND&s=2025-26'],
  ['q4', '/#/q4/0022500020?t=IND&s=2025-26'],
  ['by-day', '/#/games?view=day&date=2025-11-10&s=2025-26'],
  ['averages', '/#/team/ORL?s=2025-26'],
  ['player', '/#/player/ORL/1631094?s=2025-26'],
  ['leaders', '/#/leaders?s=2025-26'],
  ['full-q4', '/#/fullq4?s=2025-26'],
  ['help', '/#/help'],
];
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
async function settle(page: Page) {
  await expect(page.getByTestId('header')).toBeVisible();
  await expect(page.getByText(/Loading/)).toHaveCount(0, { timeout: 20_000 });
}

test('phone: the header fits at 390 px with every place visible, nothing in a hamburger; pinned while scrolling', async ({ page }, info) => {
  mkdirSync('screenshots/phone', { recursive: true });
  const heights = new Set<number>();
  for (const [name, url] of PAGES) {
    await page.goto(url);
    await settle(page);
    const h = page.getByTestId('header');
    const box = (await h.boundingBox())!;
    heights.add(Math.round(box.height));
    // every control inside the header lies inside the screen
    const out = await h.locator('button, a').evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== 'none' && e.getClientRects().length && (e.getBoundingClientRect().right > innerWidth + 0.5 || e.getBoundingClientRect().left < -0.5)).length);
    expect(out, name).toBe(0);
    const tabs = h.getByTestId('where-tabs').getByRole('button');
    await expect(tabs).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      await expect(tabs.nth(i)).toBeVisible();
      // label under the icon
      const [icon, label] = [(await tabs.nth(i).locator('svg').boundingBox())!, (await tabs.nth(i).locator('.rk-where-label').boundingBox())!];
      expect(label.y).toBeGreaterThan(icon.y + icon.height - 1);
    }
    await expect(h.getByTestId('go-anywhere')).toBeVisible();
    expect((await h.getByTestId('go-anywhere').boundingBox())!.width).toBeLessThanOrEqual(40);
    // breadcrumb: the last two parts only
    const shown = await h.getByTestId('crumb').evaluateAll((els) => els.filter((e) => getComputedStyle(e).display !== 'none').length);
    expect(shown, name).toBe(Math.min(2, await h.getByTestId('crumb').count()));
    expect(await overflow(page), name).toBeLessThanOrEqual(0);
    const path = `screenshots/phone/nav-${name}.png`;
    await page.screenshot({ path });
    await info.attach(name, { path, contentType: 'image/png' });
    await page.evaluate(() => scrollTo(0, 1200));
    expect((await h.boundingBox())!.y).toBe(0);
    await expect(h).toBeInViewport();
  }
  expect(heights.size).toBe(1);
});

test('phone: places, season chips, the team strip and How work by tap; Go anywhere opens as a full-width dialog', async ({ page }) => {
  await page.goto('/#/game/0022500020?t=IND&s=2025-26');
  await settle(page);
  await page.getByTestId('tab-averages').tap();
  await expect(page).toHaveURL(/#\/team\/IND\?s=2025-26$/);
  await page.getByTestId('season-chips').getByRole('radio', { name: '2026-27' }).tap();
  await expect(page).toHaveURL(/#\/team\/IND\?s=2026-27$/);
  await page.getByTestId('team-picker').locator('[data-value=IND]').scrollIntoViewIfNeeded();
  const strip = page.getByTestId('team-picker');
  expect(await strip.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await strip.locator('[data-value=ATL]').scrollIntoViewIfNeeded();
  await strip.locator('[data-value=ATL]').tap();
  await expect(page).toHaveURL(/#\/team\/ATL\?s=2026-27$/);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.getByTestId('tab-leaders').tap();
  await page.getByTestId('how-fullq4').tap();
  await expect(page).toHaveURL(/#\/fullq4\?s=2026-27/);
  await page.getByTestId('go-anywhere').tap();
  const dialog = page.getByTestId('player-search');
  await expect(dialog).toBeVisible();
  const d = (await dialog.boundingBox())!;
  expect(d.x).toBeGreaterThanOrEqual(0);
  expect(d.x + d.width).toBeLessThanOrEqual(390);
  await page.getByTestId('search-input').fill('bos');
  await page.getByTestId('go-item').first().tap();
  await expect(page).toHaveURL(/#\/game\/\d{10}\?s=2026-27&t=BOS$/);
  // the breadcrumb's parts open their lists inside the screen
  await page.getByTestId('crumb-btn').last().tap();
  const menu = page.getByTestId('crumb-menu');
  await expect(menu).toBeVisible();
  const m = (await menu.boundingBox())!;
  expect(m.x).toBeGreaterThanOrEqual(0);
  expect(m.x + m.width).toBeLessThanOrEqual(390);
});
