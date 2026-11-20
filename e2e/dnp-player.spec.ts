// DNP / inactive reasons visible on the rows (game chart and player page), and the player page name sitting on the
// readout line right above his rows.

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dnpLabel } from '../src/app/dnp.ts';
import type { Game } from '../src/domain/types.ts';

const load = (season: string, id: string) => JSON.parse(readFileSync(`data/${season}/games/${id}.json`, 'utf8')) as Game;

test('game chart: every DNP / inactive row shows its reason without hovering, by kind', async ({ page }) => {
  // 0022500014 MIL @ ATL: no-reason DNPs, inactive injury, coach's decision, G League assignment and two-way.
  const g = load('2025-26', '0022500014');
  await page.goto(`/#/game/${g.id}?t=ATL&s=2025-26`);
  await expect(page.getByTestId('dnp-row').first()).toBeVisible();
  const want = [g.home.tri, g.away.tri].flatMap((t) => [
    ...g.players.filter((p) => p.team === t && !(p.played && p.stints.length)).map((p) => [p.id, dnpLabel(p.reason, p.reasonDetail)] as const),
    ...(g.inactive ?? []).filter((p) => p.team === t).map((p) => [p.id, dnpLabel(p.reason, p.reasonDetail, true)] as const),
  ]);
  const rows = page.getByTestId('dnp-row');
  await expect(rows).toHaveCount(want.length);
  for (const [id, l] of want) {
    const row = page.locator('[data-testid=dnp-row]', { has: page.locator(`a[href*="/${id}?"]`) });
    await expect(row).toHaveAttribute('data-kind', l.kind);
    await expect(row.getByTestId('dnp-tag')).toHaveText(l.tag);
    await expect(row.getByTestId('dnp-tag')).toBeVisible();
    if (l.detail) await expect(row.getByTestId('dnp-reason')).toContainText(l.detail);
  }
  // All four styles appear, and they look different.
  const kinds = new Set(want.map(([, l]) => l.kind));
  expect([...kinds].sort()).toEqual(['cd', 'injury', 'other', 'plain']);
  const colors = await Promise.all(['cd', 'injury', 'other', 'plain'].map((k) => page.locator(`[data-testid=dnp-row][data-kind=${k}] [data-testid=dnp-tag]`).first().evaluate((e) => getComputedStyle(e).color)));
  expect(new Set(colors).size).toBe(4);
});

test('player page: DNP rows and missed games carry the same labels', async ({ page }) => {
  // Asa Newell (ATL), 2026-27: listed in the box score as DND_INJURY in 0022600025.
  const g = load('2026-27', '0022600025');
  const p = g.players.find((x) => x.id === 1642854)!;
  await page.goto(`/#/player/ATL/${p.id}?s=2026-27`);
  const l = dnpLabel(p.reason, p.reasonDetail);
  const label = page.getByTestId('game-row').getByTestId('dnp-label').filter({ hasText: p.reasonDetail! }).first();
  await expect(label).toHaveAttribute('data-kind', 'injury');
  await expect(label).toContainText(`${l.tag}${l.detail}`);
  // Inactive-list games (2025-26, with reasons): Franz Wagner's missed games.
  await page.goto('/#/player/ORL/1630532?s=2025-26');
  await page.locator('details.missed summary').click();
  const missed = page.getByTestId('missed-game');
  await expect(missed.first()).toBeVisible();
  await expect(missed.first().getByTestId('dnp-label')).toHaveAttribute('data-kind', 'injury');
});

test('player page: name, headshot and team on the readout line, right above his rows', async ({ page }) => {
  await page.goto('/#/player/ORL/1630532?s=2025-26');
  const bar = page.getByTestId('player-bar');
  const title = bar.getByTestId('player-title');
  await expect(title).toContainText('Franz Wagner');
  await expect(title.locator('.headshot')).toHaveCount(1);
  await expect(title.getByTestId('team-link')).toHaveText('ORL');
  const [t, r, grid] = await Promise.all([title.boundingBox(), bar.getByTestId('readout').boundingBox(), page.getByTestId('player-grid').boundingBox()]);
  // Same line: the title's middle is inside the readout's height, and the title is left of it.
  expect(t!.y + t!.height / 2).toBeGreaterThan(r!.y);
  expect(t!.y + t!.height / 2).toBeLessThan(r!.y + r!.height);
  expect(t!.x + t!.width).toBeLessThanOrEqual(r!.x);
  // Right above the rows.
  const gap = grid!.y - Math.max(t!.y + t!.height, r!.y + r!.height);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThan(24);
  // The page header no longer carries the name.
  await expect(page.locator('header.rk-header h1')).toHaveCount(0);
});
