# rotationkit — working rules for Claude

Read PROJECT.md first (what the app is, data pipeline, testing). docs/DECISIONS.md holds history; not required reading.

- **Merge your own pull request into `main` once the "PR checks" workflow (`.github/workflows/pr.yml`: npm ci,
  npm test, npm run build, npm run e2e) is green on the PR** (owner's standing instruction, updated 2026-11-14).
  Open the PR, wait for the workflow, then merge it with the GitHub API (`gh api -X PUT
  repos/AlexLCBranco/rotationkit/pulls/<n>/merge -f merge_method=merge`; allowed in `.claude/settings.json`). Don't
  wait for the owner. If the workflow fails, fix it first; never merge red.
- Work on a new branch per task; never push straight to `main`.
- Desktop only, dark mode only. There are no phone tests (removed 2026-11-14); don't add any. Automate every test
  that can be automated.
- Never invent data, ids, endpoints or field names; never patch data to pass a check.
- Keep PROJECT.md updated with every behavior change (current state only, 150 lines or fewer; history goes to
  docs/DECISIONS.md).

## Feature backlog (owner's standing workflow, added 2026-11-15)

The owner plans features in Claude chat, and the specs are written into `FEATURE_BACKLOG.md`. Most sessions will
start with a short message instead of a pasted prompt:
- "next batch" / "build the backlog": `git pull`, then implement every item under **Ready**, top to bottom.
- "next": only the top item under **Ready**.
- "build BK-n": only that item.

For each item: one branch/PR per item, following this file's other rules. Move the item to **Done** (with the PR
number and date) in that same PR. If an item is unclear or blocked, don't guess: leave it in **Ready** with a
`Blocked:` note saying what's missing, and continue with the next one. Don't add, rewrite or reorder **Ready**
items yourself; only move them and add notes. End with a short report: done / blocked / what the owner must test by
hand (only what couldn't be automated). A pasted prompt overrides this section.
