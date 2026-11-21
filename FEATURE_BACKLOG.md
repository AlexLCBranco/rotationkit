# Feature backlog — rotationkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are RK-1, RK-2, ... (never reused; RK is this repo's prefix, unique across the owner's repos).

## Ready

Context for RK-9 to RK-14 (2026-11-21): the owner wants rotationkit usable by strangers, not only by him. Everything
here must cost nothing to run (Vercel Hobby, GitHub Actions on this public repo). Each item works on desktop and phone.

### RK-9 — Front door for new visitors
**In short:** A first-time visitor lands on last night's games, can open a "How to read this" page, and links to the site show a name and description instead of a blank card.

1. `index.html`: add a meta description, Open Graph tags (`og:title`, `og:description`, `og:type`, `og:url`,
   `og:image`) and Twitter card tags. One site-wide preview image (1200 × 630 PNG in `public/`, dark, the logo plus
   one line saying what the site is). Per-page previews are RK-14, not this item.
2. First visit: today, with no remembered team, `App.tsx` falls back to `TEAM_CODES[0]`, so a stranger lands on an
   arbitrary team's latest game. Change: when the URL is empty (`#/`) and there is no remembered team (`rk.team`),
   open By day on the latest day with finished games. With a remembered team, nothing changes. Links that name a
   team or game are unaffected.
3. New place in the header menu: "How to read this" (after Leaders). One page, plain words (the 5-year-old rule),
   each with a small real example taken from the app's own components where possible:
   what a bar on the chart is (a stint), the numbers on it, foul ticks and foul-trouble colors, garbage time and its
   exact rule (from `PATTERN_CONFIG.blowout`, read from config, never retyped), "Usual", "Full Q4" and its rule,
   DNP labels ("DNP – CD", "OUT – injury/illness"), schedule chips (B2B, 3-in-4, rest days), USG%, the "⚠ Data note".
   Where the page explains a rule that has a constant in code, the text must be generated from that constant.
4. Every screen that uses one of those terms gets a small "?" link next to it that opens the page at that section.
5. Tab title for the new page follows the dynamic-title rule.

Tests: e2e for the first-visit landing (clean storage → By day; remembered team → that team's game), the new page on
desktop and phone (no sideways scroll + screenshot), each "?" link reaching its section, and a unit test that the
built `index.html` carries the tags and that the preview image exists at the stated size.

### RK-10 — Footer: unofficial-site notice and data source
**In short:** Every page gets a small footer saying the site is unofficial, not affiliated with the NBA, and where the data comes from.

- A footer on every page (desktop and phone), small and quiet: "Unofficial fan site. Not affiliated with or endorsed by
  the NBA. Data, logos and player photos: NBA.com." plus a link to "How to read this" (RK-9; if RK-9 is not built
  yet, leave that link out).
- The footer must not cover content or cause page-level scrolling on screens that are built to fit the window
  (compact game view at 1920 × 1080, Q4 view): on those it can sit below the fold.
- Keep loading logos and headshots from `cdn.nba.com` as today (do not copy them into the repo).

Tests: e2e that the footer text is present on every place in the menu, desktop and phone; the existing "fits
1920 × 1080" tests still pass.

### RK-11 — "Report a problem" link
**In short:** A "Report a problem" link in the footer and on games with a data warning opens a short form already filled with the page's address.

Blocked: needs the owner to create a free Tally form (https://tally.so) and give its link. Fields: "What's wrong?"
(long text, required), "Page" (filled in automatically), "Your email (optional)".

- Decided 2026-11-21: a Tally form, not an email link (keeps the owner's address off a public site).
- The form URL lives in one config constant. While it is empty, no link is rendered anywhere.
- Links: in the footer (RK-10) and next to every "⚠ Data note". Each opens the form in a new tab with the current page
  URL passed along. How Tally accepts a pre-filled value must be read from Tally's own docs, not guessed; if it can't
  be pre-filled on the free plan, open the plain form and say so in the report.

Tests: unit test for the link builder (URL-encoding of the page address, hash included); e2e that the link is absent
with an empty config and present, with the right address, with a test config.

### RK-12 — Games show up the same night
**In short:** New games appear within about an hour of the final buzzer instead of the next morning.

- `.github/workflows/data-update.yml`: keep the 11:00 UTC run; add hourly runs from 01:00 to 08:00 UTC. Same script,
  same concurrency group. Rename the workflow ("Data update") and fix every comment / doc that says "daily".
- Before changing anything, confirm from the code and report: (a) a game is only added once its feed status is final;
  (b) a run with no new data makes no commit (so no needless Vercel deploy; Hobby allows 100 deploys a day);
  (c) what the pipeline already does about refreshing recent box scores.
- The 11:00 run must re-fetch and re-normalize every game added since the previous 11:00 run, so late corrections to
  the box score or play-by-play are picked up. If a re-fetch changes a game, commit it; if it now fails a check, the
  existing flagging rule applies.
- Stale banner: unchanged (36 h).
- Off-season and days without games: the extra runs must end quickly and commit nothing.

Tests: unit tests for "final only", "no new data → no commit" and the 11:00 re-fetch selection (which game ids it
picks), with fixtures. Nothing here needs manual testing; the report should name the first night's run ids so the
owner can see them green.

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

### RK-15 — Remove the hoopsjunkie links
**In short:** The site no longer links to hoopsjunkie anywhere; in the schedule pop-up, a played game opens its rotation page here instead.

Why (owner, 2026-11-21): the links made sense while this was his personal tool; he is not associated with
hoopsjunkie, so a public site should not send people there.

- Score line (`GameLinks.tsx`, Games and Q4): remove the hoopsjunkie icon link. The calendarkit icon link stays
  until the owner says otherwise.
- 3-in-4 chip pop-up (`ScheduleChips.tsx`): each game square links to hoopsjunkie today. Change: a game that is in
  our data links to its rotation page here (same tab, that team first, like every other game link); a game not yet
  played or not in our data is a plain square with no link. Titles and aria-labels reworded to match.
- Remove `hoopsjunkieUrl` and `HOOPSJUNKIE_BASE_URL` (`src/app/gameLinks.ts`) and their tests once nothing uses them.
- PROJECT.md and "How to read this" (RK-9, if built) must not mention hoopsjunkie afterwards.

Tests: update `e2e/links.spec.ts` and `e2e/main.spec.ts`; e2e that no element on Games, Q4, By day or a player page
has an `href` containing "hoopsjunkie"; e2e that a played game's square in the pop-up opens that game here, on desktop
and phone.
