// By day tab (desktop): game cards of one day (order, closers, full-Q4 marks, CD DNPs), clicking a team's
// half, previous / next game and the back link on the game page, the Q4 minutes leaders panel (order, ties, No
// blowouts), arrow keys, the empty-date note, upcoming games, and Full Q4 without its old by-date section.
// Expected values come from the committed data through the same domain functions (src/domain/slate.ts).

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { cardSide, dayQ4Leaders, slateDates, slateDay, tipLabel } from '../src/domain/slate.ts';
import type { QuartersFile } from '../src/domain/leaders.ts';
import type { Game, GameIndexEntry, ScheduleEntry } from '../src/domain/types.ts';

const read = <T>(f: string) => JSON.parse(readFileSync(f, 'utf8')) as T;
const index = (s: string) => read<GameIndexEntry[]>(`data/${s}/index.json`);
const schedule = (s: string) => read<ScheduleEntry[]>(`data/${s}/schedule.json`);
const quarters = (s: string) => read<QuartersFile>(`data/${s}/quarters.json`);
const game = (s: string, id: string) => read<Game>(`data/${s}/games/${id}.json`);
const day = (s: string, d: string) => slateDay(index(s), schedule(s), d);

/** Fixture: 9 games, two in overtime, coach's-decision DNPs, more than 10 leaders, blowouts. */
const S = '2025-26';
const D = '2025-11-10';

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !m.location().url.includes('cdn.nba.com') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
const cardIds = (page: Page) => page.getByTestId('dv-game').evaluateAll((els) => els.map((e) => e.getAttribute('data-game')));
const leaderRows = (page: Page) =>
  page.getByTestId('dv-leader').evaluateAll((els) => els.map((e) => [Number(e.getAttribute('data-rank')), Number(e.getAttribute('data-player')), e.getAttribute('data-game')]));
const teamOrder = (page: Page) => page.getByTestId('game-team').evaluateAll((els) => els.map((e) => e.querySelector('[data-testid=team-link]')!.getAttribute('data-team')));
/** Game page URL with that team selected and the day kept (parameter order not checked). */
const gameUrl = (id: string, team: string, date: string | null = D) => new RegExp(`/game/${id}\\?(?=(.*&)?t=${team}(&|$))${date ? `(?=.*day=${date})` : ''}`);
/** Click a team's half of a card on a spot that is not a link (the area under the team's head). */
const clickSide = (page: Page, id: string, team: string) => page.locator(`[data-testid=dv-game][data-game="${id}"] [data-testid=dv-side][data-team="${team}"]`).click({ position: { x: 4, y: 4 } });

