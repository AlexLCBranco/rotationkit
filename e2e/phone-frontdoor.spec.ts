// RK-9 … RK-16 on a phone (Pixel 7, 390 × 844): first visit, "How to read this", the footer, "?" links by tap,
// "Report a problem", the schedule pop-up's game squares, the site name.

import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { CURRENT, FOOTER_NOTICE, index, noSidewaysScroll, PLACES, settle, trackErrors } from './helpers.ts';
import { HELP_SECTIONS } from '../src/app/help.ts';
import { SITE_NAME } from '../src/app/site.ts';

test('phone: a first visit opens By day; a remembered team opens its latest game', async ({ page, context }) => {
  await page.goto('/');
  await settle(page);
  await expect(page.getByTestId('tab-day')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('dv-side').first()).toBeVisible();
  await noSidewaysScroll(page, 'first visit');
  const p2 = await context.newPage();
  await p2.addInitScript(() => localStorage.setItem('rk.team', 'ORL'));
  await p2.goto('/');
  const orl = index(CURRENT).filter((e) => e.home === 'ORL' || e.away === 'ORL').at(-1)!;
  await expect(p2).toHaveURL(new RegExp(`#/game/${orl.id}\\?.*t=ORL`));
});

test('phone: "How to read this" — every part, no sideways scroll, screenshot; its tab label fits', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.goto('/#/leaders?s=2025-26');
  await settle(page);
  await page.getByTestId('tab-help').tap();
  await expect(page.locator('h1')).toHaveText('How to read this');
  await expect(page).toHaveTitle(`How to read this | ${SITE_NAME}`);
  await expect(page.getByTestId('help-section')).toHaveCount(HELP_SECTIONS.length);
  await expect(page.getByTestId('help-example-bar')).toBeVisible();
  await noSidewaysScroll(page, 'help');
  // the fifth place: whole label visible inside its tab, tabs do not overlap
  const boxes = await page.getByTestId('where-tabs').getByRole('button').evaluateAll((els) => els.map((e) => [e.getBoundingClientRect().left, e.getBoundingClientRect().right, e.scrollWidth - e.clientWidth, e.scrollHeight - e.clientHeight]));
  expect(boxes).toHaveLength(5);
  for (let i = 0; i < boxes.length; i++) {
    expect(boxes[i]![2], `tab ${i} clipped sideways`).toBeLessThanOrEqual(0);
    expect(boxes[i]![3], `tab ${i} clipped`).toBeLessThanOrEqual(0);
    if (i) expect(boxes[i]![0]!).toBeGreaterThanOrEqual(boxes[i - 1]![1]! - 0.5);
  }
  expect(boxes[boxes.length - 1]![1]!).toBeLessThanOrEqual(390.5);
  mkdirSync('screenshots/phone', { recursive: true });
  await page.screenshot({ path: `screenshots/phone/help-${info.project.name}.png`, fullPage: true });
  // the list of parts at the top jumps to a part
  await page.getByTestId('help-toc').getByText('USG%').tap();
  await expect(page.locator('[data-testid=help-section][data-section=usg] h2')).toBeInViewport();
  expect(errors).toEqual([]);
});

