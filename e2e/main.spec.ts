// Main screen: a team's game (team picker + game list sidebar + game chart). Desktop only (@desktop).

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

test('@desktop opening the app shows the main screen: team + game list + the latest game chart', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByTestId('tab-games')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByLabel('Season')).toHaveValue('2026-27');
  await expect(page.getByTestId('game-list')).toBeVisible();
  await expect(page.getByTestId('gc-player-row').first()).toBeVisible();
  // Default team ATL (first), its most recent 2026-27 game; the URL names team and game.
  const atl = index('2026-27').filter((e) => e.home === 'ATL' || e.away === 'ATL').at(-1)!;
  await expect(page).toHaveURL(new RegExp(`#/game/${atl.id}\\?.*t=ATL`));
  await expect(page.getByTestId('next-game')).toBeDisabled();
  expect(errors).toEqual([]);
});

const oldestFirst = [...newestFirst].reverse();
const rows = (page: Page) => page.getByTestId('list-row');
const ids = (page: Page) => rows(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
const usDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}/${d.slice(0, 4)}`;
/** The row is fully inside the list's visible area. */
const inView = (page: Page, id: string) =>
  page.evaluate((id) => {
    const box = document.querySelector('[data-testid=game-list-rows]')!.getBoundingClientRect();
    const head = document.querySelector('.gl-table thead')!.getBoundingClientRect().height;
    const r = document.querySelector(`[data-testid=list-row][data-id="${id}"]`)!.getBoundingClientRect();
    return r.top >= box.top + head - 1 && r.bottom <= box.bottom + 1 && r.bottom <= innerHeight;
  }, id);

test('@desktop game list: every finished game, oldest first, columns, latest selected and scrolled into view', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#/game/latest?t=ORL&s=2025-26');
  await expect(page).toHaveURL(new RegExp(`#/game/${latest.id}\\?`));
  await expect(page.getByTestId('tag-legend')).toBeVisible();
  await expect(rows(page)).toHaveCount(ORL.length);
  expect(await ids(page)).toEqual(oldestFirst.map((e) => e.id));
  await expect(page.locator('.gl-table thead')).toContainText('DATE');
  await expect(page.locator('.gl-table thead')).toContainText('TM');
  await expect(page.locator('.gl-table thead')).toContainText('OPP');
  // Columns in order: date | TM | @/vs | OPP | result | tags | rest.
  const first = oldestFirst[0]!;
  const cells = await rows(page).first().locator('td').allTextContents();
  const [us, them] = first.home === 'ORL' ? [first.hs, first.as] : [first.as, first.hs];
  expect(cells.slice(0, 5).map((c) => c.trim())).toEqual([usDate(first.date), 'ORL', first.home === 'ORL' ? 'vs' : '@', first.home === 'ORL' ? first.away : first.home, `${us > them ? 'W' : 'L'} ${us}–${them}`]);
  const results = await page.locator('[data-testid=list-row] [data-testid=list-result]').allTextContents();
  expect(results.map((r) => r.replace('⚠', '').trim())).toEqual(
    oldestFirst.map((e) => {
      const [u, t] = e.home === 'ORL' ? [e.hs, e.as] : [e.as, e.hs];
      return `${u > t ? 'W' : 'L'} ${u}–${t}`;
    }),
  );
  await expect(page.locator('[data-testid=list-row] [data-testid=flag]')).toHaveCount(ORL.filter((e) => e.flagged).length);
  for (const e of oldestFirst.slice(-25)) await expectChips(page.locator(`[data-testid=list-row][data-id="${e.id}"]`), expectedTags('ORL', e.id));
  // Selected = latest, highlighted, visible without scrolling by hand.
  const sel = page.locator(`[data-testid=list-row][data-id="${latest.id}"]`);
  await expect(sel).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-testid=list-row][aria-selected=true]')).toHaveCount(1);
  expect(await sel.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(await rows(page).first().evaluate((el) => getComputedStyle(el).backgroundColor));
  expect(await inView(page, latest.id)).toBe(true);
  // An old game opened by URL is scrolled into view too.
  await page.goto(`/#/game/${oldestFirst[3]!.id}?t=ORL&s=2025-26`);
  await expect(page.locator(`[data-testid=list-row][data-id="${oldestFirst[3]!.id}"]`)).toHaveAttribute('aria-selected', 'true');
  expect(await inView(page, oldestFirst[3]!.id)).toBe(true);
  expect(errors).toEqual([]);
});

