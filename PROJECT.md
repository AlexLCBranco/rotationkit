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
- **Main screen = a team's game** (`GameView.tsx`, route `#/game/<id>?t=ORL&s=2025-26`; `#/` opens the remembered
  team's latest game and the URL is rewritten to the real id so it can be bookmarked). Header: Games | Averages
  tabs and team picker. Left: the **game list** sidebar (`GameList.tsx`), a game log of every finished game of the
  team in the season, oldest at top: DATE (m/d/yyyy, blue link) | TM | @/vs | OPP | W/L score | schedule chips |
  rest days, ⚠ on flagged games; season selector, opponent search and a small tag legend above it. The selected row
  is highlighted and kept scrolled into view; click a row → that game; ↑ / ↓ on the focused list → previous / next.
  Collapse button (remembered in localStorage `rk.list`); collapsed = chart gets the full width (season selector
  moves next to the arrows). Right: ◀ ▶ + "Game N of M", game header (matchup, date, final, badge, schedule chips
  of this team AND the opponent), then the chart. The chart keeps `CHART.minPxPerMinute`; when the window is too
  narrow for list + chart it scrolls inside its box. `?game=<id>` deep links still work.
- **Q4 tab** (`Q4View.tsx`, route `#/q4/<id>?t=ORL`; decision 2026-11-05): Games | Q4 | Averages. Same team, game
  list, arrows and selected game as Games (switching tabs keeps the game; the list and arrows keep the tab). Shows
  only the 4th quarter plus any overtime right after it (OT = 5 min) on ONE shared axis: away team on top, home
  below, so a moment lines up vertically. Rows: players on court at some point in Q4/OT (`q4Rows` in
  `src/domain/q4.ts`), closers (on court at the final buzzer, green dot) first, then by Q4+OT minutes. Columns: MIN
  (Q4+OT), "PF in" = fouls entering Q4 (colored like foul trouble at the start of Q4), "Q4 PF" = fouls in Q4/OT.
  Bars, duration labels, foul ticks (cumulative numbers) and foul-trouble colors come from the same `layoutRow` as
  Games, called with `from` = start of Q4 (default 0 keeps Games unchanged). Garbage time is shaded the same way.
  Hover: one line across both teams + a card with both 5-man lineups and fouls at that moment (`cursorInfo`);
  click pins it (Close unpins). **No scrolling**: the row height shrinks to fit the window (34 px down to a
  22 px minimum, `Q4_ROW`). Worst real games (tested at 1920×950 and 1600×1000): 0022500086, 28 players in Q4 →
  22 px at 1920×950, 23 px at 1600×1000; 0022500637 (2OT) → 30 / 32 px. A game with even more players would
  stop at 22 px and the page would then scroll.
- **Q4 paragraph** ("Every change", right of the Q4 chart; `src/domain/q4Story.ts`; decision 2026-11-05): every
  lineup change of Q4 + OT in words, one paragraph: the Q4 opening lineups and score, each change ("ORL took out da
  Silva for Bane, ATL up 108–107"), each overtime's opening lineups, the closers and the result. NO clock times in
  the text: each sentence is linked to its moment instead — hovering it moves the chart's line there, shows both
  lineups and lights up the players it names; click pins. Only facts from the data are added in brackets: "had just
  picked up his 5th foul" (a foul at that very moment), "sat with N fouls" / "came back carrying N fouls" (foul
  trouble level), "first minutes of the game". No guessed reasons (rest, injury). The panel sits beside the chart so
  the no-scroll fit still holds (it scrolls inside itself if long). Tested by replaying the paragraph's changes from
  the opening lineups over every game: it reproduces the real lineup after every change and the closers.
- **Leaders tab** (`LeadersView.tsx`, logic in `src/domain/leaders.ts`, route `#/leaders?s=&w=&part=&ot=&sort=&lt=`;
  decision 2026-11-05): who averages the most 4th-quarter (or second-half) minutes and points. Choices: 4th quarter /
  second half, include overtime (off by default), last 5 / last 10 / season, all teams or one team, rank by minutes
  or points. Averages are per game played (a game he sat out that part counts as 0). Last 5 / 10 = the last N games
  of the team he played for in his latest game (a traded player counts only his current team's games); season = all
  his games. Ranked only with 3 of the last 5, 5 of the last 10, or 40% of the team's season games (`LEADER_MIN_GAMES`;
  a team with fewer games than that lowers the bar to its game count). Garbage time is included (points have no
  timestamp in our data, so they can't be cut to the blowout rule). Display: a scatter (minutes × points per game,
  dashed median lines, corners "plays it and scores" / "plays it, scores less" / "scores in short minutes", top 12
  named, greedy label placement without overlaps) beside a ranked table (GP, MIN, PTS, PTS per 12 minutes); hovering
  a row lights its dot; click opens the player's page.
