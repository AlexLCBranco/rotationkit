rotationkit: new batch of 6 features. Read CLAUDE.md and PROJECT.md first and follow them (branch per task, PR, merge when "PR checks" is green, update PROJECT.md, automate every test). Desktop + dark mode only. Never invent data, ids, endpoints or field names. If a source doesn't provide something, say so in the PR instead of faking it.

Before building, check the current code for each item. Some pieces already exist (noted below), so extend them; don't duplicate them.

1) FULL 12-MINUTE 4TH QUARTERS
- New top tab (next to the existing ones): "Full Q4". Pick a date (default: latest day with finished games; prev/next day buttons). List every player who played the entire regulation 4th quarter (12:00 on court), grouped by game, with team logos and a clickable player name. Next to each name: his season count of full Q4s.
- On the same tab, a season leaderboard: players ranked by full-Q4 count, also showing games played and %.
- Options: threshold "12:00 exact" (default) vs "11:00+"; "exclude blowouts" (reuse the existing blowout/garbage-time rule).
- OT games: count only the regulation 4th.
- Player page: add a counter ("Full Q4s: X of Y games") and a small marker on each game row where he played the full 4th.
- Data: the per-period minutes in the Leaders quarters file should be enough. Verify that first and compute client-side if possible; only add pipeline output if needed.
- Deep links: date and options in the URL like the other tabs.

2) PLAYER PAGE GAME ROWS: TV + CUP TAGS, POINTS PER STINT
- Tag national TV games and NBA Cup games on each game row (next to the Competitive/Comfortable/Blowout tag): a small tag with the national network's abbreviation, and a "CUP" tag for Cup group/knockout games. The schedule parser (src/shared/nba-schedule) already has broadcasters.nationalBroadcasters, isCupGroupGame and isCupKnockout, but the app doesn't use them yet; carry them through the pipeline into the game data/index. Use the same tags on the game page header and in the game list/dropdown.
- Points per stint: compute in the pipeline from play-by-play made shots and free throws (same source as ptsQ), assigning each scoring event to the stint that covers it. Watch free throws shot after a substitution at the same clock time: credit the scorer's points to him even if the stint boundary is at that moment, and add a unit test for it.
- Display: show stint points in the hover/tap readout everywhere stints appear (player page and game chart). Also add an option in the existing display menu (ReadoutMenu) to show points on the bars ("12:00 · 8p"), off by default; hide the label when the bar is too short to fit it.

3) GAME PAGE: BOTH TEAMS WITHOUT SCROLLING
- Add a "Compact (both teams)" toggle on the game page. When on: only players who played (DNP rows collapsed into a single line per team that expands when clicked), shorter row height, so both teams fit on one desktop screen (1080p) without scrolling or zooming. Shared time axis. Remember the choice (localStorage, try/catch). Add an e2e test that both teams' charts are within the viewport at 1920x1080 in compact mode.

4) GAME PAGE: SELECTED TEAM FIRST
- When the game is opened from a selected team, that team always shows first (top), whether home or away. With no selected team, keep the current order.
- Make HOME / AWAY very clear on each team's header (labeled tag, not just @/vs). Put the team in the URL so deep links keep the order.

5) DNP: INJURY vs COACH'S DECISION
- The game chart already lists DNP/inactive players at the bottom with a reason that only shows on hover. Change it so the reason is visible on the row without hovering, and make the types visually distinct: "DNP – CD" (available, coach's decision) in one color, "OUT – injury/illness" in another, and other reasons (G League, two-way, personal, suspension…) in a neutral style. Use the existing reason fields (players' reason/reasonDetail and the inactive list's reasons); don't guess categories when the reason is missing, show "DNP" plain.
- Same labels on the player page rows for games he didn't play.

6) PLAYER PAGE: NAME NEXT TO THE CHART
- Move the player's name (and headshot, team) down so it sits right above the rotation rows, on the same line as the "Hover or tap a stint for details…" readout, instead of far from the chart.

Ship as separate PRs where natural (e.g. 1, 2, 3+4, 5+6); merge each when green.