test('By day tab in the main menu; opens on the latest day with finished games; Games tab goes back', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/game/latest?t=ORL&s=2026-27');
  await expect(page.getByTestId('tab-games')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('games-mode')).toHaveCount(0);
  await page.getByTestId('tab-day').click();
  await expect(page).toHaveURL(/\/games\?view=day&s=2026-27/);
  const latest = slateDates(index('2026-27'), schedule('2026-27')).latestFinished!;
  await expect(page.getByTestId('dv-date')).toHaveValue(latest);
  await expect(page.getByTestId('tab-day')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('tab-games')).not.toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('dv-game')).toHaveCount(day('2026-27', latest).length);
  await page.getByTestId('tab-games').click();
  await expect(page).toHaveURL(/\/game\/\d+\?.*t=ORL/);
  await expect(page.getByTestId('game-team').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('By day tab from a game opened from By day returns to that day', async ({ page }) => {
  const id = day(S, D).find((g) => g.finished)!.id;
  await page.goto(`/game/${id}?t=${game(S, id).home.tri}&s=${S}&day=${D}`);
  await page.getByTestId('tab-day').click();
  await expect(page.getByTestId('dv-date')).toHaveValue(D);
  await expect(page.getByTestId('tab-day')).toHaveAttribute('aria-current', 'page');
});

test('cards: count and order, scores, closers with full-Q4 marks, coach\'s-decision DNPs', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`/games?view=day&date=${D}&s=${S}`);
  const want = day(S, D);
  await expect(page.getByTestId('dv-game')).toHaveCount(want.length);
  expect(await cardIds(page)).toEqual(want.map((g) => g.id));
  let cds = 0;
  for (const sg of want) {
    const g = game(S, sg.id);
    const card = page.locator(`[data-testid=dv-game][data-game="${sg.id}"]`);
    for (const t of [g.away.tri, g.home.tri]) {
      const s = cardSide(g, t);
      const side = card.locator(`[data-testid=dv-side][data-team="${t}"]`);
      await expect(side.getByTestId('dv-closer')).toHaveCount(5);
      const got = await side.getByTestId('dv-closer').evaluateAll((els) => els.map((e) => [Number(e.getAttribute('data-player')), e.getAttribute('data-full'), !!e.querySelector('[data-testid=dv-fullq4]')]));
      expect(got).toEqual(s.closers.map((p) => [p.id, p.fullQ4 ? '1' : '0', p.fullQ4]));
      await expect(side.getByTestId('dv-score')).toHaveText(String(t === g.home.tri ? g.home.score : g.away.score));
      const cd = await side.getByTestId('dv-cd-player').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-player'))));
      expect(cd).toEqual(s.cd.map((p) => p.id));
      if (s.cd.length) await expect(side.getByTestId('dv-cd')).toContainText('DNP – CD');
      cds += s.cd.length;
    }
  }
  expect(cds).toBeGreaterThan(0);
  await expect(page.locator('[data-testid=dv-game] header', { hasText: 'Final/OT' }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('2026-27 cards are in tip-time order with the tip time shown', async ({ page }) => {
  const d = '2026-11-11';
  const want = day('2026-27', d);
  await page.goto(`/games?view=day&date=${d}&s=2026-27`);
  await expect(page.getByTestId('dv-game')).toHaveCount(want.length);
  expect(await cardIds(page)).toEqual(want.map((g) => g.id));
  const tips = want.map((g) => g.tip!);
  expect([...tips].sort()).toEqual(tips);
  await expect(page.getByTestId('dv-tip')).toHaveText(want.map((g) => tipLabel(g.tip)));
});

test('clicking a team\'s half opens the game with that team first; previous / next game keep the side; back link', async ({ page }) => {
  const want = day(S, D).filter((g) => g.finished);
  const second = want[1]!;
  await page.goto(`/games?view=day&date=${D}&s=${S}`);
  await clickSide(page, second.id, second.away);
  await expect(page).toHaveURL(gameUrl(second.id, second.away));
  await expect.poll(() => teamOrder(page)).toEqual([second.away, second.home]);
  await page.getByTestId('day-next').click();
  await expect(page).toHaveURL(gameUrl(want[2]!.id, want[2]!.away));
  await page.getByTestId('day-prev').click();
  await page.getByTestId('day-prev').click();
  await expect(page).toHaveURL(gameUrl(want[0]!.id, want[0]!.away));
  await expect(page.getByTestId('day-prev')).toBeDisabled();
  await expect(page.getByTestId('day-back')).toHaveText('Back to Nov 10 2025');
  await page.getByTestId('day-back').click();
  await expect(page).toHaveURL(new RegExp(`/games\\?view=day&date=${D}&s=${S}`));
  await expect(page.getByTestId('dv-game')).toHaveCount(day(S, D).length);
  // Home side, last game: next is disabled.
  const last = want[want.length - 1]!;
  await clickSide(page, last.id, last.home);
  await expect(page).toHaveURL(gameUrl(last.id, last.home));
  await expect.poll(() => teamOrder(page)).toEqual([last.home, last.away]);
  await expect(page.getByTestId('day-next')).toBeDisabled();
  // Leaving the day (team ◀ ▶) drops the day context.
  await page.getByTestId('prev-game').click();
  await expect(page).not.toHaveURL(/day=/);
  await expect(page.getByTestId('day-nav')).toHaveCount(0);
});

test('Q4 minutes leaders: order and ties at 10th; No blowouts applies to the panel only; game link', async ({ page }) => {
  await page.goto(`/games?view=day&date=${D}&s=${S}`);
  const all = dayQ4Leaders(quarters(S), D, false);
  expect(all.length).toBeGreaterThan(10);
  await expect(page.getByTestId('dv-leader')).toHaveCount(all.length);
  expect(await leaderRows(page)).toEqual(all.map((r) => [r.rank, r.id, r.game]));
  // Everyone after the 10th is tied with him.
  expect(all.slice(10).every((r) => r.q4 === all[9]!.q4)).toBe(true);
  await page.getByRole('checkbox', { name: 'No blowouts' }).check();
  await expect(page).toHaveURL(/nb=1/);
  const nb = dayQ4Leaders(quarters(S), D, true);
  expect(nb.length).not.toBe(all.length);
  await expect(page.getByTestId('dv-leader')).toHaveCount(nb.length);
  expect(await leaderRows(page)).toEqual(nb.map((r) => [r.rank, r.id, r.game]));
  await expect(page.getByTestId('dv-game')).toHaveCount(day(S, D).length);
  // Game link → that game with the player's team first.
  const first = nb[0]!;
  await page.getByTestId('dv-leader').first().getByTestId('dv-leader-game').click();
  await expect(page).toHaveURL(gameUrl(first.game, first.team));
  await expect.poll(() => teamOrder(page).then((o) => o[0])).toBe(first.team);
  // Player name → his page.
  await page.goto(`/games?view=day&date=${D}&s=${S}`);
  await page.getByTestId('dv-leader').first().getByTestId('player-link').click();
  await expect(page).toHaveURL(new RegExp(`/player/${all[0]!.team}/${all[0]!.id}`));
});

test('arrow keys and ◀ ▶ change the day; a date without games shows the note', async ({ page }) => {
  const { dates } = slateDates(index(S), schedule(S));
  const i = dates.indexOf(D);
  await page.goto(`/games?view=day&date=${D}&s=${S}`);
  await expect(page.getByTestId('dv-game').first()).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(new RegExp(`date=${dates[i - 1]}`));
  await expect(page.getByTestId('dv-date')).toHaveValue(dates[i - 1]!);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(new RegExp(`date=${dates[i + 1]}`));
  await page.getByTestId('dv-prev').click();
  await expect(page).toHaveURL(new RegExp(`date=${D}`));
  // Christmas Eve 2025: no games.
  await page.goto(`/games?view=day&date=2025-12-24&s=${S}`);
  const latest = slateDates(index(S), schedule(S)).latestFinished!;
  await expect(page.getByTestId('dv-note')).toHaveText(`No games on 2025-12-24; showing ${latest}.`);
});

test('a game not played yet is greyed out with its tip time and is not clickable', async ({ page }) => {
  const idx = index('2026-27');
  const sch = schedule('2026-27');
  const { dates } = slateDates(idx, sch);
  const d = dates.find((x) => slateDay(idx, sch, x).some((g) => !g.finished && g.status === 'scheduled'));
  test.skip(!d, 'no scheduled game left in the committed schedule');
  const up = slateDay(idx, sch, d!).find((g) => !g.finished && g.status === 'scheduled')!;
  await page.goto(`/games?view=day&date=${d}&s=2026-27`);
  const card = page.locator(`[data-testid=dv-game][data-game="${up.id}"]`);
  await expect(card).toHaveAttribute('data-finished', '0');
  await expect(card).toHaveClass(/upcoming/);
  await expect(card.getByTestId('dv-tip')).toHaveText(tipLabel(up.tip));
  expect(Number(await card.evaluate((e) => getComputedStyle(e).opacity))).toBeLessThan(1);
  await expect(card.locator('[role=link]')).toHaveCount(0);
  await expect(card.getByTestId('dv-closer')).toHaveCount(0);
  const url = page.url();
  await card.getByTestId('dv-side').first().click({ position: { x: 4, y: 4 } });
  await expect(page).toHaveURL(url);
});
