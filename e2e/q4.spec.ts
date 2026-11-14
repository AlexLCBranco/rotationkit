// Q4 tab (desktop): rows, sort, fouls, OT axis, lineup line, URL, and the no-scroll fit on the worst real games.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { cursorInfo } from '../src/domain/gameChart.ts';
import { blowoutIntervals } from '../src/domain/patterns.ts';
import { Q4_START, q4Rows } from '../src/domain/q4.ts';
import { q4Story } from '../src/domain/q4Story.ts';
import type { Game } from '../src/domain/types.ts';

const load = (id: string) => JSON.parse(readFileSync(`data/${id.startsWith('00226') ? '2026-27' : '2025-26'}/games/${id}.json`, 'utf8')) as Game;
const index = (s: string) => JSON.parse(readFileSync(`data/${s}/index.json`, 'utf8')) as { id: string; home: string; away: string }[];
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !m.location().url.includes('cdn.nba.com') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
async function openQ4(page: Page, id: string, team?: string) {
  const g = load(id);
  await page.goto(`/#/q4/${id}${team ? `?t=${team}` : ''}`);
  await expect(page.locator('h1')).toContainText(`${g.away.tri} ${g.away.score} @ ${g.home.tri} ${g.home.score}`);
  await expect(page.getByTestId('q4-row').first()).toBeVisible();
  return g;
}
const rowIds = (page: Page, team: string) =>
  page.locator(`[data-testid=q4-team][data-team=${team}] [data-testid=q4-row]`).evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-player'))));

// Worst cases in data/ (scanned 2026-11-05): most Q4/OT players across both teams, and the longest OT (2OT) with the
// most Q4/OT players. tests/q4.test.ts checks that no other game has more rows or more periods.
const MOST_ROWS = '0022500086'; // WAS @ MIL, 28 players in Q4
const LONGEST_OT = '0022500637'; // BOS @ BKN, 2OT, 20 players

test('the worst real games fit on one screen at 1920×950 and 1600×1000: no scroll, no overlap', async ({ page }) => {
  for (const [w, h] of [[1920, 950], [1600, 1000]] as const) {
    await page.setViewportSize({ width: w, height: h });
    for (const id of [MOST_ROWS, LONGEST_OT]) {
      const g = await openQ4(page, id);
      const n = q4Rows(g, g.away.tri).length + q4Rows(g, g.home.tri).length;
      await expect(page.getByTestId('q4-row')).toHaveCount(n);
      const r = await page.evaluate(() => {
        const rows = [...document.querySelectorAll<HTMLElement>('[data-testid=q4-row]')].map((e) => e.getBoundingClientRect());
        const chart = document.querySelector<HTMLElement>('[data-testid=q4-chart]')!;
        const content = document.querySelector('.q4-content')!.getBoundingClientRect();
        const header = document.querySelector('h1')!.getBoundingClientRect();
        // Labels: inside their row, not clipped, not overlapping each other or a bar they don't belong to.
        const bad: string[] = [];
        for (const row of document.querySelectorAll<HTMLElement>('[data-testid=q4-row]')) {
          const rb = row.getBoundingClientRect();
          const labels = [...row.querySelectorAll<HTMLElement>('[data-testid=q4-stint-label]')].map((l) => ({ el: l, b: l.getBoundingClientRect() }));
          for (const { el, b } of labels) {
            if (b.top < rb.top - 0.5 || b.bottom > rb.bottom + 0.5) bad.push(`${row.dataset.player} label outside row`);
            if (el.scrollWidth > el.clientWidth + 1) bad.push(`${row.dataset.player} label clipped`);
            if (!el.textContent) bad.push('empty label');
          }
          for (let i = 0; i < labels.length; i++)
            for (let j = i + 1; j < labels.length; j++) {
              const [a, c] = [labels[i]!.b, labels[j]!.b];
              if (a.left < c.right - 0.5 && c.left < a.right - 0.5 && a.top < c.bottom - 0.5 && c.top < a.bottom - 0.5) bad.push(`${row.dataset.player} labels overlap`);
            }
        }
        for (let i = 1; i < rows.length; i++) if (rows[i]!.top < rows[i - 1]!.bottom - 0.5) bad.push(`rows ${i - 1}/${i} overlap`);
        return {
          bad,
          rowPx: Number(chart.dataset.rowPx),
          fits: chart.dataset.fits,
          sh: document.documentElement.scrollHeight,
          sw: document.documentElement.scrollWidth,
          vh: innerHeight,
          vw: innerWidth,
          bottom: content.bottom,
          right: content.right,
          headerTop: header.top,
          minRow: Math.min(...rows.map((x) => x.height)),
        };
      });
      expect(r.bad, `${id} at ${w}×${h}`).toEqual([]);
      expect(r.fits).toBe('true');
      expect(r.sh, `${id} at ${w}×${h}: page scrolls vertically`).toBeLessThanOrEqual(r.vh);
      expect(r.sw).toBeLessThanOrEqual(r.vw);
      expect(r.bottom).toBeLessThanOrEqual(r.vh);
      expect(r.right).toBeLessThanOrEqual(r.vw);
      expect(r.headerTop).toBeGreaterThanOrEqual(0);
      expect(r.rowPx).toBeGreaterThanOrEqual(22); // the readable minimum (Q4_ROW.minPx)
      expect(r.minRow).toBeGreaterThanOrEqual(22);
      console.log(`fit ${id} at ${w}×${h}: row ${r.rowPx}px, bottom ${Math.round(r.bottom)} / ${r.vh}`);
    }
  }
});

