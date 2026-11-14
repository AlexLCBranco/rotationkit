# rotationkit

NBA rotation research tool: when each player is on court, how consistent that is, how it changes when a teammate is
out. Static Vite + React 19 + TypeScript (strict) app on Vercel reading committed JSON; Vitest + Playwright; Node/tsx
scripts fetch and normalize the data. Production: **https://rotationkit.vercel.app** (deploys `main`). Desktop only,
dark theme only. History, incidents and old validation tables: `docs/DECISIONS.md` (not required reading).

## Data
- **Sources**: cdn.nba.com schedule, box score and play-by-play (required); stats.nba.com `gamerotation` (stint
  cross-check) and `boxscoresummaryv3` (roster incl. inactive players) are optional (`--cdn-only` skips them).
- **Stints** are rebuilt from play-by-play (`src/domain/stintsPbp.ts`): period starters = first involvement before any
  "sub in"; subs replayed in log order; every resolution or problem goes to `Game.stintNotes`. Identical to
  gamerotation wherever both exist.
- **+/-** per stint from the play-by-play score; same-second FTs follow the foul they belong to. **PF** = personal +
  offensive fouls (technicals excluded). Points per period (`ptsQ`) and garbage-time points (`ptsGT`) from made shots.
  **Points per stint** (`ptsS`, parallel to `stints`; `Game.stintPts` marks files that have them): same events, each in
  the scorer's stint by log order, else the one ending (then starting) at that clock — FTs after a same-clock sub
  (`stintIndexFor`). Older files lack them until `scripts/backfill-stint-points.ts [--fetch]` (only when stints match).
- **TV / Cup** (`tv`, `cup` on `schedule.json` and `index.json` entries): the feed's national TV abbreviations and
  `isCupGroupGame` / `isCupKnockout`; only for seasons whose feed is cached (none for 2025-26).
- **Inactive / DNP** (`Game.inactive`, `inactiveSource`): box-score list with reasons (2025-26), else the
  `boxscoresummaryv3` roster (2026-27, no reasons), else `null` → the appearance rule (estimate, marked *estimated*):
  with team T from his first to his last appearance for T, and after it until he appears for another team.
- **Files** (`data/`, committed): `seasons.json`; per season `index.json` (one entry per game, with team ids),
  `games/<id>.json` (compact game, `src/domain/types.ts`; ~7 KB), `appearances.json` (player → [game, team] for the
  with/without rule), `quarters.json` (per-period minutes/points for Leaders), `schedule.json` (every scheduled game,
  for upcoming games, rest days and deep links), `validation.json`; `known-issues.json`, `update-status.json`.
  All times are seconds since tip-off (OT included); every stint lies in one period.
- **Generated at build time, never committed** (`scripts/lib/generated.ts`, written to `dist/data/` by the Vite data
  plugin and served by it in dev): `<season>/players.json` = `[id, name, teams]` per box-score player, teams ordered
  by last appearance (most recent last; `src/domain/players.ts`), ~20 KB, for the header search;
  `<season>/teams/<TEAM>.json` = that team's game files in index order (one per team, empty before its first game),
  so `loadTeamGames` (Averages, player page, the Usual overlay) is ONE request per team-season (~1 MB raw, ~0.2 MB
  compressed). Single-game screens keep loading `games/<id>.json`.
- **Counts**: 2025-26 complete (1,230 games); 2026-27 grows daily (174 games through 2026-11-12). A few games fail a
  check because the box score is wrong; they keep their data, are `flagged` in the index and show a "⚠ Data note".

## Pattern engine (`src/domain/patterns.ts`, settings in `src/domain/config.ts`)
- **Blowout rule** (`PATTERN_CONFIG.blowout`, one place): Q4/OT, under 6:00 left in the period, margin ≥ 20. On by
  default; that time leaves both numerator and denominator.
- **Selection order**: season → team → home/away → rest → with/without → last N ("last 10 without X" = the 10 latest
  games X missed). Seasons never mix (season from the game id). The UI always says "based on N games".
- **With/without**: "with" = played; "without" = inactive or DNP while with the team; neither when not with the team.
- **Buckets** of 30 s (`onCourt` share, `onAtMid`), `typicalStints` (stretches on court in ≥ 50% of eligible games;
  regulation only), `teamPatternRows` (rows + "Rarely used" under 1/3 of games), `sitPattern` (median first sub-out
  / entry per quarter, shown when seen in ≥ 3 games). **Rest** (`src/domain/rest.ts`): B2B / rested from `schedule.json`.

