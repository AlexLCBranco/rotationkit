// Game chart hover readout (desktop): lineups at the hovered moment, fouls, settings, placement.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { cursorInfo } from '../src/domain/gameChart.ts';
import { gameLength } from '../src/domain/time.ts';
import type { Game } from '../src/domain/types.ts';

const load = (season: string, id: string) => JSON.parse(readFileSync(`data/${season}/games/${id}.json`, 'utf8')) as Game;

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !m.location().url.includes('cdn.nba.com') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
const tip = (page: Page) => page.getByTestId('chart-tip');
const row = (page: Page, id: number) => page.locator(`[data-testid=gc-player-row][data-player="${id}"]`);

/** Hover a player's timeline at elapsed time t (nudged by dx pixels). */
async function hoverAt(page: Page, g: Game, id: number, t: number, dx = 0) {
  const track = row(page, id).locator('.gc-track');
  await row(page, id).scrollIntoViewIfNeeded();
  const b = (await track.boundingBox())!;
  await page.mouse.move(b.x + (t / gameLength(g.periods)) * b.width + dx, b.y + b.height - 6);
  await expect(tip(page)).toHaveAttribute('data-player', String(id));
}
/** Readout lineups in the DOM: team → [{id, fouls, me}]. */
const lineups = (page: Page) =>
  page.locator('[data-testid=chart-tip] [data-testid=readout-lineup]').evaluateAll((els) =>
    els.map((el) => ({
      team: el.getAttribute('data-team'),
      players: [...el.querySelectorAll('[data-testid=readout-player]')].map((p) => ({
        id: Number(p.getAttribute('data-player')),
        fouls: Number(p.getAttribute('data-fouls')),
        shown: p.querySelector('[data-testid=readout-fouls]')?.textContent ?? null,
        me: p.classList.contains('me'),
      })),
    })),
  );

async function openGame(page: Page, id: string, team: string) {
  await page.goto(`/#/game/${id}?t=${team}`);
  // A hash-only change keeps the previous game on screen until this one loads: wait for this game's header.
  const g = load(id.startsWith('00226') ? '2026-27' : '2025-26', id);
  await expect(page.locator('h1')).toContainText(`${g.away.tri} ${g.away.score} @ ${g.home.tri} ${g.home.score}`);
  await expect(page.getByTestId('gc-player-row').first()).toBeVisible();
}

test('@desktop readout: both lineups at the hovered moment = the lineup cursor, 5 each, fouls so far; around substitutions', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  await page.addInitScript(() => localStorage.setItem('rk.list', 'collapsed'));
  for (const [id, season, team] of [['0022500093', '2025-26', 'DET'], ['0022600001', '2026-27', 'BOS']] as const) {
    const g = load(season, id);
    await openGame(page, id, team);
    let checked = 0;
    for (const p of g.players.filter((x) => x.played && x.stints.length).slice(0, 6)) {
      // Moments: around each of his substitution clocks (±1 px) and mid-stint.
      const ts = p.stints.flatMap(([s, e]) => [s, e, (s + e) / 2]).filter((t) => t > 0 && t < gameLength(g.periods));
      for (const t of ts.slice(0, 4))
        for (const dx of [-1, 0, 1]) {
          await hoverAt(page, g, p.id, t, dx);
          const at = Number(await tip(page).getAttribute('data-t'));
          const exp = cursorInfo(g, at);
          const got = await lineups(page);
          const order = p.team === g.home.tri ? [g.home.tri, g.away.tri] : [g.away.tri, g.home.tri];
          expect(got.map((x) => x.team)).toEqual(order);
          for (const l of got) {
            const want = exp.teams.find((x) => x.team === l.team)!.players;
            expect(l.players.length, `${l.team} at ${at}`).toBe(5);
            expect(l.players.map((x) => x.id)).toEqual(want.map((x) => x.p.id));
            for (const x of l.players) {
              const pl = g.players.find((y) => y.id === x.id)!;
              const n = (pl.fouls ?? []).filter(([ft]) => ft <= at).length;
              expect(x.fouls).toBe(n);
              expect(x.shown).toBe(n > 0 ? String(n) : null);
              expect(x.me).toBe(x.id === p.id);
            }
          }
          // Stint line: his stint at that moment, or "(off court)".
          const on = got[0]!.players.some((x) => x.me);
          await expect(page.getByTestId('readout-stint')).toContainText(on ? /: in Q|: in OT|: in \dOT/ : '(off court)');
          checked++;
        }
    }
    expect(checked).toBeGreaterThan(50);
  }
  expect(errors).toEqual([]);
});

test('@desktop readout lineups equal the pinned lineup cursor panel at the same moment', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rk.list', 'collapsed'));
  const g = load('2025-26', '0022500093');
  await openGame(page, g.id, 'DET');
  const p = g.players.find((x) => x.name === 'Isaiah Stewart')!;
  for (const t of [600, 1500, 2300]) {
    await hoverAt(page, g, p.id, t);
    const got = await lineups(page);
    await page.mouse.down();
    await page.mouse.up(); // click pins the cursor at the same spot
    const panel = await page.getByTestId('cursor-team').evaluateAll((els) =>
      els.map((el) => ({ team: el.getAttribute('data-team'), n: el.querySelectorAll('[data-testid=cursor-player]').length, fouls: [...el.querySelectorAll('[data-testid=cursor-player]')].map((x) => Number(x.getAttribute('data-fouls'))) })),
    );
    for (const l of got) {
      const c = panel.find((x) => x.team === l.team)!;
      expect(c.n).toBe(5);
      expect([...c.fouls].sort()).toEqual(l.players.map((x) => x.fouls).sort());
    }
    await page.getByRole('button', { name: 'Close' }).click();
  }
});

