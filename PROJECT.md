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

## How to update data
```
npm install
npm run fetch-season     # incremental; failures listed and logged to cache/fetch-errors.json
```
(Normalize/validate steps are added in Steps 2–3.)
Single game: `npm run fetch-game -- <gameId> [--force]`.
Raw responses live in `cache/` (gitignored, ~0.8 MB per game). Requests are sequential with a 600 ms gap.
Scripts route through `HTTPS_PROXY` automatically when it is set (cloud session); on a normal PC they connect directly.

## Status
- Step 0 (connectivity probe): done — all endpoints OK.
- Step 1 (fetch): done — 14/14 finished games fetched (as of 2026-10-23).

## Open problems
- No not-playing reasons from any tested source.
