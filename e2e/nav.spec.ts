// RK-8: the shared layout (backlogkit's NAV_PATTERN.md §6), desktop. The header on every main page (same height,
// pinned while scrolling); every place, What chip, How option and breadcrumb part navigates and the URL round-trips
// (reload, back / forward); click-to-update under 100 ms on the heaviest pages; no layout shift; no <select>;
// every control has a name. Screenshots of each main page → screenshots/nav/.

import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const GAME = '0022500081'; // an ORL game (t=ORL stays in the URL)
const PAGES: [string, string][] = [
  ['games', `/#/game/${GAME}?t=ORL&s=2025-26`],
  ['q4', `/#/q4/${GAME}?t=ORL&s=2025-26`],
  ['by-day', '/#/games?view=day&date=2025-11-10&s=2025-26'],
  ['averages', '/#/team/ORL?s=2025-26'],
  ['player', '/#/player/ORL/1630532?s=2025-26'],
  ['leaders', '/#/leaders?s=2025-26'],
  ['full-q4', '/#/fullq4?s=2025-26'],
];

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !m.location().url.includes('cdn.nba.com') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
async function settle(page: Page) {
  await expect(page.getByTestId('header')).toBeVisible();
  await expect(page.getByText(/Loading/)).toHaveCount(0, { timeout: 20_000 });
  await page.waitForLoadState('networkidle');
}
const header = (page: Page) => page.getByTestId('header');
const hash = (page: Page) => page.evaluate(() => location.hash);
/** The visible page (header + rows + content text), to compare a screen before and after a reload. */
const screenText = (page: Page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
/** The screen's text once it stops changing (data that loads in steps, e.g. By day's cards). */
async function stableText(page: Page) {
  let prev = '';
  for (let i = 0; i < 40; i++) {
    const t = await screenText(page);
    if (t === prev) return t;
    prev = t;
    await page.waitForTimeout(250);
  }
  return prev;
}

test('the header: on every main page, the same height and controls, still at the top after scrolling', async ({ page }, info) => {
  const errors = trackErrors(page);
  const heights = new Set<number>();
  mkdirSync('screenshots/nav', { recursive: true });
  for (const [name, url] of PAGES) {
    await page.goto(url);
    await settle(page);
    const h = header(page);
    const box = (await h.boundingBox())!;
    heights.add(Math.round(box.height));
    expect(box.y).toBe(0);
    await expect(h.getByTestId('where-tabs').getByRole('button')).toHaveCount(5);
    await expect(h.getByTestId('go-anywhere')).toBeVisible();
    await expect(h.getByTestId('hist-back')).toBeVisible();
    expect(await h.getByTestId('crumb').count()).toBeGreaterThanOrEqual(2);
    const path = `screenshots/nav/${name}.png`;
    await page.screenshot({ path });
    await info.attach(name, { path, contentType: 'image/png' });
    // pinned: scrolled down (pages taller than the window; Q4 fits the window by design), it is still at the top
    if (await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 50)) {
      await page.evaluate(() => scrollTo(0, 1500));
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    }
    expect((await h.boundingBox())!.y).toBe(0);
    await expect(h).toBeInViewport();
  }
  expect([...heights]).toEqual([92]);
  expect(errors).toEqual([]);
});

