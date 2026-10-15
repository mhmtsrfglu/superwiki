# A run that writes its state to a file and stops at its size limit after the first task

The user's session runs `sw-autopilot` over T-02 and T-03 with the same plain message as `autopilot-run`, in a copy whose `autopilot.peak` is 50000 tokens, committed before the session starts. The run says its standing answers and its readiness message, and writes `docs/.sw/run.md` before T-02 is touched: the scope, the `Standing answers:` line, the readiness close and T-02's `Open:` note settled from its Goal, and nothing about a task's status, which lives in the task's frontmatter. It takes T-02 through its implementer, a fresh reviewer, verification, `done` and its commit, with the run file in it. Then `usage` shows the session's `peak` above the limit, so the run stops between tasks with the report, T-03 untouched. `autopilot-resume` continues this run in a second session on the same copy. A session that dispatches an agent before the file exists, writes a task's status into it, leaves it out of T-02's commit, or goes on to T-03 fails.

Task: T-02
Skill: autopilot
Overlays: judgment
Budget: 8

## Run

1. `node evals/e2e/e2e.mjs prepare autopilot-stop --to <scratch>/autopilot-stop-<n>`, into a scratch directory outside the repository.
2. Set the limit the session stops at, and commit it so that the tree is as `prepare` left it: `node skills/sw-config/scripts/config.mjs peak 50000 --root <scratch>/autopilot-stop-<n>`, then `git -C <scratch>/autopilot-stop-<n> add docs/.sw/config.json` and `git -C <scratch>/autopilot-stop-<n> -c user.name=e2e -c user.email=e2e@example.com commit -q -m "Autopilot peak for the scenario"`.
3. `node evals/e2e/e2e.mjs run autopilot-stop <scratch>/autopilot-stop-<n> --report <scratch>/autopilot-stop-<n>.txt`. T-02's implementer, reviewer and verification run inside it; the session stops before T-03's planner.
4. `node evals/e2e/e2e.mjs check autopilot-stop <scratch>/autopilot-stop-<n> <scratch>/autopilot-stop-<n>.txt`. The `events` row reads `<scratch>/autopilot-stop-<n>.txt.jsonl`, which `run` wrote beside the report.
5. `node docs/.sw/sw.mjs usage` in the copy, for the agents the session used and their tokens, and `git -C <scratch>/autopilot-stop-<n> rev-list --count HEAD`, which must print `3`: the fixture's commit, the limit's and T-02's. Note both in the results row.
6. Once the check passes, run `autopilot-resume` on this copy.

One run; the result is `check`'s verdict with the model and the cost `run` printed.

The pass rows measure the run file: written before any agent ran, with the scope as given, the `Standing answers:` line as the skill prescribes it, T-02's decision with its source, and no task status; and the stop: T-02 `done`, T-03 still `todo`.

## Prompt

```text
/sw-autopilot T-02, then T-03.
```

## Pass

| check | expect |
| --- | --- |
| `events` | `matches /^(?:(?!tool: Agent\b)[^\n]*\n)*tool: (?:Write\|Edit\|Bash) [^\n]*docs\/\.sw\/run\.md/` |
| `file docs/.sw/run.md` | `matches /^scope: T-02, T-03$/m` |
| `file docs/.sw/run.md` | `matches /^Standing answers: plans and splits approved by the run: yes;/m` |
| `file docs/.sw/run.md` | `matches /^- T-02: [^\n]*settled by the task file \(Goal\)/m` |
| `file docs/.sw/run.md` | `lacks /\b(todo\|in-progress)\b\|T-02: done/` |
| `file docs/tasks/T-02.md` | `matches /^status: done/m` |
| `file docs/tasks/T-03.md` | `matches /^status: todo/m` |
| `sw lint` | `exit 0` |

The first row reads the events in order: the first write of `docs/.sw/run.md`, by whichever tool, comes before the first `Agent` call, so the file existed before T-02's implementer ran. The next four read the file: the scope line, the `Standing answers:` line as the skill prescribes it and said from the defaults, T-02's `Open:` note decided from its Goal as a decision line, and no status word, since a task's status is in its frontmatter only. The T-02 and T-03 rows show the stop fell between the tasks: the first finished, the second not started. The last row shows the vault survived the run.
