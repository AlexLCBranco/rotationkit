# rotationkit

NBA rotation pattern research tool (v1): when each player is typically on court, how consistent that is,
and how it changes when a teammate is out. Static Vite + React app on Vercel reading committed JSON.
Pre-game research / post-game review, not a live tracker.

## Stack
Vite + React 19 + TypeScript (strict), Vitest. Node/TypeScript scripts (tsx) for fetching/processing.

## Data source in use: Path B (CDN play-by-play), gamerotation as cross-check
| Data | Endpoint | Required |
|---|---|---|
| Schedule (current season) | `cdn.nba.com/static/json/staticData/scheduleLeagueV2.json` | yes |
| Game list (past season) | `stats.nba.com/stats/leaguegamelog?…&Season=2025-26…` (one request) | yes, for backfill |
| Players, stats, starters, played flag, inactive + reasons | `cdn.nba.com/…/liveData/boxscore/boxscore_<id>.json` | yes |
| Stints, fouls (exact time), score timeline | `cdn.nba.com/…/liveData/playbyplay/playbyplay_<id>.json` | yes |
| Stint cross-check | `stats.nba.com/stats/gamerotation?GameID=…&LeagueID=00` | no |
| Per-game roster incl. inactive players | `stats.nba.com/stats/boxscoresummaryv3?GameID=…&LeagueID=00` | no |

Why: stats.nba.com became unreliable (timeouts/500s, ~1 min per game with retries) while the CDN is fast
and stable. Optional stats.nba.com sources never block a game; `--cdn-only` skips them entirely.

### Path B stint reconstruction (`src/domain/stintsPbp.ts`)
- Period 1 starters from the box score. Later periods: a player is a starter if his first involvement in the
  period (any action incl. assists/fouls drawn via `personIdsFilter`, or a "sub out") comes before any "sub in".
  Technical fouls, ejections and delay-of-game are ignored as evidence (bench players can get them).
- A player on court for a whole period with no event at all: if a period has < 5 starters, the missing ones
  are taken from players with no event in that period whose box-score minutes still need a full period —
  only if that is unambiguous; otherwise the period is left short and reported (5-on-court check fails).
- Substitutions are replayed in log order; everyone on court is closed at period end.
- Every resolution or problem is written to `Game.stintNotes` and printed by validate-all.
- Each stint carries the substitution events that opened/closed it, so +/- and fouls are cut by event order
  (a player can be subbed several times at the same clock). Zero-length stints mid-period are kept (they can
  carry +/- from free throws); empty ones at period start (between-periods subs) are dropped.
- Result: identical to gamerotation (to 0.1s) on all 24 games where both exist (14 × 2026-27, 10 × 2025-26),
  including 2 of the 3 box-score mismatches below.

Path A (stints from gamerotation) is no longer used; the gamerotation parser remains for the cross-check.

### Inactive players / not-playing reasons
Order of preference per game (`Game.inactive`, `Game.inactiveSource`):
1. **Box score** (`inactiveSource: 'box'`): 2025-26 CDN box scores list inactive players with `status: INACTIVE`
   and reasons (`INACTIVE_INJURY` + "Right Hamstring; Strain", `INACTIVE_GLEAGUE_TWOWAY`, `INACTIVE_REST`, …);
   active DNPs may carry `DND_INJURY` / `DNP_COACH`. **2026-27 box scores so far list only active players
   and no reasons.** `fetch-season` re-fetches box scores from the last 7 days that lack inactive players,
   in case the CDN fills them in later (as of 2026-10-23 it has not).
2. **Roster list** (`'roster'`): `boxscoresummaryv3` `players` = full per-game roster incl. inactive players
   for 2026-27 games (no reasons; its `inactives` array is always empty). For 2025-26 games it holds only active
   players, so the box score is used there.
3. **Appearance rule** (`inactive: null`): estimate, see below. Shown as *estimated* in the UI.

