# rotationkit

NBA rotation research tool: when each player is on court, how consistent that is, how it changes when a teammate is
out. Static Vite + React 19 + TypeScript (strict) app on Vercel reading committed JSON; Vitest + Playwright; Node/tsx
scripts fetch and normalize the data. Production: **https://rotationkit.vercel.app** (deploys `main`). Visitors see the site as
**Hoop Rotations** (RK-16, a placeholder: name, description, address and the report form live in `src/app/site.ts` only). Desktop and phone (RK-4), dark theme only. History, incidents and old validation tables: `docs/DECISIONS.md` (not required reading).

## Data
- **Sources**: cdn.nba.com schedule, box score and play-by-play (required); stats.nba.com `gamerotation` (stint
  cross-check) and `boxscoresummaryv3` (roster incl. inactive players) are optional (`--cdn-only` skips them).
- **Stints** rebuilt from play-by-play (`src/domain/stintsPbp.ts`): period starters = first involvement before any "sub
  in"; subs replayed in log order; every resolution or problem goes to `Game.stintNotes`. = gamerotation where both exist.
- **+/-** per stint from the play-by-play score; same-second FTs follow the foul they belong to. **PF** = personal +
  offensive fouls (technicals excluded). Points per period (`ptsQ`) and garbage-time points (`ptsGT`) from made shots.
  **Points per stint** (`ptsS`, parallel to `stints`; `Game.stintPts` marks files that have them): same events, each in
  the scorer's stint by log order, else the one ending (then starting) at that clock — FTs after a same-clock sub
  (`stintIndexFor`). Older files lack them until `scripts/backfill-stint-points.ts [--fetch]` (only when stints match).
- **USG%** (`src/domain/usage.ts`): FGA / FTA / TOV per player and team from the box score (`Game.usg` marks files with
  them; absent = 0); `100 × plays × (team MIN/5) / (MIN × team plays)`, plays = FGA + 0.44·FTA + TOV; several games =
  minutes-weighted; whole games only. Older files: `scripts/backfill-usage.ts --fetch` (GitHub: `backfill-usage.yml`).
- **TV / Cup / tip** (`tv`, `cup` on `schedule.json` and `index.json`; `tip` = `gameDateTimeUTC` on `schedule.json`,
  absent while TBD): only for seasons whose feed is cached (none for 2025-26).
- **Inactive / DNP** (`Game.inactive`, `inactiveSource`): box-score list with reasons (2025-26), else the
  `boxscoresummaryv3` roster (2026-27, no reasons), else `null` → the appearance rule (estimate, marked *estimated*):
  with team T from his first to his last appearance for T, and after it until he appears for another team.
- **Files** (`data/`, committed): `seasons.json`; per season `index.json` (one entry per game, with team ids),
  `games/<id>.json` (compact game, `src/domain/types.ts`; ~7 KB), `appearances.json` (player → [game, team] for the
  with/without rule), `quarters.json` (per-period minutes/points for Leaders), `schedule.json` (every scheduled game,
  for upcoming games, rest days and deep links), `validation.json`; `known-issues.json`, `update-status.json`.
  All times are seconds since tip-off (OT included); every stint lies in one period.
- **Generated at build time, never committed** (`scripts/lib/generated.ts` → `dist/data/`, served by the Vite plugin in
  dev): `<season>/players.json` = `[id, name, teams]` per box-score player, teams by last appearance (latest last), for the
  search; `<season>/teams/<TEAM>.json` = that team's game files in index order, so `loadTeamGames` (Averages, player
  page, Usual) is ONE request per team-season (~0.2 MB compressed). Single-game screens load `games/<id>.json`.
- **Counts**: 2025-26 complete (1,230 games); 2026-27 grows daily (174 games through 2026-11-12). A few games fail a
  check because the box score is wrong; they keep their data, are `flagged` in the index and show a "⚠ Data note".

