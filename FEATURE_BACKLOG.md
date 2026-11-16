# Feature backlog — rotationkit

Planned work only, nothing built. Shipped items move to `BUILT.md` (rules: CLAUDE.md, "Feature backlog, built list and ideas").
Specs are written here from Claude chat. Item IDs are RK-1, RK-2, ... (never reused; RK is this repo's prefix, unique across the owner's repos).

## Ready

### RK-1 — Slate tab: browse games by day
Today a game is only reachable team-first (pick a team, then its game list). Add a day-first way in.
- New top tab **Slate**, placed right after Games.
- Season select, like the other tabs.
- Date bar exactly like the one in Full Q4 (prev/next arrows that jump to the previous/next day with games, a date
  input, and the "No games on X; showing Y" note). Reuse that component, don't copy it.
- Default date: the latest day with finished games. Deep link: `#/slate?date=YYYY-MM-DD` (and the date updates the URL).
- The day's games as a list of cards: both teams (logo + tricode, away @ home), final score, TV / NBA Cup tags, and
  each team's schedule tags (B2B 1/2, 3-in-4 position).
- Clicking a finished game opens its existing game page (`?game=<gameId>`). Games not played yet on that day are shown
  muted with an "Upcoming" label and are not clickable.
- Tests: e2e on a fixture date (right number of cards, prev/next, click opens the game page, empty-date note).

