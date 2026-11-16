# Feature backlog — rotationkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are RK-1, RK-2, ... (never reused; RK is this repo's prefix, unique across the owner's repos).

## Ready

### RK-4 — Phone-usable site (desktop stays as is)
The owner wants to open rotationkit links on his phone. rotationkit is the only one of his apps getting phone support
(others stay desktop-only). Desktop layout at >= 1280px must not change.

Found on a 375px check (Nov 2026): the page loads and the top bar, team picker and search fit, but:
- The games list scrolls inside the page; on touch, swipes over it scroll the list instead of the page (scroll trap).
- The list fills the first screen, so the opened game (e.g. a direct `?game=` link) starts below the fold.
- Badges on the right edge of list rows are clipped.
- Game chart, By day, Q4, Averages, Leaders and player pages were not checked at phone width.

Wanted, at widths < 768px:
- **Game first:** when a game is open (incl. direct links), the game header and chart are on the first screen. The
  games list becomes collapsed/compact (tap to expand), with no nested scroll trap.
- **No page-level horizontal scroll** on any route. Wide content (tables, chart) scrolls inside its own container, with
  the player-name column sticky where it applies.
- **Touch replaces hover:** tapping/dragging on the game chart moves the time cursor and shows the on-court lineup for
  that moment (check the existing pointer handlers already do this on touch; fix if not). Every hover tooltip/pop-up
  (stint text, badges, fouls, etc.) opens on tap and closes on tap outside. One shared pattern, reused everywhere.
- **RK-2 resizable panel:** drag-to-resize is disabled on phone widths (doesn't apply there).
- Badges and chips never clipped; tap targets comfortably finger-sized.
- Add a rule to CLAUDE.md: every future change must work at 390px and 1280px, and the phone e2e project must pass.

**Tests (automated, no manual testing beyond one final look on a real phone):**
- Add a Playwright `phone` project (Pixel 7, 390x844, touch) that runs by default alongside desktop.
- For every route/tab (Games, By day, Q4, Averages, Leaders, player page, team page): assert
  `document.documentElement.scrollWidth <= clientWidth`, and save a full-page screenshot as a test artifact.
- Direct game link at 390px: game header is visible in the first viewport without scrolling.
- Touch swipe over the collapsed games list scrolls the page.
- Tap on the chart shows the lineup for that moment; tap on a tooltip trigger opens it, tap outside closes it.
- Desktop e2e suite still passes unchanged.
