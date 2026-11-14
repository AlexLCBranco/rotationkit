// Player and team names are real links everywhere (one component each): right targets (season + filters kept),
// plain text until hovered, Ctrl/middle-click → new tab, back button works; the rest of a row behaves as before.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Game } from '../src/domain/types.ts';
import { teamName } from '../src/app/teams.ts';

const load = (s: string, id: string) => JSON.parse(readFileSync(`data/${s}/games/${id}.json`, 'utf8')) as Game;
const playerHref = (team: string, id: number, q: string) => `#/player/${team}/${id}?${q}`;

/** Every player link's href points at a player in this game on his own team, for the game's season. */
async function checkPlayerLinks(page: Page, scope: string, g: Game, q: string) {
  const links = page.locator(`${scope} [data-testid=player-link]`);
  expect(await links.count()).toBeGreaterThan(0);
  const all = await links.evaluateAll((els) => els.map((e) => [Number(e.getAttribute('data-player')), e.getAttribute('href')] as const));
  const people = [...g.players, ...(g.inactive ?? [])];
  for (const [id, href] of all) {
    const p = people.find((x) => x.id === id)!;
    expect(p, `player ${id}`).toBeDefined();
    expect(href).toBe(playerHref(p.team, id, q));
  }
}

test('Games tab: chart rows (incl. DNP), team names, header, readout, pinned panel, lineup list, quarter table', async ({ page }) => {
  const g = load('2025-26', '0022500093');
  await page.goto('/#/game/0022500093?t=DET&s=2025-26&w=10');
  await expect(page.getByTestId('gc-player-row').first()).toBeVisible();
  const q = 's=2025-26&w=10';
  // Chart rows: every player row and DNP row has exactly one player link (the name).
  for (const sel of ['[data-testid=gc-player-row]', '[data-testid=dnp-row]']) {
    const n = await page.locator(sel).count();
    await expect(page.locator(`${sel} [data-testid=player-link]`)).toHaveCount(n);
  }
  await checkPlayerLinks(page, '[data-testid=game-chart]', g, q);
  // Team names in the chart and the header.
  await expect(page.locator('[data-testid=game-chart] .gc-team-title [data-testid=team-link]')).toHaveText([teamName(g.away.tri), teamName(g.home.tri)]);
  await expect(page.locator('.game-title [data-testid=team-link]')).toHaveText([g.away.tri, g.home.tri]);
  await expect(page.locator('.game-title [data-testid=team-link]').first()).toHaveAttribute('href', `#/team/${g.away.tri}?${q}`);
  await expect(page.locator('[data-testid=header-tags] [data-testid=team-link]')).toHaveText(['DET', 'HOU']);
  // Hover readout: both lineups are links.
  const row = page.getByTestId('gc-player-row').first();
  const track = row.locator('.gc-track');
  const tb = (await track.boundingBox())!;
  await page.mouse.move(tb.x + tb.width * 0.3, tb.y + tb.height / 2);
  await expect(page.locator('[data-testid=chart-tip] [data-testid=readout-player] [data-testid=player-link]')).toHaveCount(10);
  await checkPlayerLinks(page, '[data-testid=chart-tip]', g, q);
  // Click pins (unchanged); the pinned panel's players are links.
  await page.mouse.click(tb.x + tb.width * 0.3, tb.y + tb.height / 2);
  await expect(page.getByTestId('cursor-panel')).toContainText('pinned');
  await expect(page.locator('[data-testid=cursor-panel] [data-testid=player-link]')).toHaveCount(10);
  await checkPlayerLinks(page, '[data-testid=cursor-panel]', g, q);
  // Lineup list and quarter table.
  const list = page.getByTestId('lineup-list').first();
  await list.locator('summary').click();
  await expect(list.getByTestId('lineup-row').first().getByTestId('player-link')).toHaveCount(5);
  await checkPlayerLinks(page, '[data-testid=lineup-list]', g, q);
  await checkPlayerLinks(page, '[data-testid=quarter-table]', g, q);
  // Clicking a name opens the player's page; back returns to the game.
  const name = row.getByTestId('player-link');
  const id = await name.getAttribute('data-player');
  await name.click();
  await expect(page).toHaveURL(new RegExp(`#/player/[A-Z]{3}/${id}\\?${q}$`));
  await expect(page.getByTestId('player-grid')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/game\/0022500093/);
  await expect(page.getByTestId('gc-player-row').first()).toBeVisible();
});

