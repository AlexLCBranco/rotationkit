// Leaders tab (desktop): Q4 / second-half minutes and points per game, last 5 / last 10 / season.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { leaders, type LeaderOpts, type QuartersFile } from '../src/domain/leaders.ts';

const file = (s: string) => JSON.parse(readFileSync(`data/${s}/quarters.json`, 'utf8')) as QuartersFile;
const want = (s: string, o: LeaderOpts) => leaders(file(s), o);
const rows = (page: Page) =>
  page.getByTestId('leaders-row').evaluateAll((els) => els.map((e) => ({ id: Number(e.getAttribute('data-player')), min: Number(e.getAttribute('data-min')), pts: Number(e.getAttribute('data-pts')) })));
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !m.location().url.includes('cdn.nba.com') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('@desktop Leaders tab: table and scatter = the leaders computed from the data, for every window and part', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#/game/latest?t=ORL&s=2025-26');
  await page.getByTestId('tab-leaders').click();
  await expect(page).toHaveURL(/#\/leaders\?s=2025-26/);
  for (const [w, part, sort, ot] of [['season', 'q4', 'min', false], [10, 'q4', 'pts', false], [5, 'h2', 'min', false], ['season', 'h2', 'pts', true]] as const) {
    await page.goto(`/#/leaders?s=2025-26${w === 'season' ? '' : `&w=${w}`}${part === 'h2' ? '&part=h2' : ''}${sort === 'pts' ? '&sort=pts' : ''}${ot ? '&ot=1' : ''}`);
    const exp = want('2025-26', { part, ot, window: w, sort });
    await expect(page.getByTestId('leaders-row').first()).toBeVisible();
    const got = await rows(page);
    expect(got.map((r) => r.id)).toEqual(exp.slice(0, 50).map((r) => r.id));
    got.forEach((r, i) => {
      expect(r.min).toBeCloseTo(exp[i]!.min, 6);
      expect(r.pts).toBeCloseTo(exp[i]!.pts, 6);
    });
    await expect(page.getByTestId('leaders-dot')).toHaveCount(exp.length);
    await expect(page.getByTestId('leaders-note')).toContainText(`${exp.length} players`);
  }
  expect(errors).toEqual([]);
});

test('@desktop filters update the URL and the table; team filter; clicking a player opens his page', async ({ page }) => {
  await page.goto('/#/leaders?s=2025-26');
  await page.getByRole('button', { name: 'Second half' }).click();
  await expect(page).toHaveURL(/part=h2/);
  await page.getByRole('button', { name: 'Last 10' }).click();
  await expect(page).toHaveURL(/w=10/);
  await page.getByRole('group', { name: 'Rank by' }).getByRole('button', { name: 'Points' }).click();
  await expect(page).toHaveURL(/sort=pts/);
  await page.getByRole('checkbox', { name: 'Include overtime' }).check();
  await expect(page).toHaveURL(/ot=1/);
  await page.getByLabel('Only this team').selectOption('ORL');
  await expect(page).toHaveURL(/lt=ORL/);
  const exp = want('2025-26', { part: 'h2', ot: true, window: 10, sort: 'pts', team: 'ORL' });
  expect((await rows(page)).map((r) => r.id)).toEqual(exp.map((r) => r.id));
  // Sorting by clicking the MIN header.
  await page.locator('[data-testid=leaders-table] th.sortable button', { hasText: 'MIN' }).click();
  await expect(page).toHaveURL(/#\/leaders\?(?!.*sort=pts)/);
  // Reload keeps everything.
  await page.reload();
  await expect(page.getByLabel('Only this team')).toHaveValue('ORL');
  await expect(page.getByRole('button', { name: 'Second half' })).toHaveAttribute('aria-pressed', 'true');
  const first = (await rows(page))[0]!;
  await page.locator(`[data-testid=leaders-row][data-player="${first.id}"] .ld-player .link`).click();
  await expect(page).toHaveURL(new RegExp(`#/player/ORL/${first.id}`));
});

test('@desktop scatter: top 12 named without overlapping; hovering a row highlights its dot', async ({ page }) => {
  await page.goto('/#/leaders?s=2025-26');
  await expect(page.getByTestId('leaders-label')).toHaveCount(12);
  const boxes = await page.getByTestId('leaders-label').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.left, r.top, r.right, r.bottom]));
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i]!, boxes[j]!];
      expect(a[0]! < b[2]! && b[0]! < a[2]! && a[1]! < b[3]! && b[1]! < a[3]!, `labels ${i} and ${j} overlap`).toBe(false);
    }
  const id = (await rows(page))[3]!.id;
  await page.locator(`[data-testid=leaders-row][data-player="${id}"]`).hover();
  await expect(page.locator(`[data-testid=leaders-dot][data-player="${id}"]`)).toHaveClass(/hover/);
  await expect(page.getByTestId('leaders-tip')).toBeVisible();
});
