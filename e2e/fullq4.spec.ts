// Full Q4 tab (desktop): players on court for the whole regulation 4th quarter, by date and over the season;
// the player page counter and row markers.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fullQ4Day, gameDates, leaderboard, playerFullQ4, seasonCounts, type FullQ4Opts } from '../src/domain/fullQ4.ts';
import type { QuartersFile } from '../src/domain/leaders.ts';
import type { Game, GameIndexEntry } from '../src/domain/types.ts';

const file = (s: string) => JSON.parse(readFileSync(`data/${s}/quarters.json`, 'utf8')) as QuartersFile;
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !m.location().url.includes('cdn.nba.com') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
const dayPlayers = (page: Page) =>
  page.getByTestId('fq-player').evaluateAll((els) => els.map((e) => `${e.closest('[data-game]')!.getAttribute('data-game')}:${e.getAttribute('data-team')}:${e.getAttribute('data-player')}`));
const want = (season: string, date: string, o: FullQ4Opts) =>
  fullQ4Day(file(season), date, o).flatMap((g) => [...g.away5, ...g.home5].map((p) => `${g.id}:${p.team}:${p.id}`));

test('tab opens on the latest day with games; list and leaderboard = computed from the data', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#/game/latest?t=ORL&s=2026-27');
  await page.getByTestId('tab-fullq4').click();
  await expect(page).toHaveURL(/#\/fullq4\?s=2026-27/);
  const dates = gameDates(file('2026-27'));
  const last = dates[dates.length - 1]!;
  await expect(page.getByTestId('fq-date')).toHaveValue(last);
  await expect(page.getByTestId('fq-game').first()).toBeVisible();
  const o: FullQ4Opts = { threshold: 'full', noBlowouts: false };
  await expect(page.getByTestId('fq-game')).toHaveCount(fullQ4Day(file('2026-27'), last, o).length);
  expect((await dayPlayers(page)).sort()).toEqual(want('2026-27', last, o).sort());
  // Season count next to each name.
  const counts = seasonCounts(file('2026-27'), o);
  const first = page.getByTestId('fq-player').first();
  const id = Number(await first.getAttribute('data-player'));
  await expect(first.getByTestId('fq-season-count')).toHaveText(`${counts.get(id)!.full} this season`);
  // Leaderboard.
  const board = leaderboard(counts);
  const rows = await page.getByTestId('fq-row').evaluateAll((els) => els.map((e) => [Number(e.getAttribute('data-player')), Number(e.getAttribute('data-full')), Number(e.getAttribute('data-gp'))]));
  expect(rows).toEqual(board.slice(0, 50).map((r) => [r.id, r.full, r.gp]));
  // Team logos in each game.
  await expect(page.getByTestId('fq-team').first().locator('.logo, .logo-fallback')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('prev / next day, options and the date live in the URL; a player name opens his page', async ({ page }) => {
  const dates = gameDates(file('2025-26'));
  const d = dates[100]!;
  await page.goto(`/#/fullq4?s=2025-26&d=${d}`);
  await expect(page.getByTestId('fq-date')).toHaveValue(d);
  await page.getByTestId('fq-prev').click();
  await expect(page).toHaveURL(new RegExp(`d=${dates[99]}`));
  await page.getByTestId('fq-next').click();
  await page.getByTestId('fq-next').click();
  await expect(page).toHaveURL(new RegExp(`d=${dates[101]}`));
  await page.getByRole('button', { name: '11:00+' }).click();
  await expect(page).toHaveURL(/th=11/);
  await page.getByRole('checkbox', { name: 'Exclude blowouts' }).check();
  await expect(page).toHaveURL(/nb=1/);
  await page.reload();
  const o: FullQ4Opts = { threshold: '11', noBlowouts: true };
  await expect(page.getByTestId('fq-game').first()).toBeVisible();
  expect((await dayPlayers(page)).sort()).toEqual(want('2025-26', dates[101]!, o).sort());
  const board = leaderboard(seasonCounts(file('2025-26'), o));
  await expect(page.getByTestId('fq-row').first()).toHaveAttribute('data-player', String(board[0]!.id));
  // Blowout games of the day are marked as left out.
  const excluded = fullQ4Day(file('2025-26'), dates[101]!, o).filter((g) => g.excluded).length;
  await expect(page.getByTestId('fq-excluded')).toHaveCount(excluded);
  // Show all.
  await page.getByTestId('fq-show-all').click();
  await expect(page.getByTestId('fq-row')).toHaveCount(board.length);
  // Name → player page.
  const link = page.getByTestId('fq-player').first().locator('a').first();
  const pid = await page.getByTestId('fq-player').first().getAttribute('data-player');
  await link.click();
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
