// RK-8: the pinned header (backlogkit's NAV_PATTERN.md §1; same look as footykit FK-65), one element for the whole
// app, identical on every page: logo, back / forward (the app's own page history), the breadcrumb (each part opens
// its siblings), "Go anywhere" (Ctrl+K) on the right, and under them the four places. It never changes height and
// never hides on scroll; the page rows under it scroll away.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { loadIndex, loadPlayers } from '../app/data.ts';
import { useAsync } from '../app/hooks.ts';
import { crumbs, goEntries, navContext, seasonShown, WHERE, whereOf, whereRoute, type Crumb, type Where } from '../app/nav.ts';
import { pageHistory, subscribe } from '../app/pageHistory.ts';
import { format, type Nav, type Route } from '../app/route.ts';
import { SITE_NAME, tabTitle } from '../app/site.ts';
import { pageTitle } from '../app/title.ts';
import { GoAnywhere } from './GoAnywhere.tsx';

const ICONS: Record<Where, ReactNode> = {
  // a basketball
  games: (
    <>
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1.8 8h12.4M8 1.8v12.4M3.6 3.6c2.2 2.4 2.2 6.4 0 8.8M12.4 3.6c-2.2 2.4-2.2 6.4 0 8.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </>
  ),
  // a calendar
  day: (
    <>
      <rect x="2" y="3.5" width="12" height="10.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2 6.5h12M5 2v3M11 2v3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="5" y="8.5" width="3" height="3" fill="currentColor" />
    </>
  ),
  // stints on a timeline
  averages: (
    <>
      <path d="M2 3.5h5M9 3.5h5M2 8h3M7 8h7M2 12.5h8M12 12.5h2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  // a podium
  leaders: (
    <>
      <path d="M5.5 6h5v8h-5zM1.5 9h4v5h-4zM10.5 10.5h4V14h-4z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 1.6l.7 1.4 1.5.2-1.1 1 .3 1.5L8 5l-1.4.7.3-1.5-1.1-1 1.5-.2z" fill="currentColor" />
    </>
  ),
  // a question mark in a circle
  help: (
    <>
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.1 6.3a2 2 0 1 1 2.9 1.8c-.6.3-1 .7-1 1.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.6" r="0.9" fill="currentColor" />
    </>
  ),
};

/** Closes a popover on Escape or a press outside `box`. */
function useDismiss(open: boolean, box: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const f = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', f);
    document.addEventListener('keydown', f);
    return () => {
      document.removeEventListener('pointerdown', f);
      document.removeEventListener('keydown', f);
    };
  }, [open, box, close]);
}

function CrumbPart({ c, last, nav }: { c: Crumb; last: boolean; nav: Nav }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const close = useMemo(() => () => setOpen(false), []);
  useDismiss(open, box, close);
  return (
    <span className="rk-crumb" ref={box} data-testid="crumb">
      <span className="rk-crumb-sep" aria-hidden="true">
        ›
      </span>
      <button
        type="button"
        className={`rk-crumb-btn${last ? ' last' : ''}`}
        aria-haspopup={c.items.length ? 'menu' : undefined}
        aria-expanded={c.items.length ? open : undefined}
        title={c.items.length ? `${c.label}: jump to another` : c.label}
        disabled={!c.items.length}
        onClick={() => setOpen((o) => !o)}
        data-testid="crumb-btn"
      >
        {c.label}
      </button>
      {open && (
        <span className="rk-crumb-menu" role="menu" data-testid="crumb-menu">
          {c.items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              className={`rk-crumb-item${it.on ? ' on' : ''}`}
              aria-current={it.on || undefined}
              ref={it.on ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
              onClick={() => {
                setOpen(false);
                if (!it.on) nav(it.route);
              }}
            >
              {it.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

export function Header({ route, seasons, season, rememberedTeam, nav }: { route: Route; seasons: string[]; season: string; rememberedTeam: string | null; nav: Nav }) {
  const h = useSyncExternalStore(subscribe, pageHistory);
  const where = whereOf(route);
  const shown = seasonShown(route, season);
  const c = navContext(route, season, rememberedTeam);
  // Game labels and the player's name for the breadcrumb (both files are already loaded by the pages; memoized).
  const index = useAsync(() => (route.view === 'game' && seasons.length ? loadIndex(shown) : Promise.resolve(undefined)), [route.view === 'game', shown, seasons.length]);
  const players = useAsync(() => (route.view === 'player' ? loadPlayers(shown) : Promise.resolve(undefined)), [route.view === 'player', shown]);
  const playerName = route.view === 'player' && players.status === 'ok' ? players.value?.find((p) => p[0] === route.player)?.[1] : undefined;
  const parts = seasons.length ? crumbs(route, season, { seasons, index: index.status === 'ok' ? index.value : undefined, playerName, rememberedTeam }) : [];
  // The tab title names the page (RK-9), then the site.
  const title = tabTitle(seasons.length ? pageTitle(route, { season: shown, index: index.status === 'ok' ? index.value : undefined, playerName }) : null);
  useEffect(() => void (document.title = title), [title]);
  const entries = useMemo(() => goEntries(c), [c.team, c.season, JSON.stringify(c.filters)]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <header className="rk-header" data-testid="header">
      <div className="rk-head-row">
        <a className="brand" href="/" title={`${SITE_NAME}: back to the start`}>
          <img className="brand-logo" src="/favicon.svg" alt="" width={22} height={22} />
          <span className="brand-text">{SITE_NAME}</span>
        </a>
        <span className="rk-hist" role="group" aria-label="Page history" data-testid="page-history">
          <button type="button" className="rk-hist-btn" disabled={h.i === 0} title={h.i === 0 ? 'Nothing to go back to' : 'Back to the previous page'} aria-label="Back" onClick={() => history.back()} data-testid="hist-back">
            ←
          </button>
          <button type="button" className="rk-hist-btn" disabled={h.i >= h.stack.length - 1} title={h.i >= h.stack.length - 1 ? 'Nothing to go forward to' : 'Forward to the next page'} aria-label="Forward" onClick={() => history.forward()} data-testid="hist-forward">
            →
          </button>
        </span>
        <nav className="rk-crumbs" aria-label="You are here" data-testid="breadcrumb">
          {parts.map((p, i) => (
            <CrumbPart key={`${i}|${p.label}`} c={p} last={i === parts.length - 1} nav={nav} />
          ))}
        </nav>
        <span className="rk-head-end">
          <GoAnywhere entries={entries} nav={nav} />
        </span>
      </div>
      <nav className="rk-where" aria-label="Places" data-testid="where-tabs">
        {WHERE.map(([w, label, tip]) => (
          <button
            key={w}
            type="button"
            className={`rk-where-tab${w === where ? ' on' : ''}`}
            aria-current={w === where ? 'page' : undefined}
            title={tip}
            onClick={() => {
              const to = whereRoute(w, c);
              if (format(to) !== format(route)) nav(to);
            }}
            data-testid={`tab-${w}`}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              {ICONS[w]}
            </svg>
            <span className="rk-where-label">{label}</span>
          </button>
        ))}
      </nav>
    </header>
  );
}
