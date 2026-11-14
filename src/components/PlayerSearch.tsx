// Player search, always in the header. "/" or Ctrl+K focuses it from anywhere (not while typing in another field).
// Case- and accent-insensitive, any part of the name, initials ("sga"). Up to 8 results (headshot, name, team),
// players of the selected season first. ↑/↓ move, Enter opens, Esc closes; the mouse works too. Empty and focused:
// the last 5 players opened. Opening a result → his page for that season (most recent team), current filters kept.

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadPlayers } from '../app/data.ts';
import { useAsync } from '../app/hooks.ts';
import { playerHref } from '../app/links.ts';
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

export function PlayerSearch() {
  const ctx = useLinkContext();
  const seasons = ctx?.seasons ?? [];
  const input = useRef<HTMLInputElement>(null);
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
      input.current?.focus();
      input.current?.select();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const season = ctx?.season ?? seasons[seasons.length - 1]!;
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
    input.current?.blur();
  };
  const go = (h: SearchHit) => {
    location.hash = href(h);
    close();
  };
  const show = open && (hits.length > 0 || q.trim() !== '');
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      // First Esc closes the list; a second one leaves the box.
      if (show) setOpen(false);
      else close();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (hits.length) setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length);
      return;
    }
    if (e.key === 'Enter') {
      const h = hits[active];
      if (h) {
        e.preventDefault();
        go(h);
      }
    }
  };
  return (
    <div className="psearch" data-testid="player-search">
      <input
        ref={input}
        type="search"
        className="psearch-input"
        placeholder="Search players  /"
        aria-label="Search players"
        aria-expanded={show}
        aria-controls="psearch-list"
        aria-activedescendant={show && hits[active] ? `psearch-${hits[active]!.id}` : undefined}
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setRecent(recentPlayers());
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        data-testid="search-input"
      />
      {show && (
        <ul className="psearch-list" id="psearch-list" role="listbox" data-testid="search-results" data-mode={q.trim() ? 'search' : 'recent'}>
          {!q.trim() && <li className="psearch-head muted">Recently opened</li>}
          {hits.map((h, i) => {
            const team = h.teams[h.teams.length - 1]!;
            return (
              <li key={h.id} id={`psearch-${h.id}`} role="option" aria-selected={i === active}>
                <a
                  className={`psearch-item${i === active ? ' active' : ''}`}
                  href={href(h)}
                  // Keep the focus in the box until the click lands (the list closes on blur).
                  onMouseDown={(e) => e.preventDefault()}
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
          {q.trim() && !hits.length && <li className="psearch-empty muted">{index.status === 'loading' ? 'Loading players…' : `No player matches “${q.trim()}”.`}</li>}
        </ul>
      )}
    </div>
  );
}