test('@desktop clicking a row, the date link and arrow keys load the right game; URL updates', async ({ page }) => {
  await page.goto('/#/game/latest?t=ORL&s=2025-26');
  await expect(page).toHaveURL(new RegExp(`#/game/${latest.id}\\?`));
  const pick = oldestFirst[40]!;
  await page.locator(`[data-testid=list-row][data-id="${pick.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`#/game/${pick.id}\\?.*t=ORL`));
  await expect(page.locator('h1')).toContainText(`${pick.away} ${pick.as} @ ${pick.home} ${pick.hs}`);
  await expect(page.getByTestId('game-count')).toHaveText('Game 41 of 82 · 2025-26');
  await page.locator(`[data-testid=list-row][data-id="${oldestFirst[10]!.id}"] .gl-date`).click();
  await expect(page).toHaveURL(new RegExp(`#/game/${oldestFirst[10]!.id}\\?`));
  // Keyboard on the focused list: ↓ = next (newer), ↑ = previous (older).
  await page.getByTestId('game-list-rows').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page).toHaveURL(new RegExp(`#/game/${oldestFirst[11]!.id}\\?`));
  await page.keyboard.press('ArrowDown');
  await expect(page).toHaveURL(new RegExp(`#/game/${oldestFirst[12]!.id}\\?`));
  await page.keyboard.press('ArrowUp');
  await expect(page).toHaveURL(new RegExp(`#/game/${oldestFirst[11]!.id}\\?`));
  const g = oldestFirst[11]!;
  await expect(page.locator('h1')).toContainText(`${g.away} ${g.as} @ ${g.home} ${g.hs}`);
  await expect(page.locator(`[data-testid=list-row][data-id="${g.id}"]`)).toHaveAttribute('aria-selected', 'true');
});

test('@desktop prev / next arrows step through the team\'s games in order', async ({ page }) => {
  await page.goto('/#/game/latest?t=ORL&s=2025-26');
  await expect(page).toHaveURL(new RegExp(`#/game/${latest.id}\\?`));
  await expect(page.getByTestId('game-count')).toHaveText('Game 82 of 82 · 2025-26');
  await expect(page.getByTestId('next-game')).toBeDisabled();
  await page.getByTestId('prev-game').click();
  await expect(page).toHaveURL(new RegExp(`#/game/${newestFirst[1]!.id}\\?.*t=ORL`));
  await page.getByTestId('prev-game').click();
  await expect(page).toHaveURL(new RegExp(`#/game/${newestFirst[2]!.id}\\?`));
  await page.getByTestId('next-game').click();
  await expect(page).toHaveURL(new RegExp(`#/game/${newestFirst[1]!.id}\\?`));
  const g = newestFirst[1]!;
  await expect(page.locator('h1')).toContainText(`${g.away} ${g.as} @ ${g.home} ${g.hs}`);
  const oldest = newestFirst.at(-1)!;
  await page.goto(`/#/game/${oldest.id}?t=ORL`);
  await expect(page.locator('h1')).toContainText(`${oldest.away} ${oldest.as} @ ${oldest.home} ${oldest.hs}`);
  await expect(page.getByTestId('prev-game')).toBeDisabled();
  await expect(page.getByTestId('next-game')).toBeEnabled();
});

test('@desktop opponent search filters rows (tricode or team name)', async ({ page }) => {
  await page.goto('/#/game/latest?t=ORL&s=2025-26');
  const vsBos = oldestFirst.filter((e) => e.home === 'BOS' || e.away === 'BOS');
  await page.getByLabel('Filter by opponent').fill('bos');
  await expect(rows(page)).toHaveCount(vsBos.length);
  expect(await ids(page)).toEqual(vsBos.map((e) => e.id));
  await page.getByLabel('Filter by opponent').fill('Celtics');
  await expect(rows(page)).toHaveCount(vsBos.length);
  await page.getByLabel('Filter by opponent').fill('zzz');
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByTestId('game-list')).toContainText('No games against');
  await page.getByLabel('Filter by opponent').fill('BOS');
  await rows(page).first().click();
  await expect(page).toHaveURL(new RegExp(`#/game/${vsBos[0]!.id}\\?`));
  await page.getByLabel('Filter by opponent').fill('');
  await expect(rows(page)).toHaveCount(ORL.length);
});

