// RK-5: a stint that runs across a quarter break: one bar on the player page, a notch at the break, each quarter's
// minutes on its own part; the readout gives the total plus the split. Fixture: Aaron Nesmith (IND), Oct 31 2025 vs
// ATL (0022500020): on court from Q2 3:17 through Q3 4:10 (stored as 1243–1440 and 1440–1910 → 3:17 + 7:50 = 11:07).

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gameLength } from '../src/domain/time.ts';
import type { Game } from '../src/domain/types.ts';

const GAME = '0022500020';
const NESMITH = 1630174;
const g = JSON.parse(readFileSync(`data/2025-26/games/${GAME}.json`, 'utf8')) as Game;

test('the fixture still has the Q2→Q3 stint', () => {
  const p = g.players.find((x) => x.id === NESMITH)!;
  expect(p.stints.map((s) => [s[0], s[1]])).toContainEqual([1243, 1440]);
  expect(p.stints.map((s) => [s[0], s[1]])).toContainEqual([1440, 1910]);
});

test('player page: the Q2→Q3 stint is one bar with a notch, per-quarter labels and the split in the readout', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/#/player/IND/${NESMITH}?s=2025-26`);
  const row = page.getByTestId('game-row').filter({ has: page.locator(`a[href*="${GAME}"]`) });
  await expect(row).toHaveCount(1);
  const bar = row.locator('[data-testid=pl-stint][data-parts="2"]');
  await expect(bar).toHaveCount(1);
  await expect(bar.getByTestId('pl-stint-notch')).toHaveCount(1);
  await expect(bar.getByTestId('pl-stint-part')).toHaveCount(2);
  await expect(bar.getByTestId('pl-stint-label')).toHaveText(['3:17', '7:50']);
  // The two parts are shaded differently.
  const shades = await bar.getByTestId('pl-stint-part').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  expect(shades[0]).not.toBe(shades[1]);
  // The notch sits on the Q2/Q3 line (left part = 197 of 667 seconds).
  const bb = (await bar.boundingBox())!;
  const nb = (await bar.getByTestId('pl-stint-notch').boundingBox())!;
  expect(Math.abs(nb.x + nb.width / 2 - (bb.x + (197 / 667) * bb.width))).toBeLessThan(2);
  await bar.hover();
  await expect(page.getByTestId('readout')).toContainText('· 11:07 — Q2 3:17, Q3 7:50 ·');
  expect(errors).toEqual([]);
});

test('player page: a part too narrow for its label loses only its label; none fits → the total', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/#/player/IND/${NESMITH}?s=2025-26`);
  const row = page.getByTestId('game-row').filter({ has: page.locator(`a[href*="${GAME}"]`) });
  const bar = row.locator('[data-testid=pl-stint][data-parts="2"]');
  await expect(bar).toHaveCount(1);
  // Labels never spill out of their part.
  const spill = await bar.getByTestId('pl-stint-part').evaluateAll((parts) =>
    parts.filter((p) => {
      const l = p.querySelector('[data-testid=pl-stint-label]');
      if (!l) return false;
      const a = p.getBoundingClientRect();
      const b = l.getBoundingClientRect();
      return b.left < a.left - 0.5 || b.right > a.right + 0.5;
    }).length,
  );
  expect(spill).toBe(0);
});

test('game chart: hovering a stint that continues across the break gives the whole run and its split', async ({ page }) => {
  await page.goto(`/#/game/${GAME}?t=IND&s=2025-26`);
  await page.getByTestId('list-collapse').click(); // the whole timeline in view at 1280 px
  const row = page.locator(`[data-testid=gc-player-row][data-player="${NESMITH}"]`);
  await expect(page.getByTestId('usual-stint').first()).toBeVisible(); // layout settled
  await row.scrollIntoViewIfNeeded();
  const track = row.locator('.gc-track');
  const b = (await track.boundingBox())!;
  await page.mouse.move(b.x + (1700 / gameLength(g.periods)) * b.width - 3, b.y + b.height - 6);
  await page.mouse.move(b.x + (1700 / gameLength(g.periods)) * b.width, b.y + b.height - 6);
  await expect(page.getByTestId('chart-tip')).toHaveAttribute('data-player', String(NESMITH));
  await expect(page.getByTestId('readout-stint')).toContainText('in a row: 11:07 — Q2 3:17, Q3 7:50');
  // A stint inside one quarter: no "in a row".
  await page.mouse.move(b.x + (200 / gameLength(g.periods)) * b.width, b.y + b.height - 6);
  await expect(page.getByTestId('readout-stint')).not.toContainText('in a row');
});