### "Did not play" rule (with/without filter)
A player only counts as "did not play" for team T in a game if he was with T at that time.
With an official list (1 or 2 above): listed inactive or in the box score as DNP. Otherwise the appearance rule:
- with T from his first appearance for T to his last appearance for T (appearance = in T's active box score);
- after his last appearance he still counts as with T unless he has appeared for another team since;
- games before his first appearance for T don't count.

Rule vs official list, DEN 2025-26 (82 games, box-score lists): 511/594 player-games agree (332 "out",
179 "not with team"). Disagreements are fringe players only: two-way/G-League players listed inactive before
their first appearance (rule: not yet with team; 33) and players who left without appearing elsewhere
(rule: still with team; 50, Hunter Tyson and Tamar Bates).

## Normalized data (`data/`)
- `data/seasons.json`: seasons available and game counts.
- `data/<season>/index.json`: one entry per game (id, date, home/away tricode, score, periods).
- `data/<season>/validation.json`: latest validate-all result for the season.
- `data/<season>/games/<id>.json`: compact game (see `src/domain/types.ts`): teams, players (box stats, starter,
  played, reason if any), stints as `[start, end, +/-, foulTimes?]`, score margin timeline, inactive list.
- All times = seconds elapsed since tip-off (OT included); formatting happens only in the UI.
- Every stint lies inside one period.
- Size: ~7 KB per game minified (~2.2 KB gzipped) → full season ≈ 9 MB in git, a team's 82 games ≈ 0.6 MB (≈0.2 MB gzipped).

### +/- attribution (verified against box score and gamerotation PT_DIFF)
Stint +/- is computed from the play-by-play running score. Same-second events around a substitution follow
NBA's rule: free throws count for the players on court when the foul was committed — each FT belongs to the
latest same-second foul of its kind (technical FT ↔ technical foul, other FTs ↔ other fouls); if that foul
was logged before the sub, the FT goes to the outgoing player. Other events follow log order. Result: matches every
gamerotation PT_DIFF in the fixtures except one where PT_DIFF itself disagrees with the box score
(0022600002, Brunson, last 7.7s) — ours agrees with the box score.

PF = play-by-play fouls with subType `personal` or `offensive` (flagrants included as they are `personal`;
technicals excluded).

## Validation
`npm test` runs Vitest on committed fixtures (`tests/fixtures/*.raw.json.gz`, raw responses gzipped):
12 games incl. OT (0022501147, 0022500458 — a full OT with no event for two players) and 2OT (0022500811),
blowouts (0022600088, 0022600092), and tricky same-second sub/FT sequences (0022600085, 0022600090,
0022500020 zero-length stint, 0022500184 technical + and-one FTs, 0022500643 double sub at one clock). Checks per game: minutes ±1s,
5 on court per team at all times, fouls = PF, stint +/- = box +/-, no overlaps, stints inside periods,
DNP players have no stints, stints = gamerotation, stint +/- = PT_DIFF; plus box-score self-consistency
(team minutes = 5 × game length, team +/- = 5 × margin) to tell box-score errors apart. Negative tests prove each check catches broken data.
`npm run validate-all` runs the same checks over every fetched game and the roster-list comparison.

## Validation results (2026-10-23)
| Season | Games | Pass all checks | gamerotation cross-check |
|---|---|---|---|
| 2025-26 | 1230 | 1226 | 10/10 identical |
| 2026-27 | 14 | 14 | 14/14 identical |

The 4 failing 2025-26 games (kept as-is, reported every run):
- 0022500093 — box score wrong: HOU minutes total 13880s instead of 14400s; Kevin Durant's Q4 stint
  (8:40, 12 points in play-by-play) is missing from his box minutes. gamerotation agrees with Path B.
- 0022500374 — box +/- off by 1 for 2 TOR players; gamerotation PT_DIFF agrees with Path B.
- 0022500722, 0022500753 — +/- off by 1–2 for a few players in same-second FT/sub sequences where NBA's
  attribution contradicts the rule it follows elsewhere (e.g. FTs between two sub batches go to the final
  lineup). Not reproducible by a consistent rule; stints and minutes are unaffected.

Size: 2025-26 + 2026-27 = 1244 games, ~9.2 MB of JSON in git (7.4 KB/game; ~2.3 MB gzipped total).
One team-season in the browser ≈ 0.6 MB raw / ~0.15 MB gzipped. Raw cache ≈ 0.43 MB/game (526 MB, gitignored).

## Pattern engine (`src/domain/patterns.ts`, settings in `src/domain/config.ts`)
- **Blowout rule (one place: `PATTERN_CONFIG.blowout`)**: time is excluded when the period is Q4 or OT,
  less than **6:00 (360 s)** is left in the period, and the score margin is **≥ 20**. Default ON in the UI.
  Excluded time is removed from both the player's on-court time and the eligible time (numerator and
  denominator), and from average minutes.
