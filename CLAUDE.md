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
