# Built — rotationkit

Shipped work only, newest first. Planned work is in `FEATURE_BACKLOG.md`, never here.
Entries dated before 2026-11-16 were backfilled from the git commit messages (data, docs, test-only, merge and
spec commits left out). New entries name their backlog ID (see CLAUDE.md, "Feature backlog, built list and ideas").

## 2026-11-16
- By day moved to the main menu (v0.1.1)
  By day is now its own tab in the header, next to Games; the By team | By day switch is gone.
- RK-1 — Games by day (slate view) (v0.1.0)
  Games tab has a By team | By day switch: one card per game of a day with each team's closers, full-Q4 marks and coach's-decision DNPs, the day's Q4 minutes leaders beside them, and previous / next game on the game page; Full Q4 keeps only its season leaderboard.

### Internal
- Schedule data: tip-off times (`tip`) added to schedule.json from the feed
- Player search e2e: compare names accent-insensitively (the Nov 14 box score spells Jokić without the accent)
- Workflow: commit straight to main, no pull requests; Checks run after every push to main; local e2e uses the session's Chromium

## 2026-11-15
- Open a player's page by name: #/player?name=<full name>

## 2026-11-14
- DNP labels by reason; player name on the readout line
- Game page: compact view for both teams, selected team first, HOME/AWAY tags
- TV / NBA Cup tags and points per stint
- Full Q4 tab: who played the whole regulation 4th quarter
- One request per team-season: team bundles generated at build time
- Across games: clickable upcoming games, Closers table, Game-by-game view
- Game chart: score margin strip (Games + Q4) and the 'Usual' overlay
- Player search in the header and clickable player/team names everywhere
- PR checks: run on ubuntu-24.04 (Playwright 1.56 has no browser build for 26.04)
- Housekeeping: desktop-only tests, PR checks workflow, daily update tests new games only, trimmed PROJECT.md

## 2026-11-07
- Fix daily update failing at npm test: cursorInfo rebuilt all lineup segments per call

## 2026-11-05
- Small fixes: data warning on the Q4 tab; Averages "vs" uses the team picker
- Fix: Averages tooltips appeared far from the pointer
- Game list: the next 3 scheduled games under the played ones (dimmed, with schedule tags, not openable)
- Leaders: "Hide garbage time" (on by default), with the rule spelled out
- Logo: stint-bars favicon, touch icon and header logo
- Leaders tab: most 4th-quarter / second-half minutes and points per game (last 5, last 10, season)
- Data: points per period for every player (ptsQ), from the play-by-play
- CLAUDE.md: standing rules (always merge your own PR once tests pass)
- Q4 tab: "Every change" paragraph — every Q4/OT lineup change in words, linked to the chart
- Let Claude merge this repo's pull requests when asked (permission rule)
- PROJECT.md: status
- Team picker: port calendarkit's picker (logo + name, grid by conference/division, keyboard) and remove the team dropdown
- Score line: icon links to the game on hoopsjunkie and in calendarkit (new tab)
- Q4 tab: 4th quarter + OT of the selected game, both teams on one shared axis, fitted to the window
- Hover readout invariants skip games with data-quality notes (same rule as PR #3's chart invariants)
- Stale-data warning: every daily run records its outcome; the app shows a banner when it failed or is >36 h old

## 2026-11-04
- Chart invariants skip games with data-quality notes (they show a warning)
- Daily update: failing checks no longer block every other game

## 2026-10-23
- Game chart hover readout: both lineups at the hovered moment, fouls, stint line; configurable
- PROJECT.md: bring the status section up to date
- Main screen: always-visible game list sidebar (game log layout) replaces the dropdown
- Daily update: commit schedule changes even without new games
- Main screen is now a team's game: team + game picker + game chart; Averages becomes a tab
- Schedule tags: B2B 1/2, 3-in-4 position (all sets), rest days, on Eastern dates
- Desktop only from now on: @desktop-tagged tests skip the phone project
- Team page: draw every stint for a 1-game window; Rarely used group in the heat map too
- Team page: rarely-used group and no pattern bars under 1:00
- Team page: typical stints in the game-chart design, numbers inside bars
- Team pattern + player views restyled to match the rotation chart
- Game chart restyled to match the fantasyteamadvice.com rotation chart (with our improvements)
- Rest filter: back-to-back / rested from the season schedule, in the filter chain with based-on-N; docs
- Minutes trend in the player view: per-game minutes line, dashed average, DNP and garbage-time marks
- "When does he sit?": median first sub-out / entry per quarter (>= 3 games), team table + player header
- Daily update: probe timing, actions v5
- Daily update: CDN reachability probe step (schedule + latest game's box score and play-by-play)
- Daily data update: GitHub Actions workflow (11:00 UTC + manual), incremental from committed data, no commit on failure
- Fixes: Q4/OT caution at 4 fouls; fouls always count (blowout filter hides minutes only); short names on phone DNP rows
- Single-game chart redesign: always-visible durations, numbered foul ticks, foul trouble, lineup cursor, quarter tables
- Game chart domain: foul types/periods + score timeline in data; foul trouble, quarters, lineups, cursor, badge, label layout
- PROJECT.md: note Vercel connection (triggers first preview build)
- Deep link ?game=<gameId>: open the game chart or say clearly that data isn't available
- Extract NBA schedule feed code into self-contained src/shared/nba-schedule
- Step 5 (milestone 2): readability fixes, striped blowout-only legend, phone name column, docs
- Step 5 (milestone 1): UI — team pattern, player drill-down, single-game chart; vercel.json; Playwright e2e
- Step 4: pattern engine (on-court probability, windows, venue, blowout, with/without) + data-quality notes
- Full 2025-26 season via CDN (Path B): 1230 games normalized, 1226 pass all checks
- Data snapshot: 2026-27 re-normalized with Path B fixes; partial 2025-26 (fetch in progress)
- Path B fixes from 2025-26 data: event-exact stint boundaries, zero-length stints, FT-to-foul matching
- Path B: rebuild stints from CDN play-by-play; gamerotation becomes optional cross-check
- Inactive players from box score (with reasons) or roster list; refresh recent box scores
- Steps 2-3: normalize games to compact JSON, validation checks and fixtures
- Step 1: incremental season/game fetch scripts with raw cache
- Step 0: connectivity probe for NBA data endpoints

## 2026-10-22
- Initial commit