- **Buckets**: 30 s over regulation (96 buckets, `PATTERN_CONFIG.bucketSeconds`). Per player and bucket:
  `onCourt` = share of eligible time on court over games he played; `onAtMid / eligibleAtMid` = "on court at
  Q2 6:00 in 7 of 10 games" (sampled at the bucket midpoint).
- **Game selection order**: season → team → home/away → with/without → last N. So "last 10 without X" means
  the 10 latest games X missed. Each step's count is exposed (`selection.games.length`, `candidates`).
- **Seasons never mix**: the season comes from the game ID (`002YY…`); a 2026-27 "last 10" is however many
  2026-27 games exist (UI shows "based on N games").
- **With/without**: "with" = he played; "without" = listed inactive or DNP in the box score while with the
  team; games when he was not with the team are in neither group (`notWithTeam`). `withoutEstimated` is true
  when any "without" game relied on the appearance rule rather than an official list.
- **Flagged games**: games failing a check keep their data and count in patterns; `Game.quality` holds
  per-player notes (check, detail, verdict `box-score` | `unresolved`, reason) and `index.json` marks them
  `flagged`.

Real-data tests (2025-26): Franz Wagner ORL 34 with / 48 without (official injury list, not estimated);
Christian Braun DEN 44 / 38 (35 inactive + 3 box DNPs); James Harden LAC→CLE (44 + 26 with; post-trade LAC
and pre-trade CLE games in neither group); 5-on-court invariant across buckets for 4 teams, blowout ON and OFF.

## UI (`src/App.tsx`, `src/components/`, `src/app/`)
- **Team pattern view** (main): team picker, season (defaults to the current season), Last 5 / Last 10 /
  Season, All / Home / Away, "Hide blowout time" (default on), With… / Without… + player. One row per player
  sorted by average minutes, drawn in the game chart's design (`PatternChart.tsx`): headshot + name | avg MIN |
  quarter timeline | games played / games in selection. Default view **Typical stints**: green bars for the
  stretches he is on court in at least half of his eligible games (`typicalStints` in `patterns.ts`: exact sweep,
  split at quarter lines, garbage time excluded, regulation only), duration inside the bar (same label rules as
  the game chart). Bright green = 75%+ of games, darker = 50–75%. With one game it is exactly that game's
  stints. A row with no such stretch says so. Hover/tap → "Q2 6:00 · on court in 7 of 10 games" plus the
  stretch's share. **Heat map** toggle keeps the older 30-second green-ramp strips (striped = only garbage time).
- **Labels**: plain words, e.g. "Last 10 games without F. Wagner · based on 10 games" (= the 10 most recent
  games he missed). Short name = family name; first initial added when two team-mates share it. With/without
  shows both group sizes and marks the "without" count *estimated* when any game lacked an official list.
- **Few games**: under 5 games, a note offers the same view (same team, player, with/without) for the
  previous season. Team and player are never reset.