## App (`src/App.tsx`, `src/components/`, `src/app/`)
State lives in the URL hash (`src/app/route.ts`), so every view is linkable and the back button works.
- **Header** (every tab): logo, tabs Games | Q4 | Averages | Leaders | Full Q4, team picker (`TeamPicker.tsx`, by
  division, full keyboard support), **player search** (`PlayerSearch.tsx`): "/" or Ctrl+K (not while typing elsewhere);
  case/accent-insensitive, any part of the name, initials ("sga"); up to 8 results (headshot, name, latest team),
  selected season first; ↑/↓, Enter, Esc, mouse; empty = last 5 opened (`rk.recent`); opens his page, filters kept.
- **Name links** (`Links.tsx`: `PlayerLink`, `TeamLink`; `src/app/links.ts`): every player / team name is a real
  `<a href="#/…">` (his page / its Averages; that season, current filters, with/without only for its own team); plain
  until hovered; a click never reaches the row under it. **Every new table, list or chart that prints a name must use
  them.** Not linked: Q4 "Every change" sentences, tooltips, `<select>` options, the deep-link "not available" page.
- **Stale banner** (`StaleBanner.tsx`): when the last update failed or the last success is older than 36 h.
- **Games** (`#/game/<id>?t=ORL&s=2026-27`; `#/` = remembered team's latest game): left, the game list
  (`GameList.tsx`): every finished game of the team, oldest first, date | team | @/vs | opponent | W/L | schedule chips
  (B2B 1/2, 3-in-4, rest days; `scheduleTags.ts`) | ⚠ on flagged games; opponent filter; collapsible (remembered);
  ↑/↓ moves; then the next 3 scheduled games, dimmed: ↑/↓ and ◀ ▶ skip them; a click opens Averages in matchup mode
  (this team `vs=` that opponent, last 10, other filters kept); the opponent's name is still its team link. Right: ◀ ▶, game header (score, game-type badge, TV / CUP tags (also in the list and player rows),
  garbage-time chip, hoopsjunkie / calendarkit icon links, both teams' schedule chips) and the **game chart**
  (`GameChart.tsx`, layout in `src/domain/gameChart.ts`):
  - team order: the selected team (`t=`, else the remembered team, when it played) first, home or away; none →
    away first and no `t=` in the URL. Each team header has a HOME / AWAY tag and the score (Q4 tab: same order/tags);
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
  - below: minutes & fouls by quarter (sortable) and the lineup list per team.
- **Q4** (`#/q4/<id>`, `Q4View.tsx`, `src/domain/q4.ts`): same game, Q4 + OT on one axis, both teams stacked; closers
  first; MIN, fouls entering Q4, Q4 fouls; a thinner margin strip (24 px) over Q4 + OT; rows shrink to fit the
  window (no scroll; border-box rows). Beside it "Every change" (`q4Story.ts`): each lineup change in words, linked to
  its moment (hover moves the chart's line).
- **Averages** (`#/team/ORL?s=&w=&v=&rest=&b=&p=&m=&vs=`, `TeamView.tsx`): filters Last 5 / 10 / Season,
  All / Home / Away, rest, "Hide blowout time", With… / Without… a player; "based on N games" label; a note offers the
  previous season under 5 games. **Typical stints** (`PatternChart.tsx`), **Heat map** or **Game by game**
  (`GameByGame.tsx`, `src/domain/gameByGame.ts`: per player, one thin strip per game of his actual regulation stints in
  the selection's last 5 games, newest on top, date + opponent; a missed game = empty strip with the DNP / inactive
  reason or "Not with the team"; click → that game), same player order and shared "Rarely used" group; "Minutes &
  fouls per game" table with "when does he sit?"; **Closers** table (`src/domain/closers.ts`): over the selection's
  close games (`CLOSE_GAME` in config: margin ≤ 5 at some point in the last 5:00 of Q4 or in OT), per player close
  games played, times on court at the final buzzer (the Q4 tab's closer), share, average Q4+OT minutes; sorted by
  times closed; "based on N close games". Matchup mode `vs=` stacks the opponent.
- **Player page** (`#/player/ORL/<id>?…`, `PlayerView.tsx`): one row per game with actual stints (a "Q4" marker on
  games he played the full 4th; "Full Q4s: X of Y games" over the selection's games he played), minutes trend,
  "when he sits", game log, games missed (DNP rows and the missed list use the same DNP labels). Click a game → that
  game. His name, headshot and team sit on the readout line right above the rows; a player with several teams in the
  season (season-wide `appearances.json`, `teamsOf`) gets a switch between them there.
- **Leaders** (`#/leaders?…`, `LeadersView.tsx`, `src/domain/leaders.ts` on `quarters.json`): Q4 / second-half min and
  pts per game (last 5 / 10 / season, OT optional, garbage time hidden by default); scatter + table; `LEADER_MIN_GAMES`.
- **Full Q4** (`#/fullq4?s=&d=YYYY-MM-DD&th=11&nb=1`, `FullQ4View.tsx`, `src/domain/fullQ4.ts` on `quarters.json`, no
  pipeline output): players on court for the whole regulation 4th (Q4 minutes = 12:00; back-to-back stints count; OT
  never counts). Date (default latest day with games, ◀ ▶ = previous / next day with games), grouped by game with logos,
  each name with his season count; season leaderboard (full Q4s, games played, %). Options: "11:00+" (`th=11`),
  "Exclude blowouts" (`nb=1`: games with 4th-quarter garbage time by the blowout rule leave both counts).
- **Deep link** `https://rotationkit.vercel.app/?game=<NBA gameId>` → that game; unknown / future / not yet added
  → "Rotation data not available for this game yet" with what the schedule knows (`DeepLink.tsx`).

## Testing
- `npm test` — Vitest: normalization and validation on 12 raw fixture games (`tests/fixtures/`, OT, 2OT, blowouts,
  tricky same-second sequences), pattern engine, game chart, Q4, leaders, schedule tags, CI update logic, and
  **whole-season sweeps** over every committed game (suites with `WHOLE_DATA_TIMEOUT`, `tests/data.ts`). Setting
  `RK_TEST_GAMES=id,id` limits the sweeps to those games (used by the daily update).
- `npm run build && npm run e2e` — Playwright against the production build (`vite preview`), **desktop only**
  (1280 × 900, compact at 1920 × 1080; no phone tests): no console errors, all 30 teams × both seasons, filters,
  labels, game chart DOM, readout, compact fit, team order, Q4 fit, Leaders, Full Q4, picker, banner, deep links. Screenshots →
  `screenshots/` (gitignored). `E2E_ALL_GAMES=1` runs the chart label checks on every game.
- **PR checks** (`.github/workflows/pr.yml`): every pull request to `main` runs `npm ci`, `npm test`,
  `npm run build`, `npm run e2e`. A PR is merged only when this workflow is green.

## Daily data update (`.github/workflows/data-update.yml` → `scripts/ci-update.ts`)
- 11:00 UTC daily (and manual "Run workflow"): probe cdn.nba.com → `fetch-season --cdn-only --strict` → `normalize`
  → `validate-all` → `RK_TEST_GAMES=<new ids> npm test` (fixtures, unit tests, and the sweeps over the new games
  only) → commit `data/` to `main` ("data: N new games through YYYY-MM-DD", or a schedule-only update) → redeploy.
- Every run writes `data/update-status.json`. A failing step commits **only** that status file ("data: update FAILED
  at <step>"), never partial game data; `scripts/record-failure.ts` records failures before the script starts.
- A game failing a validate-all check is still committed with its warning; reviewed problems go to
  `data/known-issues.json`. Data is never patched to pass a check.
- Pushes to `claude/**` branches touching the pipeline run the same steps as a dry run (no commit).

## Updating data by hand
`npm install`, then `npm run update-data` (= fetch-season → normalize → validate-all).
Past season: `npm run fetch-season -- --season 2025-26 --cdn-only`, then `npm run normalize`, `npm run validate-all`.
Single game: `npm run fetch-game -- <gameId> [--force] [--cdn-only]`. Raw cache: `cache/` (gitignored); `HTTPS_PROXY` used.

## Deploy
Vercel: `npm ci`, `npm run build` (typecheck + Vite; copies `data/` to `dist/data/` + the generated files), output
`dist/`. `main` → production; branches get preview deployments.

## Open problems
- stats.nba.com is slow/flaky (optional). 2026-27 box scores carry no inactive players or reasons (roster list used,
  no reasons). The appearance rule misjudges some fringe two-way / G-League players.
