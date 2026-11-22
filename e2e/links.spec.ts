// Score-line icon link (desktop): calendarkit, in Games and Q4. (RK-15: the hoopsjunkie link is gone.)

import { test, expect } from '@playwright/test';

test('the score line has the calendarkit icon link after the game-type chips, in Games and in Q4; no hoopsjunkie link', async ({ page }) => {
  for (const path of ['/#/game/0022600092?t=POR', '/#/q4/0022600092?t=POR']) {
    await page.goto(path);
    await expect(page.locator('h1')).toContainText('PHX');
    const ck = page.getByTestId('link-calendarkit');
    // ET date (10 pm ET Oct 21 = Oct 22 UTC).
    await expect(ck).toHaveAttribute('href', 'https://gauntlet-home.vercel.app/calendar?view=league&layout=list&date=2026-10-21&game=0022600092');
    await expect(ck).toHaveAttribute('target', '_blank');
    await expect(ck).toHaveAttribute('rel', /noopener/);
    await expect(ck).toHaveAttribute('title', 'Open in calendarkit');
    await expect(ck.locator('svg')).toHaveCount(1); // an icon…
    await expect(ck).toHaveText(''); // …not text
    expect(await ck.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('none');
    await expect(page.getByTestId('link-hoopsjunkie')).toHaveCount(0);
    // After the Blowout/Competitive (and Garbage time) chips.
    const order = await page.locator('h1').evaluate((h) => {
      const badge = h.querySelector('[data-testid=game-badge]')!;
      const link = h.querySelector('[data-testid=link-calendarkit]')!;
      return badge.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING;
    });
    expect(order).toBeTruthy();
  }
});

test('clicking opens a new tab (and leaves the app where it was)', async ({ page, context }) => {
  // Don't hit the real site: answer every request to it with a tiny page.
  await context.route(/gauntlet-home\.vercel\.app/, (r) => r.fulfill({ contentType: 'text/html', body: '<title>stub</title>' }));
  await page.goto('/#/game/0022600092?t=POR');
  const [popup] = await Promise.all([context.waitForEvent('page'), page.getByTestId('link-calendarkit').click()]);
  await popup.waitForLoadState();
  expect(popup.url()).toContain('gauntlet-home.vercel.app/calendar?view=league&layout=list&date=2026-10-21&game=0022600092');
  await expect(page).toHaveURL(/#\/game\/0022600092/);
});
