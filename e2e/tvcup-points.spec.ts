// National TV / NBA Cup tags and points per stint (desktop).
// The committed data predates both fields (they arrive with the next daily update), so these tests serve real pipeline
// output through request interception: a game normalized from its raw fixture (tests/fixtures, same code as
// `npm run normalize`) and schedule tags from the real feed excerpt (src/shared/nba-schedule/fixture.json, parsed by
// scheduleEntryOf). Committed data/ is never changed.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { normalizeGame } from '../src/domain/normalize.ts';
import { scheduleEntryOf, withScheduleTags } from '../scripts/lib/data.ts';
import { parseSchedule } from '../src/shared/nba-schedule/parse.ts';
import { formatDuration } from '../src/domain/time.ts';
import type { Game, GameIndexEntry, ScheduleEntry } from '../src/domain/types.ts';
import type { RawGame } from '../src/domain/raw.ts';

const S = '2026-27';
const GAME = '0022600085'; // ATL @ ORL, 2026-10-21 (raw fixture)
const fresh = normalizeGame(JSON.parse(gunzipSync(readFileSync(`tests/fixtures/${GAME}.raw.json.gz`)).toString()) as RawGame);
const feed = parseSchedule(JSON.parse(readFileSync('src/shared/nba-schedule/fixture.json', 'utf8'))).games.map(scheduleEntryOf);
const json = (x: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });

/** Serve the freshly normalized game (single file and inside both team bundles) and the feed's TV / Cup tags. */
async function serve(page: Page) {
  await page.route(`**/data/${S}/games/${GAME}.json`, (r) => r.fulfill(json(fresh)));
  await page.route(`**/data/${S}/teams/*.json`, async (r) => {
    const games = (await (await r.fetch()).json()) as Game[];
    await r.fulfill(json(games.map((g) => (g.id === GAME ? fresh : g))));
  });
  await page.route(`**/data/${S}/index.json`, async (r) => r.fulfill(json(withScheduleTags((await (await r.fetch()).json()) as GameIndexEntry[], feed))));
  await page.route(`**/data/${S}/schedule.json`, async (r) => {
    const by = new Map(feed.map((e) => [e.id, e]));
    await r.fulfill(json(((await (await r.fetch()).json()) as ScheduleEntry[]).map((e) => ({ ...e, ...(by.get(e.id)?.tv ? { tv: by.get(e.id)!.tv } : {}), ...(by.get(e.id)?.cup ? { cup: by.get(e.id)!.cup } : {}) }))));
  });
}

test('TV and CUP tags: game header, game list and player page rows', async ({ page }) => {
  await serve(page);
  // DET–BOS opener: NBC / Peacock in the feed.
  await page.goto(`/#/game/0022600001?t=DET&s=${S}`);
  await expect(page.locator('.game-head [data-testid=tv-tag]')).toHaveText('NBC / Peacock');
  await expect(page.locator(`[data-testid=list-row][data-id="0022600001"] [data-testid=tv-tag]`)).toHaveText('NBC / Peacock');
  // WAS–CHA: Cup group game, no national TV.
  await page.goto(`/#/game/0022600015?t=WAS&s=${S}`);
  await expect(page.locator('.game-head [data-testid=cup-tag]')).toHaveText('CUP');
  await expect(page.locator('.game-head [data-testid=tv-tag]')).toHaveCount(0);
  await expect(page.locator(`[data-testid=list-row][data-id="0022600015"] [data-testid=cup-tag]`)).toHaveAttribute('data-cup', 'group');
  // A game the feed excerpt has no tags for: none.
  await page.goto(`/#/game/${GAME}?t=ORL&s=${S}`);
  await expect(page.locator('.game-head [data-testid=game-badge]')).toBeVisible();
  await expect(page.locator('.game-head [data-testid=tv-tag], .game-head [data-testid=cup-tag]')).toHaveCount(0);
  // Player page: the row of a tagged game carries the same tag. Cade Cunningham played the DET opener.
  const det = JSON.parse(readFileSync(`data/${S}/games/0022600001.json`, 'utf8')) as Game;
  const p = det.players.find((x) => x.team === 'DET' && x.played && x.stints.length)!;
  await page.goto(`/#/player/DET/${p.id}?s=${S}`);
  await expect(page.getByTestId('game-row').last().getByTestId('tv-tag')).toHaveText('NBC / Peacock');
});

test('points per stint: game chart readout and bars (option off by default, remembered)', async ({ page }) => {
  await serve(page);
  await page.goto(`/#/game/${GAME}?t=ORL&s=${S}`);
  const p = [...fresh.players].sort((a, b) => b.pts - a.pts)[0]!;
  const row = page.locator(`[data-testid=gc-player-row][data-player="${p.id}"]`);
  const k = p.stints.findIndex((s, i) => s[1] - s[0] >= 300 && (p.ptsS![i] ?? 0) > 0);
  const st = p.stints[k]!;
  const bar = row.locator(`[data-testid=stint][data-start="${st[0]}"]`);
  await expect(bar).toHaveAttribute('data-pts', String(p.ptsS![k]));
  // Hover the middle of that stint: the readout's stint line ends with its points.
  await row.scrollIntoViewIfNeeded();
  const b = (await bar.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.getByTestId('readout-stint')).toContainText(` · ${p.ptsS![k]} pt${p.ptsS![k] === 1 ? '' : 's'}`);
  // Bars: off by default.
  const labels = row.getByTestId('stint-label');
  await expect(labels.filter({ hasText: /p$/ })).toHaveCount(0);
  await page.getByTestId('readout-settings').click();
  await page.getByTestId('bar-points-toggle').check();
  await expect(labels.filter({ hasText: `${formatDuration(st[1] - st[0])} · ${p.ptsS![k]}p` })).toHaveCount(1);
  // Every label with points fits inside its bar.
  for (const l of await page.locator('[data-testid=stint-label]', { hasText: /p$/ }).all()) await expect(l).toHaveAttribute('data-inside', 'true');
  await page.reload();
  await expect(row.getByTestId('stint-label').filter({ hasText: `· ${p.ptsS![k]}p` })).toHaveCount(1);
});

test('points per stint: player page readout and bars', async ({ page }) => {
  await serve(page);
  const p = [...fresh.players].filter((x) => x.team === 'ORL').sort((a, b) => b.pts - a.pts)[0]!;
  await page.goto(`/#/player/ORL/${p.id}?s=${S}`);
  const row = page.getByTestId('game-row').last(); // oldest game = the opener (rows newest first)
  await expect(row.locator('a').first()).toContainText('Oct 21');
  const bars = row.getByTestId('pl-stint');
  const total = (await bars.evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-pts'))))).reduce((a, b) => a + b, 0);
  expect(total).toBe(p.pts);
  const best = (await bars.evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-pts'))))).reduce((m, x, i, a) => (x > a[m]! ? i : m), 0);
  const pts = Number(await bars.nth(best).getAttribute('data-pts'));
  await bars.nth(best).hover();
  await expect(page.getByTestId('readout')).toContainText(` · ${pts} pt${pts === 1 ? '' : 's'}`);
  await expect(row.getByTestId('pl-stint-label').filter({ hasText: /p$/ })).toHaveCount(0);
  await page.getByTestId('readout-settings').click();
  await page.getByTestId('bar-points-toggle').check();
  await expect(row.getByTestId('pl-stint-label').filter({ hasText: /p$/ }).first()).toBeVisible();
  // Games without points per stint (committed files, for now): no points anywhere.
  const other = page.getByTestId('game-row').first();
  await expect(other.locator('[data-testid=pl-stint][data-pts]')).toHaveCount(0);
});
