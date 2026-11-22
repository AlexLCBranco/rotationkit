// Game page: "Compact (both teams)" fits both teams on one 1920×1080 screen; the selected team's rows come first;
// HOME / AWAY tags; the team stays in the URL.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Game } from '../src/domain/types.ts';

const load = (season: string, id: string) => JSON.parse(readFileSync(`data/${season}/games/${id}.json`, 'utf8')) as Game;
const played = (g: Game, tri: string) => g.players.filter((p) => p.team === tri && p.played && p.stints.length).length;
const dnpCount = (g: Game, tri: string) => g.players.filter((p) => p.team === tri && !(p.played && p.stints.length)).length + (g.inactive ?? []).filter((p) => p.team === tri).length;
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !m.location().url.includes('cdn.nba.com') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
const teamOrder = (page: Page) => page.getByTestId('game-team').evaluateAll((els) => els.map((e) => e.querySelector('[data-testid=home-away-tag]')!.textContent));

test.describe('compact mode at 1920×1080', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  // 0022500086 has the most players who played of any game (30); 0022600085 is a typical one with many DNPs.
  for (const [season, id] of [['2025-26', '0022500086'], ['2026-27', '0022600085']] as const) {
    test(`${id}: both teams' charts are inside the viewport without scrolling`, async ({ page }) => {
      const errors = trackErrors(page);
      const g = load(season, id);
      await page.goto(`/game/${id}?t=${g.home.tri}&s=${season}`);
      await expect(page.getByTestId('gc-player-row').first()).toBeVisible();
      await page.getByTestId('compact-toggle').check();
      await expect(page.getByTestId('game-chart')).toHaveAttribute('data-compact', 'true');
      // Only players who played; DNP folded into one line per team.
      await expect(page.getByTestId('gc-player-row')).toHaveCount(played(g, g.home.tri) + played(g, g.away.tri));
      await expect(page.getByTestId('dnp-row')).toHaveCount(0);
      await expect(page.getByTestId('dnp-fold')).toHaveCount([g.home.tri, g.away.tri].filter((t) => dnpCount(g, t) > 0).length);
      expect(await page.evaluate(() => scrollY)).toBe(0);
      const boxes = await page.getByTestId('game-team').evaluateAll((els) => els.map((e) => [...e.querySelectorAll('[data-testid=gc-player-row], [data-testid=dnp-fold]')].map((r) => r.getBoundingClientRect()).map((r) => [r.top, r.bottom])));
      expect(boxes).toHaveLength(2);
      for (const team of boxes) {
        expect(team.length).toBeGreaterThan(0);
        for (const [top, bottom] of team) {
          expect(top).toBeGreaterThanOrEqual(0);
          expect(bottom).toBeLessThanOrEqual(1080);
        }
      }
      // One shared time axis above both teams.
      await expect(page.locator('[data-testid=game-chart] .gc-axis')).toHaveCount(1);
      expect(errors).toEqual([]);
    });
  }

  test('DNP line expands on click; the choice is remembered; broken storage still works', async ({ page, context }) => {
    const g = load('2026-27', '0022600085');
    await page.goto(`/game/${g.id}?t=ORL&s=2026-27`);
    await page.getByTestId('compact-toggle').check();
    const fold = page.getByTestId('dnp-fold').first();
    await expect(fold).toContainText(`Did not play: ${dnpCount(g, 'ORL')}`);
    await fold.click();
    await expect(fold).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('dnp-row')).toHaveCount(dnpCount(g, 'ORL'));
    await page.reload();
    await expect(page.getByTestId('compact-toggle')).toBeChecked();
    await expect(page.getByTestId('game-chart')).toHaveAttribute('data-compact', 'true');
    await page.getByTestId('compact-toggle').uncheck();
    await page.reload();
    await expect(page.getByTestId('compact-toggle')).not.toBeChecked();
    await expect(page.getByTestId('dnp-row').first()).toBeVisible();
    // Storage that throws: the page still renders and the toggle still works.
    const p2 = await context.newPage();
    await p2.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get: () => { throw new Error('blocked'); } });
    });
    const errors = trackErrors(p2);
    await p2.goto(`/game/${g.id}?t=ORL&s=2026-27`);
    await p2.getByTestId('compact-toggle').check();
    await expect(p2.getByTestId('game-chart')).toHaveAttribute('data-compact', 'true');
    expect(errors).toEqual([]);
  });
});

test('the selected team shows first, home or away; HOME / AWAY tags; the team stays in the URL', async ({ page }) => {
  const g = load('2026-27', '0022600085'); // ATL @ ORL
  await page.goto(`/game/${g.id}?t=ORL&s=2026-27`);
  await expect(page.getByTestId('game-team').first()).toContainText('Orlando Magic');
  expect(await teamOrder(page)).toEqual(['HOME', 'AWAY']);
  await expect(page).toHaveURL(/t=ORL/);
  await page.goto(`/game/${g.id}?t=ATL&s=2026-27`);
  await expect(page.getByTestId('game-team').first()).toContainText('Atlanta Hawks');
  expect(await teamOrder(page)).toEqual(['AWAY', 'HOME']);
  await page.reload();
  await expect(page.getByTestId('game-team').first()).toContainText('Atlanta Hawks');
  // Q4 tab: same order.
  await page.getByTestId('how-q4').click();
  await expect(page.getByTestId('q4-team').first()).toHaveAttribute('data-team', 'ATL');
  await expect(page.getByTestId('q4-team').first().getByTestId('home-away-tag')).toHaveText('AWAY');
});

test('no selected team: away first as before, and no team is added to the URL', async ({ browser }) => {
  const ctx = await browser.newContext(); // empty storage: no remembered team
  const page = await ctx.newPage();
  await page.goto('/game/0022600085?s=2026-27');
  await expect(page.getByTestId('game-team').first()).toContainText('Atlanta Hawks');
  expect(await teamOrder(page)).toEqual(['AWAY', 'HOME']);
  await expect(page).not.toHaveURL(/[?&]t=/);
  await ctx.close();
});
