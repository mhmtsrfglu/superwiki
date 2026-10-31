---
type: task
id: T-01
title: Short imperative title
status: todo
deps: []
soft_deps: []
milestone:
priority:
review:
started:
finished:
---

## Goal

What exists when this is done, and why it matters.

## Done when

- Checkable condition.

## Sources

- [[page-name]]

## Notes

<!--
id: from `node docs/.sw/sw.mjs next-id <AREA>`; the file is docs/tasks/<id>.md.
status: todo | in-progress | done | cancelled. Cancelled tasks stay; ids are never reused.
deps: must be done before this starts. soft_deps: may start, cannot finish before them.
review: leave empty for no separate review. Any value (for example `required`, or the name of
the project's review class) makes sw-implement run a reviewer before the task can be done.
"(test)": a "Done when" item ends in "(test)" when a test is its evidence, for example "Expired
tokens are rejected (test)". sw-plan adds the mark to the items its plan proves by a test; you may
write it by hand. The implementer then writes that test first and reports a `red:` line, the run in
which it failed before the code, and the summary asks for that line and for one mutation run.
One test per behaviour: the implementer writes one test case per marked item and one for the Goal,
none for a helper, a small fix or an unmarked change; while the task is in progress a hook refuses
any other test write, so mark every item a test should prove. The Goal test is written whenever
the Goal names a behaviour the project's test command can exercise from a clean checkout, marked
items or none; only a Goal that is a text or document deliverable, or whose only check needs the
environment, goes without one.
A last section, "## Summary", is added by sw-verify when the task is closed; do not write it
by hand. It has four parts: "### Plan" (the approach as planned), "### Implementation" (what was
built, deviations), "### Changes" (files, taken from git) and "### Verification", a numbered list
with one entry per "Done when" item, each starting with a bold verdict (verified, unverified or
failed) followed by the command, a `falsifies:` line (how the command would have failed) and its
result; an item marked "(test)" also carries the implementer's `red:` line. Once per task, when it
has a marked item or a Goal test, a mutation run breaks the Goal's rule and runs the project's full
test command; its result goes to the marked item whose test went red, or to the `Tests:` line. The
part ends with a `Guard run:` line: the project's full check and the vault lint, then `git status
--porcelain`, and the `Tests:` and `surplus:` lines. A task can be `done` only when every item is
verified.
Keep this file short, the summary aside: steps go in docs/plans/<id>-plan.md, what happened
goes in docs/log.md.
Delete this comment.
-->
