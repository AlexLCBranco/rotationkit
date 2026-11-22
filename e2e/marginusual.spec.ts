// Score margin strip (Games + Q4) and the "Usual" overlay (Games).

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { marginSteps } from '../src/domain/margin.ts';
import { usualAt, usualFor, usualSelection } from '../src/domain/usual.ts';
import { Q4_START } from '../src/domain/q4.ts';
import type { Game, GameIndexEntry } from '../src/domain/types.ts';

const SEASON = '2026-27';
const GAME = '0022600200'; // BOS @ MIL, blowout with garbage time and lead changes early
const load = (id: string) => JSON.parse(readFileSync(`data/${SEASON}/games/${id}.json`, 'utf8')) as Game;
const teamGames = (team: string) =>
  (JSON.parse(readFileSync(`data/${SEASON}/index.json`, 'utf8')) as GameIndexEntry[]).filter((e) => e.id.startsWith('002') && (e.home === team || e.away === team)).map((e) => load(e.id));

/** x of every vertical edge in an SVG step path (pairs of points with the same x). */
const edges = (d: string) => {
  const pts = d.replace(/^M/, '').split(' L').map((p) => p.split(' ').map(Number) as [number, number]);
  return new Set(pts.slice(1, -1).map(([x]) => Math.round(x * 10) / 10));
};

async function stripMatchesAxis(page: Page, trackSel: string, from: number) {
  const g = load(GAME);
  const strip = page.getByTestId('margin-strip');
  await expect(strip).toBeVisible();
  const sb = (await strip.boundingBox())!;
  const tb = (await page.locator(trackSel).first().boundingBox())!;
  expect(Math.abs(sb.x - tb.x)).toBeLessThan(0.6);
  expect(Math.abs(sb.width - tb.width)).toBeLessThan(0.6);
  const k = Number(await strip.getAttribute('data-k'));
  const d = (await page.getByTestId('margin-away').getAttribute('d'))! + (await page.getByTestId('margin-home').getAttribute('d'))!;
  const xs = edges(d);
  // Every lead change of the stored margin timeline is an edge at (t − from) × k (the bars' mapping).
  for (const [t] of marginSteps(g, from).slice(1, 30)) expect(xs.has(Math.round((t - from) * k * 10) / 10), `edge at t=${t}`).toBe(true);
  return { g, k, sb };
}

test('Games: the strip sits on the bars\' axis; edges at the margin changes; final margin; cursor lines up', async ({ page }) => {
  await page.goto(`/game/${GAME}`);
  await expect(page.getByTestId('gc-player-row').first()).toBeVisible();
  const { g, k, sb } = await stripMatchesAxis(page, '[data-testid=gc-player-row] .gc-track', 0);
  // Above the first team's quarter timeline.
  const axis = (await page.locator('.gc-axis').first().boundingBox())!;
  expect(sb.y + sb.height).toBeLessThanOrEqual(axis.y + 1);
  await expect(page.getByTestId('margin-final')).toHaveText(`Final ${g.home.score > g.away.score ? `${g.home.tri} +${g.home.score - g.away.score}` : `${g.away.tri} +${g.away.score - g.home.score}`}`);
  // A stint's bar starts at the same x as the strip's time for that moment.
  const bar = page.getByTestId('stint').nth(3);
  const start = Number(await bar.getAttribute('data-start'));
  expect(Math.abs((await bar.boundingBox())!.x - (sb.x + start * k))).toBeLessThan(0.6);
  // Hovering a row: the lineup cursor is at the readout's moment on the strip's axis.
  const tb = (await page.getByTestId('gc-player-row').nth(2).locator('.gc-track').boundingBox())!;
  await page.mouse.move(tb.x + tb.width * 0.4, tb.y + 10);
  const t = Number(await page.getByTestId('chart-tip').getAttribute('data-t'));
  const line = (await page.getByTestId('cursor-line').boundingBox())!;
  expect(Math.abs(line.x - (sb.x + t * k))).toBeLessThan(1);
  // The cursor crosses the strip.
  expect(line.y).toBeLessThanOrEqual(sb.y);
  // Garbage time shading stays.
  expect(await page.locator('.gc-blowout').count()).toBeGreaterThan(0);
});

test('Q4: the strip covers Q4 + OT on the same axis as the Q4 bars', async ({ page }) => {
  await page.goto(`/q4/${GAME}`);
  await expect(page.getByTestId('q4-row').first()).toBeVisible();
  const { k, sb } = await stripMatchesAxis(page, '[data-testid=q4-row] .q4-track', Q4_START);
  const bar = page.getByTestId('q4-stint').nth(2);
  const start = Number(await bar.getAttribute('data-start'));
  expect(Math.abs((await bar.boundingBox())!.x - (sb.x + (start - Q4_START) * k))).toBeLessThan(0.6);
  await expect(page.getByTestId('q4-chart')).toHaveAttribute('data-fits', 'true');
});

