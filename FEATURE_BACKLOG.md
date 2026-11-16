# Feature backlog — rotationkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are RK-1, RK-2, ... (never reused; RK is this repo's prefix, unique across the owner's repos).

## Ready

### RK-1 — Games by day (slate view)
Today a game is only reachable team-first. Add a day-first way in, built for reviewing a whole night's rotations.

**Where:** a `By team | By day` switch inside the Games tab (no new tab). Deep link `#/games?view=day&date=YYYY-MM-DD`
(follow the app's existing route style); the switch and date update the URL.

**Date bar:** reuse the Full Q4 date bar component (prev/next arrows jump to the previous/next day with games, date
input, "No games on X; showing Y" note), plus left/right arrow keys to change day. Default: latest day with finished games.

**Game cards** (sorted by tip time), one per game:
- Both teams (logo + tricode, away @ home), final score, TV / NBA Cup tags, each team's schedule tags (B2B 1/2, 3-in-4).
- Per team: the 5 players on court at the end of regulation (the closers); mark the ones who played the whole
  regulation 4th quarter (same rule as Full Q4).
- Per team: coach's-decision DNPs (same DNP data/labels the game page uses).
- Clicking a team's half of the card opens that game's page with that team selected first.
- Not-yet-played games: greyed out, tip time shown, not clickable.

**Q4 minutes leaders of the day:** a panel on the same screen, beside the cards: top 10 players by regulation
4th-quarter minutes across all of that day's finished games (ties at 10th all shown). Each row: rank, headshot, name
(clickable, as everywhere), team, Q4 minutes (mm:ss), and the game (clickable, opens it with that player's team first).
Include a "No blowouts" toggle reusing Full Q4's toggle and definition; it applies to the panel only.

**Game page, when arrived from By day:** "← previous game | next game →" arrows walking that day's finished games
(tip-time order, keeping the team side you clicked when possible, else home), and a "Back to <date>" link returning
to By day on the same date.

**Full Q4 tab:** remove its by-date section (now covered by By day); keep the season leaderboard and its controls.

**Tests:** e2e on a fixture date: card count and order, closers and full-Q4 marks, DNP shown, click side opens the
right team first, prev/next game and back link, leaders panel order and ties, No blowouts toggle, arrow keys, empty-date
note, upcoming game not clickable, Full Q4 no longer shows the by-date section.

### RK-2 — Resizable games panel, no horizontal scroll
The left games list (Games tab) has a horizontal scrollbar even at its default width: stacked badges push the rest
column off the right edge (e.g. "ope…" cut off). Make it behave like the Claude desktop sidebar.

- **Drag to resize:** the panel's right border is a drag handle (↔ cursor on hover).
- **Default = maximum:** the current default width is the max. The panel can only be dragged narrower (down to a sensible
  minimum), never wider. The game view on the right grows to fill the freed space.
- **Remembered:** the chosen width persists across reloads (localStorage, wrapped in try/catch).
- **Reset:** a small button restores the default (full) width; double-clicking the border does the same.
- The existing `(` collapse button stays as is.
- **No horizontal scrollbar at any width**, including the default. Columns fit the panel: badges shrink/truncate with
  "…" (full text in tooltip), the rest column stays pinned on the right and always visible.

**Tests:** e2e: drag narrows and the game view widens; dragging past default is capped; min width enforced; width
survives reload; reset button and double-click restore default; no horizontal overflow in the list at default, mid and
min widths (assert scrollWidth <= clientWidth); collapse button still works.

### RK-3 — Merged schedule-density badges (match calendarkit)
Replace stacked separate badges (e.g. 3-in-4 · 2nd alongside others) with calendarkit's combined schedule-density
badges (3-in-4, 4-in-6 and similar merged into one), same rules, look and hover pop-up.

- First read calendarkit's implementation (public repo AlexLCBranco/calendarkit; schedule code originally came from
  rotationkit, so the two have drifted). Copy its logic exactly; do not invent new rules.
- If calendarkit's version is clearly the better one, have rotationkit reuse it instead of keeping a second copy that
  drifts again. Pick one source; say which in the PR.
- Applies everywhere rotationkit shows these badges (games list, game header).
- Fewer badges per row also helps RK-2 fit without horizontal scroll.

**Tests:** unit tests on fixture schedules with the same cases calendarkit tests (port them); e2e: games list shows one
merged badge where calendarkit would, hover pop-up matches.