- **Player view**: one row per game (date + opponent), actual stints on the game timeline (OT included),
  ⚠ on flagged games, collapsed list of games he missed with reasons. Click a row → game.
- **Game chart** — laid out like fantasyteamadvice.com/nba/rotations (neutral dark theme): page header with logos,
  matchup, final score, game-type badge (Blowout ≥15 / Comfortable 10–14 / Competitive <10, final margin) +
  "Garbage time m:ss" when the blowout rule excluded time. Per team: logo + name, "Foul Trouble" legend, header row
  PLAYER | MIN | Q1–Q4 (+OT) | PF, then one compact row per player: headshot (cdn.nba.com, falls back to initials) |
  name (blue) | MIN (bold) | stints on a dark track, **one bar per quarter** like the reference | PF. Starters by
  minutes, dashed divider, bench by minutes, DNP/inactive rows with a DNP badge (reason on hover/tap).
  Hover (desktop) / tap (phone) shows a floating tooltip next to the pointer. Minutes and durations are truncated
  to the second like NBA box scores (22:07.8 → 22:07).
  - Every stint shows its duration: inside the bar when ≥ 2:00 (12 px, dark on color), otherwise beside the bar,
    in the lane above, or (rarely) a lane below — never dropped, never overlapping (`layoutRow` in
    `src/domain/gameChart.ts`). Bar width stays proportional to time; the timeline never goes below 18 px/min
    (`CHART.minPxPerMinute`), so on phones it scrolls sideways inside its own box with name + MIN frozen left and PF
    frozen right. The page itself never scrolls sideways.
  - Fouls: numbered ticks (cumulative count) at the exact time; hover/tap → "Player — foul #3 — offensive foul
    (turnover) — Q2 10:04" (type from play-by-play only). Per-quarter PF badge at the end of each quarter with fouls.
  - Foul-trouble coloring (toggle, default on): thresholds per quarter in `FOUL_TROUBLE` (`src/domain/config.ts`):
    Q1 2 caution / 3 trouble, Q2 3 / 4, Q3 4 / 5, Q4 & OT 4 / 5. Trouble is striped (not color alone).
  - Clock: quarter names, light ticks and labels at 12:00/9:00/6:00/3:00 (OT 5:00/2:30).
  - Lineup cursor: hover shows the line + clock + score in the tooltip; click (tap on phone) pins it and opens a
    panel above the chart: the 5 on court per team with fouls at that moment and "on since". Drag its handle on
    phone. Lineup list per team (collapsible): start/end/
    duration/5 players/+/-; clicking a row moves the cursor there. Lineup +/- uses the score after all events at
    the boundary clock (points logged at Q1 12:00 count for the starters).
  - Minutes & fouls by quarter table per team (sortable): starter, MIN, per quarter MIN / PF / cumulative, PF total
    (= box score).
  - `#/game/latest?t=PHI` (or "Latest game →" on the team view) opens the team's most recent game.
- **Team view extras**: "Minutes & fouls per game" table (avg MIN, avg MIN per quarter, avg PF per quarter, avg PF,
  GP; follows all filters — "hide blowout time" removes garbage-time **minutes only**; fouls always count, in
  every PF total, per-quarter PF and average).
  Matchup mode: pick an opponent (`vs=`) to stack both teams' pattern views with the same filters (with/without
  applies to the first team only).
- **"When does he sit?"** (`sitPattern` in `src/domain/patterns.ts`): per regulation quarter, his first sub-out
  before the quarter ends and first entry after it starts, as the **median** game clock (rounded to 10 s) over the
  selection's games where it happened, with that count: "Q1 out ~4:40 (9) · Q2 in ~9:00 (8)". Shown only for
  events seen in **≥ 3 games** of the selection; subs in garbage time are ignored when "hide blowout time" is on.
  In the team view's "Minutes & fouls per game" table and under the player view header.
