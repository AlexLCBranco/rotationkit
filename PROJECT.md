# rotationkit

NBA rotation pattern research tool (v1): when each player is typically on court, how consistent that is,
and how it changes when a teammate is out. Static Vite + React app on Vercel reading committed JSON.
Pre-game research / post-game review, not a live tracker.

## Stack
Vite + React 19 + TypeScript (strict), Vitest. Node/TypeScript scripts (tsx) for fetching/processing.

## Data source in use: Path A
| Data | Endpoint | Why |
|---|---|---|
| Schedule | `cdn.nba.com/static/json/staticData/scheduleLeagueV2.json` | lists every game + status (3 = final) |
| Stints | `stats.nba.com/stats/gamerotation?GameID=…&LeagueID=00` | NBA's own on-court intervals; no reconstruction needed |
| Players, stats, starters, played flag | `cdn.nba.com/…/liveData/boxscore/boxscore_<id>.json` | fast, reliable |
| Fouls (exact time), score timeline | `cdn.nba.com/…/liveData/playbyplay/playbyplay_<id>.json` | fast, reliable |
| Per-game roster incl. inactive players (optional) | `stats.nba.com/stats/boxscoresummaryv3?GameID=…&LeagueID=00` | see below |

**Fallback, Path B:** if stats.nba.com becomes blocked, rebuild stints from CDN play-by-play
(period starters + `substitution` in/out events, which carry `personId`). Not implemented unless needed.

stats.nba.com notes: reachable from the cloud session (2026-10-23), but returns sporadic HTTP 500s;
the fetcher retries (2s/4s/8s backoff) and those have always succeeded so far.

### Inactive players / not-playing reasons
- CDN box score lists only active players (played flag, no reason). Injured/inactive players are absent.
- `boxscoresummaryv3` has an `inactives` array, but it was empty in every game checked → no reasons available. Dropped.
- Its `players` list is the full per-game roster *including* inactive players (e.g. GSW 0022600005 lists
  Butler, Porziņģis, Moody, who are not in the box score). Stored as an optional per-game list.
  Whether it is reliable enough to replace the appearance rule (below) is checked in validation.

### "Did not play" rule (with/without filter)
A player only counts as "did not play" for team T in a game if he was with T at that time:
- with T from his first appearance for T to his last appearance for T;
- after his last appearance he still counts as with T unless he has appeared for another team since;
- games before his first appearance for T don't count.
Counts derived from this rule are shown as *estimated* in the UI.

## Normalized data (`data/`)
- `data/index.json`: one entry per game (id, date, home/away tricode, score, periods).
- `data/games/<id>.json`: compact game (see `src/domain/types.ts`): teams, players (box stats, starter,
  played, reason if any), stints as `[start, end, +/-, foulTimes?]`, score margin timeline, inactive list.
- `data/validation.json`: latest validate-all result.
- All times = seconds elapsed since tip-off (OT included); formatting happens only in the UI.
- Stints from gamerotation are split at period boundaries, so every stint lies inside one period.
- Size: ~7 KB per game minified (~2.2 KB gzipped) → full season ≈ 9 MB in git, a team's 82 games ≈ 0.6 MB (≈0.2 MB gzipped).

### +/- attribution (verified against gamerotation PT_DIFF and box score)
Stint +/- is computed from the play-by-play running score. Same-second events around a substitution follow
NBA's rule: free throws count for the players on court when the foul was committed (FTs logged after the
sub but from a foul logged before it go to the outgoing player); FTs from a foul logged after the sub
(e.g. a technical) go to the incoming player. Other events follow log order. Result: matches every
gamerotation PT_DIFF in the fixtures except one where PT_DIFF itself disagrees with the box score
(0022600002, Brunson, last 7.7s) — ours agrees with the box score.

PF = play-by-play fouls with subType `personal` or `offensive` (flagrants included as they are `personal`;
technicals excluded).

## Validation
`npm test` runs Vitest on committed fixtures (`tests/fixtures/*.raw.json.gz`, raw responses gzipped):
8 games incl. OT (0022501147) and 2OT (0022500811) from 2025-26, blowouts (0022600088, 0022600092), and
games with tricky same-second sub/FT sequences (0022600085, 0022600090). Checks per game: minutes ±1s,
5 on court per team at all times, fouls = PF, stint +/- = box +/-, no overlaps, stints inside periods,
DNP players have no stints, stint +/- = PT_DIFF. Negative tests prove each check catches broken data.
`npm run validate-all` runs the same checks over every fetched game and the roster-list comparison.

## How to update data
```
npm install
npm run update-data      # = fetch-season → normalize → validate-all
git add data && git commit -m "Update data" && git push
```
- `fetch-season` is incremental; failed games are listed and logged to `cache/fetch-errors.json` (re-run to retry).
- `validate-all` must report 0 failed games before committing; if not, look at the reported check/player.
  Data is never patched to pass a check.
Single game: `npm run fetch-game -- <gameId> [--force]`.
Raw responses live in `cache/` (gitignored, ~0.8 MB per game). Requests are sequential with a 600 ms gap.
Scripts route through `HTTPS_PROXY` automatically when it is set (cloud session); on a normal PC they connect directly.

## Status
- Step 0 (connectivity probe): done — all endpoints OK.
- Step 1 (fetch): done — 14/14 finished games fetched (as of 2026-10-23).
- Step 2 (normalize): done.
- Step 3 (validation): done — 14/14 season games and 8/8 fixtures pass all checks.

## Open problems
- No not-playing reasons from any tested source.
