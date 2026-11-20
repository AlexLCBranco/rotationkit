// "Go anywhere" (RK-8, NAV_PATTERN.md §1), always at the right of the header: the button, Ctrl+K or "/" opens it from
// anywhere (not while typing in another field). Places and teams ("bos", "celtics averages") first, then players:
// case- and accent-insensitive, any part of the name, initials ("sga"); up to 8 players (headshot, name, team), the
// selected season's first. ↑/↓ move, Enter opens, Esc closes; the mouse works too. Empty: the last 5 players opened.
// A player → his page for that season (most recent team), current filters kept.

import { useEffect, useMemo, useState } from 'react';
import { loadPlayers } from '../app/data.ts';
import { useAsync } from '../app/hooks.ts';
import { playerHref } from '../app/links.ts';
import { goFind, type GoEntry } from '../app/nav.ts';
import { format, type Route } from '../app/route.ts';
import { recentPlayers } from '../app/recent.ts';
import { searchPlayers, type PlayerIndexEntry, type SearchHit } from '../domain/players.ts';
import { Headshot } from './Headshot.tsx';
import { useLinkContext } from './Links.tsx';

export const SEARCH_LIMIT = 8;

/** True when the key goes to a text field (or a select) the user is typing in. */
const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
};

export function GoAnywhere({ entries, nav }: { entries: GoEntry[]; nav: (r: Route) => void }) {
  const ctx = useLinkContext();
  const seasons = ctx?.seasons ?? [];
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState(recentPlayers);
  // The indexes are small (~20 KB per season): loaded once, so typing is instant.
  const index = useAsync(async () => Object.fromEntries(await Promise.all(seasons.map(async (s) => [s, await loadPlayers(s)] as const))) as Record<string, PlayerIndexEntry[]>, [seasons]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey;
      const ctrlK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
      if (!slash && !ctrlK) return;
      if (typing(e.target)) return;
      e.preventDefault();
      setRecent(recentPlayers());
      setOpen(true);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const season = ctx?.season ?? seasons[seasons.length - 1]!;
  const places = useMemo(() => goFind(entries, q), [entries, q]);
  const hits: SearchHit[] = useMemo(() => {
    if (!q.trim()) return recent.map((r) => ({ id: r.id, name: r.name, teams: [r.team], season: r.season }));
    return index.status === 'ok' ? searchPlayers(index.value, q, season, SEARCH_LIMIT) : [];
  }, [q, index, season, recent]);
  useEffect(() => setActive(0), [q]);
  if (!ctx) return null;

  const href = (h: SearchHit) => playerHref(ctx, { id: h.id, team: h.teams[h.teams.length - 1]!, season: h.season });
  const close = () => {
    setOpen(false);
    setQ('');
  };
  const go = (h: SearchHit) => {
    close();
    location.hash = href(h);
  };
  const goPlace = (e: GoEntry) => {
    close();
    nav(e.route);
  };
  const n = places.length + hits.length;
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (n) setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (active < places.length) goPlace(places[active]!);
      else if (hits[active - places.length]) go(hits[active - places.length]!);
    }
  };
  return (
    <>
      <button
        type="button"
        className="rk-go-btn"
        onClick={() => {
          setRecent(recentPlayers());
          setOpen(true);
        }}
        aria-label="Go anywhere (Ctrl+K)"
        title="Go anywhere: a player, a team, a place (Ctrl+K or /)"
        data-testid="go-anywhere"
      >
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <circle cx="6.8" cy="6.8" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M10.3 10.3l3.9 3.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span className="rk-go-text">Go anywhere</span>
        <kbd className="rk-go-kbd">Ctrl K</kbd>
      </button>
      {open && (
        <div className="rk-go-shade" onPointerDown={(e) => e.target === e.currentTarget && close()}>
          <div className="rk-go psearch" role="dialog" aria-label="Go anywhere" data-testid="player-search">
            <input
              autoFocus
              type="search"
              className="rk-go-input psearch-input"
              placeholder='A player, a team ("bos"), a place…'
              aria-label="Go anywhere: a player, a team or a place"
              aria-expanded="true"
              aria-controls="psearch-list"
              aria-activedescendant={n ? `psearch-${active}` : undefined}
              role="combobox"
              autoComplete="off"
              spellCheck={false}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              data-testid="search-input"
            />
            <ul className="psearch-list" id="psearch-list" role="listbox" data-testid="search-results" data-mode={q.trim() ? 'search' : 'recent'}>
              {!q.trim() && hits.length > 0 && <li className="psearch-head muted">Recently opened</li>}
              {places.map((e, i) => (
                <li key={`${e.kind}|${e.label}`} id={`psearch-${i}`} role="option" aria-selected={i === active}>
                  <a
                    className={`psearch-item${i === active ? ' active' : ''}`}
                    href={format(e.route)}
                    onMouseEnter={() => setActive(i)}
                    onClick={(ev) => {
                      if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button !== 0) return;
                      ev.preventDefault();
                      goPlace(e);
                    }}
                    data-testid="go-item"
                  >
                    <span className="psearch-name">{e.label}</span>
                    <span className="psearch-team muted">{e.kind}</span>
                  </a>
                </li>
              ))}
              {hits.map((h, k) => {
                const i = places.length + k;
                const team = h.teams[h.teams.length - 1]!;
                return (
                  <li key={h.id} id={`psearch-${i}`} role="option" aria-selected={i === active}>
                    <a
                      className={`psearch-item${i === active ? ' active' : ''}`}
                      href={href(h)}
                      onMouseEnter={() => setActive(i)}
                      onClick={(e) => {
                        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
                        e.preventDefault();
                        go(h);
                      }}
                      data-testid="search-result"
                      data-player={h.id}
                      data-team={team}
                      data-season={h.season}
                    >
                      <Headshot id={h.id} name={h.name} />
                      <span className="psearch-name">{h.name}</span>
                      <span className="psearch-team">
                        {team}
                        {h.teams.length > 1 && <span className="muted"> · was {h.teams.slice(0, -1).reverse().join(', ')}</span>}
                        {h.season !== season && <span className="muted"> · {h.season}</span>}
                      </span>
                    </a>
                  </li>
                );
              })}
              {q.trim() && !n && <li className="psearch-empty muted">{index.status === 'loading' ? 'Loading players…' : `Nothing matches “${q.trim()}”.`}</li>}
              {!q.trim() && !hits.length && <li className="psearch-empty muted">Type a player, a team or a place.</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
