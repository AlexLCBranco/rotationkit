// RK-9 (front door), RK-10 (footer), RK-11 (report a problem), RK-15 (no hoopsjunkie links), RK-16 (site name): desktop.

import { test, expect } from '@playwright/test';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { CURRENT, FOOTER_NOTICE, index, noSidewaysScroll, PLACES, settle, trackErrors } from './helpers.ts';
import { HELP_SECTIONS } from '../src/app/help.ts';
import { OG_IMAGE, REPORT_FORM_URL, SITE_NAME, SITE_TAGLINE, SITE_URL } from '../src/app/site.ts';
import { garbageRule } from '../src/app/help.ts';

const latestDay = index(CURRENT).at(-1)!.date;

test.describe('RK-9: first visit', () => {
  test('clean storage and an empty URL → By day on the latest day with finished games', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await settle(page);
    await expect(page.getByTestId('tab-day')).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveURL(/\/games\?view=day/);
    await expect(page.getByTestId('dv-side').first()).toBeVisible();
    await expect(page.getByTestId('dv-date')).toHaveValue(latestDay);
    // a reload stays there; the logo ("back to the start") leads there too
    // looking around without picking a team does not make one "remembered": the logo still leads to By day
    for (const tab of ['tab-leaders', 'tab-help', 'tab-averages', 'tab-games']) {
      await page.getByTestId(tab).click();
      await settle(page);
      await expect(page.getByTestId(tab)).toHaveAttribute('aria-current', 'page');
      expect(await page.evaluate(() => localStorage.getItem('rk.team')), tab).toBeNull();
    }
    await page.locator('.brand').click();
    await expect(page.getByTestId('tab-day')).toHaveAttribute('aria-current', 'page');
    // picking a team does: from then on the start page is that team's latest game
    await page.getByTestId('tab-averages').click();
    await page.getByTestId('team-picker').locator('[data-value=BOS]').click();
    await expect(page).toHaveURL(/\/team\/BOS/);
    await page.locator('.brand').click();
    await expect(page).toHaveURL(/\/game\/\d+\?.*t=BOS/);
    expect(errors).toEqual([]);
  });
  test('a remembered team → that team\'s latest game, as before', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('rk.team', 'ORL'));
    await page.goto('/');
    const orl = index(CURRENT).filter((e) => e.home === 'ORL' || e.away === 'ORL').at(-1)!;
    await expect(page).toHaveURL(new RegExp(`/game/${orl.id}\\?.*t=ORL`));
    await expect(page.getByTestId('tab-games')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('game-list')).toBeVisible();
  });
  test('links that name a team or a game are unaffected by a clean storage', async ({ page }) => {
    await page.goto('/game/0022500020');
    await expect(page.locator('h1')).toContainText('ATL');
    await expect(page).toHaveURL(/\/game\/0022500020/);
    await page.goto('/team/BOS?s=2025-26');
    await expect(page.getByTestId('team-picker')).toHaveAttribute('data-team', 'BOS');
  });
});

