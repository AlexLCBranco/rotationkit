// Upcoming games open the matchup view; Averages "Closers" table; "Game by game" view.

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { closersTable } from '../src/domain/closers.ts';
import { selectGames, DEFAULT_FILTERS, type Filters } from '../src/domain/patterns.ts';
import { lastGames, playerStrips } from '../src/domain/gameByGame.ts';
import { buildAppearances } from '../src/domain/availability.ts';
import { formatMin } from '../src/app/labels.ts';
import type { Game, GameIndexEntry } from '../src/domain/types.ts';

const season = (s: string) =>
  (JSON.parse(readFileSync(`data/${s}/index.json`, 'utf8')) as GameIndexEntry[]).map((e) => JSON.parse(readFileSync(`data/${s}/games/${e.id}.json`, 'utf8')) as Game);

test('clicking an upcoming game opens Averages in matchup mode (this team vs that opponent, last 10)', async ({ page }) => {
  await page.goto('/#/game/latest?t=ORL&s=2026-27&v=home');
  const up = page.getByTestId('upcoming-row').first();
  await expect(up).toBeVisible();
  const opp = (await up.getAttribute('data-opp'))!;
  await up.locator('.gl-result-future').click();
  await expect(page).toHaveURL(new RegExp(`#/team/ORL\\?s=2026-27&w=10&v=home&vs=${opp}$`));
  await expect(page.getByTestId('team-block')).toHaveCount(2);
  await expect(page.getByTestId('team-block').nth(1)).toHaveAttribute('data-team', opp);
  await expect(page.getByTestId('selection-label').first()).toContainText('Last 10 home games');
  // Back returns to the game.
  await page.goBack();
  await expect(page).toHaveURL(/#\/game\//);
  // The date is a real link to the same place; the opponent's name still goes to its own team page.
  const up2 = page.getByTestId('upcoming-row').first();
  await expect(up2.getByTestId('upcoming-matchup')).toHaveAttribute('href', `#/team/ORL?s=2026-27&w=10&v=home&vs=${opp}`);
  await up2.getByTestId('team-link').nth(1).click();
  await expect(page).toHaveURL(new RegExp(`#/team/${opp}\\?s=2026-27&v=home$`));
});

test('Closers table: close games of the selection, same numbers as computed, follows the filters', async ({ page }) => {
  const games = season('2025-26');
  for (const [q, f] of [['', DEFAULT_FILTERS], ['&w=10&v=away', { ...DEFAULT_FILTERS, window: 10, venue: 'away' }]] as [string, Filters][]) {
    const sel = selectGames(games, '2025-26', 'ORL', f);
    const { close, rows } = closersTable(sel.games, 'ORL');
    await page.goto(`/#/team/ORL?s=2025-26${q}`);
    const table = page.getByTestId('closers');
    await expect(page.getByTestId('closers-based-on')).toContainText(`based on ${close.length} close game${close.length === 1 ? '' : 's'}`);
    await expect(table.getByTestId('closers-row')).toHaveCount(rows.length);
    const got = await table.getByTestId('closers-row').evaluateAll((trs) => trs.map((tr) => [Number(tr.getAttribute('data-player')), ...[...tr.querySelectorAll('td')].slice(1).map((td) => td.textContent)]));
    expect(got).toEqual(rows.map((r) => [r.id, String(r.played), String(r.closed), `${Math.round(r.share * 100)}%`, formatMin(r.q4Min)]));
    await expect(table.getByTestId('player-link').first()).toHaveAttribute('href', new RegExp(`^#/player/ORL/${rows[0]!.id}\\?s=2025-26`));
  }
});

test('Game by game: same players, order and rare group as the other views; last 5 games, newest on top; click opens', async ({ page }) => {
  const games = season('2025-26');
  const sel = selectGames(games, '2025-26', 'ORL', { ...DEFAULT_FILTERS, window: 10 });
  const last = lastGames(sel.games);
  await page.goto('/#/team/ORL?s=2025-26&w=10');
  const typical = page.getByTestId('pattern-chart');
  await expect(typical.getByTestId('player-row').first()).toBeVisible();
  await page.getByTestId('rare-toggle').click();
  const order = await typical.getByTestId('player-row').evaluateAll((els) => els.map((e) => [e.getAttribute('data-player'), e.getAttribute('data-rare')]));
  await page.getByRole('button', { name: 'Game by game' }).click();
  const gbg = page.getByTestId('game-by-game');
  await expect(gbg).toBeVisible();
  // Rare group stays open (shared state) and the order is the same.
  expect(await gbg.getByTestId('player-row').evaluateAll((els) => els.map((e) => [e.getAttribute('data-player'), e.getAttribute('data-rare')]))).toEqual(order);
  const idx = buildAppearances(games);
  for (const [pid] of order.slice(0, 6)) {
    const row = gbg.locator(`[data-testid=player-row][data-player="${pid}"]`);
    const strips = row.getByTestId('gbg-strip');
    await expect(strips).toHaveCount(5);
    expect(await strips.evaluateAll((els) => els.map((e) => e.getAttribute('data-game')))).toEqual(last.map((g) => g.id));
    const want = playerStrips(last, 'ORL', Number(pid), idx);
    for (let i = 0; i < 5; i++) {
      const s = strips.nth(i);
      expect(await s.getByTestId('gbg-stint').evaluateAll((els) => els.map((e) => [Number(e.getAttribute('data-start')), Number(e.getAttribute('data-end'))]))).toEqual(want[i]!.stints.map(([a, b]) => [a, b]));
      if (!want[i]!.played) await expect(s.getByTestId('gbg-missed')).toHaveText(want[i]!.missed!);
    }
  }
  // Labels: date and opponent.
  const first = gbg.getByTestId('gbg-strip').first();
  await expect(first).toContainText(last[0]!.home.tri === 'ORL' ? last[0]!.away.tri : last[0]!.home.tri);
  // Bars sit on the quarter axis: a stint starting at t is at t × k from the track's left.
  const bar = gbg.getByTestId('gbg-stint').nth(3);
  const track = bar.locator('xpath=..');
  const [bb, tb] = [(await bar.boundingBox())!, (await track.boundingBox())!];
  expect(Math.abs(bb.x - (tb.x + (Number(await bar.getAttribute('data-start')) * tb.width) / 2880))).toBeLessThan(0.6);
  // Clicking a strip opens that game.
  await gbg.getByTestId('gbg-strip').nth(2).locator('.gc-track').click();
  await expect(page).toHaveURL(new RegExp(`#/game/${last[2]!.id}\\?`));
});

test('Game by game: a missed game shows an empty strip with the reason', async ({ page }) => {
  // Franz Wagner missed long stretches of 2025-26 (official injury list).
  const games = season('2025-26');
  const sel = selectGames(games, '2025-26', 'ORL', DEFAULT_FILTERS);
  const idx = buildAppearances(games);
  const strips = playerStrips(lastGames(sel.games), 'ORL', 1630532, idx);
  await page.goto('/#/team/ORL?s=2025-26');
  await page.getByRole('button', { name: 'Game by game' }).click();
  await page.getByTestId('rare-toggle').click();
  const row = page.locator('[data-testid=game-by-game] [data-testid=player-row][data-player="1630532"]');
  await expect(row.getByTestId('gbg-strip')).toHaveCount(5);
  const missed = strips.filter((s) => !s.played);
  await expect(row.getByTestId('gbg-missed')).toHaveText(missed.map((s) => s.missed!));
  test.info().annotations.push({ type: 'missed', description: missed.map((s) => s.missed).join(' | ') });
});
