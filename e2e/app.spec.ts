// End-to-end checks against the production build (vite preview). Screenshots go to screenshots/ (gitignored).

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const TEAMS = ['ATL', 'BKN', 'BOS', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK', 'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS'];
const index = (s: string) => JSON.parse(readFileSync(`data/${s}/index.json`, 'utf8')) as { home: string; away: string }[];
const teamGames = (s: string, t: string) => index(s).filter((g) => g.home === t || g.away === t).length;

function trackErrors(page: Page) {
  const errors: string[] = [];
  // Headshots/logos come from cdn.nba.com and degrade to initials when they fail; their load errors don't count.
  page.on('console', (m) => m.type() === 'error' && !m.location().url.includes('cdn.nba.com') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `screenshots/${name}-${project}.png`, fullPage: true });
const label = (page: Page) => page.getByTestId('selection-label');
async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw, 'page must not scroll sideways').toBeLessThanOrEqual(cw);
}

test('loads on the current season with no console errors', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByTestId('player-row').first()).toBeVisible();
  await expect(page.getByLabel('Season')).toHaveValue('2026-27');
  await expect(label(page)).toContainText('based on');
  await noHorizontalScroll(page);
  await shot(page, 'team-current-season', info.project.name);
  expect(errors).toEqual([]);
});

test('team pattern view renders for all 30 teams in both seasons', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one viewport is enough for the 60-view sweep');
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  for (const season of ['2026-27', '2025-26']) {
    for (const t of TEAMS) {
      await page.goto(`/#/team/${t}?s=${season}`);
      const n = teamGames(season, t);
      await expect(page.getByLabel('Team')).toHaveValue(t);
      await expect(label(page)).toContainText(`based on ${n} game${n === 1 ? '' : 's'}`);
      if (n === 0) {
        // Teams that haven't played yet this season: explicit empty state + switch to the previous season.
        await expect(page.getByText('No games match these filters.')).toBeVisible();
        await expect(page.getByTestId('low-sample')).toBeVisible();
      } else {
        await expect(page.getByTestId('player-row').first()).toBeVisible();
        expect(await page.getByTestId('player-row').count(), `${t} ${season} rows`).toBeGreaterThan(5);
      }
    }
  }
  expect(errors).toEqual([]);
});

test('filters change the "based on N games" count and the plain-words label', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.goto('/#/team/ORL?s=2025-26');
  await expect(label(page)).toHaveText('All 2025-26 games · based on 82 games');
  await page.getByRole('button', { name: 'Last 10' }).click();
  await expect(label(page)).toHaveText('Last 10 games · based on 10 games');
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(label(page)).toHaveText('Last 10 home games · based on 10 games');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByLabel('With or without').selectOption('without');
  await page.getByLabel('Player').selectOption({ label: 'F. Wagner' });
  // Two Wagners on ORL → first initial.
  await expect(label(page)).toHaveText('Last 10 games without F. Wagner · based on 10 games');
  await expect(page.getByTestId('ww-groups')).toContainText('With F. Wagner: 34 games · Without: 48 games');
  await expect(page.getByTestId('ww-groups')).not.toContainText('estimated');
  await page.getByRole('button', { name: 'Season' }).click();
  await expect(label(page)).toHaveText('All 2025-26 games without F. Wagner · based on 48 games');
  // Strip readout on hover/tap.
  await page.locator('svg.heat').first().click({ position: { x: 1, y: 5 } });
  await expect(page.getByTestId('pattern-tip')).toContainText(/Q1 12:00–11:30 · on court in \d+ of \d+ games/);
  await noHorizontalScroll(page);
  await shot(page, 'team-without-wagner', info.project.name);
  const blowout = page.getByRole('checkbox', { name: 'Hide blowout time' });
  await expect(blowout).toBeChecked(); // default ON
  await blowout.click();
  await expect(blowout).not.toBeChecked();
  await expect(label(page)).toContainText('based on 48 games');
  expect(errors).toEqual([]);
});

test('few games in 2026-27: note + one-click switch to 2025-26 keeps team, player and with/without', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.goto('/#/team/ORL?s=2026-27&w=10&p=1630532&m=with');
  await expect(page.getByTestId('low-sample')).toBeVisible();
  await shot(page, 'low-sample', info.project.name);
  await page.getByRole('button', { name: 'Show the same view for 2025-26' }).click();
  await expect(page.getByLabel('Season')).toHaveValue('2025-26');
  await expect(page.getByLabel('Team')).toHaveValue('ORL');
  await expect(label(page)).toHaveText('Last 10 games with F. Wagner · based on 10 games');
  await expect(page.getByTestId('low-sample')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('player drill-down and single-game chart open from clicks; flagged game shows its warning', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.goto('/#/team/HOU?s=2025-26');
  await expect(page.getByTestId('flag-summary')).toContainText('1 game in this selection has a data note');
  await page.getByRole('button', { name: 'Durant', exact: true }).click();
  await expect(page.getByTestId('player-grid')).toBeVisible();
  await expect(page.locator('h1')).toContainText('Kevin Durant');
  const rows = page.getByTestId('game-row');
  expect(await rows.count()).toBeGreaterThan(40);
  await noHorizontalScroll(page);
  await shot(page, 'player-durant', info.project.name);
  // Flagged game row → game chart with the warning.
  const flagged = rows.filter({ has: page.getByTestId('flag') });
  await expect(flagged).toHaveCount(1);
  await flagged.getByRole('button').first().click();
  await expect(page).toHaveURL(/#\/game\/0022500093/);
  await expect(page.getByTestId('quality-warning')).toContainText('Kevin Durant — minutes: play-by-play 36:48 vs box score 28:08');
  await expect(page.getByTestId('quality-warning')).toContainText('The box score looks wrong');
  await expect(page.getByTestId('game-team')).toHaveCount(2);
  await page.getByTestId('stint').first().hover();
  await expect(page.getByTestId('chart-tip')).toContainText(/in Q1 12:00 → out Q\d/);
  await noHorizontalScroll(page);
  await shot(page, 'game-flagged', info.project.name);
  // Back to the player view.
  await page.goBack();
  await expect(page.getByTestId('player-grid')).toBeVisible();
  expect(errors).toEqual([]);
});

test('single-game chart: 2OT game axis, blowout shading, DNP rows with reasons', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.goto('/#/game/0022500811');
  await expect(page.locator('h1')).toContainText('Final/2OT');
  await expect(page.locator('.gc-qname').filter({ hasText: '2OT' }).first()).toBeAttached();
  await expect(page.getByTestId('dnp-row').first()).toBeAttached();
  await shot(page, 'game-2ot', info.project.name);
  await page.goto('/#/game/0022600092');
  await expect(page.locator('.gc-blowout').first()).toBeAttached();
  await expect(page.getByTestId('garbage-badge').first()).toBeVisible();
  await noHorizontalScroll(page);
  await shot(page, 'game-blowout', info.project.name);
  await expect(page.getByTestId('quality-warning')).toHaveCount(0);
  expect(errors).toEqual([]);
});
