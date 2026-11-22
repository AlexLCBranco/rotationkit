// RK-14: addresses are real paths; one generated page per game, player and team with its own title and preview tags;
// old hash links still parse; sitemap and robots.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSeason } from './data.ts';
import { format, isStart, parse } from '../src/app/route.ts';
import { step } from '../src/app/pageHistory.ts';
import { SITE_NAME, SITE_URL } from '../src/app/site.ts';
import { buildPlayerIndex } from '../src/domain/players.ts';
import type { GameIndexEntry } from '../src/domain/types.ts';
import { withHead } from '../scripts/lib/head.ts';
import { allPages, gamePage, pageFiles, playerPage, sitemap, teamPage } from '../scripts/lib/pages.ts';

const index = (s: string) => JSON.parse(readFileSync(`data/${s}/index.json`, 'utf8')) as GameIndexEntry[];
const HTML = withHead(readFileSync('index.html', 'utf8'), {});

describe('addresses', () => {
  it('format gives a path (no hash) for every view, and it round-trips', () => {
    for (const url of [
      '/game/0022500093?s=2025-26&t=ORL',
      '/q4/0022500093?t=ORL',
      '/team/ORL?s=2025-26&w=10&v=home&b=0&p=1630532&m=without',
      '/team/ORL?s=2025-26&gs=post',
      '/player/ORL/1630532?s=2025-26',
      '/player?name=Luka+Don%C4%8Di%C4%87',
      '/games?view=day&date=2026-11-12&s=2026-27&nb=1',
      '/leaders?s=2025-26&w=10&part=h2&ot=1&sort=usg&lt=ORL&gt=1',
      '/fullq4?s=2026-27&t=ORL&th=11&nb=1',
      '/help?sec=garbage',
    ]) {
      const out = format(parse(url));
      expect(out.startsWith('/'), url).toBe(true);
      expect(out).not.toContain('#');
      expect(parse(out)).toEqual(parse(url));
      expect(format(parse(out))).toBe(out);
    }
    expect(format(parse('/team'))).toBe('/team');
  });
  it('an old hash link names the same view as its new address', () => {
    for (const [old, now] of [
      ['#/game/0022500093?t=ORL&s=2025-26', '/game/0022500093?s=2025-26&t=ORL'],
      ['#/q4/0022500093?t=ORL', '/q4/0022500093?t=ORL'],
      ['#/team/ORL?s=2025-26&w=10', '/team/ORL?s=2025-26&w=10'],
      ['#/player/ORL/1630532', '/player/ORL/1630532'],
      ['#/games?view=day&date=2025-11-10', '/games?view=day&date=2025-11-10'],
      ['#/leaders', '/leaders'],
      ['#/fullq4?th=11', '/fullq4?th=11'],
      ['#/help?sec=usg', '/help?sec=usg'],
    ] as const) {
      expect(parse(old)).toEqual(parse(now));
      expect(format(parse(old))).toBe(now);
    }
  });
  it('the start page', () => {
    for (const u of ['/', '', '#/', '#']) expect(isStart(u), u).toBe(true);
    for (const u of ['/leaders', '/?game=1', '#/team/ORL', '/game/1']) expect(isStart(u), u).toBe(false);
    expect(parse('/')).toMatchObject({ view: 'game', game: 'latest', team: null });
  });
  it('page history works on addresses', () => {
    const h = step({ stack: ['/'], i: 0 }, '/leaders', 'push');
    expect(step(h, '/', 'browser')).toEqual({ stack: ['/', '/leaders'], i: 0 });
  });
});

