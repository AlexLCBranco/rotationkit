// End-to-end checks against the production build (vite preview). Screenshots go to screenshots/ (gitignored).

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DEFAULT_FILTERS, selectGames, type Filters } from '../src/domain/patterns.ts';
import { restForTeam } from '../src/domain/rest.ts';
import type { Game } from '../src/domain/types.ts';

const TEAMS = ['ATL', 'BKN', 'BOS', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK', 'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS'];
const index = (s: string) => JSON.parse(readFileSync(`data/${s}/index.json`, 'utf8')) as { home: string; away: string }[];
const teamGames = (s: string, t: string) => index(s).filter((g) => g.home === t || g.away === t).length;

/**
 * A team + filters whose selection has a number of games matching `want` (searched in the data, newest season first),
 * so tests that need "one game" or "under 5 games" keep working as the season fills up.
 */
function findSelection(want: (n: number) => boolean, teams = TEAMS) {
  for (const season of ['2026-27', '2025-26']) {
    const sched = JSON.parse(readFileSync(`data/${season}/schedule.json`, 'utf8'));
    const ids = index(season) as unknown as { id: string; home: string; away: string }[];
    for (const team of teams) {
      const games = ids.filter((e) => e.home === team || e.away === team).map((e) => JSON.parse(readFileSync(`data/${season}/games/${e.id}.json`, 'utf8')) as Game);
      const rest = restForTeam(sched, team);
      for (const venue of ['home', 'away'] as const)
        for (const r of [undefined, 'b2b', 'rested'] as const) {
          const f: Filters = { ...DEFAULT_FILTERS, venue, ...(r ? { rest: r } : {}) };
          const sel = selectGames(games, season, team, f, undefined, rest);
          if (want(sel.games.length)) return { season, team, venue, rest: r, games: sel.games, query: `s=${season}&v=${venue}${r ? `&rest=${r}` : ''}` };
        }
    }
  }
  throw new Error('no team/filter combination in data/ matches');
}

function trackErrors(page: Page) {
  const errors: string[] = [];
  // Headshots/logos come from cdn.nba.com and degrade to initials when they fail; their load errors don't count.
  page.on('console', (m) => m.type() === 'error' && !m.location().url.includes('cdn.nba.com') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `screenshots/${name}-${project}.png`, fullPage: true });
const label = (page: Page) => page.getByTestId('selection-label');
async function noHorizontalScroll(page: Page) {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw, 'page must not scroll sideways').toBeLessThanOrEqual(cw);
}

test('loads on the current season with no console errors', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.goto('/');
  // Main screen is the game view; averages are one tab away.
  await expect(page.getByTestId('game-list')).toBeVisible();
  await page.getByTestId('tab-averages').click();
  await expect(page.getByTestId('player-row').first()).toBeVisible();
  await expect(page.getByTestId('season-chips').locator('[aria-checked=true]')).toHaveText('2026-27');
  await expect(label(page)).toContainText('based on');
  await noHorizontalScroll(page);
  await shot(page, 'team-current-season', info.project.name);
  expect(errors).toEqual([]);
});

test('team pattern view renders for all 30 teams in both seasons', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  for (const season of ['2026-27', '2025-26']) {
    for (const t of TEAMS) {
      await page.goto(`/#/team/${t}?s=${season}`);
      const n = teamGames(season, t);
      await expect(page.getByTestId('team-picker')).toHaveAttribute('data-team', t);
      await expect(label(page)).toContainText(`based on ${n} game${n === 1 ? '' : 's'}`);
      if (n === 0) {
        // Teams that haven't played yet this season: explicit empty state + switch to the previous season.
        await expect(page.getByText('No games match these filters.')).toBeVisible();
        await expect(page.getByTestId('low-sample')).toBeVisible();
      } else {
        await expect(page.getByTestId('player-row').first()).toBeVisible();
        expect(await page.getByTestId('player-row').count(), `${t} ${season} rows`).toBeGreaterThan(5);
      }
    }
  }
  expect(errors).toEqual([]);
});

