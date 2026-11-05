// Team picker (desktop), ported from calendarkit: mouse and keyboard change the team and the game list.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PICKER_ORDER, TEAM_BY_TRI, letterJump } from '../src/data/teams.ts';

const index = (s: string) => JSON.parse(readFileSync(`data/${s}/index.json`, 'utf8')) as { id: string; home: string; away: string }[];
const games = (t: string) => index('2025-26').filter((e) => e.home === t || e.away === t);
const button = (page: Page) => page.getByTestId('team-picker');
const list = (page: Page) => page.getByTestId('team-picker-list');

test('@desktop the button shows logo + name; the list is grouped by conference and division, current team highlighted', async ({ page }) => {
  await page.goto('/#/game/latest?t=ORL&s=2025-26');
  await expect(button(page)).toContainText('Orlando Magic');
  await expect(button(page)).toHaveAttribute('data-team', 'ORL');
  await expect(page.locator('select[aria-label=Team]')).toHaveCount(0); // the old dropdown is gone
  await button(page).click();
  await expect(list(page)).toBeVisible();
  await expect(list(page).locator('.ck-picker-head')).toHaveText([
    'East · Atlantic', 'East · Central', 'East · Southeast', 'West · Northwest', 'West · Pacific', 'West · Southwest',
  ]);
  await expect(list(page).getByRole('option')).toHaveCount(30);
  const order = await list(page).getByRole('option').evaluateAll((els) => els.map((e) => e.getAttribute('data-tri')));
  expect(order).toEqual(PICKER_ORDER.map((t) => t.tricode));
  await expect(list(page).locator('[aria-selected=true]')).toHaveAttribute('data-tri', 'ORL');
  await expect(list(page).locator('.ck-picker-active')).toHaveAttribute('data-tri', 'ORL');
  await page.keyboard.press('Escape');
  await expect(list(page)).toHaveCount(0);
  await expect(button(page)).toBeFocused();
});

test('@desktop picking with the mouse: same URL and game list as the old dropdown', async ({ page }) => {
  await page.goto('/#/game/latest?t=ORL&s=2025-26');
  await button(page).click();
  await list(page).locator('[data-tri=LAL]').click();
  const lal = games('LAL');
  await expect(page).toHaveURL(new RegExp(`#/game/${lal.at(-1)!.id}\\?.*t=LAL`));
  await expect(page.getByTestId('list-row')).toHaveCount(lal.length);
  await expect(button(page)).toContainText('Los Angeles Lakers');
  // Averages tab: the same picker.
  await page.getByTestId('tab-averages').click();
  await button(page).click();
  await list(page).locator('[data-tri=MIA]').click();
  await expect(page).toHaveURL(/#\/team\/MIA\?s=2025-26/);
});

test('@desktop picking with the keyboard: ↓ opens, arrows / letter jump move, Enter picks, Escape cancels', async ({ page }) => {
  await page.goto('/#/game/latest?t=ORL&s=2025-26');
  await button(page).focus();
  // Escape: nothing changes.
  await page.keyboard.press('ArrowDown');
  await expect(list(page)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(button(page)).toHaveAttribute('data-team', 'ORL');
  // Letter jump: "d" from Orlando → the next team after ORL whose city or name starts with D.
  const d = letterJump(TEAM_BY_TRI.get('ORL')!.id, 'd')!;
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('d');
  await expect(list(page).locator('.ck-picker-active')).toHaveAttribute('data-tri', d.tricode);
  await page.keyboard.press('Enter');
  await expect(list(page)).toHaveCount(0);
  await expect(button(page)).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`#/game/${games(d.tricode).at(-1)!.id}\\?.*t=${d.tricode}`));
  await expect(page.getByTestId('list-row')).toHaveCount(games(d.tricode).length);
  // Arrows: → jumps a division (5 teams), ↑ one back; Enter picks.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  const i = PICKER_ORDER.findIndex((t) => t.tricode === d.tricode);
  const want = PICKER_ORDER[Math.max(0, Math.min(29, i + 5)) - 1]!;
  await expect(list(page).locator('.ck-picker-active')).toHaveAttribute('data-tri', want.tricode);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`t=${want.tricode}`));
  await expect(page.getByTestId('list-row')).toHaveCount(games(want.tricode).length);
  // Home / End.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await expect(list(page).locator('.ck-picker-active')).toHaveAttribute('data-tri', PICKER_ORDER.at(-1)!.tricode);
  await page.keyboard.press('Home');
  await expect(list(page).locator('.ck-picker-active')).toHaveAttribute('data-tri', PICKER_ORDER[0]!.tricode);
  await page.keyboard.press('Escape');
});
