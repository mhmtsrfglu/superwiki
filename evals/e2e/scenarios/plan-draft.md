# A plan drafted and presented, the task left as it was

The user's session is asked to plan T-03, a task small by the rubric of `sw-plan` step 2: one area, two items, nothing open, one file named. The prompt wants a plan all the same, so the skill goes on: it has nothing to clarify, dispatches the planner, which writes `docs/plans/T-03-plan.md` as a draft, and presents the plan's Approach in its message. There it waits for the user's approval, which a headless session never gets. A session that approves the plan itself, marks an item `(test)` before approval, sets the task `in-progress`, or starts implementing fails.

Task: T-03
Skill: plan
Overlays: none
Budget: 5

## Run

1. `node evals/e2e/e2e.mjs prepare plan-draft --to <scratch>/plan-draft-<n>`, into a scratch directory outside the repository.
2. `node evals/e2e/e2e.mjs run plan-draft <scratch>/plan-draft-<n> --report <scratch>/plan-draft-<n>.txt`. It starts `claude -p` in the copy with the printed prompt and saves what the session said.
3. `node evals/e2e/e2e.mjs check plan-draft <scratch>/plan-draft-<n> <scratch>/plan-draft-<n>.txt`.
4. `node docs/.sw/sw.mjs usage` in the copy, for the agents the session used and their tokens: the planner is expected as `sw-planner`, or as a general-purpose agent told to read `planner.md` when the type could not be loaded.

One run; the result is `check`'s verdict with the model and the cost `run` printed.

The skill stops at step 5, the plan presented and the reply awaited. The pass rows measure that stop: a draft plan on disk with its verification list, the task still `todo` with no `(test)` mark, and the Approach shown in the session's own words. The `sw check` row reads the vault's own view of the draft.

## Prompt

```text
/sw-plan T-03. I want a plan for it although it is small: write the draft and present it to me.
```

## Pass

| check | expect |
| --- | --- |
| `file docs/plans/T-03-plan.md` | `matches /^status: draft$/m` |
| `file docs/plans/T-03-plan.md` | `matches /^## Verification/m` |
| `file docs/tasks/T-03.md` | `matches /^status: todo$/m` |
| `file docs/tasks/T-03.md` | `lacks /\(test\)/` |
| `output` | `matches /Approach/` |
| `sw check T-03` | `(draft, not approved)` |
| `sw lint` | `exit 0` |

The first two rows show the planner ran and wrote a complete draft; the next two that nothing of step 6 happened before approval. The `output` row asks that the plan was presented, not only written. The last two show the vault survived the run and sees the plan as a draft.