test('filters change the "based on N games" count and the plain-words label', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.goto('/#/team/ORL?s=2025-26');
  await expect(label(page)).toHaveText('All 2025-26 games · based on 82 games');
  await page.getByRole('button', { name: 'Last 10' }).click();
  await expect(label(page)).toHaveText('Last 10 games · based on 10 games');
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(label(page)).toHaveText('Last 10 home games · based on 10 games');
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByTestId('ww-mode').getByRole('tab', { name: 'Without…' }).click();
  await page.getByTestId('ww-player').getByRole('radio', { name: 'F. Wagner', exact: true }).click();
  // Two Wagners on ORL → first initial.
  await expect(label(page)).toHaveText('Last 10 games without F. Wagner · based on 10 games');
  await expect(page.getByTestId('ww-groups')).toContainText('With F. Wagner: 34 games · Without: 48 games');
  await expect(page.getByTestId('ww-groups')).not.toContainText('estimated');
  await page.getByRole('button', { name: 'Season' }).click();
  await expect(label(page)).toHaveText('All 2025-26 games without F. Wagner · based on 48 games');
  // Typical stints are the default; strip readout on hover/tap in the heat map.
  await expect(page.getByTestId('pattern-chart')).toBeVisible();
  await page.getByRole('button', { name: 'Heat map' }).click();
  await page.locator('svg.heat').first().click({ position: { x: 1, y: 5 } });
  await expect(page.getByTestId('pattern-tip')).toContainText(/Q1 12:00–11:30 · on court in \d+ of \d+ games/);
  await noHorizontalScroll(page);
  await shot(page, 'team-without-wagner', info.project.name);
  const blowout = page.getByRole('checkbox', { name: 'Hide blowout time' });
  await expect(blowout).toBeChecked(); // default ON
  await blowout.click();
  await expect(blowout).not.toBeChecked();
  await expect(label(page)).toContainText('based on 48 games');
  expect(errors).toEqual([]);
});

test('few games in the current season: note + one-click switch to 2025-26 keeps team, player, filters and with/without', async ({ page }, info) => {
  const errors = trackErrors(page);
  // ORL in 2026-27 with a filter that leaves under 5 games (the with/without filter can only lower the count).
  const sel = findSelection((n) => n > 0 && n < 5, ['ORL']);
  expect(sel.season).toBe('2026-27');
  await page.goto(`/#/team/ORL?${sel.query}&w=10&p=1630532&m=with`);
  await expect(page.getByTestId('low-sample')).toBeVisible();
  await shot(page, 'low-sample', info.project.name);
  await page.getByRole('button', { name: 'Show the same view for 2025-26' }).click();
  await expect(page.getByTestId('season-chips').locator('[aria-checked=true]')).toHaveText('2025-26');
  await expect(page.getByTestId('team-picker')).toHaveAttribute('data-team', 'ORL');
  await expect(label(page)).toContainText('with F. Wagner');
  const q = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
  expect([q.get('s'), q.get('v'), q.get('rest'), q.get('w'), q.get('p'), q.get('m')]).toEqual(['2025-26', sel.venue, sel.rest ?? null, '10', '1630532', 'with']);
  expect(errors).toEqual([]);
});

test('player drill-down and single-game chart open from clicks; flagged game shows its warning', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.goto('/#/team/HOU?s=2025-26');
  await expect(page.getByTestId('flag-summary')).toContainText('1 game in this selection has a data note');
  await page.getByTestId('pattern-chart').getByRole('link', { name: /^(Kevin )?Durant$/ }).click();
  await expect(page.getByTestId('player-grid')).toBeVisible();
  await expect(page.locator('h1')).toContainText('Kevin Durant');
  const rows = page.getByTestId('game-row');
  expect(await rows.count()).toBeGreaterThan(40);
  await noHorizontalScroll(page);
  await shot(page, 'player-durant', info.project.name);
  // Flagged game row → game chart with the warning.
  const flagged = rows.filter({ has: page.getByTestId('flag') });
  await expect(flagged).toHaveCount(1);
  await flagged.getByRole('link').first().click();
  await expect(page).toHaveURL(/#\/game\/0022500093/);
  await expect(page.getByTestId('quality-warning')).toContainText('Kevin Durant — minutes: play-by-play 36:48 vs box score 28:08');
  await expect(page.getByTestId('quality-warning')).toContainText('The box score looks wrong');
  await expect(page.getByTestId('game-team')).toHaveCount(2);
  await page.getByTestId('stint').first().hover();
  await expect(page.getByTestId('chart-tip')).toContainText(/in Q1 12:00 → out Q\d/);
  await noHorizontalScroll(page);
  await shot(page, 'game-flagged', info.project.name);
  // Back to the player view.
  await page.goBack();
  await expect(page.getByTestId('player-grid')).toBeVisible();
  expect(errors).toEqual([]);
});