- **Points per period** (`PlayerGame.ptsQ`, decision 2026-11-05): the box score only has game totals, so normalize adds
  each player's points per period from the play-by-play's made 2s, 3s and free throws. All 1,337 games were
  re-normalized from raw; the only change to the files was this field, and every player's periods add up to his
  box-score points (tested). `data/<season>/quarters.json` (built by normalize from the game files: per player per
  game, minutes and points per period; ~1.1 MB, ~360 KB gzipped) feeds the Leaders tab.
- **Game links** (`GameLinks.tsx`, URLs in `src/app/gameLinks.ts`; decision 2026-11-05): two small icon links
  (no underlined text) on the score line after the game-type / garbage-time chips, in Games and Q4, opening in a
  new tab. hoopsjunkie (basketball icon, tooltip "Open on hoopsjunkie"):
  `https://hoopsjunkie.io/games/<ET date>/<away>-vs-<home>`, lowercase tricodes, the same rule as calendarkit's
  `gameLinkUrl` (src/slate/links.ts, verified there on the live site). calendarkit (calendar icon, "Open in
  calendarkit"): `https://gauntlet-home.vercel.app/calendar?view=league&layout=list&date=<ET date>&game=<gameId>`
  (calendarkit opens on today until its own date/game change lands). The date is `Game.date`, the box score's
  Eastern date, so a 10 pm ET tip (next day in UTC) keeps its ET date.
- **Team picker** (`TeamPicker.tsx`, data in `src/data/teams.ts`; decision 2026-11-05): replaces the team dropdown
  in the Games/Q4 and Averages headers. PORTED from calendarkit (`src/components/TeamPicker.tsx`, its team/division
  table and `team-picker.css`): a button with logo + full name opening a grid grouped East Atlantic / Central /
  Southeast, West Northwest / Pacific / Southwest, current team highlighted. Keyboard as in calendarkit: Enter /
  Space / ↓ open, arrows move (← → a division), Home / End, a letter jumps to the next team whose city or name starts
  with it, Enter picks, Escape closes (focus back on the button). Port differences: teams passed as tricodes (the
  app's URL key), rotationkit's own `TeamLogo` (NBA CDN logos), no compact phone mode, `--ck-*` colors mapped to
  this palette. Picking does exactly what the dropdown did (same URL, same game list). The Averages "vs" matchup
  dropdown is unchanged (it is not the team picker). Team ids are checked against our game data in a test.
- **Schedule tags** (`src/domain/scheduleTags.ts`, on US Eastern dates from `schedule.json`; preseason and the
  All-Star game don't count, scheduled future games do): "B2B 1" plays again the next day; "B2B 2" played the day
  before; "3-in-4 · 1st/2nd/3rd" = position in a set of 3 consecutive team games within 4 days (first and last at
  most 3 days apart); a game in several sets shows its highest position and lists all sets on hover; days of rest
  "0d" / "1d" / "2d+" ("opener" for the first game). `index.json` entries carry the team ids (`hid`/`aid`) for logos.
- **Averages** (secondary tab, unchanged) — **Team pattern view**: team picker, season (defaults to the current season), Last 5 / Last 10 /
  Season, All / Home / Away, "Hide blowout time" (default on), With… / Without… + player. One row per player
  sorted by average minutes, drawn in the game chart's design (`PatternChart.tsx`): headshot + name | avg MIN |
  quarter timeline | games played / games in selection. Default view **Typical stints**: green bars for the
  stretches he is on court in at least half of his eligible games (`typicalStints` in `patterns.ts`: exact sweep,
  split at quarter lines, garbage time excluded, regulation only), duration inside the bar (same label rules as
  the game chart). Bright green = 75%+ of games, darker = 50–75%. With one game it is exactly that game's
  stints. A row with no such stretch says so. With 2+ games, bars shorter than `TEAM_PATTERN.minBarSeconds` (1:00)
  are not drawn (blowout-cut noise); hover still gives the exact share. With exactly 1 game every real stint is
  drawn (short ones labelled beside the bar), so it matches the game chart. Players who played in fewer than
  `TEAM_PATTERN.rarelyUsedShare` (1/3) of the selection's games go into a collapsed "Rarely used" group at the
  bottom, in both views (Typical stints and Heat map) with one shared open/closed state: dimmed bars/strips
  (from the games they played), GP in bold yellow. Both settings live in `config.ts`;
  rows come from `teamPatternRows` in `patterns.ts`. Hover/tap → "Q2 6:00 · on court in 7 of 10 games" plus the
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
  Minutes and durations are truncated to the second like NBA box scores (22:07.8 → 22:07).
  - **Hover readout** on a player's row (on a bar or an empty part of it): header "Q1 8:30 · PHI 12–10 BOS" (his
    team first), then both lineups at that moment (his team, then the opponent slightly muted; short names, the
    hovered player highlighted, fouls so far as a small yellow number when > 0), then his stint line, smaller:
    "Maxey: in Q1 12:00 → out Q1 6:12 · 5:48 · +/- +4", or "Maxey (off court)". Data: `hoverReadout` in
    `gameChart.ts`, built on `cursorInfo` / `onCourtAt` (the lineup cursor's logic; `stintAt` is the one "on court
    at t" rule, in at s ≤ t < out at e). Foul ticks and DNP badges keep their own text. "⚙ Readout" in the chart
    toolbar: lineups both teams / hovered player's team only / off, stint details, foul counts (default all on;
    localStorage `rk.readout`, read and written inside try/catch). The card is placed beside the pointer, above the
    hovered row (below it if there is no room), always inside the window.
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
- **Logo** (decision 2026-11-05, option 1 of 5): "stint bars", four rounded bars in the chart's green / caution / foul-trouble colors on a dark rounded square. `public/favicon.svg` (browser tab), `favicon-32.png` and `apple-touch-icon.png` (rendered from the SVG), and next to "rotationkit" in the header.
- Dark theme only (no light theme by design). Works at 390 px phone width (no sideways scroll).
- **Desktop only from now on** (user decision, 2026-10-23): nothing new is built or polished for phones. What
  already works on phones stays, and the existing phone tests must keep passing.

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
- `e2e/main.spec.ts` (desktop): main screen default, game list order/columns/chips/selection in view, row click +
  date link + arrow keys, prev/next, opponent search, URL + reload + back, collapse remembered, minute labels keep
  their scale with the list open, team/season pickers, header tags for both teams (checked against an independent computation),
  overlapping 3-in-4 hover, Averages tab. `tests/scheduleTags.test.ts`: hand-made schedules + real 2025-26 spot checks.
- New features get desktop tests only: put `@desktop` in the test title and the phone project skips it
  (`grepInvert` in `playwright.config.ts`). Existing phone tests keep running.

## Deploy (Vercel)
`vercel.json`: install `npm ci`, build `npm run build` (typecheck + Vite), output `dist/`. The build copies
`data/` to `dist/data/`; the app only reads those JSON files (never NBA.com). Vercel deploys `main` to
production; feature branches get preview deployments. Vercel connected to the repo on 2026-10-23.

## Automatic daily data updates (GitHub Actions)
Workflow: `.github/workflows/data-update.yml` → `scripts/ci-update.ts`.
- **Schedule**: every day at **11:00 UTC** (after all US games have finished). Takes effect once the workflow is on
  `main` (scheduled workflows only run from the default branch).
- **What it does**: `probe-cdn` (is cdn.nba.com reachable from the runner) → `fetch-season --cdn-only --strict`
  (Path B, cdn.nba.com only) → `normalize` → `validate-all` → `npm test`. If every step passes and there are new
  games, it commits `data/` to `main` as "data: N new games through YYYY-MM-DD" and pushes; Vercel then redeploys
  production. The schedule feed is downloaded and `schedule.json` rewritten on every run, so with no new games but a
  changed schedule (postponed or rescheduled game) it commits "data: schedule update (N games changed)" and the
  B2B / 3-in-4 tags are fixed the next morning.
- **Run status, every run** (decision 2026-11-05, after the update failed silently Oct 24 – Nov 4): each run on
  `main` writes `data/update-status.json` (`lastRun`, `result` ok/failed, `failingStep`, `error`, `lastSuccess`,
  `failingSince` = first failure of the current streak, `runId`). Success: committed with the data, or alone as
  "data: update status (ok, nothing new)" on quiet days (so quiet days never look stale; this means one small
  commit and one production redeploy per day). Failure: ONLY the status file is committed ("data: update FAILED at
  <step>"), never partial game data. A failure before the script even runs (checkout, `npm ci`) is recorded by the
  workflow's last step, `scripts/record-failure.ts`, run with plain Node (`--experimental-strip-types`, no npm
  packages). The probe moved from its own workflow step into the script so a blocked CDN is recorded too.
- **Stale-data banner** (`src/components/StaleBanner.tsx`, logic in `src/domain/updateStatus.ts`): at the top of
  every page when the last run failed ("Data last updated <date>, update failing since <date>.") or when the last
  successful run is older than 36 h (`STALE_AFTER_HOURS`; "…, no successful update since then." — the job stopped
  running, so there is no failure date to show). No banner when fine, or before the first run wrote the file.
- **Incremental without a cache**: the runner has no raw cache; already-committed games are read from
  `data/<season>/index.json` and skipped. `normalize` only (re)writes games whose raw data is present and rebuilds
  the index/appearances from all committed game files. `validation.json` is not committed by CI (it holds the
  gamerotation cross-check from full local runs).
- **Failure = no game data committed** (only the status file, above). Any step failing (CDN unreachable or blocked,
  a game that fails to download, a normalize error, a failing test) fails the run; GitHub emails the repository
  owner and the site shows the banner. A game failing a validate-all check does not fail the run (PR #3). To investigate: Actions tab → "Daily data update" → the failed run's log; the line
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
- A game that fails a validate-all check is still committed and shown with its warning; only a game that
  fails to normalize stops the update. New failing games are listed as NEW in the log (known ones are in
  `data/known-issues.json`); look at the reported check/player and add them there. Data is never patched to
  pass a check. (Before 2026-11-04 any NEW failure blocked the whole update: 8 bad NBA box scores froze all
  2026-27 data at Oct 23 for 12 days.)
- Past season (one-off): `npm run fetch-season -- --season 2025-26 --cdn-only`, then `npm run normalize` and
  `npm run validate-all` (both default to every cached season; `-- --season X` for one).
- Missing stats.nba.com cross-check data can be retried later: `npm run fetch-season -- --retry-optional`.
Single game: `npm run fetch-game -- <gameId> [--force] [--cdn-only]`.
Raw responses live in `cache/` (gitignored, ~0.5 MB per game). Requests are sequential with a 250 ms gap
(CDN) / 600 ms gap (stats.nba.com).
Scripts route through `HTTPS_PROXY` automatically when it is set (cloud session); on a normal PC they connect directly.

## Status
- Steps 0–6 of the original plan: done (probe, fetch, normalize, validation, pattern engine, UI, Vercel deploy +
  "How to update data"). Path B (stints from CDN play-by-play) is the primary source; 2025-26 fully backfilled.
- Added since: single-game chart in the fantasyteamadvice layout (foul-trouble colors, lineup cursor — both were
  "out of scope for v1" and were requested later), `?game=` deep links, shared `nba-schedule` module, daily GitHub
  Actions data update (also commits schedule-only changes), "when does he sit?", minutes trend, rest filter,
  team page "Typical stints" view with "Rarely used" group.
- Main screen is now a team's game (game list sidebar + chart, schedule tags B2B / 3-in-4 / rest); averages are a tab.
- Desktop only from now on; existing phone tests are kept passing.
- 2026-11-05: stale-data banner + run status file, Q4 tab, hoopsjunkie / calendarkit links on the score line,
  calendarkit's team picker (branch `claude/q4-tab-links-picker`, stacked on the open hover-readout PR #2).
- All work is on branch `claude/blissful-ride-ry8cnl`, not merged. The daily data update only commits to `main`, so
  it starts working for the live site once the branch is merged.

## Open problems
- stats.nba.com is slow/flaky (timeouts, 500s). It is optional now; `--cdn-only` skips it.
- 2026-27 box scores carry no inactive players/reasons (yet); roster list used instead (no reasons).
- Appearance rule misjudges fringe two-way/G-League players (see above); fine for rotation players.