test('@desktop picking a game updates the URL; reload and back keep the same game', async ({ page }) => {
  await page.goto('/#/game/latest?t=ORL&s=2025-26');
  await expect(page).toHaveURL(new RegExp(`#/game/${latest.id}\\?`));
  const pick = newestFirst[9]!;
  await page.locator(`[data-testid=list-row][data-id="${pick.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`#/game/${pick.id}\\?.*t=ORL`));
  await page.reload();
  await expect(page.locator('h1')).toContainText(`${pick.away} ${pick.as} @ ${pick.home} ${pick.hs}`);
  expect(gameId(page)).toBe(pick.id);
  await expect(page.locator(`[data-testid=list-row][data-id="${pick.id}"]`)).toHaveAttribute('aria-selected', 'true');
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`#/game/${latest.id}\\?`));
});

test('@desktop collapse / expand the list; the state is remembered', async ({ page }) => {
  await page.goto('/#/game/latest?t=ORL&s=2025-26');
  const chart = page.locator('.gc-box').first();
  await expect(page.getByTestId('game-list')).toBeVisible();
  const narrow = (await chart.boundingBox())!.width;
  await page.getByTestId('list-collapse').click();
  await expect(page.getByTestId('game-list')).toHaveCount(0);
  await expect(page.getByTestId('list-expand')).toBeVisible();
  expect((await chart.boundingBox())!.width).toBeGreaterThan(narrow + 300); // chart gets the full width
  await page.reload();
  await expect(page.getByTestId('list-expand')).toBeVisible();
  await expect(page.getByTestId('game-list')).toHaveCount(0);
  await page.getByLabel('Season').selectOption('2026-27'); // season stays reachable while collapsed
  await expect(page).toHaveURL(/s=2026-27/);
  await page.getByTestId('list-expand').click();
  await expect(page.getByTestId('game-list')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('game-list')).toBeVisible();
});

test('@desktop minute labels keep their size with the sidebar open; the chart scrolls inside its box instead', async ({ page }) => {
  const labels = () =>
    page.locator('[data-testid=game-team]').first().getByTestId('stint-label').evaluateAll((els) =>
      els.map((e) => ({ text: e.textContent, w: Math.round(e.getBoundingClientRect().width), clipped: e.scrollWidth > e.clientWidth + 1, visible: e.getBoundingClientRect().width > 0 })),
    );
  const pxPerMinute = () => page.locator('[data-testid=game-team]').first().locator('.gc-row:not(.gc-axis) .gc-track').first().evaluate((el) => el.getBoundingClientRect().width / 48);
  for (const width of [1280, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#/game/0022500093?t=ORL');
    await expect(page.getByTestId('game-list')).toBeVisible();
    await expect(page.getByTestId('stint-label').first()).toBeVisible();
    const open = await labels();
    expect(await pxPerMinute()).toBeGreaterThanOrEqual(18);
    expect(open.length).toBeGreaterThan(10);
    expect(open.every((l) => l.visible && !l.clipped && l.text)).toBe(true);
    await page.getByTestId('list-collapse').click();
    await expect(page.getByTestId('game-list')).toHaveCount(0);
    const closed = await labels();
    expect(open.map((l) => l.text)).toEqual(closed.map((l) => l.text));
    // Same or wider with the full width (the chart may stretch), never narrower with the list open below the minimum.
    open.forEach((l, i) => expect(l.w).toBeLessThanOrEqual(closed[i]!.w));
    expect(open.every((l) => l.w >= 1)).toBe(true);
    await page.getByTestId('list-expand').click();
  }
  // At 1280 the chart is wider than its box → it scrolls inside the box; the page itself does not.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  const box = page.locator('.gc-box').first();
  const [sw, cw] = await box.evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(sw).toBeGreaterThan(cw);
  const [psw, pcw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(psw).toBeLessThanOrEqual(pcw);
});

test('@desktop team picker and season picker → that team\'s latest game; the opponent\'s view lists its own games', async ({ page }) => {
  await page.goto('/#/game/latest?t=ORL&s=2025-26');
  await page.getByLabel('Team').selectOption('BOS');
  const bos = index('2025-26').filter((e) => e.home === 'BOS' || e.away === 'BOS');
  await expect(page).toHaveURL(new RegExp(`#/game/${bos.at(-1)!.id}\\?.*t=BOS`));
  await expect(rows(page)).toHaveCount(bos.length);
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
