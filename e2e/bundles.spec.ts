// Averages and the player page load a team-season with ONE request (the bundle generated at build time);
// single-game screens keep reading single game files. The served bundle equals the individual game files.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { GameIndexEntry } from '../src/domain/types.ts';

function track(page: Page) {
  const urls: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/data/')) urls.push(u.pathname);
  });
  return urls;
}

test('Averages: one bundle request per team-season, no single game files', async ({ page }) => {
  const urls = track(page);
  await page.goto('/team/ORL?s=2025-26&vs=BOS');
  await expect(page.getByTestId('pattern-chart')).toHaveCount(2);
  expect(urls.filter((u) => u.includes('/teams/')).sort()).toEqual(['/data/2025-26/teams/BOS.json', '/data/2025-26/teams/ORL.json']);
  expect(urls.filter((u) => u.includes('/games/'))).toEqual([]);
});

test('player page: one bundle request', async ({ page }) => {
  const urls = track(page);
  await page.goto('/player/ORL/1630532?s=2025-26');
  await expect(page.getByTestId('game-row').first()).toBeVisible();
  expect(urls.filter((u) => u.includes('/teams/'))).toEqual(['/data/2025-26/teams/ORL.json']);
  expect(urls.filter((u) => u.includes('/games/'))).toEqual([]);
});

test('single-game screens keep reading the single game file', async ({ page }) => {
  const urls = track(page);
  await page.goto('/q4/0022500093');
  await expect(page.getByTestId('q4-row').first()).toBeVisible();
  expect(urls).toContain('/data/2025-26/games/0022500093.json');
});

test('the served bundle = the individual game files (what the build wrote to dist/data)', async ({ request }) => {
  for (const [season, team] of [['2025-26', 'ORL'], ['2026-27', 'DEN']]) {
    const res = await request.get(`/data/${season}/teams/${team}.json`);
    expect(res.ok()).toBe(true);
    const bundle = (await res.json()) as { id: string }[];
    const ids = (JSON.parse(readFileSync(`data/${season}/index.json`, 'utf8')) as GameIndexEntry[]).filter((e) => e.home === team || e.away === team).map((e) => e.id);
    expect(bundle.map((g) => g.id)).toEqual(ids);
    expect(bundle).toEqual(ids.map((id) => JSON.parse(readFileSync(`data/${season}/games/${id}.json`, 'utf8'))));
  }
});
