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

### RK-5 — Per-quarter minutes inside stints that cross a quarter break
Stints that continue across a quarter break (e.g. end of Q2 into Q3) are merged into one bar (`mergeContinuousPts`)
with one total label ("18:54"). The owner can't tell how much of that was in each quarter.

Wanted (game chart, and anywhere else merged stint bars show labels):
- Keep one continuous bar (it is one stint), but split it visually at each quarter break: a thin dark notch/gap
  through the bar at the break, and each quarter's segment in a slightly different shade of the bar color
  (alternating), so the pieces read as one stint in parts.
- Split the label: each segment shows its own minutes, e.g. `6:54 │ 12:00` instead of `18:54`. Points (`· 17p`) stay
  once, after the last segment. Works for stints crossing 2+ breaks (`2:10 │ 12:00 │ 3:05`).
- If a segment is too narrow for its label, that segment shows no label (the notch still shows); if no segment fits,
  fall back to the total as today.
- Hover/tap tooltip shows the total plus the per-quarter split (`18:54 — Q2 6:54, Q3 12:00`).
- Overtime breaks count as quarter breaks.

**Tests (automated):** unit test for the split (stint crossing 1 and 2 breaks, segment widths/labels, narrow-segment
fallback); e2e on a fixture game with a Q2→Q3 stint: bar has the notch, labels show the split, tooltip shows total +
split.

### RK-6 — Team roster on the player page
On a player page (e.g. Luka Dončić · LAL), the owner wants to jump to teammates and the team without going back.

Wanted:
- A roster panel for the selected player's team, placed on the left side of the player page (exact design open; owner
  hasn't decided — pick something compact that doesn't push the chart down or narrow it much at 1280px).
- Team name at the top of the panel, clickable → that team's rotations page (same target as other clickable team names).
- Every roster player clickable → their player page, keeping the current filters (season, Last 5/10/Season,
  Home/Away, rest, blowout toggle, game type) where they apply.
- Current player highlighted in the list.
- Uses the season selected on the page (traded players: show the team for that season; if the player had 2+ teams
  that season, show the latest team, with the others as links).
- Phone (< 768px, see RK-4): panel collapses into a "Roster" toggle above the chart, no horizontal scroll.

**Tests (automated):** e2e on a fixture player: roster panel lists the team's players, current player highlighted;
clicking a teammate opens their page with filters kept; clicking the team name opens the team page; phone project:
toggle opens/closes the roster and no page-level horizontal scroll.
