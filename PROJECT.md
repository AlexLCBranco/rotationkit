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
- **Inactive / DNP** (`Game.inactive`, `inactiveSource`): box-score list with reasons (2025-26), else the
  `boxscoresummaryv3` roster (2026-27, no reasons), else `null` → the appearance rule (estimate, marked *estimated*):
  with team T from his first to his last appearance for T, and after it until he appears for another team.
- **Files** (`data/`, committed): `seasons.json`; per season `index.json` (one entry per game, with team ids),
  `games/<id>.json` (compact game, `src/domain/types.ts`; ~7 KB), `appearances.json` (player → [game, team] for the
  with/without rule), `quarters.json` (per-period minutes/points for Leaders), `schedule.json` (every scheduled game,
  for upcoming games, rest days and deep links), `validation.json`; `known-issues.json`, `update-status.json`.
  All times are seconds since tip-off (OT included); every stint lies in one period.
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
  / entry per quarter, shown when seen in ≥ 3 games).
- **Rest** (`src/domain/rest.ts`): back-to-back / rested from `schedule.json`.

## App (`src/App.tsx`, `src/components/`, `src/app/`)
State lives in the URL hash (`src/app/route.ts`), so every view is linkable and the back button works.
- **Header** (every tab): logo, tabs Games | Q4 | Averages | Leaders, team picker (`TeamPicker.tsx`, grouped by
  division, full keyboard support). A stale-data banner (`StaleBanner.tsx`) shows when the last update failed or the
  last success is older than 36 h.
- **Games** (`#/game/<id>?t=ORL&s=2026-27`; `#/` = remembered team's latest game): left, the game list
  (`GameList.tsx`): every finished game of the team, oldest first, date | team | @/vs | opponent | W/L | schedule chips
  (B2B 1/2, 3-in-4, rest days; `scheduleTags.ts`) | ⚠ on flagged games; opponent filter; collapsible (remembered);
  ↑/↓ moves; then the next 3 scheduled games, dimmed, not openable. Right: ◀ ▶, game header (score, game-type badge,
  garbage-time chip, hoopsjunkie / calendarkit icon links, both teams' schedule chips) and the **game chart**
  (`GameChart.tsx`, layout in `src/domain/gameChart.ts`):
  - per team: one row per player (starters, divider, bench, then DNP/inactive rows with reasons), headshot, name,
    MIN, stints on a quarter timeline (≥ `CHART.minPxPerMinute`, scrolls inside its box), PF;
  - every stint labelled with its duration (inside when ≥ 2:00, else beside / in another lane, never overlapping);
    numbered foul ticks with type and clock; per-quarter PF badges; foul-trouble colors (`FOUL_TROUBLE`, toggle);
    garbage time shaded;
  - hover: both lineups at that moment, score, fouls so far and the player's stint ("⚙ Readout" settings, saved in
    localStorage `rk.readout`); click pins the lineup cursor (panel with both 5-man lineups and "on since");
  - below: minutes & fouls by quarter (sortable) and the lineup list per team.
- **Q4** (`#/q4/<id>`, `Q4View.tsx`, `src/domain/q4.ts`): same game, Q4 + OT on one axis, both teams stacked; closers
  first; MIN, fouls entering Q4, Q4 fouls; rows shrink to fit the window (no scroll). Beside it "Every change"
  (`q4Story.ts`): each lineup change in words, linked to its moment (hover moves the chart's line).
- **Averages** (`#/team/ORL?s=&w=&v=&rest=&b=&p=&m=&vs=`, `TeamView.tsx`): filters Last 5 / 10 / Season,
  All / Home / Away, rest, "Hide blowout time", With… / Without… a player; "based on N games" label; a note offers the
  previous season under 5 games. **Typical stints** (`PatternChart.tsx`) or **Heat map** per player, "Rarely used"
  group; "Minutes & fouls per game" table with "when does he sit?"; matchup mode `vs=` stacks the opponent.
- **Player page** (`#/player/ORL/<id>?…`, `PlayerView.tsx`): one row per game with actual stints, minutes trend,
  "when he sits", game log, games missed with reasons. Click a game → that game.
- **Leaders** (`#/leaders?…`, `LeadersView.tsx`, `src/domain/leaders.ts` on `quarters.json`): Q4 or second-half
  minutes and points per game (last 5 / 10 / season, OT optional, garbage time hidden by default); scatter + table;
  minimum games `LEADER_MIN_GAMES`.
- **Deep link** `https://rotationkit.vercel.app/?game=<NBA gameId>` → that game; unknown / future / not yet added
  → "Rotation data not available for this game yet" with what the schedule knows (`DeepLink.tsx`).

## Testing
- `npm test` — Vitest: normalization and validation on 12 raw fixture games (`tests/fixtures/`, OT, 2OT, blowouts,
  tricky same-second sequences), pattern engine, game chart, Q4, leaders, schedule tags, CI update logic, and
  **whole-season sweeps** over every committed game (suites with `WHOLE_DATA_TIMEOUT`, `tests/data.ts`). Setting
  `RK_TEST_GAMES=id,id` limits the sweeps to those games (used by the daily update).
- `npm run build && npm run e2e` — Playwright against the production build (`vite preview`), **desktop only**
  (1280 × 900; phone tests were removed 2026-11-14): no console errors, all 30 teams × both seasons, filters and
  labels, game chart DOM checks, readout, Q4 fit, Leaders, team picker, banner, deep links. Screenshots →
  `screenshots/` (gitignored). `E2E_ALL_GAMES=1` runs the chart label checks on every game.
- **PR checks** (`.github/workflows/pr.yml`): every pull request to `main` runs `npm ci`, `npm test`,
  `npm run build`, `npm run e2e`. A PR is merged only when this workflow is green.

## Daily data update (`.github/workflows/data-update.yml` → `scripts/ci-update.ts`)
- 11:00 UTC daily (and manual "Run workflow"): probe cdn.nba.com → `fetch-season --cdn-only --strict` → `normalize`
  → `validate-all` → `RK_TEST_GAMES=<new ids> npm test` (fixtures, unit tests, and the sweeps over the new games
  only) → commit `data/` to `main` ("data: N new games through YYYY-MM-DD", or a schedule-only update) → Vercel
  redeploys.
- Every run writes `data/update-status.json`. A failing step commits **only** that status file ("data: update FAILED
  at <step>"), never partial game data; `scripts/record-failure.ts` records failures before the script starts.
- A game failing a validate-all check is still committed with its warning; reviewed problems go to
  `data/known-issues.json`. Data is never patched to pass a check.
- Pushes to `claude/**` branches touching the pipeline run the same steps as a dry run (no commit).

## Updating data by hand
```
npm install
npm run update-data      # = fetch-season → normalize → validate-all
```
Past season: `npm run fetch-season -- --season 2025-26 --cdn-only`, then `npm run normalize`, `npm run validate-all`.
Single game: `npm run fetch-game -- <gameId> [--force] [--cdn-only]`. Raw responses are cached in `cache/`
(gitignored). Scripts use `HTTPS_PROXY` when set.

## Deploy
Vercel: `npm ci`, `npm run build` (typecheck + Vite; the build copies `data/` to `dist/data/`), output `dist/`.
`main` → production; branches get preview deployments.

## Open problems
- stats.nba.com is slow/flaky; it is optional.
- 2026-27 box scores carry no inactive players or reasons; the roster list is used (no reasons).
- The appearance rule misjudges some fringe two-way / G-League players.
