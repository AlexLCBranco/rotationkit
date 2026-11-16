// Header player search: on every tab, "/" and Ctrl+K, matching, keyboard and mouse, recent players, traded players.

import { test, expect, type Page } from '@playwright/test';
import { fold } from '../src/domain/players.ts';

const box = (page: Page) => page.getByTestId('search-input');
const results = (page: Page) => page.getByTestId('search-result');

test('the search box is in the header on every tab and on the player page', async ({ page }) => {
  for (const url of ['/#/game/0022500093', '/#/q4/0022500093', '/#/team/ORL?s=2025-26', '/#/leaders?s=2025-26', '/#/player/ORL/1630532?s=2025-26']) {
    await page.goto(url);
    await expect(page.locator('header.topbar').getByTestId('player-search')).toBeVisible();
  }
});

test('"/" and Ctrl+K focus it from anywhere, but not while typing in another field', async ({ page }) => {
  await page.goto('/#/game/0022500093');
  await expect(page.getByTestId('gc-player-row').first()).toBeVisible();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('/');
  await expect(box(page)).toBeFocused();
  await expect(box(page)).toHaveValue('');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(box(page)).not.toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(box(page)).toBeFocused();
  // Typing "/" in the game list's opponent filter types it there.
  const other = page.getByLabel('Filter by opponent');
  await other.click();
  await page.keyboard.press('/');
  await expect(other).toHaveValue('/');
  await expect(other).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(other).toBeFocused();
});

test('case- and accent-insensitive, any part of the name, initials; headshot, name, team; at most 8', async ({ page }) => {
  await page.goto('/#/team/DEN?s=2026-27');
  await box(page).fill('jok');
  // Names compared accent-insensitively: the feed's spelling can change between games ("Jokić" / "Jokic") and the
  // index keeps the latest (tests/players.test.ts).
  await expect(results(page).first()).toContainText(/Nikola Joki[cć]/);
  await expect(results(page).first()).toContainText('DEN');
  await expect(results(page).first().locator('.headshot')).toBeVisible();
  await box(page).fill('JOKIC');
  await expect(results(page).first()).toContainText(/Nikola Joki[cć]/);
  await box(page).fill('gilgeous');
  await expect(results(page).first()).toContainText('Shai Gilgeous-Alexander');
  await box(page).fill('sga');
  await expect(results(page).filter({ hasText: 'Shai Gilgeous-Alexander' })).toHaveCount(1);
  await box(page).fill('a');
  await expect(results(page)).toHaveCount(8);
  await box(page).fill('zzzzqx');
  await expect(page.getByTestId('search-results')).toContainText('No player matches');
});

test('players of the selected season first', async ({ page }) => {
  await page.goto('/#/team/ORL?s=2025-26');
  await box(page).fill('jo');
  const seasons = await results(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-season')));
  expect(seasons.length).toBe(8);
  expect(seasons.every((s) => s === '2025-26')).toBe(true);
});

test('↑/↓ + Enter opens the player page for the selected season, keeping the filters; Esc closes', async ({ page }) => {
  await page.goto('/#/team/ORL?s=2025-26&w=10&v=home');
  await box(page).fill('nikola');
  const sel = page.locator('[role=option][aria-selected=true] [data-testid=search-result]');
  const second = results(page).nth(1);
  const [id, team] = [await second.getAttribute('data-player'), await second.getAttribute('data-team')];
  await expect(sel).toHaveAttribute('data-player', (await results(page).first().getAttribute('data-player'))!);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await expect(sel).toHaveAttribute('data-player', id!);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`#/player/${team}/${id}\\?s=2025-26&w=10&v=home$`));
  await box(page).fill('jok');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/player\/DEN\/203999\?s=2025-26&w=10&v=home$/);
  await expect(page.locator('h1')).toContainText('Nikola Jokić');
  await expect(page.getByTestId('search-results')).toHaveCount(0);
  await expect(box(page)).toHaveValue('');
  // Esc closes the list.
  await box(page).fill('jok');
  await expect(page.getByTestId('search-results')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('search-results')).toHaveCount(0);
  // Back goes to the pages before.
  await page.goBack();
  await expect(page).toHaveURL(/#\/player\/[A-Z]{3}\/\d+\?s=2025-26&w=10&v=home$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/team\/ORL/);
});

test('mouse: hover highlights, click opens', async ({ page }) => {
  await page.goto('/#/game/0022600001');
  await box(page).fill('gilgeous');
  await results(page).first().hover();
  await expect(page.locator('[role=option][aria-selected=true]')).toContainText('Gilgeous-Alexander');
  await results(page).first().click();
  await expect(page).toHaveURL(/#\/player\/OKC\/1628983\?s=2026-27/);
});

test('empty box shows the last 5 players opened, most recent first; they open the same way', async ({ page }) => {
  await page.goto('/#/team/ORL?s=2026-27');
  const opened: string[] = [];
  for (const q of ['jok', 'gilgeous', 'harden', 'doncic', 'banchero', 'wembanyama']) {
    await box(page).fill(q);
    const first = results(page).first();
    opened.push((await first.locator('.psearch-name').textContent())!);
    await first.click();
    await expect.poll(async () => fold((await page.locator('h1').textContent()) ?? '')).toContain(fold(opened.at(-1)!));
  }
  await box(page).focus();
  await expect(page.getByTestId('search-results')).toHaveAttribute('data-mode', 'recent');
  await expect(results(page).locator('.psearch-name')).toHaveText(opened.slice(-5).reverse());
  await page.reload();
  await box(page).focus();
  await expect(results(page)).toHaveCount(5);
  await page.keyboard.press('Enter');
  await expect(page.locator('h1')).toContainText(opened.at(-1)!);
});

test('traded player: search opens his most recent team; his page switches between his teams', async ({ page }) => {
  await page.goto('/#/team/ORL?s=2025-26');
  await box(page).fill('harden');
  await expect(results(page).first()).toContainText('CLE');
  await expect(results(page).first()).toContainText('was LAC');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/player\/CLE\/201935\?s=2025-26$/);
  const sw = page.getByTestId('team-switch');
  await expect(sw.getByTestId('team-switch-option')).toHaveText(['LAC', 'CLE']);
  await expect(sw.locator('[aria-current=page]')).toHaveText('CLE');
  const cle = await page.getByTestId('game-row').count();
  await sw.getByText('LAC').click();
  await expect(page).toHaveURL(/#\/player\/LAC\/201935\?s=2025-26$/);
  await expect(sw.locator('[aria-current=page]')).toHaveText('LAC');
  await expect(page.getByTestId('game-row').first()).toBeVisible();
  expect(await page.getByTestId('game-row').count()).not.toBe(cle);
  // One team only: no switch.
  await page.goto('/#/player/DEN/203999?s=2025-26');
  await expect(page.locator('h1')).toContainText('Nikola Jokić');
  await expect(page.getByTestId('team-switch')).toHaveCount(0);
});