test('phone: a "?" opens the page at its part by tap; it is big enough to tap', async ({ page }) => {
  for (const [url, s] of [['/#/game/0022500020?t=IND&s=2025-26', 'garbage'], ['/#/team/ORL?s=2025-26', 'usg'], ['/#/fullq4?s=2025-26', 'fullq4']] as const) {
    await page.goto(url);
    await settle(page);
    const link = page.locator(`[data-testid=help-link][data-section=${s}]`).first();
    await link.scrollIntoViewIfNeeded();
    const box = (await link.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(20);
    await link.tap();
    await expect(page).toHaveURL(new RegExp(`#/help\\?.*sec=${s}`));
    await expect(page.locator(`[data-testid=help-section][data-section=${s}] h2`)).toBeInViewport();
    await noSidewaysScroll(page, `help at ${s}`);
  }
});

test('phone: the footer on every place, no sideways scroll', async ({ page }, info) => {
  for (const [name, url] of PLACES) {
    await page.goto(url);
    await settle(page);
    const f = page.getByTestId('footer');
    await expect(page.getByTestId('footer-notice'), name).toHaveText(FOOTER_NOTICE);
    await f.scrollIntoViewIfNeeded();
    await expect(page.getByTestId('footer-help'), name).toBeVisible();
    await expect(f.getByTestId('report-link'), name).toBeVisible();
    await noSidewaysScroll(page, name);
    const [right, w] = await f.evaluate((el) => [el.getBoundingClientRect().right, innerWidth]);
    expect(right, name).toBeLessThanOrEqual(w + 0.5);
  }
  await page.screenshot({ path: `screenshots/phone/footer-${info.project.name}.png` });
});

test('phone: "Report a problem" carries the page address; absent without a form', async ({ page, context }) => {
  await page.addInitScript(() => ((window as unknown as { __RK_REPORT_FORM__: string }).__RK_REPORT_FORM__ = 'https://forms.test/f1'));
  await context.route(/forms\.test/, (r) => r.fulfill({ contentType: 'text/html', body: '<title>form</title>' }));
  await page.goto('/#/team/ORL?s=2025-26');
  await settle(page);
  const link = page.getByTestId('footer').getByTestId('report-link');
  await link.scrollIntoViewIfNeeded();
  const [popup] = await Promise.all([context.waitForEvent('page'), link.tap()]);
  await popup.waitForURL(/forms\.test/);
  expect(popup.url()).toBe(`https://forms.test/f1?page=${encodeURIComponent(page.url())}`);
  const p2 = await context.newPage();
  await p2.addInitScript(() => ((window as unknown as { __RK_REPORT_FORM__: string }).__RK_REPORT_FORM__ = ''));
  await p2.goto('/#/team/ORL?s=2025-26');
  await settle(p2);
  await expect(p2.getByTestId('footer')).toBeVisible();
  await expect(p2.getByTestId('report-link')).toHaveCount(0);
});

test('phone: schedule pop-up — a played game\'s square opens that game here; no hoopsjunkie link anywhere', async ({ page }) => {
  const ORL = index('2025-26').filter((e) => e.home === 'ORL' || e.away === 'ORL');
  await page.goto(`/#/game/${ORL.at(-1)!.id}?t=ORL&s=2025-26`);
  await settle(page);
  // a game of ORL with a 3-in-4 tag in its header
  let chip = page.locator('[data-testid=header-tags][data-team=ORL] [data-testid=tag-3in4]');
  for (const e of [...ORL].reverse()) {
    if (await chip.count()) break;
    await page.goto(`/#/game/${e.id}?t=ORL&s=2025-26`);
    await settle(page);
    chip = page.locator('[data-testid=header-tags][data-team=ORL] [data-testid=tag-3in4]');
  }
  const here = /game\/(\d+)/.exec(new URL(page.url()).hash)?.[1] ?? '';
  await chip.tap();
  const pop = page.getByTestId('tif-pop');
  await expect(pop).toBeVisible();
  await expect.poll(() => pop.locator('a[data-testid=tip-game]').count()).toBeGreaterThanOrEqual(3);
  expect(await page.locator('[href*=hoopsjunkie]').count()).toBe(0);
  const other = pop.locator(`a[data-testid=tip-game]:not([data-id="${here}"])`).first();
  const id = await other.getAttribute('data-id');
  await other.tap();
  await expect(page).toHaveURL(new RegExp(`#/game/${id}\\?.*t=ORL`));
  await noSidewaysScroll(page, 'game from the pop-up');
});

test('phone: the site name is "Hoop Rotations" in the tab title; the old name is nowhere on screen', async ({ page }) => {
  for (const [name, url] of PLACES) {
    await page.goto(url);
    await settle(page);
    await expect(page, name).toHaveTitle(new RegExp(SITE_NAME));
    expect((await page.evaluate(() => document.body.innerText)).toLowerCase(), name).not.toContain('rotationkit');
  }
});