test.describe('RK-9: "How to read this"', () => {
  test('in the header menu after Leaders; every part is there, rules come from the settings, with a real example', async ({ page }, info) => {
    const errors = trackErrors(page);
    await page.goto('/leaders?s=2025-26');
    const tabs = page.getByTestId('where-tabs').getByRole('button');
    await expect(tabs).toHaveText(['Games', 'By day', 'Averages', 'Leaders', 'How to read this']);
    await page.getByTestId('tab-help').click();
    await expect(page).toHaveURL(/\/help/);
    await expect(page.getByTestId('tab-help')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('h1')).toHaveText('How to read this');
    await expect(page).toHaveTitle(`How to read this | ${SITE_NAME}`);
    await expect(page.getByTestId('help-section')).toHaveCount(HELP_SECTIONS.length);
    for (const [id, title] of HELP_SECTIONS) await expect(page.locator(`[data-testid=help-section][data-section=${id}] h2`)).toHaveText(title);
    await expect(page.getByTestId('help-garbage-rule').locator('li')).toHaveText(garbageRule());
    await expect(page.getByTestId('help-foul-rules').locator('li')).toHaveCount(4);
    // real example: a real player's bars from the latest game
    const ex = page.getByTestId('help-example-bar');
    await expect(ex).toBeVisible();
    expect(await ex.getByTestId('pl-stint').count()).toBeGreaterThanOrEqual(2);
    await expect(ex.getByTestId('player-link')).toBeVisible();
    await expect(page.getByTestId('help-example-usg')).toContainText('His USG% was');
    await expect(page.getByTestId('help-dnp').locator('.dnp-tag')).toHaveText(['DNP – CD', 'OUT – injury/illness', 'Rest', 'DNP', 'Inactive']);
    await noSidewaysScroll(page, 'help');
    mkdirSync('screenshots', { recursive: true });
    await page.screenshot({ path: `screenshots/help-${info.project.name}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });

  test('every "?" link opens the page at its own part', async ({ page }) => {
    test.setTimeout(120_000);
    const flagged = index('2025-26').find((e) => e.flagged)!;
    const screens: [string, string[]][] = [
      ['/game/0022500020?t=IND&s=2025-26', ['garbage', 'fouls', 'usual', 'bar', 'schedule', 'dnp', 'usg']],
      [`/game/${flagged.id}?s=2025-26`, ['datanote']],
      ['/q4/0022500020?t=IND&s=2025-26', ['fouls']],
      ['/games?view=day&date=2025-11-10&s=2025-26', ['fullq4', 'dnp', 'schedule']],
      ['/team/ORL?s=2025-26', ['garbage', 'usg']],
      ['/player/ORL/1631094?s=2025-26', ['fullq4', 'usg']],
      ['/leaders?s=2025-26', ['garbage', 'usg']],
      ['/fullq4?s=2025-26', ['fullq4', 'garbage']],
    ];
    const seen = new Set<string>();
    for (const [url, sections] of screens) {
      for (const s of sections) {
        await page.goto(url);
        await settle(page);
        const link = page.locator(`[data-testid=help-link][data-section=${s}]`).first();
        await expect(link, `${url}: "?" for ${s}`).toBeVisible();
        expect(await link.getAttribute('title')).toBe(HELP_SECTIONS.find(([id]) => id === s)![2]);
        await link.click();
        await expect(page).toHaveURL(new RegExp(`/help\\?.*sec=${s}`));
        const part = page.locator(`[data-testid=help-section][data-section=${s}]`);
        await expect(part).toHaveClass(/\bon\b/);
        await expect(part.locator('h2')).toBeInViewport();
        seen.add(s);
      }
    }
    // every term of the page has a "?" on some screen (the numbers on a bar are explained right under "a bar")
    expect([...seen].sort()).toEqual(HELP_SECTIONS.map(([id]) => id).filter((id) => id !== 'numbers').sort());
  });
});

test.describe('RK-9: link preview tags', () => {
  test('the built page carries the description, Open Graph and Twitter tags; the image is served at 1200 × 630', async ({ page, request }) => {
    const built = readFileSync('dist/index.html', 'utf8');
    for (const p of ['og:title', 'og:description', 'og:type', 'og:url', 'og:image']) expect(built, p).toMatch(new RegExp(`<meta property="${p}" content="[^"]+"`));
    for (const n of ['description', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) expect(built, n).toMatch(new RegExp(`<meta name="${n}" content="[^"]+"`));
    await page.goto('/');
    expect(await page.locator('meta[name=description]').getAttribute('content')).toBe(SITE_TAGLINE);
    expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toBe(`${SITE_URL}${OG_IMAGE.path}`);
    const r = await request.get(OG_IMAGE.path);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-type']).toContain('image/png');
    const size = await page.evaluate(
      (src) =>
        new Promise<number[]>((ok, no) => {
          const i = new Image();
          i.onload = () => ok([i.naturalWidth, i.naturalHeight]);
          i.onerror = () => no(new Error('image did not load'));
          i.src = src;
        }),
      OG_IMAGE.path,
    );
    expect(size).toEqual([OG_IMAGE.width, OG_IMAGE.height]);
  });
});

test.describe('RK-10: footer', () => {
  test('on every place: the unofficial-site notice, the data source and a link to "How to read this"', async ({ page }) => {
    for (const [name, url] of PLACES) {
      await page.goto(url);
      await settle(page);
      await expect(page.getByTestId('footer'), name).toHaveCount(1);
      await expect(page.getByTestId('footer-notice'), name).toHaveText(FOOTER_NOTICE);
      await expect(page.getByTestId('footer-help'), name).toHaveAttribute('href', '/help');
      if (name === 'q4') {
        // built to fit the window: no page scroll; the footer is at the end of the side panel's own scroll
        await expect(page.getByTestId('q4-story').getByTestId('footer')).toHaveCount(1);
        const [sh, vh] = await page.evaluate(() => [document.documentElement.scrollHeight, innerHeight]);
        expect(sh, 'q4 has no page scroll').toBeLessThanOrEqual(vh);
        await page.getByTestId('footer').scrollIntoViewIfNeeded();
        await expect(page.getByTestId('footer-help')).toBeInViewport();
        continue;
      }
      // after the page's content, never on top of it
      const order = await page.evaluate(() => {
        const [p, f] = [document.querySelector('.page')!, document.querySelector('[data-testid=footer]')!];
        return [p.getBoundingClientRect().bottom, f.getBoundingClientRect().top, getComputedStyle(f).position];
      });
      expect(order[1] as number, name).toBeGreaterThanOrEqual((order[0] as number) - 0.5);
      expect(order[2], name).toBe('static');
      await noSidewaysScroll(page, name);
    }
    await page.getByTestId('footer-help').click();
    await expect(page.locator('h1')).toHaveText('How to read this');
  });
  test('headshots and logos still come from cdn.nba.com (not copied into the site)', async ({ page }) => {
    // (answer cdn.nba.com with a small picture: where the real one cannot be reached, the app swaps the <img> for initials)
    await page.route(/cdn\.nba\.com/, (r) => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><rect width="26" height="26" fill="#555"/></svg>' }));
    await page.goto('/game/0022500020?t=IND&s=2025-26');
    await settle(page);
    await expect(page.getByTestId('gc-player-row').first()).toBeVisible();
    const srcs = await page.locator('img.headshot, img.logo').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
    expect(srcs.length).toBeGreaterThan(10);
    expect(srcs.every((s) => s.startsWith('https://cdn.nba.com/'))).toBe(true);
  });
});

test.describe('RK-11: "Report a problem"', () => {
  const flagged = index('2025-26').find((e) => e.flagged)!;
  test('no form set → no link anywhere', async ({ page }) => {
    await page.addInitScript(() => ((window as unknown as { __RK_REPORT_FORM__: string }).__RK_REPORT_FORM__ = ''));
    for (const url of ['/leaders', `/game/${flagged.id}?s=2025-26`]) {
      await page.goto(url);
      await settle(page);
      await expect(page.getByTestId('footer')).toBeVisible();
      await expect(page.getByTestId('report-link')).toHaveCount(0);
    }
  });
  test('a form set → in the footer and next to the data note, new tab, with this page\'s address', async ({ page, context }) => {
    await page.addInitScript(() => ((window as unknown as { __RK_REPORT_FORM__: string }).__RK_REPORT_FORM__ = 'https://forms.test/f1'));
    await context.route(/forms\.test/, (r) => r.fulfill({ contentType: 'text/html', body: '<title>form</title>' }));
    await page.goto(`/game/${flagged.id}?s=2025-26`);
    await settle(page);
    await expect(page.getByTestId('quality-warning')).toBeVisible();
    await expect(page.getByTestId('report-link')).toHaveCount(2);
    const want = () => `https://forms.test/f1?page=${encodeURIComponent(page.url())}`;
    for (const link of [page.getByTestId('footer').getByTestId('report-link'), page.getByTestId('quality-warning').getByTestId('report-link')]) {
      await expect(link).toHaveText('Report a problem');
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /noopener/);
      const [popup] = await Promise.all([context.waitForEvent('page'), link.click()]);
      await popup.waitForURL(/forms\.test/);
      expect(popup.url()).toBe(want());
      expect(new URL(popup.url()).searchParams.get('page')).toBe(page.url());
      expect(page.url()).toContain(`/game/${flagged.id}`);
      await popup.close();
    }
    // after moving to another page the link carries the new address
    await page.getByTestId('tab-leaders').click();
    await settle(page);
    const [popup] = await Promise.all([context.waitForEvent('page'), page.getByTestId('footer').getByTestId('report-link').click()]);
    await popup.waitForURL(/forms\.test/);
    expect(new URL(popup.url()).searchParams.get('page')).toContain('/leaders');
  });
  test('by default the link opens the owner\'s form', async ({ page }) => {
    await page.goto('/leaders');
    await settle(page);
    expect(await page.getByTestId('report-link').getAttribute('href')).toBe(`${REPORT_FORM_URL}?page=${encodeURIComponent(page.url())}`);
  });
});

test.describe('RK-15: no hoopsjunkie links', () => {
  test('no link to hoopsjunkie on Games, Q4, By day or a player page', async ({ page }) => {
    for (const [name, url] of PLACES.filter(([n]) => ['games', 'q4', 'by-day', 'player'].includes(n))) {
      await page.goto(url);
      await settle(page);
      // open a 3-in-4 pop-up too, when the screen has one
      const chip = page.getByTestId('tag-3in4').first();
      if (await chip.count()) {
        // (a page still laying itself out scrolls, which closes the pop-up: hover again until it stays)
        await expect(async () => {
          await page.mouse.move(2, 2);
          await chip.hover();
          await expect(page.getByTestId('tif-pop')).toBeVisible({ timeout: 1000 });
        }).toPass({ timeout: 10_000 });
      }
      const bad = await page.locator('[href]').evaluateAll((els) => els.map((e) => e.getAttribute('href')!).filter((h) => /hoopsjunkie/i.test(h)));
      expect(bad, name).toEqual([]);
      expect(await page.evaluate(() => /hoopsjunkie/i.test(document.body.innerHTML)), name).toBe(false);
    }
  });
  test('schedule pop-up: a played game\'s square opens that game here (same tab, that team first); an unplayed one is plain', async ({ page }) => {
    // 2025-26 is complete: every square of a stretch is a played game.
    await page.goto('/game/latest?t=ORL&s=2025-26');
    await settle(page);
    const row = page.locator('[data-testid=list-row]:has([data-testid=tag-3in4])').first();
    const from = await row.getAttribute('data-id');
    await row.getByTestId('tag-3in4').hover();
    const pop = page.getByTestId('tif-pop');
    await expect(pop).toBeVisible();
    const squares = pop.getByTestId('tip-game');
    const ids = await squares.evaluateAll((els) => els.map((e) => [e.tagName, e.getAttribute('data-id')!, e.getAttribute('target')]));
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(ids.every(([tag, , target]) => tag === 'A' && target === null)).toBe(true);
    const other = ids.find(([, id]) => id !== from)!;
    await expect(pop.locator(`[data-id="${other[1]}"]`)).toHaveAttribute('title', /Open this game's rotations$/);
    await pop.locator(`[data-id="${other[1]}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/game/${other[1]}\\?.*t=ORL`));
    const e = index('2025-26').find((x) => x.id === other[1])!;
    await expect(page.locator('h1')).toContainText(`${e.away} ${e.as} @ ${e.home} ${e.hs}`);
    // ORL's rows come first (the selected team)
    await expect(page.getByTestId('game-team').first()).toContainText('Orlando Magic');
    // This season: a square for a game that is not in our data yet is not a link.
    const played = new Set(index(CURRENT).map((x) => x.id));
    for (const team of ['ORL', 'BOS', 'LAL', 'DEN', 'NYK', 'OKC', 'MIA', 'PHX']) {
      await page.goto(`/game/latest?t=${team}&s=${CURRENT}`);
      await settle(page);
      const chip = page.locator('[data-testid=header-tags]').first().getByTestId('tag-3in4');
      if (!(await chip.count())) continue;
      await chip.hover();
      await expect(page.getByTestId('tif-pop')).toBeVisible();
      await expect(page.getByTestId('tif-pop').getByTestId('tip-game').first()).toBeVisible();
      await expect.poll(async () => (await page.getByTestId('tif-pop').locator('a[data-testid=tip-game]').count()) > 0).toBe(true);
      const now = await page.getByTestId('tif-pop').getByTestId('tip-game').evaluateAll((els) => els.map((x) => [x.tagName, x.getAttribute('data-id')!]));
      for (const [tag, id] of now) expect(tag, `${team} ${id}`).toBe(played.has(id!) ? 'A' : 'SPAN');
      await page.mouse.move(5, 890);
    }
  });
});

test.describe('RK-16: the site is shown as "Hoop Rotations"', () => {
  test('the old name appears in no built HTML (the address aside)', () => {
    const html = readdirSync('dist').filter((f) => f.endsWith('.html'));
    expect(html).toContain('index.html');
    for (const f of html) {
      const text = readFileSync(`dist/${f}`, 'utf8').replaceAll(SITE_URL, '');
      expect(text.toLowerCase(), f).not.toContain('rotationkit');
      expect(text, f).toMatch(new RegExp(`<title>[^<]*${SITE_NAME}`));
    }
  });
  test('the old name is in no visible text, hover text or tab title of the main screens; the header shows the new one', async ({ page }) => {
    for (const [name, url] of [...PLACES, ['not-available', '/?game=0022599999'], ['no-player', '/player?name=Nobody%20Atall']] as [string, string][]) {
      await page.goto(url);
      await settle(page);
      await expect(page.locator('.brand'), name).toHaveText(SITE_NAME);
      await expect(page, name).toHaveTitle(new RegExp(`${SITE_NAME}`));
      const texts = await page.evaluate(() => [document.body.innerText, document.title, ...[...document.querySelectorAll('[title],[aria-label],[alt]')].map((e) => `${e.getAttribute('title') ?? ''} ${e.getAttribute('aria-label') ?? ''} ${e.getAttribute('alt') ?? ''}`)].join('\n'));
      expect(texts.toLowerCase(), name).not.toContain('rotationkit');
    }
  });
  test('tab titles name the page, then the site', async ({ page }) => {
    await page.goto('/game/0022500020?t=IND&s=2025-26');
    const e = index('2025-26').find((x) => x.id === '0022500020')!;
    await expect(page).toHaveTitle(`${e.away} ${e.as}, ${e.home} ${e.hs} · Oct 31, 2025 · rotations | ${SITE_NAME}`);
    await page.goto('/team/ORL?s=2025-26');
    await expect(page).toHaveTitle(`Orlando Magic · 2025-26 · usual rotation | ${SITE_NAME}`);
    await page.goto('/player/ORL/1631094?s=2025-26');
    await expect(page).toHaveTitle(`Paolo Banchero · Orlando Magic · rotations | ${SITE_NAME}`);
    await page.goto('/leaders?s=2025-26');
    await expect(page).toHaveTitle(`Leaders · 2025-26 | ${SITE_NAME}`);
  });
});