test('links look like plain text until hovered (no blue charts); hover underlines', async ({ page }) => {
  await page.goto('/#/game/0022500093');
  const link = page.locator('[data-testid=gc-player-row] [data-testid=player-link]').first();
  await expect(link).toBeVisible();
  const style = () => link.evaluate((e) => ({ color: getComputedStyle(e).color, parent: getComputedStyle(e.parentElement!).color, deco: getComputedStyle(e).getPropertyValue('text-decoration'), cursor: getComputedStyle(e).cursor }));
  const before = await style();
  expect(before.color).toBe(before.parent);
  expect(before.deco).not.toContain('underline');
  await link.hover();
  const after = await style();
  expect(after.deco).toContain('underline');
  expect(after.cursor).toBe('pointer');
  // A Q4 row name inherits the row's color too.
  await page.goto('/#/q4/0022500093');
  const q4 = page.locator('[data-testid=q4-row] [data-testid=player-link]').first();
  expect(await q4.evaluate((e) => getComputedStyle(e).color === getComputedStyle(e.parentElement!).color)).toBe(true);
});

test('Ctrl+click and middle-click open a new tab; the app stays where it was', async ({ page, context }) => {
  await page.goto('/#/game/0022500093');
  const link = page.locator('[data-testid=gc-player-row] [data-testid=player-link]').first();
  const href = (await link.getAttribute('href'))!;
  for (const click of [() => link.click({ modifiers: ['Control'] }), () => link.click({ button: 'middle' })]) {
    const [tab] = await Promise.all([context.waitForEvent('page'), click()]);
    await tab.waitForURL((u) => u.href.includes(href));
    await tab.close();
    await expect(page).toHaveURL(/#\/game\/0022500093/);
    await expect(page.getByTestId('cursor-panel')).toHaveCount(0); // no pin from the click
  }
});

test('game list: opponent and team are team links; the rest of the row still selects the game', async ({ page }) => {
  await page.goto('/#/game/0022500093?t=DET&s=2025-26');
  const rows = page.getByTestId('list-row');
  await expect(rows.first()).toBeVisible();
  const row = rows.nth(3);
  const id = await row.getAttribute('data-id');
  const opp = (await row.getAttribute('data-opp'))!;
  await expect(row.getByTestId('team-link')).toHaveText(['DET', opp]);
  await row.getByTestId('list-result').click();
  await expect(page).toHaveURL(new RegExp(`#/game/${id}`));
  await row.getByTestId('team-link').nth(1).click();
  await expect(page).toHaveURL(new RegExp(`#/team/${opp}\\?s=2025-26$`));
  await expect(page.getByTestId('team-block').first()).toHaveAttribute('data-team', opp);
  // Upcoming games: the opponent is a team link too.
  await page.goto('/#/game/latest?t=ORL&s=2026-27');
  const up = page.getByTestId('upcoming-row').first();
  await expect(up).toBeVisible();
  const uopp = (await up.getAttribute('data-opp'))!;
  await expect(up.getByTestId('team-link').nth(1)).toHaveAttribute('href', `#/team/${uopp}?s=2026-27`);
});

test('Q4 tab: row names, team names and the pinned lineup card', async ({ page }) => {
  const g = load('2025-26', '0022500093');
  await page.goto('/#/q4/0022500093?s=2025-26');
  await expect(page.getByTestId('q4-row').first()).toBeVisible();
  const rows = await page.getByTestId('q4-row').count();
  await expect(page.locator('[data-testid=q4-row] [data-testid=player-link]')).toHaveCount(rows);
  await checkPlayerLinks(page, '[data-testid=q4-chart]', g, 's=2025-26');
  await expect(page.locator('[data-testid=q4-team] .q4-team-head [data-testid=team-link]')).toHaveCount(2);
  const tb = (await page.getByTestId('q4-row').first().locator('.q4-track').boundingBox())!;
  await page.mouse.click(tb.x + tb.width / 2, tb.y + 5);
  await expect(page.getByTestId('q4-cursor-card')).toContainText('pinned');
  await expect(page.locator('[data-testid=q4-cursor-card] [data-testid=player-link]')).toHaveCount(10);
});

test('Averages: Typical stints, Heat map, minutes table and the team name; filters kept', async ({ page }) => {
  await page.goto('/#/team/ORL?s=2025-26&w=10&v=home');
  const chart = page.getByTestId('pattern-chart');
  await expect(chart.getByTestId('player-row').first()).toBeVisible();
  const n = await chart.locator('[data-testid=player-row]').count();
  await expect(chart.locator('[data-testid=player-row] [data-testid=player-link]')).toHaveCount(n);
  await expect(chart.getByTestId('player-link').first()).toHaveAttribute('href', /^#\/player\/ORL\/\d+\?s=2025-26&w=10&v=home$/);
  await expect(page.locator('[data-testid=averages-table] [data-testid=player-link]')).toHaveCount(await page.getByTestId('avg-row').count());
  await expect(page.locator('.block-head [data-testid=team-link]')).toHaveAttribute('href', '#/team/ORL?s=2025-26&w=10&v=home');
  await page.getByRole('button', { name: 'Heat map' }).click();
  await expect(page.locator('[data-testid=team-grid] [data-testid=player-link]').first()).toHaveAttribute('href', /^#\/player\/ORL\/\d+\?s=2025-26&w=10&v=home$/);
  // Hover on the timeline still shows the tooltip (unchanged).
  await page.getByRole('button', { name: 'Typical stints' }).click();
  await chart.locator('.gc-track').nth(1).click({ position: { x: 5, y: 20 } });
  await expect(page.getByTestId('pattern-tip')).toBeVisible();
});

test('player page: his team and every opponent are team links', async ({ page }) => {
  await page.goto('/#/player/ORL/1630532?s=2025-26');
  await expect(page.getByTestId('game-row').first()).toBeVisible();
  await expect(page.locator('h1 [data-testid=team-link]')).toHaveAttribute('href', '#/team/ORL?s=2025-26');
  const rows = await page.getByTestId('game-row').count();
  await expect(page.locator('[data-testid=game-row] [data-testid=team-link]')).toHaveCount(rows);
  await expect(page.locator('[data-testid=game-log] [data-testid=game-log-row] [data-testid=team-link]')).toHaveCount(await page.getByTestId('game-log-row').count());
  // Clicking the date still opens the game.
  await page.getByTestId('game-row').first().locator('a.link').click();
  await expect(page).toHaveURL(/#\/game\/\d+/);
});

test('Leaders: table names and teams, scatter dots and labels', async ({ page }) => {
  await page.goto('/#/leaders?s=2025-26&w=10');
  const row = page.getByTestId('leaders-row').first();
  await expect(row).toBeVisible();
  const id = await row.getAttribute('data-player');
  const team = (await row.getByTestId('team-link').textContent())!.trim();
  await expect(row.getByTestId('player-link')).toHaveAttribute('href', `#/player/${team}/${id}?s=2025-26&w=10`);
  await expect(row.getByTestId('team-link')).toHaveAttribute('href', `#/team/${team}?s=2025-26&w=10`);
  const dot = page.locator(`[data-testid=leaders-dot-link]:has([data-player="${id}"])`);
  await expect(dot).toHaveAttribute('href', `#/player/${team}/${id}?s=2025-26&w=10`);
  await expect(page.locator(`[data-testid=leaders-label][data-player="${id}"]`).locator('xpath=..')).toHaveAttribute('href', `#/player/${team}/${id}?s=2025-26&w=10`);
  await dot.locator('circle').click();
  await expect(page).toHaveURL(new RegExp(`#/player/${team}/${id}\\?s=2025-26&w=10$`));
});
