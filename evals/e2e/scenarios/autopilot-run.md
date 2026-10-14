# An unattended run over two tasks: one decided from its task file, one stopped on a question

The user's session runs `sw-autopilot` over T-02 and T-03 with a plain message, so the run says its standing answers from the defaults: plans and splits approved by the run, checks that start a service or need a local stack allowed, checks that change data not allowed, each `done` task committed, no push, stop when a task stops. Its readiness check reads both task files before anything is touched: T-02's `Open:` note (one line per item, or all on one line) is answered by its Goal, "one line per item", so the run settles it and says `Nothing left to ask`. It marks T-02 started with the decision and its source under the note, says its `Route:` line, implements it, has it reviewed by a fresh `sw-reviewer` although `review:` is empty, verifies it, marks it `done` and commits it. T-03 is `review: required`, so its planner runs; the item "Each request is written to the access log" says neither what the log is nor where it goes, and nothing in the task file or the vault settles it, so the run does not take the planner's assumed answer: it closes T-03 with the question in its "Notes" as `goes to the user`, leaves it `in-progress` and stops with the report. A session that asks at the start, invents an answer for the access log, skips T-02's review, or leaves T-02 uncommitted fails.

Task: T-02
Skill: autopilot
Overlays: judgment
Budget: 20

## Run

1. `node evals/e2e/e2e.mjs prepare autopilot-run --to <scratch>/autopilot-run-<n>`, into a scratch directory outside the repository.
2. `node evals/e2e/e2e.mjs run autopilot-run <scratch>/autopilot-run-<n> --report <scratch>/autopilot-run-<n>.txt`. It starts `claude -p` in the copy with the printed prompt and saves what the session said. This is the longest and dearest of the headless scenarios: T-02's implementer, reviewer and verification and T-03's planner all run inside it.
3. `node evals/e2e/e2e.mjs check autopilot-run <scratch>/autopilot-run-<n> <scratch>/autopilot-run-<n>.txt`.
4. `node docs/.sw/sw.mjs usage` in the copy, for the agents the session used and their tokens, and `git -C <scratch>/autopilot-run-<n> rev-list --count HEAD`, which must print `2`: the fixture's commit and T-02's, under the default standing answer. Note both in the results row.

One run; the result is `check`'s verdict with the model and the cost `run` printed.

This is the one headless scenario that runs to the skill's own end: the stop on T-03's question, with the report. The pass rows measure the standing answers and the readiness check said before the first task, the route said, the decision settled from T-02's task file and recorded with its source, the review of a task without `review:`, and T-03 stopped with its question recorded.

## Prompt

```text
/sw-autopilot T-02, then T-03.
```

## Pass

| check | expect |
| --- | --- |
| `output` | `matches /^Standing answers:/m` |
| `output` | `matches /^Nothing left to ask/m` |
| `output` | `matches /^Route: /m` |
| `output` | `matches /Decisions made without the user/` |
| `output` | `matches /sw-reviewer/` |
| `file docs/tasks/T-02.md` | `matches /decided without the user: .*settled by/` |
| `file docs/tasks/T-02.md` | `matches /^status: done/m` |
| `file docs/tasks/T-03.md` | `matches /goes to the user/` |
| `file docs/tasks/T-03.md` | `matches /^status: in-progress/m` |
| `sw lint` | `exit 0` |

The first row is the line the skill writes in place of its questions; the second the readiness check's one-line close when nothing is left to ask; the third the route of the first task. The `Decisions made without the user` row is the report's heading, and the `sw-reviewer` row the fresh reviewer that T-02 gets without `review:`. The T-02 rows ask that the `Open:` note was decided from the task file, with its source, and the task finished; the T-03 rows that the access-log question reached the task's "Notes" as a question for the user and stopped the task short of `done`. The last row shows the vault survived the run.