test('single-game chart: 2OT game axis, blowout shading, DNP rows with reasons', async ({ page }, info) => {
  const errors = trackErrors(page);
  await page.goto('/#/game/0022500811');
  await expect(page.locator('h1')).toContainText('Final/2OT');
  await expect(page.locator('.gc-qname').filter({ hasText: '2OT' }).first()).toBeAttached();
  await expect(page.getByTestId('dnp-row').first()).toBeAttached();
  await shot(page, 'game-2ot', info.project.name);
  await page.goto('/#/game/0022600092');
  await expect(page.locator('.gc-blowout').first()).toBeAttached();
  await expect(page.getByTestId('garbage-badge').first()).toBeVisible();
  await noHorizontalScroll(page);
  await shot(page, 'game-blowout', info.project.name);
  await expect(page.getByTestId('quality-warning')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('team page with one game shows exactly that game\'s stints, numbers inside', async ({ page }, info) => {
  const errors = trackErrors(page);
  const sel = findSelection((n) => n === 1);
  const game = sel.games[0]!;
  // Blowout time shown (b=0): the bars must be the game's raw stints (the blowout cut is tested elsewhere).
  await page.goto(`/#/team/${sel.team}?${sel.query}&b=0`);
  await expect(label(page)).toContainText('based on 1 game');
  await expect(page.getByTestId('pattern-chart')).toBeVisible();
  const played = game.players.filter((p) => p.team === sel.team && p.played && p.stints.some(([s, e]) => e > s));
  await expect(page.getByTestId('rare-toggle')).toHaveCount(0); // 1 of 1 game is never rare
  expect(played.length).toBeGreaterThan(5);
  let short = 0;
  for (const p of played) {
    const row = page.locator(`[data-testid=pattern-chart] [data-testid=player-row][data-player="${p.id}"]`);
    const bars = await row.getByTestId('typical-stint').evaluateAll((els) => els.map((e) => [Number(e.dataset.start), Number(e.dataset.end)]));
    const want = p.stints.filter(([s, e]) => e > s && s < 2880).map(([s, e]) => [s, Math.min(e, 2880)] as [number, number]);
    expect(bars, `player ${p.id}`).toEqual(want);
    // One game: every real stint is drawn, short ones (under 1:00 too) labelled beside the bar, as in the game chart.
    const labels = await row.getByTestId('stint-label').evaluateAll((els) => els.map((e) => e.getAttribute('data-inside')));
    expect(labels).toHaveLength(want.length);
    want.forEach(([s, e], i) => {
      if (e - s < 120) expect(labels[i], `player ${p.id} stint ${i}`).toBe('false');
      if (e - s < 60) short++;
    });
  }
  expect(await page.locator('[data-testid=pattern-chart] [data-testid=stint-label][data-inside=true]').count()).toBeGreaterThan(10);
  await expect(page.getByTestId('typical-legend')).not.toContainText('not drawn');
  test.info().annotations.push({ type: 'selection', description: `${sel.team} ${sel.query} → ${game.id}, ${short} stint(s) under 1:00` });
  // Hover readout.
  await page.locator('[data-testid=pattern-chart] .gc-track').nth(1).click({ position: { x: 5, y: 20 } });
  await expect(page.getByTestId('pattern-tip')).toContainText(/Q1 1[12]:\d\d · on court in [01] of 1 game\b/);
  await noHorizontalScroll(page);
  await shot(page, 'team-one-game', info.project.name);
  expect(errors).toEqual([]);
});

test('team page: rarely-used group follows the window\'s game count; no pattern bar under 1:00', async ({ page }, info) => {
  const errors = trackErrors(page);
  const rows = page.locator('[data-testid=pattern-chart] [data-testid=player-row]');
  const check = async (games: number) => {
    await expect(label(page)).toContainText(`based on ${games} games`);
    const toggle = page.getByTestId('rare-toggle');
    if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click(); // stays as the user left it
    await expect(page.locator('[data-testid=player-row][data-rare=true]')).toHaveCount(0); // collapsed
    const regular = await rows.evaluateAll((els) => els.map((e) => Number(e.querySelector('[data-testid=gp]')!.firstChild!.textContent)));
    expect(regular.every((gp) => gp * 3 >= games), `regular rows ${regular} of ${games}`).toBe(true);
    await toggle.click();
    const rare = await page.locator('[data-testid=player-row][data-rare=true]').evaluateAll((els) =>
      els.map((e) => Number(e.querySelector('[data-testid=gp]')!.firstChild!.textContent)),
    );
    expect(rare.length).toBeGreaterThan(0);
    expect(rare.every((gp) => gp * 3 < games), `rare rows ${rare} of ${games}`).toBe(true);
    await expect(toggle).toContainText(`Rarely used (${rare.length})`);
    const bars = await page.getByTestId('typical-stint').evaluateAll((els) => els.map((e) => Number(e.dataset.end) - Number(e.dataset.start)));
    expect(bars.length).toBeGreaterThan(20);
    expect(Math.min(...bars)).toBeGreaterThanOrEqual(60);
    await expect(page.getByTestId('typical-legend')).toContainText('bars under 1:00 not drawn');
  };
  await page.goto('/#/team/ORL?s=2025-26');
  await expect(page.getByTestId('rare-toggle')).toHaveAttribute('aria-expanded', 'false'); // collapsed by default
  await check(82);
  await noHorizontalScroll(page);
  await shot(page, 'team-rarely-used', info.project.name);
  await page.goto('/#/team/ORL?s=2025-26&w=10');
  await check(10);
  expect(errors).toEqual([]);
});

test('heat map: same "Rarely used" group and the same open/closed state as the default view', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/#/team/ORL?s=2025-26&w=10');
  await expect(label(page)).toContainText('based on 10 games');
  const rareRows = page.locator('[data-testid=player-row][data-rare=true]');
  const gps = (sel: string) =>
    page.locator(sel).evaluateAll((els) => els.map((e) => Number(e.querySelector('[data-testid=gp]')!.firstChild!.textContent)));
  // Typical view: collapsed → open it.
  const typicalRare = await page.getByTestId('rare-toggle').textContent();
  await page.getByTestId('rare-toggle').click();
  const typicalIds = await rareRows.evaluateAll((els) => els.map((e) => e.getAttribute('data-player')));
  // Heat map: still open, same players, same rule.
  await page.getByRole('button', { name: 'Heat map' }).click();
  await expect(page.getByTestId('team-grid')).toBeVisible();
  await expect(page.getByTestId('rare-toggle')).toHaveAttribute('aria-expanded', 'true');
  expect(await page.getByTestId('rare-toggle').textContent()).toBe(typicalRare!.replace('▸', '▾'));
  expect(await rareRows.evaluateAll((els) => els.map((e) => e.getAttribute('data-player')))).toEqual(typicalIds);
  expect((await gps('[data-testid=team-grid] [data-testid=player-row][data-rare=true]')).every((gp) => gp * 3 < 10)).toBe(true);
  expect((await gps('[data-testid=team-grid] [data-testid=player-row][data-rare=false]')).every((gp) => gp * 3 >= 10)).toBe(true);
  // Close in the heat map → closed in the default view too.
  await page.getByTestId('rare-toggle').click();
  await expect(rareRows).toHaveCount(0);
  await page.getByRole('button', { name: 'Typical stints' }).click();
  await expect(page.getByTestId('rare-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(rareRows).toHaveCount(0);
  await noHorizontalScroll(page);
  expect(errors).toEqual([]);
});

test('Averages tooltips sit right next to the pointer (Typical stints and Heat map)', async ({ page }) => {
  await page.goto('/#/team/ATL?s=2025-26&w=5');
  const near = async (x: number, y: number) => {
    const b = (await page.getByTestId('pattern-tip').boundingBox())!;
    const dx = x < b.x ? b.x - x : x > b.x + b.width ? x - (b.x + b.width) : 0;
    const dy = y < b.y ? b.y - y : y > b.y + b.height ? y - (b.y + b.height) : 0;
    expect(dx, `tooltip ${Math.round(dx)} px sideways from the pointer`).toBeLessThanOrEqual(20);
    expect(dy, `tooltip ${Math.round(dy)} px from the pointer vertically`).toBeLessThanOrEqual(40);
  };
  // Typical stints: in Q1 and in Q4 (the far right, where the tooltip flips to the left of the pointer).
  const track = page.locator('[data-testid=pattern-chart] [data-testid=player-row] .gc-track').nth(3);
  const t = (await track.boundingBox())!;
  for (const f of [0.1, 0.9]) {
    const [x, y] = [t.x + f * t.width, t.y + t.height / 2];
    await page.mouse.move(x, y);
    await expect(page.getByTestId('pattern-tip')).toBeVisible();
    await near(x, y);
  }
  // Heat map.
  await page.getByRole('button', { name: 'Heat map' }).click();
  const strip = page.locator('svg.heat').nth(13);
  const s = (await strip.boundingBox())!;
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await expect(page.getByTestId('pattern-tip')).toBeVisible();
  await near(s.x + s.width / 2, s.y + s.height / 2);
});
