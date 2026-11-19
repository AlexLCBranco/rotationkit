// Phone (RK-4): Pixel 7, 390 × 844, touch (the `phone` project in playwright.config.ts runs e2e/phone*.spec.ts).
// Every route: no page-level sideways scroll, a full-page screenshot as a test artifact; game first on direct links;
// no scroll trap over the games list; touch replaces hover on the chart and on hover texts.

import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const GAME = '0022500020'; // ATL @ IND, 2025-10-31 (a blowout: its badge carries a hover text)
const ROUTES: [string, string][] = [
  ['games', `/#/game/${GAME}?t=IND&s=2025-26`],
  ['games-compact-list-open', `/#/game/${GAME}?t=IND&s=2025-26`],
  ['by-day', '/#/games?view=day&date=2025-11-10&s=2025-26'],
  ['q4', `/#/q4/${GAME}?t=IND&s=2025-26`],
  ['averages', '/#/team/ORL?s=2025-26'],
  ['averages-heat-map', '/#/team/ORL?s=2025-26'],
  ['averages-game-by-game', '/#/team/ORL?s=2025-26'],
  ['averages-matchup', '/#/team/ORL?s=2025-26&w=10&vs=BOS'],
  ['leaders', '/#/leaders?s=2025-26'],
  ['leaders-by-usage', '/#/leaders?s=2025-26&sort=usg'],
  ['averages-with-usage', '/#/team/PHI?s=2025-26'],
  ['full-q4', '/#/fullq4?s=2025-26'],
  ['player', '/#/player/ORL/1631094?s=2025-26'],
  ['player-with-dnp-reasons', '/#/player/IND/1630174?s=2025-26'],
  ['player-two-teams', '/#/player/LAC/201935?s=2025-26'],
  ['team', '/#/team/IND?s=2025-26'],
  ['deep-link', `/?game=${GAME}`],
];

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !m.location().url.includes('cdn.nba.com') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/** Wait until the screen has its data (no "Loading…" left). */
async function settle(page: Page) {
  await expect(page.locator('header.topbar')).toBeVisible();
  await expect(page.getByText('Loading…')).toHaveCount(0, { timeout: 20_000 });
  await page.waitForTimeout(300);
}

for (const [name, url] of ROUTES) {
  test(`phone: ${name} has no page-level horizontal scroll`, async ({ page }, info) => {
    const errors = trackErrors(page);
    await page.goto(url);
    await settle(page);
    if (name === 'games-compact-list-open') {
      await page.getByTestId('list-expand').tap();
      await expect(page.getByTestId('game-list')).toBeVisible();
    }
    if (name === 'averages-heat-map') await page.getByRole('button', { name: 'Heat map' }).tap();
    if (name === 'averages-game-by-game') await page.getByRole('button', { name: 'Game by game' }).tap();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    mkdirSync('screenshots/phone', { recursive: true });
    const path = `screenshots/phone/${name}.png`;
    await page.screenshot({ path, fullPage: true });
    await info.attach(name, { path, contentType: 'image/png' });
    expect(errors).toEqual([]);
  });
}

test('phone: a direct game link shows the game header and the chart on the first screen', async ({ page }) => {
  for (const url of [`/?game=${GAME}`, `/#/game/${GAME}?t=IND&s=2025-26`]) {
    await page.goto(url);
    await expect(page.getByTestId('game-head')).toBeVisible();
    expect(await page.evaluate(() => scrollY)).toBe(0);
    const head = (await page.getByTestId('game-head').boundingBox())!;
    expect(head.y + head.height).toBeLessThanOrEqual(844);
    const chart = (await page.getByTestId('game-chart').boundingBox())!;
    expect(chart.y).toBeLessThan(844);
    // The list is folded behind "☰ Games (N)"; no drag-to-resize on phones.
    await expect(page.getByTestId('game-list')).toHaveCount(0);
    await expect(page.getByTestId('list-expand')).toContainText('Games (');
  }
});

test('phone: the games list has no scroll box of its own; a swipe over it scrolls the page; picking a game folds it', async ({ page }) => {
  await page.goto(`/#/game/${GAME}?t=IND&s=2025-26`);
  await settle(page);
  await page.getByTestId('list-expand').tap();
  const rows = page.getByTestId('game-list-rows');
  await expect(rows).toBeVisible();
  await expect(page.getByTestId('list-resize')).toHaveCount(0);
  expect(await rows.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  // Badges never cut: every chip fits inside its cell.
  const clipped = await page.locator('[data-testid=list-row] .gl-tags').evaluateAll((tds) =>
    tds.filter((td) => [...td.querySelectorAll('.chip-tag, .chip-tif, .badge')].some((c) => c.getBoundingClientRect().right > td.getBoundingClientRect().right + 0.5 || c.scrollWidth > c.clientWidth + 1)).length,
  );
  expect(clipped).toBe(0);
  // A touch swipe that starts on the list moves the page.
  const box = (await rows.boundingBox())!;
  const before = await page.evaluate(() => scrollY);
  const x = box.x + box.width / 2;
  expect(box.y).toBeLessThan(700);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', y: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', 700);
  for (let i = 1; i <= 10; i++) await touch('touchMove', 700 - i * 40);
  await touch('touchEnd', 0);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 100);
  // Pick another game: it opens and the list folds away again.
  const other = page.getByTestId('list-row').nth(2);
  const id = await other.getAttribute('data-id');
  await other.locator('.gl-result').tap();
  await expect(page).toHaveURL(new RegExp(`#/game/${id}`));
  await expect(page.getByTestId('game-list')).toHaveCount(0);
});

