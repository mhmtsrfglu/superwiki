# A second session continues the run from its file and stops on a question

A fresh session is given `continue the run` in the copy `autopilot-stop` left: T-02 `done` and committed, T-03 `todo`, `docs/.sw/run.md` with the scope `T-02, T-03`, the standing answers and T-02's decision. The session reads the file before anything else: its first tool call reads `docs/.sw/run.md`, before any file is touched or agent dispatched. It asks for neither the scope nor the answers, repeats no readiness check, and takes T-03, the next task in the recorded scope: `review: required`, so `Route: large` and its planner, whose access-log item nothing settles, so T-03 closes with the question `goes to the user` and the run stops with the report. The report carries the run file's `Standing answers:` line word for word, and its "Decisions made without the user" is the run file's section, T-02's decision from the first session included. A session that asks what to run or which answers hold, touches a file or dispatches the planner before it has read the run file, or reports only its own session's decisions fails.

Task: T-03
Skill: autopilot
Overlays: judgment
Budget: 8

## Run

No `prepare`: the copy is `autopilot-stop`'s after its check passed, and this session is the run's second.

1. `node evals/e2e/e2e.mjs run autopilot-resume <scratch>/autopilot-stop-<n> --report <scratch>/autopilot-resume-<n>.txt`. T-03's planner runs inside it; the session stops on its question.
2. `node evals/e2e/e2e.mjs check autopilot-resume <scratch>/autopilot-stop-<n> <scratch>/autopilot-resume-<n>.txt`. The `events` rows read `<scratch>/autopilot-resume-<n>.txt.jsonl`.
3. `node docs/.sw/sw.mjs usage` in the copy, and `git -C <scratch>/autopilot-stop-<n> rev-list --count HEAD`, which still prints `3`. Note both in the results row.

One run per run of `autopilot-stop`; the result is `check`'s verdict with the model and the cost `run` printed.

The pass rows measure what the second session read before it touched anything, the task it took and the route, the recorded standing answers and the decisions of the whole run in its report, and T-03 stopped with its question recorded.

## Prompt

```text
/sw-autopilot continue the run.
```

## Pass

| check | expect |
| --- | --- |
| `events` | `matches /^(?:text: [^\n]*\n)*tool: (?:Read\|Bash) [^\n]*docs\/\.sw\/run\.md/` |
| `events` | `matches /^tool: Agent [^\n]*sw-planner/m` |
| `output` | `matches /^Standing answers: plans and splits approved by the run: yes; checks that start a service or need a local stack: allowed; checks that change data: not allowed; commit each done task: yes, as <ID>: <title>; push: no; when a task stops: stop the run\.$/m` |
| `output` | `matches /^Route: large/m` |
| `output` | `matches /T-02: [^\n]*settled by the task file \(Goal\)/` |
| `file docs/.sw/run.md` | `matches /^- T-02: [^\n]*settled by the task file \(Goal\)/m` |
| `file docs/tasks/T-03.md` | `matches /goes to the user/` |
| `file docs/tasks/T-03.md` | `matches /^status: in-progress/m` |
| `sw lint` | `exit 0` |

The first row reads the events in order: the session's first tool call, after any text, is a `Read` of `docs/.sw/run.md` or a `Bash` command that names it, so the file was read before any `Agent`, `Edit` or `Write` call and before any other command; a session that loads skills, runs lint or opens a task file first fails it. The second row is the planner the session dispatched for T-03, the fourth its route. The third row is the run file's `Standing answers:` line in the report, word for word as the first session recorded it. The fifth and sixth rows are the first session's decision on T-02, in this session's report and still in the file. The T-03 rows show the access-log question reached the task's "Notes" as a question for the user and stopped the task short of `done`. The last row shows the vault survived both sessions.
