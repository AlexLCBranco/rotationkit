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

## Feature backlog, built list and ideas (owner's standing workflow, updated 2026-11-15)

Three lists, never mixed:
- `FEATURE_BACKLOG.md`: planned work only. Nothing built is ever in it. It is the only list of planned work:
  "next", "queued" or "plan" sections in other docs are history, not the plan.
- `BUILT.md`: shipped work only, newest first.
- `IDEAS.md`: ideas the owner mentioned that are not planned (maybe later, maybe never). Never built from directly.

The owner's messages (always `git pull` first):
- "what's planned" / "what's in the backlog": read `FEATURE_BACKLOG.md` only. List each item as
  `BK-n — title — one plain sentence on what changes in the app`. Build nothing.
- "what's built" / "what shipped" (maybe "since <date>" or "last N"): read `BUILT.md` only and list it.
- "ideas" / "what ideas": read `IDEAS.md` only and list it as `I-n — idea`.
- "next batch" / "build the backlog": every item, top to bottom. "next": the top item only. "build BK-n": that item only.
- "promote I-n": cut it from `IDEAS.md` and add it at the bottom of Ready in `FEATURE_BACKLOG.md` with the next free
  BK ID and a `From I-n` line. Build it only if the owner also asks for that.

Before building, list the IDs and titles you are about to build, in plain words.

When an item ships: in the same commit/PR as the code, cut it from `FEATURE_BACKLOG.md` and add it at the top of
`BUILT.md` under `## <YYYY-MM-DD> — v<version>` as `- BK-n — title`. An item is never in both files. IDs are never
reused. Work shipped without a backlog item (a direct request, a fix) also gets a `BUILT.md` line, without an ID.
Follow this file's other rules (branches, tests, version bump) as usual.

When the owner mentions something that isn't to be built now (an aside, "later", "someday", "maybe"), add it at the
bottom of `IDEAS.md` as `- I-n — the idea in plain words (YYYY-MM-DD)` and say so in the report. Never put an idea
in the backlog yourself.

If an item is unclear or blocked, don't guess: leave it in `FEATURE_BACKLOG.md` with a `Blocked:` note saying what's
missing, and continue with the next one. Don't add, rewrite or reorder backlog items yourself; only remove shipped
ones and add `Blocked:` notes. End with a short report: built / blocked / ideas added / what the owner must test by
hand (only what couldn't be automated). A pasted prompt overrides this section.

Guard: `scripts/check-lists.mjs` runs with the checks (before `npm test`) and fails if an ID is both planned and built, an
ID repeats, or package.json's version has no `BUILT.md` entry. Fix the lists, never the check.
