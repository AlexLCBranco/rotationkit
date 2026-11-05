# rotationkit — working rules for Claude

Read PROJECT.md first (what the app is, data pipeline, decisions).

- **Always merge your own pull request into `main` once the full test suite, e2e and build pass** (owner's standing
  instruction, 2026-11-05). Open the PR, then merge it with the GitHub API (`gh api -X PUT
  repos/AlexLCBranco/rotationkit/pulls/<n>/merge -f merge_method=merge`; allowed in `.claude/settings.json`). Don't
  wait for the owner. If tests fail, fix them first; never merge red.
- Work on a new branch per task; never push straight to `main`.
- Desktop only, dark mode only. Automate every test that can be automated.
- Never invent data, ids, endpoints or field names; never patch data to pass a check.
- Keep PROJECT.md updated with every behavior change.