- **Minutes trend** (player view): minutes per game over the selection (games he was with the team), dashed
  average over games played, × for DNP/inactive games (reason on hover/tap), hollow markers for games with garbage
  time.
- **Rest filter** (`src/domain/rest.ts`, team/player views): Any rest / Back-to-back (second night) / Rested
  (1 or 2+ days off), applied after home/away and before with/without in the filter chain, with "based on N
  games". Rest = days since the team's previous game in `data/<season>/schedule.json`; the season opener counts as
  rested; preseason games are ignored; the NBA Cup final (006 ID) counts as a game played. Known gap: the 2025-26
  schedule file only has the regular-season games we fetched, so the day after the 2025-26 Cup final is not
  recognised as a back-to-back for the two finalists (2026-27 uses the full feed, which includes it).
- **Player view extras**: game-type badge on each game row; game log table (date, opponent, H/A, badge, starter,
  MIN, MIN and PF per quarter, PF) with an average row on top.
- **State** lives in the URL hash (`#/team/ORL?s=2025-26&w=10&p=1630532&m=without`), so views are linkable.
- Dark theme only (no light theme by design). Works at 390 px phone width (no sideways scroll).

## Deep link by game ID
Contract: **`<BASE_URL>/?game=<gameId>`** — `gameId` is the NBA game ID from the schedule feed (e.g. `0022600123`).
`<BASE_URL>` is the production URL, to be filled in after the first merge to main.
- Game in rotationkit's data → opens that game's chart (the URL becomes `<BASE_URL>/#/game/<gameId>`).
- Unknown ID, not played yet, in progress, or data not added yet → page saying
  "Rotation data not available for this game yet", with matchup, date and status when the schedule knows the
  game. Never a blank page.
- Uses `data/<season>/schedule.json` (written by `normalize`: every game of the cached feed's season, incl.
  unplayed ones; for past seasons the played games).

## Shared module: `src/shared/nba-schedule/`
Self-contained schedule-feed reader, also used by the NBA calendar project (copied as-is; see its README).
- `parse.ts` — **browser-safe**: no imports, no Node APIs. Raw feed JSON → full game objects (all raw fields
  kept + derived status/type/UTC start/TBD/Cup flags).
- `node.ts` — **Node only, optional**: fetch with browser-like headers, timeout, retries, `HTTPS_PROXY` support.
- Tests next to it (`*.test.ts`, `fixture.json`), runnable on their own; one runs the parser in a JS realm
  without Node globals. rotationkit's `fetch-season` imports from here.

## Testing
- `npm test` — Vitest: normalization, validation, pattern engine, game chart (incl. invariants over every game of
  both seasons and a play-by-play foul-number check), nba-schedule module (266 tests).
- `npm run build && npm run e2e` — Playwright against the production build served by `vite preview`, desktop
  1280px and phone 390px: no console errors, all 30 teams × both seasons render with the right "based on N",
  filters/labels, low-sample switch, player + game click-through, flagged warning, no sideways scroll,
  `?game=` deep links (valid, future, unknown, garbage), game chart DOM checks (labels inside/beside, proportional
  bars, tick count = PF, no overlaps) on a sample of games; `E2E_ALL_GAMES=1 npx playwright test e2e/gamechart.spec.ts
  -g "labels"` runs them on every game (≈2.5 min per viewport).
  Screenshots go to `screenshots/` (gitignored).

## Deploy (Vercel)
`vercel.json`: install `npm ci`, build `npm run build` (typecheck + Vite), output `dist/`. The build copies
`data/` to `dist/data/`; the app only reads those JSON files (never NBA.com). Vercel deploys `main` to
production; feature branches get preview deployments. Vercel connected to the repo on 2026-10-23.