test('Usual: outlines = typical stints over the previous 10 games (none under 3 games); toggle remembered', async ({ page }) => {
  const g = load(GAME);
  await page.goto(`/game/${GAME}`);
  await expect(page.getByTestId('gc-player-row').first()).toBeVisible();
  await expect(page.getByTestId('usual-toggle')).toBeChecked();
  await expect(page.getByTestId('usual-stint').first()).toBeAttached();
  let withNone = 0;
  for (const tri of [g.away.tri, g.home.tri]) {
    const sel = usualSelection(teamGames(tri), g, tri);
    for (const p of g.players.filter((x) => x.team === tri && x.played && x.stints.length)) {
      const u = usualFor(sel, p.id);
      const got = await page
        .locator(`[data-testid=gc-player-row][data-player="${p.id}"] [data-testid=usual-stint]`)
        .evaluateAll((els) => els.map((e) => [Number(e.getAttribute('data-start')), Number(e.getAttribute('data-end'))]));
      expect(got, p.name).toEqual((u?.stints ?? []).map((s) => [s.start, s.end]));
      if (!u) withNone++;
    }
  }
  test.info().annotations.push({ type: 'players without an outline (< 3 games)', description: String(withNone) });
  await page.getByTestId('usual-toggle').uncheck();
  await expect(page.getByTestId('usual-stint')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('gc-player-row').first()).toBeVisible();
  await expect(page.getByTestId('usual-toggle')).not.toBeChecked();
  await expect(page.getByTestId('usual-stint')).toHaveCount(0);
  await page.getByTestId('usual-toggle').check();
  await expect(page.getByTestId('usual-stint').first()).toBeAttached();
});

test('Usual never hides or shifts bars, labels or foul ticks', async ({ page }) => {
  await page.goto(`/game/${GAME}`);
  await expect(page.getByTestId('usual-stint').first()).toBeAttached();
  const boxes = () =>
    page.locator('[data-testid=stint], [data-testid=stint-label], [data-testid=foul-tick], [data-testid=gc-player-row]').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return [e.getAttribute('data-testid'), Math.round(r.x * 10), Math.round(r.y * 10), Math.round(r.width * 10), Math.round(r.height * 10)].join();
      }),
    );
  const on = await boxes();
  // Painted under the bars, and never catches the pointer.
  const outline = page.getByTestId('usual-stint').first();
  expect(await outline.evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none');
  const hidden = await page.getByTestId('stint').evaluateAll((bars) =>
    bars.filter((b) => {
      const r = b.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return top && !b.contains(top) && top.getAttribute('data-testid') === 'usual-stint';
    }).length,
  );
  expect(hidden).toBe(0);
  await page.getByTestId('usual-toggle').uncheck();
  await expect(page.getByTestId('usual-stint')).toHaveCount(0);
  expect(await boxes()).toEqual(on);
});

test('hover readout: "usually on court here (7 of 10)" on an outline, nothing elsewhere', async ({ page }) => {
  const g = load(GAME);
  await page.goto(`/game/${GAME}`);
  await expect(page.getByTestId('usual-stint').first()).toBeAttached();
  const outline = page.getByTestId('usual-stint').first();
  const row = outline.locator('xpath=ancestor::*[@data-testid="gc-player-row"]');
  const pid = Number(await row.getAttribute('data-player'));
  const p = g.players.find((x) => x.id === pid)!;
  const u = usualFor(usualSelection(teamGames(p.team), g, p.team), pid)!;
  const ob = (await outline.boundingBox())!;
  await page.mouse.move(ob.x + ob.width / 2, ob.y + ob.height / 2);
  const t = Number(await page.getByTestId('chart-tip').getAttribute('data-t'));
  const c = usualAt(u, t);
  await expect(page.getByTestId('readout-usual')).toHaveText(`usually on court here (${c.on} of ${c.of})`);
  // Off the outlines (e.g. past regulation or before the first outline): no line.
  const first = u.stints[0]!;
  if (first.start > 30) {
    const tb = (await row.locator('.gc-track').boundingBox())!;
    await page.mouse.move(tb.x + 2, tb.y + ob.height / 2 + (ob.y - tb.y));
    await expect(page.getByTestId('chart-tip')).toBeVisible();
    await expect(page.getByTestId('readout-usual')).toHaveCount(0);
  }
});
