# Feature backlog — rotationkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are RK-1, RK-2, ... (never reused; RK is this repo's prefix, unique across the owner's repos).

## Ready

### RK-7 — Usage rate (USG%)
**What:** usage rate for every player: share of team plays a player finishes while on court, standard formula `100 × (FGA + 0.44×FTA + TOV) × (team MIN / 5) / (MIN × (team FGA + 0.44×team FTA + team TOV))`, from the box score data already fetched (if any field is missing, say which and where it would come from). Where it shows (owner hasn't decided the placement, keep it compact): a USG% column in Averages and Leaders (last 5 / last 10 / season like the other columns), and per game on the player page and the single-game view. Must work on desktop and phone (RK-4 rules).
**Tests:** unit: USG% for a fixture game matches a hand-computed value; e2e: the column shows in Averages and sorts; phone project: no page-level horizontal scroll.
Blocked: the committed game files have no FGA, FTA or TOV, for players or teams (only MIN, PTS, REB, AST, PF, +/-).
They come from the cdn.nba.com box score the pipeline already fetches: `statistics.fieldGoalsAttempted`,
`freeThrowsAttempted`, `turnovers` per player (team totals in the team's `statistics`). Adding them means a change to
`normalize` plus re-fetching every game of both seasons (~1,420 box scores); cdn.nba.com refuses requests from Claude's
cloud session (HTTP 403), so that backfill has to run on GitHub Actions or the owner's machine. Owner to decide: OK to add
the fields to the normalized files and backfill them (e.g. a one-off manual run of a backfill workflow)?
