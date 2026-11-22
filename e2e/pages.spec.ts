// RK-14 (desktop): every game, player and team has a real address (a path) that answers with its own title and
// preview tags before any script runs; old hash links and ?game= links land on the new address; back / forward work;
// filters stay in the address; sitemap.xml and robots.txt; the generated pages stay small.

import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { index, settle, trackErrors } from './helpers.ts';
import { SITE_NAME, SITE_URL } from '../src/app/site.ts';

const e = index('2025-26').find((x) => x.id === '0022500020')!;
const GAME_TITLE = `ATL ${e.as}, IND ${e.hs} · Oct 31, 2025 · rotations | ${SITE_NAME}`;

test('the address itself answers with that page\'s title and tags, without JavaScript', async ({ request }) => {
  const cases: [string, string, string][] = [
    ['/game/0022500020', GAME_TITLE, 'Atlanta Hawks'],
    ['/game/0022500020?t=IND&s=2025-26', GAME_TITLE, 'Indiana Pacers'],
    ['/player/ORL/1631094', `Paolo Banchero · Orlando Magic · rotations | ${SITE_NAME}`, 'Paolo Banchero (Orlando Magic)'],
    ['/team/ORL', `Orlando Magic · 2026-27 · usual rotation | ${SITE_NAME}`, 'Orlando Magic, 2026-27'],
  ];
  for (const [url, title, inDescription] of cases) {
    const r = await request.get(url);
    expect(r.status(), url).toBe(200);
    const html = await r.text();
    expect(html, url).toContain(`<title>${title}</title>`);
    expect(html, url).toContain(`<meta property="og:title" content="${title}" />`);
    expect(html, url).toContain(`<meta name="twitter:title" content="${title}" />`);
    expect(html.match(/<meta name="description" content="([^"]+)"/)![1], url).toContain(inDescription);
    expect(html, url).toContain(`<meta property="og:url" content="${SITE_URL}${url.split('?')[0]}" />`);
    expect(html, url).toContain(`<meta property="og:image" content="${SITE_URL}/og.png" />`);
  }
  // a place without a page of its own gets the site's general tags (and still loads the app)
  const leaders = await (await request.get('/leaders')).text();
  expect(leaders).toContain(`<title>Leaders | ${SITE_NAME}</title>`);
  expect(leaders).toContain('<div id="root"></div>');
});

test('loading a path address directly shows the right view; the tab title matches the page\'s own', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/game/0022500020?t=IND&s=2025-26');
  await settle(page);
  await expect(page.locator('h1')).toContainText(`ATL ${e.as} @ IND ${e.hs}`);
  await expect(page).toHaveTitle(GAME_TITLE);
  expect(new URL(page.url()).hash).toBe('');
  await page.goto('/player/ORL/1631094?s=2025-26');
  await settle(page);
  await expect(page.getByTestId('player-bar')).toContainText('Banchero');
  await page.goto('/team/ORL?s=2025-26&w=10');
  await settle(page);
  await expect(page.getByTestId('team-picker')).toHaveAttribute('data-team', 'ORL');
  await expect(page.getByTestId('selection-label')).toContainText('Last 10 games');
  await page.goto('/q4/0022500020?t=IND');
  await settle(page);
  await expect(page.getByTestId('q4-chart')).toBeVisible();
  for (const [url, tab] of [['/leaders?s=2025-26', 'tab-leaders'], ['/games?view=day&date=2025-11-10', 'tab-day'], ['/help?sec=usg', 'tab-help'], ['/fullq4', 'tab-leaders']] as const) {
    await page.goto(url);
    await settle(page);
    await expect(page.getByTestId(tab)).toHaveAttribute('aria-current', 'page');
  }
  expect(errors).toEqual([]);
});

test('old links keep working: #/… and ?game= open the same view and the address becomes the new one', async ({ page }) => {
  const old: [string, RegExp][] = [
    ['/#/game/0022500020?t=IND&s=2025-26', /\/game\/0022500020\?s=2025-26&t=IND$/],
    ['/#/q4/0022500020?t=IND', /\/q4\/0022500020\?.*t=IND/],
    ['/#/team/ORL?s=2025-26&w=10', /\/team\/ORL\?s=2025-26&w=10$/],
    ['/#/player/ORL/1631094?s=2025-26', /\/player\/ORL\/1631094\?s=2025-26$/],
    ['/#/games?view=day&date=2025-11-10&s=2025-26', /\/games\?view=day&date=2025-11-10&s=2025-26$/],
    ['/#/leaders?s=2025-26&sort=usg', /\/leaders\?s=2025-26&sort=usg$/],
    ['/#/fullq4?s=2025-26&th=11', /\/fullq4\?s=2025-26&th=11$/],
    ['/#/help?sec=usg', /\/help\?sec=usg$/],
    ['/?game=0022500020', /\/game\/0022500020\?s=2025-26/],
  ];
  for (const [url, now] of old) {
    await page.goto(url);
    await settle(page);
    await expect(page, url).toHaveURL(now);
    expect(page.url(), url).not.toContain('#');
    expect(page.url(), url).not.toContain('game=');
  }
  await page.goto('/#/game/0022500020?t=IND&s=2025-26');
  await expect(page.locator('h1')).toContainText(`ATL ${e.as} @ IND ${e.hs}`);
  // an old link opened while the app is already open (same tab) works too
  await page.evaluate(() => (location.hash = '#/team/BOS?s=2025-26'));
  await expect(page).toHaveURL(/\/team\/BOS\?s=2025-26$/);
  expect(page.url()).not.toContain('#');
  await expect(page.getByTestId('team-picker')).toHaveAttribute('data-team', 'BOS');
});