## Automatic daily data updates (GitHub Actions)
Workflow: `.github/workflows/data-update.yml` → `scripts/ci-update.ts`.
- **Schedule**: every day at **11:00 UTC** (after all US games have finished). Takes effect once the workflow is on
  `main` (scheduled workflows only run from the default branch).
- **What it does**: `fetch-season --cdn-only --strict` (Path B, cdn.nba.com only) → `normalize` → `validate-all` →
  `npm test`. If every step passes and there are new games, it commits `data/` to `main` as
  "data: N new games through YYYY-MM-DD" and pushes; Vercel then redeploys production. No new games → no commit.
- **Incremental without a cache**: the runner has no raw cache; already-committed games are read from
  `data/<season>/index.json` and skipped. `normalize` only (re)writes games whose raw data is present and rebuilds
  the index/appearances from all committed game files. `validation.json` is not committed by CI (it holds the
  gamerotation cross-check from full local runs).
- **Failure = nothing committed.** Any step failing (CDN unreachable or blocked, a game that fails to download,
  normalize error, a validation problem not listed in `data/known-issues.json`, a failing test) fails the run; GitHub
  emails the repository owner. To investigate: Actions tab → "Daily data update" → the failed run's log; the line
  `Data update FAILED at "<step>"` names the step. A new, reviewed data problem can be accepted by adding the game
  to `data/known-issues.json` (with the reason) in a normal commit.
- **Manual run**: GitHub → Actions → "Daily data update" → "Run workflow" (branch `main`). Locally, a dry run:
  `npx tsx scripts/ci-update.ts` (add `--commit` to commit and push).
- **Commit author**: `github-actions[bot]` by default; set repository variables `DATA_COMMIT_NAME` /
  `DATA_COMMIT_EMAIL` to commit as someone else (e.g. if Vercel's Hobby plan refuses bot-authored commits).
- Pushes to `claude/**` branches that touch the pipeline run the same steps as a dry run (never commit), which
  also checks that cdn.nba.com answers GitHub's runners.

## How to update data
```
npm install
npm run update-data      # = fetch-season → normalize → validate-all
git add data && git commit -m "Update data" && git push
```
- `update-data` covers the current season. `fetch-season` is incremental; failed games are listed and logged
  to `cache/fetch-errors.json` (re-run to retry). Add `-- --cdn-only` if stats.nba.com is misbehaving.
- `validate-all` must report 0 NEW failing games before committing (known ones are listed in
  `data/known-issues.json`); if not, look at the reported check/player. Data is never patched to pass a check.
- Past season (one-off): `npm run fetch-season -- --season 2025-26 --cdn-only`, then `npm run normalize` and
  `npm run validate-all` (both default to every cached season; `-- --season X` for one).
- Missing stats.nba.com cross-check data can be retried later: `npm run fetch-season -- --retry-optional`.
Single game: `npm run fetch-game -- <gameId> [--force] [--cdn-only]`.
Raw responses live in `cache/` (gitignored, ~0.5 MB per game). Requests are sequential with a 250 ms gap
(CDN) / 600 ms gap (stats.nba.com).
Scripts route through `HTTPS_PROXY` automatically when it is set (cloud session); on a normal PC they connect directly.

## Status
- Step 0 (connectivity probe): done — all endpoints OK.
- Step 1 (fetch): done — 14/14 finished games fetched (as of 2026-10-23).
- Step 2 (normalize): done.
- Step 3 (validation): done.
- Path B (stints from play-by-play) is the primary source; 2025-26 backfilled via CDN (1230/1230 fetched).
- Step 4 (pattern engine): done; with/without included. 186 tests.
- Step 5 (UI): built; e2e passing locally. Awaiting review of the Vercel preview.

## Open problems
- stats.nba.com is slow/flaky (timeouts, 500s). It is optional now; `--cdn-only` skips it.
- 2026-27 box scores carry no inactive players/reasons (yet); roster list used instead (no reasons).
- Appearance rule misjudges fringe two-way/G-League players (see above); fine for rotation players.
