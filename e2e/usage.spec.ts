// RK-7: usage rate (USG%) in Averages (sortable), Leaders, the player page's game log and the single-game table.
// Expected values come from the committed game files through the same domain code (src/domain/usage.ts).

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { formatUsg, gameUsage, usagePart, usageRate } from '../src/domain/usage.ts';
import { leaders, type QuartersFile } from '../src/domain/leaders.ts';
import type { Game } from '../src/domain/types.ts';

const load = (season: string, id: string) => JSON.parse(readFileSync(`data/${season}/games/${id}.json`, 'utf8')) as Game;
const index = (season: string) => JSON.parse(readFileSync(`data/${season}/index.json`, 'utf8')) as { id: string; home: string; away: string }[];
const num = (s: string) => (s.trim() === '—' ? -1 : Number(s));
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !m.location().url.includes('cdn.nba.com') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('single game: USG% per player = the box-score formula (Siakam 27.5 in 0022500020); the column sorts', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#/game/0022500020?t=IND&s=2025-26');
  const table = page.locator('[data-testid=quarter-table][data-team=IND]');
  await expect(table).toBeVisible();
  const g = load('2025-26', '0022500020');
  const row = table.getByTestId('quarter-row').filter({ hasText: 'Pascal Siakam' });
  await expect(row.getByTestId('q-usg')).toHaveText('27.5');
  for (const p of g.players.filter((x) => x.team === 'IND' && x.played && x.stints.length)) {
    await expect(table.getByTestId('quarter-row').filter({ hasText: p.name }).first().getByTestId('q-usg')).toHaveText(formatUsg(gameUsage(g, p)));
  }
  await table.locator('th.sortable button', { hasText: 'USG%' }).click();
  await expect(table.locator('th.sortable', { hasText: 'USG%' })).toHaveAttribute('aria-sort', 'descending');
  const vals = (await table.getByTestId('q-usg').allTextContents()).map(num);
  expect(vals).toEqual([...vals].sort((a, b) => b - a));
  expect(errors).toEqual([]);
});

test('Averages: USG% column = minutes-weighted usage over the selection; clicking it sorts the table', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#/team/PHI?s=2025-26');
  const table = page.getByTestId('averages-table');
  await expect(table).toBeVisible();
  await expect(table.locator('th', { hasText: 'USG%' })).toBeVisible();
  const games = index('2025-26').filter((e) => e.home === 'PHI' || e.away === 'PHI').map((e) => load('2025-26', e.id));
  const want = (id: number) => formatUsg(usageRate(games.flatMap((g) => g.players.filter((p) => p.id === id && p.team === 'PHI' && p.played && p.stints.length).map((p) => usagePart(g, p)))));
  const read = async () =>
    table.getByTestId('avg-row').evaluateAll((rows) =>
      rows.map((r) => ({ id: Number(r.querySelector('[data-testid=player-link]')!.getAttribute('href')!.match(/player\/PHI\/(\d+)/)![1]), usg: r.querySelector('[data-testid=avg-usg]')!.textContent! })),
    );
  const before = await read();
  expect(before.length).toBeGreaterThan(5);
  for (const r of before) expect(r.usg, String(r.id)).toBe(want(r.id));
  // Some PHI games carry the counts (fixture games), so real values show.
  expect(before.some((r) => r.usg !== '—')).toBe(true);
  await table.locator('th.sortable button', { hasText: 'USG%' }).click();
  await expect(table.locator('th.sortable', { hasText: 'USG%' })).toHaveAttribute('aria-sort', 'descending');
  const after = (await read()).map((r) => num(r.usg));
  expect(after).toEqual([...after].sort((a, b) => b - a));
  expect(after).not.toEqual(before.map((r) => num(r.usg)));
  // Back to minutes.
  await table.locator('th.sortable button', { hasText: 'MIN' }).click();
  expect((await read()).map((r) => r.id)).toEqual(before.map((r) => r.id));
  expect(errors).toEqual([]);
});

test('Leaders: USG% column = the data; "Rank by USG%" sorts by it and is kept in the URL', async ({ page }) => {
  const errors = trackErrors(page);
  const file = JSON.parse(readFileSync('data/2025-26/quarters.json', 'utf8')) as QuartersFile;
  await page.goto('/#/leaders?s=2025-26');
  await page.getByRole('group', { name: 'Rank by' }).getByRole('button', { name: 'USG%' }).click();
  await expect(page).toHaveURL(/sort=usg/);
  const exp = leaders(file, { part: 'q4', ot: false, window: 'season', sort: 'usg', noGarbage: true });
  await expect(page.getByTestId('leaders-row').first()).toBeVisible();
  const got = await page.getByTestId('leaders-row').evaluateAll((els) => els.map((e) => ({ id: Number(e.getAttribute('data-player')), usg: e.querySelector('[data-testid=leaders-usg]')!.textContent! })));
  expect(got.map((r) => r.id)).toEqual(exp.slice(0, got.length).map((r) => r.id));
  got.forEach((r, i) => expect(r.usg).toBe(formatUsg(exp[i]!.usg)));
  await page.locator('[data-testid=leaders-table] th.sortable button', { hasText: 'MIN' }).click();
  await expect(page).toHaveURL(/#\/leaders\?(?!.*sort=)/);
  await page.locator('[data-testid=leaders-table] th.sortable button', { hasText: 'USG%' }).click();
  await expect(page).toHaveURL(/sort=usg/);
  expect(errors).toEqual([]);
});

test('player page: USG% per game in the game log, and over the selection on the average row', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#/player/IND/1627783?s=2025-26');
  const log = page.getByTestId('game-log');
  await expect(log).toBeVisible();
  await expect(log.getByTestId('game-log-row').getByTestId('game-log-usg').filter({ hasText: '27.5' })).toHaveCount(1);
  const games = index('2025-26').filter((e) => e.home === 'IND' || e.away === 'IND').map((e) => load('2025-26', e.id));
  const parts = games.flatMap((g) => g.players.filter((p) => p.id === 1627783 && p.team === 'IND' && p.played && p.stints.length).map((p) => usagePart(g, p)));
  await expect(log.getByTestId('game-log-avg').getByTestId('game-log-usg')).toHaveText(formatUsg(usageRate(parts)));
  expect(errors).toEqual([]);
});