test('rows: only players on court in Q4/OT, both teams, away on top; closers first then minutes; fouls', async ({ page }) => {
  const errors = trackErrors(page);
  const g = await openQ4(page, '0022500093', 'DET');
  const teams = await page.getByTestId('q4-team').evaluateAll((els) => els.map((e) => e.getAttribute('data-team')));
  expect(teams).toEqual([g.away.tri, g.home.tri]);
  for (const tri of [g.away.tri, g.home.tri]) {
    const want = q4Rows(g, tri);
    expect(await rowIds(page, tri)).toEqual(want.map((r) => r.p.id));
    const cells = await page.locator(`[data-testid=q4-team][data-team=${tri}] [data-testid=q4-row]`).evaluateAll((els) =>
      els.map((e) => [e.getAttribute('data-closer'), e.querySelector('[data-testid=q4-pf-before]')!.textContent, e.querySelector('[data-testid=q4-pf-in]')!.textContent]),
    );
    expect(cells).toEqual(want.map((r) => [String(r.closer), String(r.foulsBefore), r.foulsIn ? String(r.foulsIn) : '—']));
    // Foul ticks: only Q4/OT fouls, numbered cumulatively over the game.
    for (const r of want) {
      const ticks = await page.locator(`[data-testid=q4-row][data-player="${r.p.id}"] [data-testid=q4-foul-tick]`).evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-n'))));
      expect(ticks).toEqual(Array.from({ length: r.foulsIn }, (_, i) => r.foulsBefore + i + 1));
    }
    // Stint minutes always on the bars: every Q4 stint has a label.
    const stints = await page.locator(`[data-testid=q4-team][data-team=${tri}] [data-testid=q4-stint]`).count();
    expect(await page.locator(`[data-testid=q4-team][data-team=${tri}] [data-testid=q4-stint-label]`).count()).toBe(stints);
  }
  expect(errors).toEqual([]);
});

test('overtime is on the same axis after Q4 (5 min each)', async ({ page }) => {
  const g = await openQ4(page, LONGEST_OT);
  await expect(page.locator('.q4-axis .gc-qname')).toHaveText(['Q4', 'OT', '2OT']);
  const w = await page.locator('.q4-axis .gc-qname').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  expect(w[1]! / w[0]!).toBeCloseTo(5 / 12, 2);
  expect(w[2]!).toBeCloseTo(w[1]!, 0);
  const pl = q4Rows(g, g.home.tri)[0]!;
  const bars = await page.locator(`[data-testid=q4-row][data-player="${pl.p.id}"] [data-testid=q4-stint]`).evaluateAll((els) => els.map((e) => [Number(e.getAttribute('data-start')), Number(e.getAttribute('data-end'))]));
  expect(bars).toEqual(pl.p.stints.filter(([s, e]) => e > s && s >= Q4_START).map(([s, e]) => [s, e]));
});

