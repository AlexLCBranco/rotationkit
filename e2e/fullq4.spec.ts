// Full Q4 tab (desktop): players on court for the whole regulation 4th quarter over the season;
// the player page counter and row markers.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { leaderboard, playerFullQ4, seasonCounts, type FullQ4Opts } from '../src/domain/fullQ4.ts';
import type { QuartersFile } from '../src/domain/leaders.ts';
import type { Game, GameIndexEntry } from '../src/domain/types.ts';

const file = (s: string) => JSON.parse(readFileSync(`data/${s}/quarters.json`, 'utf8')) as QuartersFile;
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !m.location().url.includes('cdn.nba.com') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
test('tab opens with the season leaderboard (= computed from the data) and no by-date section (moved to Games › By day)', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#/game/latest?t=ORL&s=2026-27');
  await page.getByTestId('tab-leaders').click();
  await page.getByTestId('how-fullq4').click();
  await expect(page).toHaveURL(/#\/fullq4\?s=2026-27/);
  const o: FullQ4Opts = { threshold: 'full', noBlowouts: false };
  const board = leaderboard(seasonCounts(file('2026-27'), o));
  await expect(page.getByTestId('fq-row').first()).toBeVisible();
  const rows = await page.getByTestId('fq-row').evaluateAll((els) => els.map((e) => [Number(e.getAttribute('data-player')), Number(e.getAttribute('data-full')), Number(e.getAttribute('data-gp'))]));
  expect(rows).toEqual(board.slice(0, 50).map((r) => [r.id, r.full, r.gp]));
  await expect(page.getByRole('region', { name: 'By date' })).toHaveCount(0);
  await expect(page.getByLabel('Date')).toHaveCount(0);
  await expect(page.getByTestId('fq-game')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('options live in the URL; show all; a player name opens his page', async ({ page }) => {
  await page.goto('/#/fullq4?s=2025-26');
  await page.getByRole('button', { name: '11:00+' }).click();
  await expect(page).toHaveURL(/th=11/);
  await page.getByRole('checkbox', { name: 'Exclude blowouts' }).check();
  await expect(page).toHaveURL(/nb=1/);
  await page.reload();
  const o: FullQ4Opts = { threshold: '11', noBlowouts: true };
  const board = leaderboard(seasonCounts(file('2025-26'), o));
  await expect(page.getByTestId('fq-row').first()).toHaveAttribute('data-player', String(board[0]!.id));
  await page.getByTestId('fq-show-all').click();
  await expect(page.getByTestId('fq-row')).toHaveCount(board.length);
  const row = page.getByTestId('fq-row').first();
  const pid = await row.getAttribute('data-player');
  await row.getByTestId('player-link').click();
  await expect(page).toHaveURL(new RegExp(`#/player/[A-Z]{3}/${pid}`));
});

test('player page: "Full Q4s: X of Y games" and a marker on each full-4th row', async ({ page }) => {
  const season = '2025-26';
  const index = JSON.parse(readFileSync(`data/${season}/index.json`, 'utf8')) as GameIndexEntry[];
  const games = index.filter((e) => e.home === 'ORL' || e.away === 'ORL').map((e) => JSON.parse(readFileSync(`data/${season}/games/${e.id}.json`, 'utf8')) as Game);
  const top = leaderboard(seasonCounts(file(season), { threshold: 'full', noBlowouts: false })).find((r) => r.team === 'ORL')!;
  const mine = playerFullQ4(games, top.id, 'ORL');
  await page.goto(`/#/player/ORL/${top.id}?s=${season}`);
  await expect(page.getByTestId('fq-counter')).toContainText(`Full Q4s: ${mine.full.size} of ${mine.played} games`);
  await expect(page.getByTestId('fq-mark')).toHaveCount(mine.full.size);
});