test('places: each one opens, is highlighted, and the URL round-trips (reload, header back / forward, browser back)', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`/#/game/${GAME}?t=ORL&s=2025-26`);
  await settle(page);
  await expect(page.getByTestId('hist-back')).toBeDisabled();
  const want: [string, RegExp][] = [
    ['day', /^#\/games\?view=day&s=2025-26&t=ORL$/],
    ['averages', /^#\/team\/ORL\?s=2025-26$/],
    ['leaders', /^#\/leaders\?s=2025-26&t=ORL$/],
    ['games', /^#\/game\/\d{10}\?s=2025-26&t=ORL$/],
  ];
  const seen: string[] = [await hash(page)];
  for (const [w, re] of want) {
    await page.getByTestId(`tab-${w}`).click();
    await expect.poll(() => hash(page)).toMatch(re);
    await expect(page.getByTestId(`tab-${w}`)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[data-testid=where-tabs] [aria-current=page]')).toHaveCount(1);
    await settle(page);
    const before = await stableText(page);
    await page.reload();
    await settle(page);
    await expect(page.getByTestId(`tab-${w}`)).toHaveAttribute('aria-current', 'page');
    expect(await stableText(page)).toBe(before);
    seen.push(await hash(page));
  }
  // header back walks the same pages in reverse; forward comes back
  for (let i = seen.length - 2; i >= 0; i--) {
    await page.getByTestId('hist-back').click();
    await expect.poll(() => hash(page)).toBe(seen[i]);
  }
  await expect(page.getByTestId('hist-back')).toBeDisabled();
  await page.getByTestId('hist-forward').click();
  await expect.poll(() => hash(page)).toBe(seen[1]);
  await page.goBack();
  await expect.poll(() => hash(page)).toBe(seen[0]);
  await page.goForward();
  await expect.poll(() => hash(page)).toBe(seen[1]);
  await expect(page.getByTestId('hist-forward')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('What and How: every season chip, every team in the strip, every How option navigates and survives a reload', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  // How: Games (whole game | 4th quarter), Leaders (minutes & points | full 4th quarters)
  await page.goto(`/#/game/${GAME}?t=ORL&s=2025-26`);
  await settle(page);
  for (const [id, re] of [['how-q4', /^#\/q4\//], ['how-games', /^#\/game\//]] as const) {
    await page.getByTestId(id).click();
    await expect.poll(() => hash(page)).toMatch(re);
    await expect(page.getByTestId(id)).toHaveAttribute('aria-selected', 'true');
    await page.reload();
    await expect(page.getByTestId(id)).toHaveAttribute('aria-selected', 'true');
  }
  await page.goto('/#/leaders?s=2025-26');
  for (const [id, re] of [['how-fullq4', /^#\/fullq4\?s=2025-26/], ['how-leaders', /^#\/leaders\?s=2025-26/]] as const) {
    await page.getByTestId(id).click();
    await expect.poll(() => hash(page)).toMatch(re);
    await page.reload();
    await expect(page.getByTestId(id)).toHaveAttribute('aria-selected', 'true');
  }
  // Seasons on every page
  for (const [, url] of PAGES) {
    await page.goto(url);
    await settle(page);
    const chips = page.getByTestId('season-chips').getByRole('radio');
    await expect(chips).toHaveText(['2026-27', '2025-26']);
    await chips.first().click();
    await expect.poll(() => hash(page)).toMatch(/s=2026-27/);
    await expect(chips.first()).toHaveAttribute('aria-checked', 'true');
    await page.reload();
    await expect(page.getByTestId('season-chips').locator('[aria-checked=true]')).toHaveText('2026-27');
  }
  // Every team (Averages); the chosen one highlighted and scrolled into view in its strip
  await page.goto('/#/team/ORL?s=2025-26');
  const strip = page.getByTestId('team-picker');
  const teams = await strip.getByRole('radio').evaluateAll((els) => els.map((e) => e.getAttribute('data-value')!));
  expect(teams).toHaveLength(30);
  for (const t of teams) {
    await strip.locator(`[data-value=${t}]`).click();
    await expect.poll(() => hash(page)).toBe(`#/team/${t}?s=2025-26`);
    await expect(strip).toHaveAttribute('data-team', t);
  }
  await page.reload();
  const on = strip.locator('[aria-checked=true]');
  await expect(on).toHaveAttribute('data-value', teams.at(-1)!);
  const [s, c] = [(await strip.boundingBox())!, (await on.boundingBox())!];
  expect(c.x).toBeGreaterThanOrEqual(s.x - 1);
  expect(c.x + c.width).toBeLessThanOrEqual(s.x + s.width + 1);
  // Matchup and Leaders' team strips
  await strip.locator('[data-value=ORL]').click();
  await page.getByTestId('vs-picker').locator('[data-value=BOS]').click();
  await expect.poll(() => hash(page)).toBe('#/team/ORL?s=2025-26&vs=BOS');
  await page.getByTestId('vs-picker').locator('[data-value=""]').click();
  await expect.poll(() => hash(page)).toBe('#/team/ORL?s=2025-26');
  await page.goto('/#/leaders?s=2025-26');
  await page.getByTestId('leaders-team').locator('[data-value=MIA]').click();
  await expect.poll(() => hash(page)).toMatch(/lt=MIA/);
  // Games: the team strip opens that team's latest game
  await page.goto(`/#/game/${GAME}?t=ORL&s=2025-26`);
  await page.getByTestId('team-picker').locator('[data-value=BOS]').click();
  await expect.poll(() => hash(page)).toMatch(/^#\/game\/\d{10}\?s=2025-26&t=BOS$/);
  expect(errors).toEqual([]);
});

test('breadcrumb: every part with siblings opens its list and jumps; the current one is marked', async ({ page }) => {
  const errors = trackErrors(page);
  for (const [, url] of PAGES) {
    await page.goto(url);
    await settle(page);
    const n = await page.getByTestId('crumb').count();
    for (let i = 0; i < n; i++) {
      const btn = page.getByTestId('crumb-btn').nth(i);
      if (await btn.isDisabled()) continue;
      const start = await hash(page);
      await btn.click();
      const menu = page.getByTestId('crumb-menu');
      await expect(menu).toBeVisible();
      await expect(menu.locator('[aria-current=true]')).toHaveCount(1);
      // Escape closes it without moving
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await btn.click();
      await menu.locator('[role=menuitem]:not([aria-current])').first().click();
      await expect.poll(() => hash(page)).not.toBe(start);
      await page.goto(url);
      await settle(page);
    }
  }
  // The game's parts: Games › 2025-26 › Orlando Magic › <date · away @ home> › Whole game
  await page.goto(`/#/game/${GAME}?t=ORL&s=2025-26`);
  await settle(page);
  const labels = await page.getByTestId('crumb-btn').allTextContents();
  expect(labels[0]).toBe('Games');
  expect(labels[1]).toBe('2025-26');
  expect(labels.at(-1)).toBe('Whole game');
  expect(errors).toEqual([]);
});

/** ms from a click to the next painted frame (the screen already shows the change: React renders discrete clicks
 * synchronously). */
const clickTime = (page: Page, selector: string) =>
  page.evaluate(async (sel) => {
    const el = document.querySelector<HTMLElement>(sel)!;
    const t0 = performance.now();
    el.click();
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    return performance.now() - t0;
  }, selector);

test('clicks on loaded data update the screen in under 100 ms (game page and Averages, the heaviest pages)', async ({ page }) => {
  await page.goto(`/#/game/${GAME}?t=ORL&s=2025-26`);
  await settle(page);
  // load both views once, then time the switches
  const times: number[] = [];
  for (const id of ['how-q4', 'how-games', 'how-q4', 'how-games']) {
    times.push(await clickTime(page, `[data-testid=${id}]`));
    await settle(page);
  }
  await page.goto('/#/team/ORL?s=2025-26');
  await settle(page);
  for (const name of ['Last 10', 'Season', 'Last 5', 'Season']) {
    times.push(await page.evaluate(async (n) => {
      const el = [...document.querySelectorAll<HTMLElement>('.seg button')].find((b) => b.textContent === n)!;
      const t0 = performance.now();
      el.click();
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      return performance.now() - t0;
    }, name));
  }
  times.push(await clickTime(page, '[data-testid=tab-leaders]'));
  console.log('click-to-update ms:', times.map((t) => Math.round(t)).join(', '));
  expect(Math.max(...times.slice(1))).toBeLessThan(100);
});

test('no layout shift on load or after navigating', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  const cls = () => page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  for (const [name, url] of PAGES) {
    await page.goto(url);
    await settle(page);
    await page.waitForTimeout(300);
    expect(await cls(), name).toBeLessThan(0.05);
  }
  // navigating with the header and the rows
  await page.goto(`/#/game/${GAME}?t=ORL&s=2025-26`);
  await settle(page);
  for (const id of ['how-q4', 'how-games', 'tab-averages', 'tab-leaders', 'how-fullq4', 'tab-day', 'tab-games']) {
    await page.getByTestId(id).click();
    await settle(page);
    await page.waitForTimeout(200);
  }
  expect(await cls()).toBeLessThan(0.05);
});

test('no <select> anywhere; every icon-only control has a name or a hover text', async ({ page }) => {
  for (const [name, url] of PAGES) {
    await page.goto(url);
    await settle(page);
    await expect(page.locator('select'), name).toHaveCount(0);
    const unnamed = await page.locator('header button, header a, [data-testid=page-rows] button, button').evaluateAll((els) =>
      els.filter((e) => !(e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent?.trim())).map((e) => e.outerHTML.slice(0, 120)),
    );
    expect(unnamed, name).toEqual([]);
  }
});
