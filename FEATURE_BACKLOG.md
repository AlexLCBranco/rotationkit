# Feature backlog — rotationkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are RK-1, RK-2, ... (never reused; RK is this repo's prefix, unique across the owner's repos).

## Ready

### RK-8 — Shared layout: pinned header menu, chips instead of dropdowns
**In short:** rotationkit gets the shared layout every app now uses: a header always at the top (back/forward, breadcrumb, main places, "Go anywhere" search), and under it "What" chips and a "How" switch, so nothing is hidden in dropdowns.
**What:**
- Follow [NAV_PATTERN.md](https://github.com/AlexLCBranco/backlogkit/blob/main/NAV_PATTERN.md) exactly (read it first; it is the spec). Same look as footykit FK-65 so the apps read as one site; if FK-65 has shipped, copy its header styles rather than re-designing.
- Used on the phone: the 390 px rules in section 4 are a must. Pick the Where tabs from the app's real pages (at most 5); games/teams/dates become What chips or strips; flag in the report how you mapped them.
- Replace every `<select>` used to pick what's shown with chips/strips. Every state in the URL; old URLs keep working.
**Tests:** as in NAV_PATTERN.md section 6.

