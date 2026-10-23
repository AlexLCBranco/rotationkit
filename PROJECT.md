# rotationkit

NBA rotation pattern research tool (v1): when each player is typically on court, how consistent that is,
and how it changes when a teammate is out. Static Vite + React app on Vercel reading committed JSON.

## Stack
Vite + React 19 + TypeScript (strict), Vitest. Node/TypeScript scripts (tsx) for fetching/processing.

## Data source (Step 0 probe, 2026-10-23)
All four endpoints reachable from the cloud session (`npm run probe`):
- Schedule: `https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json` — OK (seasonYear 2026-27)
- `https://stats.nba.com/stats/gamerotation?GameID=…&LeagueID=00` — OK (~0.7s)
- CDN play-by-play `liveData/playbyplay/playbyplay_<id>.json` — OK
- CDN box score `liveData/boxscore/boxscore_<id>.json` — OK

Note: Node's built-in fetch needs `NODE_USE_ENV_PROXY=1` to go through the session proxy.
Path decision: pending user approval.

## Status
- Step 0 (connectivity probe): done.

## Open problems
- CDN box score lists only active players; inactive/injured players are absent and no not-playing reason is given.
