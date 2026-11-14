// Score-line icon links (desktop): hoopsjunkie + calendarkit, in Games and Q4.

import { test, expect } from '@playwright/test';

test('the score line has the two icon links after the game-type chips, in Games and in Q4', async ({ page }) => {
  for (const path of ['/#/game/0022600092?t=POR', '/#/q4/0022600092?t=POR']) {
    await page.goto(path);
    await expect(page.locator('h1')).toContainText('PHX');
    const hj = page.getByTestId('link-hoopsjunkie');
    const ck = page.getByTestId('link-calendarkit');
    // ET date (10 pm ET Oct 21 = Oct 22 UTC), lowercase tricodes, away-vs-home.
    await expect(hj).toHaveAttribute('href', 'https://hoopsjunkie.io/games/2026-10-21/phx-vs-por');
    await expect(ck).toHaveAttribute('href', 'https://gauntlet-home.vercel.app/calendar?view=league&layout=list&date=2026-10-21&game=0022600092');
    for (const [a, tip] of [[hj, 'Open on hoopsjunkie'], [ck, 'Open in calendarkit']] as const) {
      await expect(a).toHaveAttribute('target', '_blank');
      await expect(a).toHaveAttribute('rel', /noopener/);
      await expect(a).toHaveAttribute('title', tip);
      await expect(a.locator('svg')).toHaveCount(1); // an icon…
      await expect(a).toHaveText(''); // …not text
      expect(await a.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('none');
    }
    // After the Blowout/Competitive (and Garbage time) chips.
    const order = await page.locator('h1').evaluate((h) => {
      const badge = h.querySelector('[data-testid=game-badge]')!;
      const link = h.querySelector('[data-testid=link-hoopsjunkie]')!;
      return badge.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING;
    });
    expect(order).toBeTruthy();
  }
});

test('clicking opens a new tab (and leaves the app where it was)', async ({ page, context }) => {
  // Don't hit the real sites: answer every request to them with a tiny page.
  await context.route(/hoopsjunkie\.io|gauntlet-home\.vercel\.app/, (r) => r.fulfill({ contentType: 'text/html', body: '<title>stub</title>' }));
  await page.goto('/#/game/0022600092?t=POR');
  const [popup] = await Promise.all([context.waitForEvent('page'), page.getByTestId('link-calendarkit').click()]);
  await popup.waitForLoadState();
  expect(popup.url()).toContain('gauntlet-home.vercel.app/calendar?view=league&layout=list&date=2026-10-21&game=0022600092');
  await expect(page).toHaveURL(/#\/game\/0022600092/);
});
