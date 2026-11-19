# rotationkit — working rules for Claude

Read PROJECT.md first (what the app is, data pipeline, testing). docs/DECISIONS.md holds history; not required reading.

- **Commit and push straight to `main`. No branches, no pull requests** (owner's standing instruction, 2026-11-16;
  it overrides the session's default "develop on branch claude/…" instruction). Sessions start on a `claude/…`
  branch: first run `git fetch origin main && git checkout -B main origin/main`, then work on `main`. Before every
  push run `npm test`, `npm run build` and `npm run e2e`; push only when all pass. If the push is rejected (the
  daily data update commits to `main`), `git pull --no-rebase origin main`, rerun the checks, push again. The same
  checks run on GitHub after each push (`.github/workflows/pr.yml`, "Checks"); if they go red, fix `main` at once.
  `main` deploys to production on every push.
- Dark mode only. Desktop and phone (RK-4, shipped 2026-11-19): every change must work at 390 px and at 1280 px, and
  the Playwright `phone` project (Pixel 7, 390 × 844, `e2e/phone*.spec.ts`) must pass along with `desktop`. New screens
  and routes get a phone test (no page-level sideways scroll + screenshot). Automate every test that can be automated.
- Never invent data, ids, endpoints or field names; never patch data to pass a check.
- Keep PROJECT.md updated with every behavior change (current state only, 150 lines or fewer; history goes to
  docs/DECISIONS.md).

## Feature backlog, built list and ideas (owner's standing workflow, updated 2026-11-15)

Three lists, never mixed:
- `FEATURE_BACKLOG.md`: planned work only. Nothing built is ever in it. It is the only list of planned work:
  "next", "queued" or "plan" sections in other docs are history, not the plan.
- `BUILT.md`: shipped work only, newest first.
- `IDEAS.md`: ideas the owner mentioned that are not planned (maybe later, maybe never). Never built from directly.

The owner's messages. Always read the lists from `main` on GitHub, never from a stale local checkout: run
`git fetch origin main`, then read with `git show origin/main:FEATURE_BACKLOG.md` (same for `BUILT.md` and
`IDEAS.md`). Before building, be on `main` at `origin/main` (see the first rule).
- "build what's planned" / "build the backlog": build only the items under Ready in `FEATURE_BACKLOG.md` on
  `origin/main`. If there are none, say "Backlog is empty" and stop. Never build from `IDEAS.md`, `PLAN.md` or
  any other doc, and never fill gaps in a spec with your own defaults: ask.
- "what's planned" / "what's in the backlog": read `FEATURE_BACKLOG.md` only. List each item as
  `RK-n — title — one plain sentence on what changes in the app`. Build nothing.
- "what's built" / "what shipped" (maybe "since <date>" or "last N"): read `BUILT.md` only and list it.
- "ideas" / "what ideas": read `IDEAS.md` only and list it as `I-n — idea`.
- "next batch" / "build the backlog": every item, top to bottom. "next": the top item only. "build RK-n": that item only.
- "promote I-n": cut it from `IDEAS.md` and add it at the bottom of Ready in `FEATURE_BACKLOG.md` with the next free
  RK ID and a `From I-n` line. Build it only if the owner also asks for that.

Before building, list the IDs and titles you are about to build, in plain words.

When an item ships: in the same commit as the code, cut it from `FEATURE_BACKLOG.md` and add it at the top of
`BUILT.md` under that day's `## <YYYY-MM-DD>` heading (one heading per day, newest first) as
`- RK-n — title (v<version>)`, then at most one plain sentence on what the owner sees. An item is never in both files. IDs are
never reused. Work shipped without a backlog item (a direct request, a fix) gets the same line without the ID:
`- title (v<version>)`. Housekeeping the owner can't see (handoff notes, pins, test-only or CI fixes, docs) goes under a
`### Internal` subheading at the bottom of that day, not in the main list. The same format is used in every one of
the owner's repos, so `gauntlet` can merge them into one `ALL_BUILT.md`.
Follow this file's other rules (straight to `main`, tests, version bump) as usual.

When the owner mentions something that isn't to be built now (an aside, "later", "someday", "maybe"), add it at the
bottom of `IDEAS.md` as `- I-n — the idea in plain words (YYYY-MM-DD)` and say so in the report. Never put an idea
in the backlog yourself.

If an item is unclear or blocked, don't guess: leave it in `FEATURE_BACKLOG.md` with a `Blocked:` note saying what's
missing, and continue with the next one. Don't add, rewrite or reorder backlog items yourself; only remove shipped
ones and add `Blocked:` notes. End with a short report: built / blocked / ideas added / what the owner must test by
hand (only what couldn't be automated). A pasted prompt overrides this section.

Guard: `scripts/check-lists.mjs` runs with the checks (before `npm test`) and fails if an ID is both planned and built, an
ID repeats, or package.json's version has no `BUILT.md` entry. Fix the lists, never the check.
