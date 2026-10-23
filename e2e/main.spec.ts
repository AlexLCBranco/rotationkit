// Main screen: a team's game (team picker + game picker + game chart). Desktop only (@desktop).

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Entry = { id: string; date: string; home: string; away: string; hs: number; as: number; flagged?: true };
const index = (s: string) => JSON.parse(readFileSync(`data/${s}/index.json`, 'utf8')) as Entry[];
const ORL = index('2025-26').filter((e) => e.home === 'ORL' || e.away === 'ORL');
const newestFirst = [...ORL].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
const latest = newestFirst[0]!;

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !m.location().url.includes('cdn.nba.com') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
const gameId = (page: Page) => new URL(page.url()).hash.match(/^#\/game\/(\d{10})/)?.[1];
const items = (page: Page) => page.getByTestId('picker-item');

// Independent tag check (not using the app's module): from the season's game dates per team.
const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
function expectedTags(team: string, id: string) {
  const ds = index('2025-26')
    .filter((e) => e.home === team || e.away === team)
    .map((e) => ({ id: e.id, d: day(e.date) }))
    .sort((a, b) => a.d - b.d);
  const i = ds.findIndex((x) => x.id === id);
  let pos = 0;
  for (let k = Math.max(0, i - 2); k <= i && k + 2 < ds.length; k++) if (ds[k + 2]!.d - ds[k]!.d <= 3) pos = Math.max(pos, i - k + 1);
  return {
    b2b1: i + 1 < ds.length && ds[i + 1]!.d - ds[i]!.d === 1,
    b2b2: i > 0 && ds[i]!.d - ds[i - 1]!.d === 1,
    pos,
    rest: i === 0 ? 'opener' : ds[i]!.d - ds[i - 1]!.d - 1 >= 2 ? '2d+' : `${ds[i]!.d - ds[i - 1]!.d - 1}d`,
  };
}
async function expectChips(scope: ReturnType<Page['locator']>, t: ReturnType<typeof expectedTags>) {
  await expect(scope.getByTestId('tag-b2b1')).toHaveCount(t.b2b1 ? 1 : 0);
  await expect(scope.getByTestId('tag-b2b2')).toHaveCount(t.b2b2 ? 1 : 0);
  await expect(scope.getByTestId('tag-3in4')).toHaveCount(t.pos ? 1 : 0);
  if (t.pos) await expect(scope.getByTestId('tag-3in4')).toHaveAttribute('data-position', String(t.pos));
  await expect(scope.getByTestId('tag-rest')).toHaveText(t.rest);
}

test('@desktop opening the app shows the main screen: team + game picker + the latest game chart', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByTestId('tab-games')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByLabel('Season')).toHaveValue('2026-27');
  await expect(page.getByTestId('game-picker')).toBeVisible();
  await expect(page.getByTestId('gc-player-row').first()).toBeVisible();
  // Default team ATL (first), its most recent 2026-27 game; the URL names team and game.
  const atl = index('2026-27').filter((e) => e.home === 'ATL' || e.away === 'ATL').at(-1)!;
  await expect(page).toHaveURL(new RegExp(`#/game/${atl.id}\\?.*t=ATL`));
  await expect(page.getByTestId('next-game')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('@desktop picker: newest first, every finished game, latest selected, W/L score, flagged ⚠', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#/game/latest?t=ORL&s=2025-26');
  await expect(page).toHaveURL(new RegExp(`#/game/${latest.id}\\?`));
  await page.getByTestId('game-picker').click();
  await expect(page.getByTestId('tag-legend')).toBeVisible();
  await expect(items(page)).toHaveCount(ORL.length);
  expect(await items(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-id')))).toEqual(newestFirst.map((e) => e.id));
  await expect(items(page).first()).toHaveAttribute('aria-selected', 'true');
  const results = await page.locator('[data-testid=picker-item] [data-testid=picker-result]').allTextContents();
  expect(results).toEqual(
    newestFirst.map((e) => {
      const [us, them] = e.home === 'ORL' ? [e.hs, e.as] : [e.as, e.hs];
      return `${us > them ? 'W' : 'L'} ${us}–${them}`;
    }),
  );
  await expect(page.locator('[data-testid=picker-item] [data-testid=flag]')).toHaveCount(ORL.filter((e) => e.flagged).length);
  // Chips in the list match an independent computation, game by game.
  for (const e of newestFirst.slice(0, 25)) await expectChips(page.locator(`[data-testid=picker-item][data-id="${e.id}"]`), expectedTags('ORL', e.id));
  // The list scrolls (it does not grow the page).
  const box = await page.locator('.gp-list').evaluate((el) => [el.scrollHeight, el.clientHeight]);
  expect(box[0]).toBeGreaterThan(box[1]!);
  expect(errors).toEqual([]);
});

test('@desktop prev / next arrows step through the team\'s games in order', async ({ page }) => {
  await page.goto('/#/game/latest?t=ORL&s=2025-26');
  await expect(page).toHaveURL(new RegExp(`#/game/${latest.id}\\?`));
  await expect(page.getByTestId('next-game')).toBeDisabled();
  await page.getByTestId('prev-game').click();
  await expect(page).toHaveURL(new RegExp(`#/game/${newestFirst[1]!.id}\\?.*t=ORL`));
  await page.getByTestId('prev-game').click();
  await expect(page).toHaveURL(new RegExp(`#/game/${newestFirst[2]!.id}\\?`));
  await page.getByTestId('next-game').click();
  await expect(page).toHaveURL(new RegExp(`#/game/${newestFirst[1]!.id}\\?`));
  const g = newestFirst[1]!;
  await expect(page.locator('h1')).toContainText(`${g.away} ${g.as} @ ${g.home} ${g.hs}`);
  // Oldest game: previous is disabled.
  const oldest = newestFirst.at(-1)!;
  await page.goto(`/#/game/${oldest.id}?t=ORL`);
  await expect(page.locator('h1')).toContainText(`${oldest.away} ${oldest.as} @ ${oldest.home} ${oldest.hs}`);
  await expect(page.getByTestId('prev-game')).toBeDisabled();
  await expect(page.getByTestId('next-game')).toBeEnabled();
});

test('@desktop opponent filter (tricode or team name)', async ({ page }) => {
  await page.goto('/#/game/latest?t=ORL&s=2025-26');
  await page.getByTestId('game-picker').click();
  const vsBos = newestFirst.filter((e) => e.home === 'BOS' || e.away === 'BOS');
  await page.getByLabel('Filter by opponent').fill('bos');
  await expect(items(page)).toHaveCount(vsBos.length);
  expect(await items(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-id')))).toEqual(vsBos.map((e) => e.id));
  await page.getByLabel('Filter by opponent').fill('Celtics');
  await expect(items(page)).toHaveCount(vsBos.length);
  await page.getByLabel('Filter by opponent').fill('zzz');
  await expect(items(page)).toHaveCount(0);
  await expect(page.getByTestId('game-picker-panel')).toContainText('No games against');
  await page.getByLabel('Filter by opponent').fill('BOS');
  await items(page).last().click();
  await expect(page).toHaveURL(new RegExp(`#/game/${vsBos.at(-1)!.id}\\?`));
});

test('@desktop picking a game updates the URL; reload and back keep the same game', async ({ page }) => {
  await page.goto('/#/game/latest?t=ORL&s=2025-26');
  await expect(page).toHaveURL(new RegExp(`#/game/${latest.id}\\?`));
  await page.getByTestId('game-picker').click();
  const pick = newestFirst[9]!;
  await page.locator(`[data-testid=picker-item][data-id="${pick.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`#/game/${pick.id}\\?.*t=ORL`));
  await page.reload();
  await expect(page.locator('h1')).toContainText(`${pick.away} ${pick.as} @ ${pick.home} ${pick.hs}`);
  expect(gameId(page)).toBe(pick.id);
  await page.getByTestId('game-picker').click();
  await expect(page.locator(`[data-testid=picker-item][data-id="${pick.id}"]`)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`#/game/${latest.id}\\?`));
});

test('@desktop team picker and season picker → that team\'s latest game; the opponent\'s view lists its own games', async ({ page }) => {
  await page.goto('/#/game/latest?t=ORL&s=2025-26');
  await page.getByLabel('Team').selectOption('BOS');
  const bos = index('2025-26').filter((e) => e.home === 'BOS' || e.away === 'BOS');
  await expect(page).toHaveURL(new RegExp(`#/game/${bos.at(-1)!.id}\\?.*t=BOS`));
  await page.getByTestId('game-picker').click();
  await expect(items(page)).toHaveCount(bos.length);
  await page.keyboard.press('Escape');
  await page.getByLabel('Season').selectOption('2026-27');
  const bos27 = index('2026-27').filter((e) => e.home === 'BOS' || e.away === 'BOS');
  await expect(page).toHaveURL(new RegExp(`#/game/${bos27.at(-1)!.id}\\?.*t=BOS`));
});

test('@desktop game header: this team\'s and the opponent\'s schedule tags', async ({ page }) => {
  // A game where the opponent was on the second night of a back-to-back and ORL was not, and one in a 3-in-4.
  const oppB2b = ORL.find((e) => {
    const opp = e.home === 'ORL' ? e.away : e.home;
    return expectedTags(opp, e.id).b2b2 && !expectedTags('ORL', e.id).b2b2;
  })!;
  const tif = ORL.find((e) => expectedTags('ORL', e.id).pos === 3)!;
  for (const e of [oppB2b, tif, newestFirst.at(-1)!]) {
    const opp = e.home === 'ORL' ? e.away : e.home;
    await page.goto(`/#/game/${e.id}?t=ORL&s=2025-26`);
    await expect(page.locator('h1')).toContainText(`${e.away} ${e.as} @ ${e.home} ${e.hs}`);
    await expectChips(page.locator('[data-testid=header-tags][data-team=ORL]'), expectedTags('ORL', e.id));
    await expectChips(page.locator(`[data-testid=header-tags][data-team=${opp}]`), expectedTags(opp, e.id));
  }
  await expect(page.locator('[data-testid=header-tags][data-team=ORL] [data-testid=tag-rest]')).toHaveText('opener');
});

test('@desktop overlapping 3-in-4 sets: highest position shown, every set listed on hover', async ({ page }) => {
  // A real game that sits in two sets (4 games in 5 days or tighter).
  const multi = ORL.find((e) => {
    const ds = ORL.map((x) => day(x.date)).sort((a, b) => a - b);
    const d = day(e.date);
    const i = ds.indexOf(d);
    const sets = [i - 2, i - 1, i].filter((k) => k >= 0 && k + 2 < ds.length && ds[k + 2]! - ds[k]! <= 3);
    return sets.length >= 2;
  })!;
  await page.goto(`/#/game/${multi.id}?t=ORL&s=2025-26`);
  const chip = page.locator('[data-testid=header-tags][data-team=ORL] [data-testid=tag-3in4]');
  await expect(chip).toHaveAttribute('data-position', String(expectedTags('ORL', multi.id).pos));
  expect(Number(await chip.getAttribute('data-sets'))).toBeGreaterThanOrEqual(2);
  const title = (await chip.getAttribute('title'))!;
  expect(title.split('\n').filter((l) => / game\)$/.test(l)).length).toBe(Number(await chip.getAttribute('data-sets')));
});

test('@desktop Averages is a secondary tab; Games goes back to the latest game', async ({ page }) => {
  await page.goto('/#/game/latest?t=ORL&s=2025-26');
  await expect(page).toHaveURL(new RegExp(`#/game/${latest.id}\\?`));
  await page.getByTestId('tab-averages').click();
  await expect(page).toHaveURL(/#\/team\/ORL\?s=2025-26/);
  await expect(page.getByTestId('pattern-chart')).toBeVisible();
  await page.getByTestId('tab-games').click();
  await expect(page).toHaveURL(new RegExp(`#/game/${latest.id}\\?.*t=ORL`));
});
