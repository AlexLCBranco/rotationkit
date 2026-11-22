// Shared by the RK-9 … RK-16 specs (desktop and phone).

import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { GameIndexEntry, ScheduleEntry } from '../src/domain/types.ts';

export const index = (season: string) => JSON.parse(readFileSync(`data/${season}/index.json`, 'utf8')) as GameIndexEntry[];
export const schedule = (season: string) => JSON.parse(readFileSync(`data/${season}/schedule.json`, 'utf8')) as ScheduleEntry[];
export const CURRENT = '2026-27';

export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !m.location().url.includes('cdn.nba.com') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

export async function settle(page: Page) {
  await expect(page.getByTestId('header')).toBeVisible();
  await expect(page.locator('.page.muted')).toHaveCount(0);
  await expect(page.getByText('Loading…')).toHaveCount(0);
}

export async function noSidewaysScroll(page: Page, what = '') {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw, `${what}: the page must not scroll sideways`).toBeLessThanOrEqual(cw);
}

/** One screen per place in the menu (plus the 4th-quarter view and a player page). */
export const PLACES: [string, string][] = [
  ['games', '/#/game/0022500020?t=IND&s=2025-26'],
  ['q4', '/#/q4/0022500020?t=IND&s=2025-26'],
  ['by-day', '/#/games?view=day&date=2025-11-10&s=2025-26'],
  ['averages', '/#/team/ORL?s=2025-26'],
  ['player', '/#/player/ORL/1631094?s=2025-26'],
  ['leaders', '/#/leaders?s=2025-26'],
  ['full-q4', '/#/fullq4?s=2025-26'],
  ['help', '/#/help'],
];

export const FOOTER_NOTICE = 'Unofficial fan site. Not affiliated with or endorsed by the NBA. Data, logos and player photos: NBA.com.';
