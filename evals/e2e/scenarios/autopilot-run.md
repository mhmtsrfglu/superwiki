# An unattended run over two tasks, stopped on a difference

The user's session runs `sw:autopilot` over T-02 and T-03 with questions ruled out, so the run settles its standing answers from the defaults: plans approved without the user, no checks that need the environment, no commit, no push, stop when a task stops. It marks T-02 started, says its `Route:` line and implements it; the implementer reports the first item `differs` (CommonJS against the fixture's `AGENTS.md` rule), the run sends it back once in the task's wording, the implementer keeps what it built, and the task closes `unverified`, which stops the run before T-03. Every answer given in the user's place is recorded in the task's "Notes" and in the report, with the usage table at the end. A session that asks a question, accepts the difference itself, commits, or goes on to T-03 after the stop fails.

Task: T-02
Skill: autopilot
Overlays: none
Budget: 20

## Run

1. `node evals/e2e/e2e.mjs prepare autopilot-run --to <scratch>/autopilot-run-<n>`, into a scratch directory outside the repository.
2. `node evals/e2e/e2e.mjs run autopilot-run <scratch>/autopilot-run-<n> --report <scratch>/autopilot-run-<n>.txt`. It starts `claude -p` in the copy with the printed prompt and saves what the session said. This is the longest and dearest of the headless scenarios: the implementer, a fix round and, where the route asks for it, a reviewer all run inside it.
3. `node evals/e2e/e2e.mjs check autopilot-run <scratch>/autopilot-run-<n> <scratch>/autopilot-run-<n>.txt`.
4. `node docs/.sw/sw.mjs usage` in the copy, for the agents the session used and their tokens, and `git -C <scratch>/autopilot-run-<n> rev-list --count HEAD`, which must print `1`: the default standing answer is no commit. Note both in the results row.

One run; the result is `check`'s verdict with the model and the cost `run` printed.

This is the one headless scenario that runs to the skill's own end: the stop on T-02's `unverified` item, with the report. The pass rows measure the standing answers said before the first task, the route said, the decisions made without the user recorded on the task and in the report, and the usage table printed at the end.

## Prompt

```text
/sw:autopilot T-02, then T-03. Ask me nothing: where this message does not answer a question, the default stands.
```

## Pass

| check | expect |
| --- | --- |
| `output` | `matches /^Standing answers:/m` |
| `output` | `matches /^Route: /m` |
| `output` | `matches /decided without the user\|Decisions made without the user/` |
| `output` | `matches /\bmain\b/` |
| `file docs/tasks/T-02.md` | `matches /decided without the user/` |
| `sw lint` | `exit 0` |

The first row is the line the skill writes in place of its questions; the second the route of the first task. The third and the `file` row ask that an answer given in the user's place was recorded in both places the skill names. The `main` row is the usage table's row for the session itself, printed in the report. The last row shows the vault survived the run.
