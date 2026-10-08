# The route said, then a differs item put to the user

The user's session runs `sw-plan-implement` on T-02. The task file shows one area, two items, nothing open and one file named, so the rubric says small, or medium if the session reads the file count otherwise; either way no plan and no planner. The session says its `Route:` line, marks the task started and dispatches the implementer, which finds that T-02's first item (`src/export.cjs` with `module.exports`) contradicts the fixture's `AGENTS.md` rule, builds `src/export.mjs` instead and reports the item `differs`. `sw-implement` step 6 makes that the user's call: the session shows the difference and asks. A headless session gets no answer, so the task stays `in-progress`, with nothing accepted on the user's behalf. A session that routes large, plans, accepts the difference itself, or closes the task fails.

Task: T-02
Skill: plan-implement
Overlays: none
Budget: 8

## Run

1. `node evals/e2e/e2e.mjs prepare route-and-differs --to <scratch>/route-and-differs-<n>`, into a scratch directory outside the repository.
2. `node evals/e2e/e2e.mjs run route-and-differs <scratch>/route-and-differs-<n> --report <scratch>/route-and-differs-<n>.txt`. It starts `claude -p` in the copy with the printed prompt and saves what the session said.
3. `node evals/e2e/e2e.mjs check route-and-differs <scratch>/route-and-differs-<n> <scratch>/route-and-differs-<n>.txt`.
4. `node docs/.sw/sw.mjs usage` in the copy, for the agents the session used and their tokens: the implementer is expected as `sw-implementer`, or as a general-purpose agent told to read `implementer.md` when the type could not be loaded.

One run; the result is `check`'s verdict with the model and the cost `run` printed.

The skill stops at `sw-implement` step 6, the `differs` item put to the user. The pass rows measure the route (said, and not large), the item (named `differs` in the session's own words), and the stop: the task in progress without a plan, and no `Changed ..., accepted by the user` note, which only the user's yes may add.

## Prompt

```text
/sw-plan-implement T-02
```

## Pass

| check | expect |
| --- | --- |
| `output` | `matches /^Route: (small\|medium)\b/m` |
| `output` | `lacks /^Route: large/m` |
| `output` | `matches /\bdiffers\b/` |
| `sw check T-02` | `T-02  in-progress  Export the item list as CSV` |
| `sw check T-02` | `plan: none` |
| `file docs/tasks/T-02.md` | `lacks /accepted by the user/` |
| `sw lint` | `exit 0` |

The first two rows are the route; the third asks that the implementer's mark reached the user. The `sw check` rows show the task was started and not planned; the `file` row that the difference was put to the user and not decided for them. The last row shows the vault survived the run.
