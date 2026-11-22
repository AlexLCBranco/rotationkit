// The <head> tags that describe a page to browsers, search engines and link previews (RK-9, RK-14): title,
// description, canonical address, Open Graph and Twitter card tags. Written into index.html at build time (vite.config.ts)
// between the markers below, and again per generated page (scripts/lib/pages.ts).

import { OG_IMAGE, SITE_NAME, SITE_TAGLINE, SITE_URL, tabTitle } from '../../src/app/site.ts';

export const HEAD_OPEN = '<!--rk:head-->';
export const HEAD_CLOSE = '<!--/rk:head-->';

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface HeadInfo {
  /** The page's own part of the title (none = the site's start page). */
  title?: string;
  description?: string;
  /** Path on the site, starting with "/". */
  path?: string;
}

export function headTags(h: HeadInfo = {}): string {
  const title = esc(tabTitle(h.title));
  const desc = esc(h.description ?? SITE_TAGLINE);
  const url = esc(SITE_URL + (h.path ?? '/'));
  const img = esc(SITE_URL + OG_IMAGE.path);
  return [
    HEAD_OPEN,
    `<title>${title}</title>`,
    `<meta name="description" content="${desc}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${desc}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta property="og:image:width" content="${OG_IMAGE.width}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE.height}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${desc}" />`,
    `<meta name="twitter:image" content="${img}" />`,
    HEAD_CLOSE,
  ].join('\n    ');
}

/** `html` with the block between the markers replaced by this page's tags. */
export function withHead(html: string, h: HeadInfo): string {
  const a = html.indexOf(HEAD_OPEN);
  const b = html.indexOf(HEAD_CLOSE);
  if (a < 0 || b < 0) throw new Error('index.html has no rk:head markers');
  return html.slice(0, a) + headTags(h) + html.slice(b + HEAD_CLOSE.length);
}
