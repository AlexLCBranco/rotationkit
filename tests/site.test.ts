// RK-9 / RK-11 / RK-16: the site's name in one place, the head tags of index.html, the preview image, the report link.

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { headTags, withHead } from '../scripts/lib/head.ts';
import { OG_IMAGE, REPORT_FORM_URL, REPORT_PAGE_PARAM, reportUrl, SITE_NAME, SITE_TAGLINE, SITE_URL, tabTitle } from '../src/app/site.ts';
import { gameTitle, pageTitle, playerTitle, teamTitle } from '../src/app/title.ts';
import { parse } from '../src/app/route.ts';

describe('head tags (index.html at build time)', () => {
  // The same function the Vite plugin runs on index.html (vite.config.ts → siteHead).
  const html = withHead(readFileSync('index.html', 'utf8'), {});
  it('index.html keeps the markers and types no name of its own', () => {
    const src = readFileSync('index.html', 'utf8');
    expect(src).toContain('<!--rk:head-->');
    expect(src).not.toMatch(/<title>/);
    expect(src.toLowerCase()).not.toContain(SITE_NAME.toLowerCase());
  });
  it('title, description, Open Graph and Twitter card tags, all from the site constants', () => {
    expect(html).toContain(`<title>${SITE_NAME}: ${SITE_TAGLINE.replace(/\.$/, '')}</title>`);
    expect(html).toContain(`<meta name="description" content="${SITE_TAGLINE}" />`);
    for (const p of ['og:title', 'og:description', 'og:type', 'og:url', 'og:image']) expect(html, p).toMatch(new RegExp(`<meta property="${p}" content="[^"]+" />`));
    for (const n of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) expect(html, n).toMatch(new RegExp(`<meta name="${n}" content="[^"]+" />`));
    expect(html).toContain(`<meta property="og:url" content="${SITE_URL}/" />`);
    expect(html).toContain(`<meta property="og:image" content="${SITE_URL}${OG_IMAGE.path}" />`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });
  it('values are escaped', () => {
    expect(headTags({ title: 'A "B" <c> & d' })).toContain('<title>A &quot;B&quot; &lt;c&gt; &amp; d | ');
  });
  it('the built page, when there is a build, carries the same tags', () => {
    if (!existsSync('dist/index.html')) return;
    const built = readFileSync('dist/index.html', 'utf8');
    expect(built).toContain(`<meta property="og:image" content="${SITE_URL}${OG_IMAGE.path}" />`);
    expect(built).toContain(`<title>${tabTitle()}</title>`);
  });
});

describe('preview image', () => {
  it(`public${OG_IMAGE.path} is a ${OG_IMAGE.width} × ${OG_IMAGE.height} PNG`, () => {
    const png = readFileSync(`public${OG_IMAGE.path}`);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    // IHDR: width and height, big-endian, at bytes 16 and 20.
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([OG_IMAGE.width, OG_IMAGE.height]);
  });
});

describe('"Report a problem" link (RK-11)', () => {
  const page = 'https://rotationkit.vercel.app/#/game/0022600092?t=POR&s=2026-27';
  it('the form with the page address URL-encoded, hash included', () => {
    const url = reportUrl(page, 'https://tally.so/r/abc')!;
    expect(url).toBe(`https://tally.so/r/abc?${REPORT_PAGE_PARAM}=https%3A%2F%2Frotationkit.vercel.app%2F%23%2Fgame%2F0022600092%3Ft%3DPOR%26s%3D2026-27`);
    expect(new URL(url).searchParams.get(REPORT_PAGE_PARAM)).toBe(page);
    expect(new URL(url).hash).toBe('');
  });
  it('a form address that already has parameters keeps them', () => {
    expect(reportUrl('https://x.test/a b', 'https://tally.so/r/abc?x=1')).toBe(`https://tally.so/r/abc?x=1&${REPORT_PAGE_PARAM}=https%3A%2F%2Fx.test%2Fa%20b`);
  });
  it('no form set → no link', () => {
    expect(reportUrl(page, '')).toBeNull();
    expect(reportUrl(page, '  ')).toBeNull();
  });
  it("the owner's form is set", () => {
    expect(REPORT_FORM_URL).toBe('https://tally.so/r/Vpz5KM');
    expect(reportUrl(page)).toContain('https://tally.so/r/Vpz5KM?page=');
  });
});

describe('tab titles', () => {
  const e = { id: '0022600300', date: '2026-11-20', away: 'LAL', home: 'BOS', as: 112, hs: 108 };
  it('page part, then the site name; the start page is the name and what the site is', () => {
    expect(tabTitle('Leaders')).toBe(`Leaders | ${SITE_NAME}`);
    expect(tabTitle()).toBe(`${SITE_NAME}: Who was on the court, and when, in every NBA game`);
  });
  it('game, player, team', () => {
    expect(gameTitle(e)).toBe('LAL 112, BOS 108 · Nov 20, 2026 · rotations');
    expect(playerTitle('Paolo Banchero', 'ORL')).toBe('Paolo Banchero · Orlando Magic · rotations');
    expect(teamTitle('ORL', '2026-27')).toBe('Orlando Magic · 2026-27 · usual rotation');
  });
  it('every kind of page', () => {
    const d = { season: '2026-27', index: [e as never], playerName: 'Paolo Banchero' };
    const t = (hash: string) => pageTitle(parse(hash), d);
    expect(t('#/game/0022600300?t=BOS')).toBe('LAL 112, BOS 108 · Nov 20, 2026 · rotations');
    expect(t('#/q4/0022600300')).toBe('LAL 112, BOS 108 · Nov 20, 2026 · rotations · 4th quarter');
    expect(t('#/game/latest?t=BOS')).toBe('Boston Celtics · games');
    expect(t('#/')).toBeNull();
    expect(t('#/games?view=day&date=2026-11-20')).toBe('Games of Nov 20, 2026');
    expect(t('#/team/ORL')).toBe('Orlando Magic · 2026-27 · usual rotation');
    expect(t('#/player/ORL/1631094')).toBe('Paolo Banchero · Orlando Magic · rotations');
    expect(t('#/leaders')).toBe('Leaders · 2026-27');
    expect(t('#/fullq4')).toBe('Full 4th quarters · 2026-27');
    expect(t('#/help')).toBe('How to read this');
  });
});