test('@desktop hovering an empty part of a row: both lineups, "(off court)" in the stint line', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rk.list', 'collapsed'));
  const g = load('2025-26', '0022500093');
  await openGame(page, g.id, 'DET');
  const p = g.players.find((x) => x.name === 'Jalen Duren')!;
  const gap = p.stints.find((s, i) => p.stints[i + 1] && p.stints[i + 1]![0] - s[1] > 120)!;
  await hoverAt(page, g, p.id, gap[1] + 60);
  const got = await lineups(page);
  expect(got).toHaveLength(2);
  expect(got.every((l) => l.players.length === 5)).toBe(true);
  expect(got[0]!.players.some((x) => x.me)).toBe(false);
  await expect(page.getByTestId('readout-stint')).toHaveText('Duren (off court)');
  await expect(page.getByTestId('readout-head')).toHaveText(/^Q\d \d+:\d\d · DET \d+–\d+ HOU$/);
});

test('@desktop readout settings change the content and persist across reload', async ({ page }) => {
  await page.addInitScript(() => localStorage.getItem('rk.list') ?? localStorage.setItem('rk.list', 'collapsed'));
  const g = load('2025-26', '0022500093');
  const p = g.players.find((x) => x.name === 'Isaiah Stewart')!;
  const t = p.stints[1]![0] + 30; // on court, with fouls on the floor by then
  await openGame(page, g.id, 'DET');
  // Defaults: both lineups + stint + fouls.
  await hoverAt(page, g, p.id, t);
  await expect(page.getByTestId('readout-lineup')).toHaveCount(2);
  await expect(page.getByTestId('readout-stint')).toHaveCount(1);
  expect(await page.getByTestId('readout-fouls').count()).toBeGreaterThan(0);
  const settings = async (fn: () => Promise<void>) => {
    await page.getByTestId('readout-settings').click();
    await fn();
    await page.keyboard.press('Escape');
  };
  await settings(() => page.getByLabel('Hovered player’s team only').check());
  await hoverAt(page, g, p.id, t);
  await expect(page.getByTestId('readout-lineup')).toHaveCount(1);
  await expect(page.getByTestId('readout-lineup')).toHaveAttribute('data-team', 'DET');
  await settings(() => page.getByLabel('Foul counts').uncheck());
  await hoverAt(page, g, p.id, t);
  await expect(page.getByTestId('readout-fouls')).toHaveCount(0);
  await settings(() => page.getByLabel('Stint details').uncheck());
  await hoverAt(page, g, p.id, t);
  await expect(page.getByTestId('readout-stint')).toHaveCount(0);
  // Persisted.
  await page.reload();
  await expect(page.getByTestId('gc-player-row').first()).toBeVisible();
  await hoverAt(page, g, p.id, t);
  await expect(page.getByTestId('readout-lineup')).toHaveCount(1);
  await expect(page.getByTestId('readout-fouls')).toHaveCount(0);
  await expect(page.getByTestId('readout-stint')).toHaveCount(0);
  await settings(() => page.getByLabel('Off', { exact: true }).check());
  await hoverAt(page, g, p.id, t);
  await expect(page.getByTestId('readout-lineup')).toHaveCount(0);
  await expect(page.getByTestId('readout-head')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('gc-player-row').first()).toBeVisible();
  await page.getByTestId('readout-settings').click();
  await expect(page.getByLabel('Off', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Stint details')).not.toBeChecked();
  await expect(page.getByLabel('Foul counts')).not.toBeChecked();
});

test('@desktop the readout stays on screen at 1280px and never covers the hovered row', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const g = load('2025-26', '0022500093');
  for (const list of ['open', 'collapsed']) {
    await page.goto('/');
    await page.evaluate((v) => localStorage.setItem('rk.list', v), list);
    await openGame(page, g.id, 'DET');
    const ids = await page.getByTestId('gc-player-row').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-player'))));
    let checked = 0;
    for (const id of [ids[0]!, ids[3]!, ids[ids.length - 1]!]) {
      const r = row(page, id);
      await r.scrollIntoViewIfNeeded();
      // Scroll so the row is at the very top, then at the very bottom of the window, too.
      for (const where of ['as-is', 'top', 'bottom'] as const) {
        if (where !== 'as-is')
          await r.evaluate((el, w) => {
            const b = el.getBoundingClientRect();
            scrollBy(0, w === 'top' ? b.top - 2 : b.bottom - innerHeight + 2);
          }, where);
        const box = page.locator('.gc-box').first();
        const vb = (await box.boundingBox())!;
        const track = (await r.locator('.gc-track').boundingBox())!;
        const left = Math.max(track.x, vb.x) + 2;
        const right = Math.min(track.x + track.width, vb.x + vb.width, 1280) - 2;
        for (const f of [0, 0.5, 1]) {
          await page.mouse.move(left + f * (right - left), track.y + track.height - 6);
          await expect(tip(page)).toBeVisible();
          const tb = (await tip(page).boundingBox())!;
          const rb = (await r.boundingBox())!;
          expect(tb.x).toBeGreaterThanOrEqual(0);
          expect(tb.y).toBeGreaterThanOrEqual(0);
          expect(tb.x + tb.width).toBeLessThanOrEqual(1280);
          expect(tb.y + tb.height).toBeLessThanOrEqual(800);
          const overlap = Math.min(tb.y + tb.height, rb.y + rb.height) - Math.max(tb.y, rb.y);
          expect(overlap, `card covers the hovered row (${list}, ${where}, ${f})`).toBeLessThanOrEqual(0);
          checked++;
        }
      }
    }
    expect(checked).toBe(27);
  }
});