describe('generated pages', () => {
  const pages = allPages('data');
  const paths = new Set(pages.map((p) => p.path));
  it('one page per game in the data', () => {
    for (const s of ['2025-26', '2026-27']) for (const e of index(s)) expect(paths.has(`/game/${e.id}`), e.id).toBe(true);
    expect(pages.filter((p) => p.path.startsWith('/game/'))).toHaveLength(index('2025-26').length + index('2026-27').length);
  });
  it('one page per player and team he played for, in every season; one per team', () => {
    const want = new Set<string>();
    for (const s of ['2025-26', '2026-27']) for (const [id, , teams] of buildPlayerIndex(loadSeason(s))) for (const t of teams) want.add(`/player/${t}/${id}`);
    expect(new Set(pages.filter((p) => p.path.startsWith('/player/')).map((p) => p.path))).toEqual(want);
    expect(pages.filter((p) => p.path.startsWith('/team/'))).toHaveLength(30);
    expect(paths.size).toBe(pages.length); // no address twice
  });
  it('a known game: real teams, score and date in the title, description and tags', () => {
    const e = index('2025-26').find((x) => x.id === '0022500020')!;
    const p = gamePage(e);
    expect(p.title).toBe(`ATL ${e.as}, IND ${e.hs} · Oct 31, 2025 · rotations`);
    expect(p.description).toContain(`Atlanta Hawks ${e.as}, Indiana Pacers ${e.hs} on Oct 31, 2025`);
    const html = pageFiles(HTML, [p])['game/0022500020.html']!;
    expect(html).toContain(`<title>ATL ${e.as}, IND ${e.hs} · Oct 31, 2025 · rotations | ${SITE_NAME}</title>`);
    expect(html).toContain(`<meta property="og:title" content="ATL ${e.as}, IND ${e.hs} · Oct 31, 2025 · rotations | ${SITE_NAME}" />`);
    expect(html).toContain(`<meta property="og:url" content="${SITE_URL}/game/0022500020" />`);
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}/game/0022500020" />`);
    expect(html).toContain(`<meta property="og:image" content="${SITE_URL}/og.png" />`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html).toContain('<div id="root"></div>'); // still the app
    const first = index('2026-27')[0]!;
    expect(gamePage(first).title).toBe(`${first.away} ${first.as}, ${first.home} ${first.hs} · Oct 20, 2026 · rotations`);
  });
  it('a player and a team', () => {
    expect(playerPage(1631094, 'Paolo Banchero', 'ORL')).toMatchObject({ path: '/player/ORL/1631094', title: 'Paolo Banchero · Orlando Magic · rotations' });
    expect(pages.find((p) => p.path === '/player/ORL/1631094')!.title).toBe('Paolo Banchero · Orlando Magic · rotations');
    expect(teamPage('ORL', '2026-27')).toMatchObject({ path: '/team/ORL', title: 'Orlando Magic · 2026-27 · usual rotation' });
    expect(pages.find((p) => p.path === '/team/BOS')!.title).toBe('Boston Celtics · 2026-27 · usual rotation');
    // a name with a quote or an accent is escaped / kept
    expect(pageFiles(HTML, [playerPage(1, `D'Angelo "X" <b>`, 'ORL')])['player/ORL/1.html']).toContain('D\'Angelo &quot;X&quot; &lt;b&gt;');
  });
  it('sitemap lists the start page, the help page and every generated page; robots points to it', () => {
    const files = pageFiles(HTML, pages);
    const map = files['sitemap.xml']!;
    expect(map.match(/<loc>/g)).toHaveLength(pages.length + 2);
    expect(map).toContain(`<loc>${SITE_URL}/</loc>`);
    expect(map).toContain(`<loc>${SITE_URL}/game/0022500020</loc>`);
    expect(map).toContain(`<loc>${SITE_URL}/team/ORL</loc>`);
    expect(sitemap([])).toContain(`<loc>${SITE_URL}/help</loc>`);
    expect(files['robots.txt']).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
    expect(Object.keys(files)).toHaveLength(pages.length + 2);
  });
  it('the pages stay small: each adds under 2 KB to index.html; under 20 MB in all', () => {
    const files = pageFiles(HTML, pages);
    let total = 0;
    for (const [path, text] of Object.entries(files)) {
      total += Buffer.byteLength(text);
      if (path.endsWith('.html')) expect(Buffer.byteLength(text) - Buffer.byteLength(HTML), path).toBeLessThan(2048);
    }
    expect(total).toBeLessThan(20 * 1024 * 1024);
  });
  it('host config: clean addresses, one catch-all pattern (no entry per page)', () => {
    const v = JSON.parse(readFileSync('vercel.json', 'utf8')) as { cleanUrls: boolean; rewrites: { source: string; destination: string }[] };
    expect(v.cleanUrls).toBe(true);
    expect(v.rewrites).toEqual([{ source: '/((?!data/|assets/).*)', destination: '/index.html' }]);
  });
});
