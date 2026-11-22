// The footer of every page (RK-10): small and quiet, after the page's content (on screens built to fit the window
// it sits below the fold). Says the site is unofficial and where the data comes from; links to "How to read this"
// and, when a form is set, to "Report a problem" (RK-11).

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { helpHref } from '../app/help.ts';
import { reportUrl, SITE_NAME } from '../app/site.ts';

/** RK-11: opens the form in a new tab with the address of the page the visitor is on (read at click time, so it is
 * always the current one). Renders nothing while no form is set. `form` is only passed by tests. */
export function ReportLink({ className, form }: { className?: string; form?: string }) {
  const test = typeof window !== 'undefined' ? (window as { __RK_REPORT_FORM__?: string }).__RK_REPORT_FORM__ : undefined;
  const base = form ?? test;
  const href = reportUrl(typeof location === 'undefined' ? '' : location.href, base);
  if (!href) return null;
  return (
    <a
      className={className ?? 'report-link'}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Tell us what looks wrong on this page (opens a short form in a new tab)"
      onClick={(e) => {
        e.stopPropagation();
        e.currentTarget.href = reportUrl(location.href, base)!;
      }}
      data-testid="report-link"
    >
      Report a problem
    </a>
  );
}

// A screen built to fit the window with no page scroll (the 4th-quarter view) gives the footer a place inside its
// own scrolling panel; the footer then renders there instead of after the page.
let slot: HTMLElement | null = null;
const subs = new Set<() => void>();
export function setFooterSlot(el: HTMLElement | null) {
  if (slot === el) return;
  slot = el;
  subs.forEach((f) => f());
}
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));

export function Footer() {
  const at = useSyncExternalStore(subscribe, () => slot);
  const footer = (
    <footer className={`site-footer${at ? ' in-panel' : ''}`} data-testid="footer">
      <span data-testid="footer-notice">Unofficial fan site. Not affiliated with or endorsed by the NBA. Data, logos and player photos: NBA.com.</span>
      <span className="site-footer-links">
        <span>{SITE_NAME}</span>
        <a href={helpHref()} data-testid="footer-help">
          How to read this
        </a>
        <ReportLink />
      </span>
    </footer>
  );
  return at ? createPortal(footer, at) : footer;
}
