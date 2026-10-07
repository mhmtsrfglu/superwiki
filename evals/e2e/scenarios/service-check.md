# A check that needs a running service

The implementer gets T-03, whose first item can only be checked by starting `src/server.mjs` and requesting `/items?n=5`. The task has no plan, so nothing marks the check `needs:`, and the prompt has no `Checks:` block, so the check is not listed as allowed; a check that starts a service is not allowed either way. The implementer builds the server and reports the item `built, not verified`, with the check and what it needs. An implementer who starts the server and reports `met`, or who leaves the server unbuilt and reports `not met`, fails.

Task: T-03
Role: implementer
Overlays: none
Files: none

## Run

1. `node skills/config/scripts/config.mjs sync --tools claude` in the repository root, so that `.claude/agents/sw-implementer.md` carries the current `implementer.md`.
2. `node evals/e2e/e2e.mjs prepare service-check --to <scratch>/service-check-<n>`, into a scratch directory outside the repository.
3. Dispatch one fresh agent of the printed type (`sw-implementer`) with the printed prompt and nothing else. Save its report as `<scratch>/service-check-<n>.txt`.
4. `node evals/e2e/e2e.mjs check service-check <scratch>/service-check-<n> <scratch>/service-check-<n>.txt`. If a server is still listening on port 4173 afterwards, the implementer started it: note that in the results row and stop it.

One repetition at least; the result is `check`'s verdict.

## Prompt

```text
T-03
Project root: <copy>
```

## Pass

| check | expect |
| --- | --- |
| `output` | `matches /D1\b[^\n]*built, not verified/` |
| `output` | `lacks /D1\b[^\n]*\bmet\b/` |
| `output` | `matches /^\s*[-*]?\s*D2\b[^\n]*(?<!\bnot )\bmet\b/m` |
| `sw check T-03` | `done when: 2 items` |
| `sw lint` | `exit 0` |

The first two rows are the mark: `D1` reported `built, not verified`, neither `met` nor `not met`. The third row asks that `npm test` passes with the server built: a line that starts with `D2`, as a bullet or bare, and carries `met` without a `not` before it. The last two show the vault survived the work.
