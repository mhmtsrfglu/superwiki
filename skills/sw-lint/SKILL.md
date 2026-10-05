---
name: sw-lint
description: Use when the user asks to check, lint, health-check, clean up or audit the Superwiki vault or wiki, after bulk edits or a migration, or invokes sw-lint or sw:lint.
---

# sw-lint

Two passes. The first is a script and costs almost nothing. The second reads pages and costs tokens, so it runs only when the user approves it.

## Pass 1: structure (always)

1. Run `node docs/.sw/sw.mjs lint` from the project root. Read only its output, not the vault. It exits with code 1 while errors remain; that is expected.
2. **Fix broken links first, then run lint again**, because one rename produces several findings (`broken-link` in every page that linked the old name, plus `not-in-index` and `orphan-page` for the new one).
   - A rename is established when exactly one page is reported `not-in-index` or `orphan-page` and its name is a variation of the broken target. Re-point every `[[old]]` to `[[new]]` in the files lint named, including `index.md` and task files.
   - Two candidates, or no resemblance: do not guess. Report it.
3. Fix what else has one correct answer:

   | Finding | Fix |
   |---|---|
   | `stale-board`, `missing-board` | `node docs/.sw/sw.mjs board`: it rewrites the task list in `index.md` from the task files. Never edit that list by hand |
   | `not-in-index` | add `- [[page]]: summary` to `index.md`, using the page's `summary:` |
   | `missing-field` `summary` | copy it from the page's line in `index.md`; if there is none, read the page and write it |
   | `missing-field` `type` | read that page, write the field |
   | `missing-date` | fill from `git log --follow --format=%ad --date=short -- <file>` when the project is under git and the date is unambiguous |

4. Report the rest and let the user decide. Do not change a task's `status` or `deps` to silence a finding.

   | Finding | Why it needs a human |
   |---|---|
   | `started-before-deps`, `done-before-deps`, `dep-cycle`, `cancelled-dep` | either the status or the dependency is wrong; only the user knows which |
   | `done-unverified` | the task is `done` but its `## Summary` holds an unverified or failed item. Run sw-summarize for it; do not edit a verdict by hand |
   | `missing-date` you could not fill | no history to take it from, or it hangs on a finding above |
   | `duplicate-name` | one of the pages must be renamed and every link to it re-pointed |
   | `broken-link` with no clear target, `orphan-plan`, `unknown-dep` | the page may be missing or the reference stale |
   | `orphan-page` | may be fine; may want a link from a related page |

5. Run lint again and state the before and after counts.

## Pass 2: meaning (ask first)

Offer it with its size: "The wiki has N pages; a semantic review reads them. Run it?" (N from `node docs/.sw/sw.mjs status`). If approved:

1. Read `index.md`. Collect follow-ups that ingests deferred: find the last lint entry with `grep -n '^## \[.*\] lint' docs/log.md | tail -1` and read the log from that line to the end (the whole log only if there is no lint entry and it is short; otherwise `tail -60`).
2. Read the wiki pages. Up to about twenty pages, read them all; beyond that, go group by group (same `type`, or linked to each other). Open a file in `raw/` only to settle whether two pages really contradict each other. Look for:
   - claims that contradict each other;
   - a `decision` page superseded by a later one without saying so;
   - concepts named on several pages that have no page of their own;
   - pages that should link to each other and do not;
   - summaries or titles that no longer match the page;
   - each collected follow-up: still needed, or already handled.
3. Present the findings as a numbered list with the pages involved, and say which ones you recommend applying now. Apply only what the user agrees to.

## Finish

1. Run `node docs/.sw/sw.mjs lint` once more if you edited anything after the last run.
2. Append to `docs/log.md`, in the layout its last entries use:

   ```
   ## [YYYY-MM-DD] lint | <N> fixed, <M> open
   Fixed: <what>. Open: <findings left for the user>. Follow-up: <semantic findings and ingest follow-ups not yet handled>.
   ```

   Carry every unhandled follow-up into this entry: the next lint reads only from here on. Name a page that was renamed or removed in backticks, not as a `[[link]]`.
