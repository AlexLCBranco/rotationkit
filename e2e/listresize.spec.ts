// RK-2: the Games list panel resizes like the Claude desktop sidebar — drag its right border narrower (never wider than
// the default), remembered across reloads, ↔ / double-click restore the default — and never scrolls sideways.

import { test, expect, type Page } from '@playwright/test';

const MAX = 500;
const MIN = 334;
/** Below this width only date | team | @/vs | opponent | W/L show (badges and rest days hidden). */
const NARROW = 410;

const width = (page: Page) => page.getByTestId('game-list').evaluate((e) => Math.round(e.getBoundingClientRect().width));
const mainWidth = (page: Page) => page.locator('.gv-main').evaluate((e) => Math.round(e.getBoundingClientRect().width));
/** Drag the border by dx px. */
async function drag(page: Page, dx: number) {
  const h = (await page.getByTestId('list-resize').boundingBox())!;
  const x = h.x + h.width / 2;
  const y = h.y + h.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 4 });
  await page.mouse.move(x + dx, y, { steps: 4 });
  await page.mouse.up();
}
/** No horizontal overflow in the list, in the scroller or in any non-badge cell; the rest column is fully visible
 *  (narrow: badges and rest hidden, date / teams / W-L fully visible). */
async function expectFits(page: Page) {
  const narrow = (await width(page)) < NARROW;
  const r = await page.evaluate((narrow) => {
    const box = document.querySelector('[data-testid=game-list-rows]')!;
    const list = document.querySelector('[data-testid=game-list]')!.getBoundingClientRect();
    const clipped = [...document.querySelectorAll('.gl-table td:not(.gl-tags)')].filter((td) => td.scrollWidth > td.clientWidth + 1).map((td) => td.textContent);
    const rest = [...document.querySelectorAll('.gl-table tbody tr td:last-child')].map((td) => td.getBoundingClientRect());
    const hidden = [...document.querySelectorAll('.gl-table tbody tr td:nth-child(n + 6)')].every((td) => getComputedStyle(td).display === 'none');
    const result = [...document.querySelectorAll('[data-testid=list-result]')].map((td) => td.getBoundingClientRect());
    return {
      sw: box.scrollWidth,
      cw: box.clientWidth,
      clipped,
      restIn: narrow ? hidden && result.every((b) => b.right <= list.right + 0.5) : !hidden && rest.every((b) => b.right <= list.right + 0.5 && b.width > 30),
    };
  }, narrow);
  expect(r.sw).toBeLessThanOrEqual(r.cw);
  expect(r.clipped).toEqual([]);
  expect(r.restIn).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#/game/latest?t=HOU&s=2026-27');
  await page.evaluate(() => localStorage.removeItem('rk.listWidth'));
  await page.reload();
  await expect(page.getByTestId('list-row').first()).toBeVisible();
});

test('default width is the maximum; drag narrows it (game view widens), capped at the default and the minimum', async ({ page }) => {
  expect(await width(page)).toBe(MAX);
  await expect(page.getByTestId('list-resize')).toHaveCSS('cursor', 'ew-resize');
  await expect(page.getByTestId('list-reset')).toHaveCount(0);
  await expectFits(page);
  const main0 = await mainWidth(page);
  await drag(page, -40);
  expect(await width(page)).toBe(MAX - 40);
  expect(await mainWidth(page)).toBe(main0 + 40);
  await expectFits(page);
  // Never wider than the default.
  await drag(page, 200);
  expect(await width(page)).toBe(MAX);
  // Never narrower than the minimum.
  await drag(page, -400);
  expect(await width(page)).toBe(MIN);
  expect(await mainWidth(page)).toBe(main0 + MAX - MIN);
  await expectFits(page);
});

test('the width survives a reload; ↔ and double-click restore the default', async ({ page }) => {
  await drag(page, -50);
  expect(await width(page)).toBe(MAX - 50);
  await page.reload();
  await expect(page.getByTestId('list-row').first()).toBeVisible();
  expect(await width(page)).toBe(MAX - 50);
  await page.getByTestId('list-reset').click();
  expect(await width(page)).toBe(MAX);
  await expect(page.getByTestId('list-reset')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('list-row').first()).toBeVisible();
  expect(await width(page)).toBe(MAX);
  await drag(page, -60);
  expect(await width(page)).toBe(MAX - 60);
  await page.getByTestId('list-resize').dblclick();
  expect(await width(page)).toBe(MAX);
});

test('no horizontal overflow at default, mid and minimum widths, for several teams and both seasons', async ({ page }) => {
  for (const [t, s] of [['HOU', '2026-27'], ['ORL', '2025-26'], ['LAL', '2026-27'], ['BOS', '2025-26']] as const) {
    for (const w of [MAX, 460, NARROW, NARROW - 1, MIN]) {
      await page.evaluate((w) => localStorage.setItem('rk.listWidth', String(w)), w);
      await page.goto(`/#/game/latest?t=${t}&s=${s}`);
      await page.reload();
      await expect(page.getByTestId('list-row').first()).toBeVisible();
      expect(await width(page)).toBe(w);
      await expectFits(page);
    }
  }
  await page.evaluate(() => localStorage.setItem('rk.listWidth', '440'));
  await page.reload();
  await expect(page.getByTestId('list-row').first()).toBeVisible();
  // A badge that doesn't fit is cut with "…" and keeps its full text for the tooltip / pop-up.
  const cut = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.gl-tags-in .chip-tag, .gl-tags-in .badge, .gl-tags-in .chip-tif')]
      .filter((e) => e.scrollWidth > e.clientWidth)
      .map((e) => ({ ellipsis: getComputedStyle(e).textOverflow, full: e.title || e.getAttribute('aria-label') || '' })),
  );
  expect(cut.length).toBeGreaterThan(0);
  for (const c of cut) {
    expect(c.ellipsis).toBe('ellipsis');
    expect(c.full).not.toBe('');
  }
});

test('the collapse button still hides and shows the list, and the width is kept', async ({ page }) => {
  await drag(page, -30);
  await page.getByTestId('list-collapse').click();
  await expect(page.getByTestId('game-list')).toHaveCount(0);
  await page.getByTestId('list-expand').click();
  await expect(page.getByTestId('game-list')).toBeVisible();
  expect(await width(page)).toBe(MAX - 30);
});

test('narrowest: only date, game and W/L; badges and rest days come back when widened', async ({ page }) => {
  await drag(page, -400);
  expect(await width(page)).toBe(MIN);
  const row = page.getByTestId('list-row').last();
  await expect(row.locator('.gl-date')).toBeVisible();
  await expect(row.getByTestId('list-result')).toBeVisible();
  await expect(row.locator('.gl-tags')).toBeHidden();
  await expect(row.locator('td').last()).toBeHidden();
  await expect(page.getByTestId('tag-legend')).toBeHidden();
  await expectFits(page);
  await drag(page, NARROW - MIN + 10);
  await expect(row.locator('.gl-tags')).toBeVisible();
  await expect(row.locator('td').last()).toBeVisible();
  await expectFits(page);
});
