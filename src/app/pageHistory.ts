// RK-8: the header's back / forward = the app's own page history (NAV_PATTERN.md §1). It mirrors the browser's
// session history inside the app (the buttons call history.back() / forward()), so it knows when there is nothing
// to go back or forward to. Kept in sessionStorage so a reload keeps it.

export interface PageHistory {
  stack: string[];
  i: number;
}

/** A hash change: `replace` (the app fixed up the URL), `push` (the app navigated), else the browser's own move
 * (back / forward, a link, typing the URL): one step back or forward when it matches, otherwise a new page. */
export function step(h: PageHistory, hash: string, how: 'push' | 'replace' | 'browser'): PageHistory {
  if (h.stack[h.i] === hash) return h;
  if (how === 'replace') return { stack: h.stack.map((x, k) => (k === h.i ? hash : x)), i: h.i };
  if (how === 'browser') {
    if (h.stack[h.i - 1] === hash) return { ...h, i: h.i - 1 };
    if (h.stack[h.i + 1] === hash) return { ...h, i: h.i + 1 };
  }
  return { stack: [...h.stack.slice(0, h.i + 1), hash], i: h.i + 1 };
}

const KEY = 'rk.pages';
let state: PageHistory = load();
let pending: { hash: string; how: 'push' | 'replace' } | null = null;
const subs = new Set<() => void>();

function load(): PageHistory {
  const hash = typeof location === 'undefined' ? '' : location.hash;
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as PageHistory | null;
    if (saved && Array.isArray(saved.stack) && saved.stack[saved.i] === hash) return saved;
  } catch {
    /* no storage */
  }
  return { stack: [hash], i: 0 };
}

/** Called by the app's own navigation just before it changes the URL. */
export function expect(hash: string, how: 'push' | 'replace') {
  pending = { hash, how };
}

export function onHashChange(hash: string) {
  const how = pending && pending.hash === hash ? pending.how : 'browser';
  pending = null;
  const next = step(state, hash, how);
  if (next === state) return;
  state = next;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* no storage */
  }
  subs.forEach((f) => f());
}

export const pageHistory = () => state;
export function subscribe(f: () => void) {
  subs.add(f);
  return () => void subs.delete(f);
}