test('hover: one line across both teams with both 5-man lineups (= lineup cursor); click pins', async ({ page }) => {
  const g = await openQ4(page, '0022500093', 'DET');
  const track = page.locator('[data-testid=q4-row] .q4-track').first();
  const b = (await track.boundingBox())!;
  for (const f of [0.1, 0.35, 0.6, 0.9]) {
    await page.mouse.move(b.x + f * b.width, b.y + 4);
    const t = Number(await page.getByTestId('q4-cursor-card').getAttribute('data-t'));
    const want = cursorInfo(g, t);
    const got = await page.getByTestId('q4-lineup').evaluateAll((els) =>
      els.map((e) => ({ team: e.getAttribute('data-team'), ids: [...e.querySelectorAll('[data-testid=q4-lineup-player]')].map((p) => Number(p.getAttribute('data-player'))), fouls: [...e.querySelectorAll('[data-testid=q4-lineup-player]')].map((p) => Number(p.getAttribute('data-fouls'))) })),
    );
    expect(got.map((x) => x.team)).toEqual(want.teams.map((x) => x.team));
    for (const [i, x] of got.entries()) {
      expect(x.ids).toHaveLength(5);
      expect(x.ids).toEqual(want.teams[i]!.players.map((p) => p.p.id));
      expect(x.fouls).toEqual(want.teams[i]!.players.map((p) => p.fouls));
    }
    // The line spans both teams.
    const line = (await page.getByTestId('q4-cursor-line').boundingBox())!;
    const teams = await page.getByTestId('q4-team').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.top, r.bottom]));
    expect(line.y).toBeLessThanOrEqual(teams[0]![0]! + 1);
    expect(line.y + line.height).toBeGreaterThanOrEqual(teams[1]![1]! - 1);
  }
  // Click pins: moving away keeps the line and card where they were.
  await page.mouse.click(b.x + 0.5 * b.width, b.y + 4);
  const pinned = await page.getByTestId('q4-cursor-line').getAttribute('data-t');
  await page.mouse.move(b.x + 0.8 * b.width, b.y + 4);
  await expect(page.getByTestId('q4-cursor-line')).toHaveAttribute('data-t', pinned!);
  await expect(page.getByTestId('q4-cursor-card')).toContainText('pinned');
  await page.mouse.move(5, 5);
  await expect(page.getByTestId('q4-cursor-line')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('q4-cursor-line')).toHaveCount(0);
});

test('garbage time is shaded in Q4 like in Games', async ({ page }) => {
  const id = index('2025-26').map((e) => e.id).find((x) => blowoutIntervals(load(x)).some(([a]) => a >= Q4_START))!;
  await openQ4(page, id);
  expect(await page.locator('[data-testid=q4-row] .gc-blowout').count()).toBeGreaterThan(0);
});

