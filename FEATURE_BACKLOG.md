# Feature backlog — rotationkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are RK-1, RK-2, ... (never reused; RK is this repo's prefix, unique across the owner's repos).

## Ready

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
