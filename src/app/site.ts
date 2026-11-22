// The site's public name, one-line description and outside links, in ONE place (RK-16). Everything a visitor sees
// reads from here: tab titles, the header, the footer, "How to read this", the social tags and index.html (filled in
// at build time by vite.config.ts). "Hoop Rotations" is a placeholder name: to rename the site, change SITE_NAME.
// No imports: the build scripts load this file too.

export const SITE_NAME = 'Hoop Rotations';

/** One plain line saying what the site is. */
export const SITE_TAGLINE = 'Who was on the court, and when, in every NBA game.';

/** The public address (stays until the name is final, so shared links don't break twice). */
export const SITE_URL = 'https://rotationkit.vercel.app';

/** Site-wide link preview image (public/, 1200 × 630; redraw with `node scripts/make-og-image.mjs`). */
export const OG_IMAGE = { path: '/og.png', width: 1200, height: 630 } as const;

/** RK-11: the "Report a problem" form (Tally). Empty = no link is shown anywhere. */
export const REPORT_FORM_URL = 'https://tally.so/r/Vpz5KM';

/** Tab title: the page's own part, then the site's name. */
export const tabTitle = (page?: string | null) => (page ? `${page} | ${SITE_NAME}` : `${SITE_NAME}: ${SITE_TAGLINE.replace(/\.$/, '')}`);

/** The URL parameter that carries the page's address to the form. Tally fills a field from a URL parameter only
 * through a hidden field of the SAME name (case-sensitive) set as that field's default answer (Tally help:
 * "Pre-populate form fields", "Hidden fields"; free plan). So the form needs a hidden field called `page`. */
export const REPORT_PAGE_PARAM = 'page';

/** The "Report a problem" link for a page: the form with that page's full address (hash included) passed along,
 * URL-encoded. Null while no form is set. */
export function reportUrl(pageUrl: string, form: string = REPORT_FORM_URL): string | null {
  if (!form.trim()) return null;
  return `${form.trim()}${form.includes('?') ? '&' : '?'}${REPORT_PAGE_PARAM}=${encodeURIComponent(pageUrl)}`;
}