test('the tab is in the URL; Games ↔ Q4 keep the same game; the list and arrows keep the tab', async ({ page }) => {
  const orl = index('2025-26').filter((e) => e.home === 'ORL' || e.away === 'ORL');
  const g = await openQ4(page, orl[10]!.id, 'ORL');
  await expect(page.getByTestId('tab-q4')).toHaveAttribute('aria-current', 'page');
  await page.getByTestId('tab-games').click();
  await expect(page).toHaveURL(new RegExp(`#/game/${g.id}\\?`));
  await expect(page.getByTestId('gc-player-row').first()).toBeVisible();
  await page.getByTestId('tab-q4').click();
  await expect(page).toHaveURL(new RegExp(`#/q4/${g.id}\\?.*t=ORL`));
  await page.getByTestId('next-game').click();
  await expect(page).toHaveURL(new RegExp(`#/q4/${orl[11]!.id}\\?`));
  await page.locator(`[data-testid=list-row][data-id="${orl[3]!.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`#/q4/${orl[3]!.id}\\?`));
  await expect(page.getByTestId('q4-chart')).toBeVisible();
  // A bare #/q4 link opens the latest game of the team in the Q4 tab.
  await page.goto('/#/q4?t=ORL&s=2025-26');
  await expect(page).toHaveURL(new RegExp(`#/q4/${orl.at(-1)!.id}\\?`));
  await page.getByTestId('tab-averages').click();
  await page.getByTestId('tab-q4').click();
  await expect(page).toHaveURL(new RegExp(`#/q4/${orl.at(-1)!.id}\\?`));
});

test('paragraph: every change in words (no clock times); hovering a sentence shows its moment and players', async ({ page }) => {
  const errors = trackErrors(page);
  for (const id of ['0022600085', LONGEST_OT]) {
    const g = await openQ4(page, id);
    const story = q4Story(g, new Map());
    const sentences = page.getByTestId('q4-sentence');
    await expect(sentences).toHaveCount(story.length);
    expect(await sentences.evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-t'))))).toEqual(story.map((x) => x.t));
    expect(await page.getByTestId('q4-story').textContent()).not.toMatch(/\b\d{1,2}:\d{2}\b/);
    for (const i of [1, Math.floor(story.length / 2), story.length - 2]) {
      const x = story[i]!;
      await sentences.nth(i).hover();
      await expect(page.getByTestId('q4-cursor-line')).toHaveAttribute('data-t', String(x.t));
      const want = cursorInfo(g, x.t);
      const got = await page.getByTestId('q4-lineup').evaluateAll((els) => els.map((e) => [...e.querySelectorAll('[data-testid=q4-lineup-player]')].map((p) => Number(p.getAttribute('data-player')))));
      expect(got).toEqual(want.teams.map((t) => t.players.map((p) => p.p.id)));
      const lit = await page.locator('[data-testid=q4-row].lit').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-player'))).sort());
      expect(lit).toEqual([...x.players].filter((p) => q4Rows(g, g.home.tri).concat(q4Rows(g, g.away.tri)).some((r) => r.p.id === p)).sort());
    }
    // Click pins the moment; leaving the sentence keeps it.
    await sentences.nth(1).click();
    await page.mouse.move(5, 5);
    await expect(page.getByTestId('q4-cursor-line')).toHaveAttribute('data-t', String(story[1]!.t));
    await expect(page.getByTestId('q4-cursor-card')).toContainText('pinned');
    await page.getByRole('button', { name: 'Close' }).click();
  }
  // Still no page scroll with the paragraph beside the chart.
  for (const [w, h] of [[1920, 950], [1600, 1000]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await openQ4(page, MOST_ROWS);
    const [sh, vh, sw, vw] = await page.evaluate(() => [document.documentElement.scrollHeight, innerHeight, document.documentElement.scrollWidth, innerWidth]);
    expect(sh).toBeLessThanOrEqual(vh);
    expect(sw).toBeLessThanOrEqual(vw);
    const story = (await page.getByTestId('q4-story').boundingBox())!;
    expect(story.y + story.height).toBeLessThanOrEqual(vh);
  }
  expect(errors).toEqual([]);
});

test('a game with a data note shows the same warning on the Q4 tab as on Games', async ({ page }) => {
  await page.goto('/#/q4/0022500093?t=DET');
  await expect(page.getByTestId('q4-chart')).toBeVisible();
  await expect(page.getByTestId('quality-warning')).toContainText('Kevin Durant — minutes: play-by-play 36:48 vs box score 28:08');
  await page.goto('/#/q4/0022600085?t=ORL');
  await expect(page.getByTestId('q4-chart')).toBeVisible();
  await expect(page.getByTestId('quality-warning')).toHaveCount(0);
});
