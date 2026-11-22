# Feature backlog — rotationkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are RK-1, RK-2, ... (never reused; RK is this repo's prefix, unique across the owner's repos).

## Ready

Context for RK-9 to RK-14 (2026-11-21): the owner wants rotationkit usable by strangers, not only by him. Everything
here must cost nothing to run (Vercel Hobby, GitHub Actions on this public repo). Each item works on desktop and phone.

### RK-13 — Play-in, playoffs and the NBA Cup final
**In short:** Play-in, playoff and Cup final games get rotations like any other game, clearly tagged, and never get mixed into regular-season averages.

Why now: `data/2025-26` holds exactly 1,230 games (regular season only), so no postseason game has ever gone through
the pipeline. Backfilling last season's is a free test months before the next playoffs.

1. Pipeline: fetch and normalize game ids starting `004` (playoffs), `005` (play-in) and `006` (Cup final) — types
   already named in `src/shared/nba-schedule/parse.ts`. Backfill 2025-26 (GitHub workflow like `backfill-usage.yml`
   if it can't run in the session). Report how many pass every check and what fails. Never patch data to pass.
2. Games list, By day, game header, player page rows: a tag on these games ("PLAY-IN", "PLAYOFFS" with round and
   game number if the feed gives them — read the feed, don't invent — and "CUP FINAL").
3. Averages, Leaders, Usual, Closers, Full Q4 counts, "When does he sit?", USG%: regular season only by default,
   exactly as today. A new chip next to the season chips, "Regular season | Postseason", switches all of them to
   play-in + playoffs of that season. The chip only shows for seasons that have postseason games. The Cup final is in
   neither set (it does not count in NBA season stats); it is only viewable as a single game.
4. Schedule chips (B2B, 3-in-4, rest days): decide from the code whether postseason games should count and say what
   you did; if unsure, mark the item `Blocked:` with the question rather than guessing.
5. "Based on N games" must always say which set it is.

Tests: validation over all backfilled games; unit tests that the default selection for 2025-26 is unchanged (same N
as before this item for a few teams) and that the postseason set contains only `004`/`005` ids; e2e for the tag and
the chip on desktop and phone.

### RK-14 — Links that preview: one real page per game, player and team
**In short:** A link to a game, player or team shows that game's teams and score (or the player's or team's name) when pasted into WhatsApp, X or Reddit, and Google can find each page.

Problem: all state is in the URL hash, which never reaches the server, so every shared link has the same preview and
search engines see one page. Build RK-9 first (site-wide tags).

Outcome required (the mechanism is yours, within the limits below):
- The address the user sees and copies for a game, a player and a team's Averages is a path, not a hash
  (for example `/game/<gameId>`), and that exact address returns HTML whose `<title>`, description and Open Graph /
  Twitter tags are specific to it, without running JavaScript:
  game → "LAL 112, BOS 108 · Nov 20, 2026 · rotations" style (real teams, score, date); player → his name and team;
  team → its name and season. Preview image: the site-wide one from RK-9 (per-game images are a later item).
- Generated at build time as static files, next to the team bundles (`scripts/lib/generated.ts`). No server
  functions, no paid features. Do not add one `vercel.json` entry per page (Vercel caps routes at 1,024 per
  deployment); real files or a single pattern only.
- Every old link keeps working: `#/...` routes and `/?game=<id>` open the same view and the address becomes the new one.
- Filters and options (team first, season, with/without, etc.) stay in the URL and survive reload, back and forward.
- A `sitemap.xml` listing every generated page, and `robots.txt` pointing to it.
- By day, Leaders and other places may stay as they are unless moving them is free.

Before building, report the plan and the size of the router change. If it means rewriting more than `src/app/route.ts`,
`pageHistory.ts` and the link helpers, stop and mark the item `Blocked:` with the options.

Tests: unit tests on the generator (one page per game / player / team in the data, correct title and tags for a few
known games); e2e that loading a path address directly shows the right view, that old hash and `?game=` links land on
it, that back / forward work, on desktop and phone; a build-size check so the generated pages stay small (report the
total).
