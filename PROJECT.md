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

## How to update data
```
npm install
npm run update-data      # = fetch-season → normalize → validate-all
git add data && git commit -m "Update data" && git push
```
- `update-data` covers the current season. `fetch-season` is incremental; failed games are listed and logged
  to `cache/fetch-errors.json` (re-run to retry). Add `-- --cdn-only` if stats.nba.com is misbehaving.
- `validate-all` must report 0 failed games before committing; if not, look at the reported check/player.
  Data is never patched to pass a check.
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
- Next: Step 5 (UI).

## Open problems
- stats.nba.com is slow/flaky (timeouts, 500s). It is optional now; `--cdn-only` skips it.
- 2026-27 box scores carry no inactive players/reasons (yet); roster list used instead (no reasons).
- Appearance rule misjudges fringe two-way/G-League players (see above); fine for rotation players.