test('phone: tapping the chart shows the lineup for that moment; a tap outside closes it; the clock handle drags', async ({ page }) => {
  await page.goto(`/#/game/${GAME}?t=IND&s=2025-26`);
  await settle(page);
  const row = page.getByTestId('gc-player-row').first();
  const track = row.locator('.gc-track');
  await track.scrollIntoViewIfNeeded();
  const tb = (await track.boundingBox())!;
  await page.touchscreen.tap(tb.x + 230, tb.y + tb.height - 8);
  const tip = page.getByTestId('chart-tip');
  await expect(tip).toBeVisible();
  await expect(tip).toHaveAttribute('data-player', (await row.getAttribute('data-player'))!);
  await expect(tip.locator('.rd-lineup, [data-testid=readout-lineup]').first()).toBeVisible();
  const cursor = page.getByTestId('cursor-line');
  await expect(cursor).toBeVisible();
  const c0 = (await cursor.boundingBox())!.x;
  // Tap somewhere else on the chart: the cursor and the readout follow that moment.
  await page.touchscreen.tap(tb.x + 320, tb.y + tb.height - 8);
  await expect.poll(async () => (await cursor.boundingBox())!.x).toBeGreaterThan(c0 + 50);
  await expect(tip).toBeVisible();
  // Tap outside the chart: the readout closes (the pinned cursor stays).
  await page.getByTestId('game-head').tap();
  await expect(tip).toHaveCount(0);
  await expect(cursor).toBeVisible();
  // Drag the clock handle with a finger: the cursor moves.
  const handle = cursor.locator('.gc-cursor-handle');
  const hb = (await handle.boundingBox())!;
  const x0 = (await cursor.boundingBox())!.x;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: hb.y + hb.height / 2 }] });
  await touch('touchStart', hb.x + hb.width / 2);
  for (let i = 1; i <= 6; i++) await touch('touchMove', hb.x + hb.width / 2 + i * 10);
  await touch('touchEnd', 0);
  await expect.poll(async () => (await cursor.boundingBox())!.x).toBeGreaterThan(x0 + 20);
});

test('phone: a hover text opens on tap and closes on a tap outside (shared pattern)', async ({ page }) => {
  await page.goto(`/#/game/${GAME}?t=IND&s=2025-26`);
  await settle(page);
  const badge = page.getByTestId('game-head').locator('.badge[title]').first();
  const text = (await badge.getAttribute('title'))!;
  await badge.tap();
  const tip = page.getByTestId('tap-tip');
  await expect(tip).toHaveText(text);
  // Inside the screen.
  const b = (await tip.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(390);
  await page.getByTestId('game-count').tap();
  await expect(tip).toHaveCount(0);
  // A foul tick in the chart opens its own text the same way.
  const tick = page.getByTestId('foul-tick').first();
  await tick.scrollIntoViewIfNeeded();
  await tick.tap();
  await expect(page.getByTestId('chart-tip')).toContainText('foul #');
  await page.getByTestId('game-count').tap();
  await expect(page.getByTestId('chart-tip')).toHaveCount(0);
});

test('phone: the roster folds into a "Roster" toggle above the chart; it opens and closes, no sideways scroll', async ({ page }) => {
  await page.goto('/#/player/IND/1630174?s=2025-26');
  await settle(page);
  const toggle = page.getByTestId('roster-toggle');
  await expect(toggle).toContainText('Roster');
  await expect(page.getByTestId('roster-body')).toHaveCount(0);
  const tb = (await toggle.boundingBox())!;
  const grid = (await page.getByTestId('player-grid').boundingBox())!;
  expect(tb.y).toBeLessThan(grid.y);
  await toggle.tap();
  await expect(page.getByTestId('roster-body')).toBeVisible();
  await expect(page.getByTestId('roster-player').first()).toBeVisible();
  await expect(page.locator('[data-testid=roster-player][aria-current=true]')).toHaveAttribute('data-player', '1630174');
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await toggle.tap();
  await expect(page.getByTestId('roster-body')).toHaveCount(0);
});