## Pattern engine (`src/domain/patterns.ts`, settings in `src/domain/config.ts`)
- **Blowout rule** (`PATTERN_CONFIG.blowout`, one place): Q4/OT, under 6:00 left in the period, margin ≥ 20; on by default (that time leaves both counts).
- **Game sets** (RK-13, `src/domain/gameSet.ts`, kind = id prefix): regular season (002) | postseason = play-in (005) + playoffs (004); the Cup final (006) is in neither. Every average (Averages, player page, Leaders,
  Full Q4, Closers, Usual, USG%) counts ONE set: regular by default, `gs=post` via the "Regular season | Postseason" chip (shown when the season has postseason games); labels always name the set. Tags PLAY-IN / PLAYOFFS / CUP FINAL (+ the feed's label). Past seasons: `scripts/backfill-postseason.ts` (GitHub: `backfill-postseason.yml`).
- **Selection order**: season → team → home/away → rest → with/without → last N ("last 10 without X" = the 10 latest
  games X missed). Seasons never mix (season from the game id). The UI always says "based on N games".
- **With/without**: "with" = played; "without" = inactive or DNP while with the team; neither when not with the team.
- **Buckets** of 30 s (`onCourt` share, `onAtMid`), `typicalStints` (stretches on court in ≥ 50% of eligible games;
  regulation only), `teamPatternRows` (rows + "Rarely used" under 1/3 of games), `sitPattern` (median first sub-out
  / entry per quarter, shown when seen in ≥ 3 games). **Rest** (`src/domain/rest.ts`): B2B / rested from `schedule.json`.

## App (`src/App.tsx`, `src/components/`, `src/app/`)
State lives in the URL hash (`src/app/route.ts`), so every view is linkable and the back button works.
- **Layout** (RK-8, backlogkit's NAV_PATTERN.md, footykit FK-65's look): pinned **header** (`Header.tsx`, `app/nav.ts`; 92 px, phone 100):
  logo, ← → (own history, `pageHistory.ts`), breadcrumb (each part lists its siblings), **Go anywhere** (`GoAnywhere.tsx`; button,
  "/", Ctrl+K: places, teams ("bos"), then 8 players, accent-insensitive, initials, empty = last 5 `rk.recent`), places **Games · By
  day · Averages · Leaders · How to read this** (Q4 / Full Q4 = How of Games / Leaders). **Page rows** (`PageRows.tsx`): season chips, team strips, How.
- **Front door** (RK-9 / 10 / 11): an empty URL with no remembered team (`rk.team`, set only when the visitor goes somewhere with a team, never by a URL fix-up) opens By day.
  **How to read this** (`#/help?sec=<part>`, `HelpView.tsx`, `app/help.ts`): ten parts in plain words, rule sentences generated from the settings (`PATTERN_CONFIG.blowout`, `FOUL_TROUBLE`, `USUAL`,
  `FULL_Q4_SECONDS`), a real example from the latest game; a small **"?"** (`HelpLink.tsx`) next to each term on every screen opens its part. **Footer** (`Footer.tsx`, every page; inside the window on Q4):
  unofficial-site notice, data source, How to read this, **Report a problem** (also next to every "⚠ Data note"): the Tally form `REPORT_FORM_URL?page=<this page's address>`, new tab; no form set = no link.
  Tab titles name the page (`app/title.ts`). `index.html` gets title, description, Open Graph / Twitter tags at build time (`scripts/lib/head.ts`); preview image `public/og.png` (`scripts/make-og-image.ts`).
- **Name links** (`Links.tsx`: `PlayerLink`, `TeamLink`; `src/app/links.ts`): every player / team name is a real `<a>`
  (his page / its Averages; that season, current filters, with/without only for its own team); a click never reaches the
  row under it. **Every new name in a table, list or chart must use them.** Not linked: Q4 sentences, tooltips, chips.
- **Stale banner** (`StaleBanner.tsx`): when the last update failed or the last success is older than 36 h.
- **Games** (`#/game/<id>?t=ORL&s=2026-27`; `#/` = remembered team's latest game): left, the game list
  (`GameList.tsx`): every finished game of the team, oldest first, date | team | @/vs | opponent | W/L | schedule chips
  (B2B 1/2, 3-in-4, rest days; `scheduleTags.ts`) | ⚠ on flagged games; opponent filter; collapsible (remembered);
  drag its right border narrower only (500 px down to what date | game | W/L need, ~334 px; `rk.listWidth`; ↔ / dbl-click
  = 500); columns sized from their measured text (system font); badges cut with "…", hidden with rest days when < 30 px. **3-in-4 chip** (list, header, By day) = calendarkit's merged stretch (port of
  7a1c7f7): chained overlapping sets, "4in6 · 2nd"; hover pop-up: one square per day, a game in our data links to its page here (that team first), others are plain;
  ↑/↓ moves; then the next 3 scheduled games, dimmed: ↑/↓ and ◀ ▶ skip them; a click opens Averages in matchup mode
  (this team `vs=` that opponent, last 10, other filters kept); the opponent's name is still its team link. ◀ ▶ in the rows. Right: game header (score, game-type badge, TV / CUP tags (also in the list and player rows),
  garbage-time chip, calendarkit icon link, both teams' schedule chips) and the **game chart**
  (`GameChart.tsx`, layout in `src/domain/gameChart.ts`):
  - team order: the selected team (`t=`, else the remembered team, when it played) first, home or away; none →
    away first and no `t=` in the URL. Each team header has a HOME / AWAY tag and the score (Q4 view: same order/tags);
  - per team: one row per player (starters, divider, bench, then DNP/inactive rows with the reason on the row:
    `src/app/dnp.ts` from the source codes only — `*_COACH` "DNP – CD", injury / concussion "OUT – injury/illness",
    others neutral in words, no code = plain "DNP" / "Inactive"; + the source's detail), headshot, name,
    MIN, stints on a quarter timeline (≥ `CHART.minPxPerMinute`, scrolls inside its box), PF;
  - **Compact (both teams)** toggle (localStorage `rk.compact`): `CHART_COMPACT` rows (no bottom label lane; a label
    with no room is left out), one shared axis, no legend, DNP rows folded into one clickable line per team; both
    teams fit 1920×1080 (e2e on the game with the most players);
  - stints labelled with their duration (inside when ≥ 2:00, else beside / another lane, never overlapping); numbered
    foul ticks (type, clock); per-quarter PF badges; foul-trouble colors (`FOUL_TROUBLE`, toggle); garbage time shaded;
  - hover: both lineups, score, fouls so far, the player's stint with its points ("⚙ Readout" settings, `rk.readout`,
    incl. "Points on the bars": "12:00 · 8p" inside bars long enough, off by default, also on the player page); click
    pins the lineup cursor (panel with both 5-man lineups and "on since");
  - **score margin strip** (`MarginStrip.tsx`, `src/domain/margin.ts`) above the timeline, on the bars' own axis:
    the stored `margin` timeline (time-sorted) as a step area, away lead above the zero line, home lead below,
    final margin in the label column; the lineup cursor crosses it;
  - **"Usual"** (toolbar toggle, on by default, localStorage `rk.usual`; `src/domain/usual.ts`, `USUAL` in config):
    a faint dashed outline behind each player's bars = `typicalStints` over his team's previous 10 games of the season
    (this game excluded, blowout rule on, regulation only); none under 3 games in that window. No pointer events, never
    moves bars/labels/ticks; hovering on an outline adds "usually on court here (7 of 10)";
  - below: minutes & fouls by quarter (sortable, with USG%) and the lineup list per team.
- **By day** (`#/games?view=day&date=YYYY-MM-DD&s=&nb=1`, `DayView.tsx`, `src/domain/slate.ts`; from a game opened
  from By day the By day place returns to that day): `DateBar.tsx` (◀ ▶ / ← → = previous / next day with games, date input, "No games on X; showing Y"; default
  latest day with finished games). Cards in tip-time order (no tip → id order): score, TV / CUP, schedule chips; per team
  the 5 on court at the end of regulation ("Q4" mark = Full Q4 rule) and DNP – CD players only (`*_COACH`); games not in
  `index.json` dimmed with tip time, not clickable. A team's half → its game, that team first, `day=` (game page:
  "← previous game | next game →" keeping the side, "Back to <date>"). Panel: day's regulation Q4 minutes top 10 + ties
  (`quarters.json`); "No blowouts" (`nb=1`, Full Q4's rule) applies to it only.
- **Q4** (`#/q4/<id>`, `Q4View.tsx`, `src/domain/q4.ts`): same game, Q4 + OT on one axis, both teams stacked; closers
  first; MIN, fouls entering Q4, Q4 fouls; a thinner margin strip (24 px) over Q4 + OT; rows shrink to fit the window
  (no scroll; border-box rows). Beside it "Every change" (`q4Story.ts`): each lineup change in words, linked to its moment.
- **Averages** (`#/team/ORL?s=&w=&v=&rest=&b=&p=&m=&vs=`, `TeamView.tsx`): filters Last 5 / 10 / Season,
  All / Home / Away, rest, "Hide blowout time", With… / Without… a player; "based on N games" label; a note offers the
  previous season under 5 games. **Typical stints** (`PatternChart.tsx`), **Heat map** or **Game by game**
  (`GameByGame.tsx`, `src/domain/gameByGame.ts`: per player, one thin strip per game of his actual regulation stints in
  the selection's last 5 games, newest on top, date + opponent; a missed game = empty strip with the DNP / inactive
  reason or "Not with the team"; click → that game), same player order and shared "Rarely used" group; "Minutes &
  fouls per game" table (sortable by MIN / USG% / PF) with "when does he sit?"; **Closers** table (`src/domain/closers.ts`): over the selection's
  close games (`CLOSE_GAME` in config: margin ≤ 5 at some point in the last 5:00 of Q4 or in OT), per player close
  games played, times on court at the final buzzer (the Q4 view's closer), share, average Q4+OT minutes; sorted by
  times closed; "based on N close games". Matchup mode `vs=` stacks the opponent.
- **Player page** (`#/player/ORL/<id>?…`, `PlayerView.tsx`): one row per game with actual stints (a "Q4" marker on
  games he played the full 4th; "Full Q4s: X of Y games" over the selection's games he played), minutes trend,
  "when he sits", game log (USG% per game and on the average row), games missed (DNP rows and the missed list use the same DNP labels). Click a game → that
  game. His name, headshot and team sit on the readout line right above the rows; a player with several teams in the
  season (season-wide `appearances.json`, `teamsOf`) gets a switch between them there. A stint across a quarter / OT break:
  one bar, a notch + a shade per quarter, each part labelled ("6:54 │ 12:00", pts after the last; too narrow → none; none
  fits → total), readout "18:54 — Q2 6:54, Q3 12:00" (`domain/stints.ts`; the game chart readout adds "in a row: …").
  **Roster panel** (`RosterPanel.tsx`, `domain/roster.ts`), left: his latest team of the season (earlier ones as links),
  current roster by min/game, links keep the filters, him highlighted; phone: a "Roster" toggle on top.
- **Phone** (< 768 px, `src/app/phone.ts`): places as icons with labels under, breadcrumb's last 2 parts; the game first, its list folded behind "☰ Games (N)" (in the
  page, no TM column / resize, folds after a pick); wide charts and tables scroll in their own box (name sticky); hover
  texts open on tap, close on a tap outside (`TapTips.tsx`, `useTapOutside`); chart: tap = cursor + readout, drag the handle.
- **Leaders** (`#/leaders?…`, `LeadersView.tsx`, `src/domain/leaders.ts` on `quarters.json`): Q4 / second-half min and pts per game (last 5 / 10 / season, OT optional, garbage time hidden by default); scatter + table; `LEADER_MIN_GAMES`;
  USG% column / "Rank by USG%" (`sort=usg`; whole games, from `quarters.json`'s usage counts, minutes from stints).
- **Full Q4** (`#/fullq4?s=&th=11&nb=1`, `FullQ4View.tsx`, `domain/fullQ4.ts`): whole regulation 4th on court (12:00; back-to-back stints count; OT never): season leaderboard (full Q4s, GP, %); "11:00+" (`th=11`); "Exclude blowouts" (`nb=1`). Per date: By day.
- **Deep link** `/?game=<NBA gameId>` → that game; unknown / future / not added → "Rotation data not available…" + the schedule (`DeepLink.tsx`).
- **Player by name** `/#/player?name=<full name>[&s=&w=…]` (`PlayerByName.tsx`, `domain/playerByName.ts`; for statmuse-builder): exact name, ignoring case, accents, `.'-`, Jr./Sr./II–IV; same name → latest appearance; team = his latest in `s=` / current / last season with data; then history.replace → `#/player/<TEAM>/<id>`, params kept. None → "No rotation data for '<name>'".

## Testing
- `npm test` — Vitest: 12 raw fixture games (`tests/fixtures/`), domain logic, CI logic, and **whole-season sweeps** over
  every committed game (`WHOLE_DATA_TIMEOUT`, `tests/data.ts`; `RK_TEST_GAMES=id,id` limits them, for the data update).
- `npm run build && npm run e2e` — Playwright on the build (`vite preview`): **desktop** (1280 × 900, compact 1920 × 1080)
  and **phone** (Pixel 7 390 × 844 touch, `e2e/phone*.spec.ts`: no sideways scroll + screenshot per route, game first, swipe, taps). `e2e/nav.spec.ts` / `phone-nav.spec.ts`: NAV_PATTERN §6 (header, URL round-trips, < 100 ms clicks, layout shift, no `<select>`). No console errors; By day date 2025-11-10. `E2E_ALL_GAMES=1`: all games. Shots → `screenshots/`.
  `e2e/frontdoor.spec.ts` / `phone-frontdoor.spec.ts`: RK-9…16 (first visit, help, footer, report link, no old name, no outside game links).
- **Checks** (`.github/workflows/pr.yml`, every push to `main`): `npm ci`, `npm test`, `npm run build`, `npm run e2e`. Work goes straight to `main` (no PRs); run the same locally before pushing.

## Data updates (`.github/workflows/data-update.yml` "Data update" → `scripts/ci-update.ts`)
- **Hourly 01:00–08:00 UTC** (RK-12; `--hourly`) and **11:00 UTC** (and manual): probe cdn.nba.com → `fetch-season --cdn-only --strict` (final games only: schedule status + box score
  `gameStatus 3`) → `normalize` → `validate-all` → `RK_TEST_GAMES=<ids> npm test` → commit `data/` to `main` ("data: N new games through YYYY-MM-DD") → redeploy.
  An hourly run with no new game and no schedule change stops after normalize and commits nothing. The 11:00 run always does every step, records itself in
  `data/update-status.json` (stale banner: 36 h) and downloads again (`--refetch`) the games added since the previous 11:00 run (`pending` in that file); a changed game is committed.
- A failing step commits **only** the status file ("data: update FAILED at <step>", `scripts/record-failure.ts`). A game failing a validate-all check is still committed with its warning;
  reviewed problems go to `data/known-issues.json`; data is never patched. `claude/**` pushes touching the pipeline: dry run.
- **By hand**: `npm run update-data` (fetch-season → normalize → validate-all; `-- --season 2025-26 --cdn-only` for a past season); one game: `npm run fetch-game -- <id> [--force] [--cdn-only]`. Cache: `cache/`. **Deploy** (Vercel): per push.
- **Open problems**: stats.nba.com is slow/flaky (optional). 2026-27 box scores have no inactive reasons, so DNP – CD is rare there. The appearance rule misjudges some fringe two-way / G-League players.