test('links move without loading a page; back, forward and reload keep the view and its filters', async ({ page }) => {
  await page.goto('/team/ORL?s=2025-26');
  await settle(page);
  await page.evaluate(() => ((window as unknown as { __same: boolean }).__same = true));
  await page.getByRole('button', { name: 'Last 10' }).click();
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page).toHaveURL(/\/team\/ORL\?s=2025-26&w=10&v=home$/);
  // a name link (a real <a href="/player/…">)
  const link = page.getByTestId('player-link').first();
  const href = await link.getAttribute('href');
  expect(href).toMatch(/^\/player\/ORL\/\d+\?s=2025-26&w=10&v=home$/);
  await link.click();
  await expect(page).toHaveURL(new RegExp(href!.replace('?', '\\?') + '$'));
  await expect(page.getByTestId('player-bar')).toBeVisible();
  // a game from his rows, then Q4, then Leaders
  await page.getByTestId('tab-leaders').click();
  await expect(page).toHaveURL(/\/leaders\?/);
  expect(await page.evaluate(() => (window as unknown as { __same?: boolean }).__same)).toBe(true); // never reloaded
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(href!.replace('?', '\\?') + '$'));
  await expect(page.getByTestId('player-bar')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/team\/ORL\?s=2025-26&w=10&v=home$/);
  await expect(page.getByTestId('selection-label')).toContainText('Last 10 home games');
  await page.goForward();
  await expect(page.getByTestId('player-bar')).toBeVisible();
  await page.reload();
  await settle(page);
  await expect(page).toHaveURL(new RegExp(href!.replace('?', '\\?') + '$'));
  await expect(page.getByTestId('selection-label')).toContainText('Last 10 home games');
  // the header's own back button
  await page.getByTestId('hist-back').click();
  await expect(page).toHaveURL(/\/team\/ORL\?s=2025-26&w=10&v=home$/);
  // Ctrl-click still opens a new tab (the link is a real address)
  const [tab] = await Promise.all([page.context().waitForEvent('page'), page.getByTestId('player-link').first().click({ modifiers: ['ControlOrMeta'] })]);
  await tab.waitForLoadState();
  expect(new URL(tab.url()).pathname).toMatch(/^\/player\/ORL\/\d+$/);
  await expect(page).toHaveURL(/\/team\/ORL/);
});

test('sitemap.xml lists every generated page; robots.txt points to it', async ({ request }) => {
  const map = await (await request.get('/sitemap.xml')).text();
  const locs = [...map.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  const games = index('2025-26').length + index('2026-27').length;
  expect(locs.filter((l) => l.startsWith(`${SITE_URL}/game/`))).toHaveLength(games);
  expect(locs.filter((l) => l.startsWith(`${SITE_URL}/team/`))).toHaveLength(30);
  expect(locs.filter((l) => l.startsWith(`${SITE_URL}/player/`)).length).toBeGreaterThan(500);
  expect(locs).toContain(`${SITE_URL}/`);
  expect(locs).toContain(`${SITE_URL}/game/${index('2026-27').at(-1)!.id}`);
  // every address in it is a file of the build
  const files = new Set(['game', 'player', 'team'].flatMap((d) => walk(join('dist', d))).map((f) => f.slice('dist'.length).replace(/\.html$/, '')));
  for (const l of locs.filter((x) => /\/(game|player|team)\//.test(x))) expect(files.has(l.slice(SITE_URL.length)), l).toBe(true);
  expect(locs).toContain(`${SITE_URL}/help`);
  expect(locs.some((l) => l.includes('/q4/'))).toBe(false);
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  expect(robots).toContain('Allow: /');
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
}

test('every address of the app is a real file of the build (a reload never needs a host rule)', () => {
  for (const f of ['leaders.html', 'fullq4.html', 'games.html', 'help.html', 'team.html', 'player.html', 'q4/0022500020.html', '404.html', 'game/0022500020.html', 'team/ORL.html', 'player/ORL/1631094.html'])
    expect(readFileSync(join('dist', f), 'utf8'), f).toContain('<div id="root"></div>');
});

test('build size: the generated pages stay small', () => {
  const files = ['game', 'player', 'team', 'q4'].flatMap((d) => walk(join('dist', d)));
  const total = files.reduce((n, f) => n + statSync(f).size, 0);
  const base = statSync('dist/index.html').size;
  console.log(`generated pages: ${files.length} files, ${(total / 1024 / 1024).toFixed(1)} MB in all, ${(total / files.length / 1024).toFixed(1)} KB each`);
  expect(Math.max(...files.map((f) => statSync(f).size)) - base).toBeLessThan(2048);
  expect(total).toBeLessThan(20 * 1024 * 1024);
  expect(readFileSync(files[0]!, 'utf8')).toContain('<div id="root"></div>');
});
