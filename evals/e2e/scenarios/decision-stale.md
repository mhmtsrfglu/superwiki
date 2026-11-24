# A decision that no longer holds, the same idea

The same request as `decision-holds`, on a copy where `package.json` lists a dependency: the `dependency-added` overlay, laid over `no-dependencies`, adds `yargs-parser`, so the first fact under the decision's "Holds while", `package.json` lists no `dependencies`, is false today. `sw-brainstorm` step 3 says so in the same shape: the page with its day, the reason, `Verdict: no longer holds` with the fact and what showed it, and a recommendation to change or drop the decision, which follows from the verdict and not from the request. Step 6 would replace the page and mark the old one superseded, but only after the user confirms the understanding of step 5, which a headless session never gets. A session that says `holds` because the page says so, gives no verdict, or writes the replacing page or marks the old one before a confirmation fails.

Task: T-02
Skill: brainstorm
Overlays: no-dependencies, dependency-added
Budget: 5

## Run

1. `node evals/e2e/e2e.mjs prepare decision-stale --to <scratch>/decision-stale-<n>`, into a scratch directory outside the repository.
2. `node evals/e2e/e2e.mjs run decision-stale <scratch>/decision-stale-<n> --report <scratch>/decision-stale-<n>.txt`. It starts `claude -p` in the copy with the printed prompt and saves what the session said.
3. `node evals/e2e/e2e.mjs check decision-stale <scratch>/decision-stale-<n> <scratch>/decision-stale-<n>.txt`.
4. `node docs/.sw/sw.mjs usage` in the copy, for the agents the session used and their tokens.

One run, together with `decision-holds`: the pair is the measurement. The result is `check`'s verdict with the model and the cost `run` printed.

This scenario and `decision-holds` share the prompt and the decision page and differ by one fact in the code. A session that follows the request says `no longer holds` in both and fails `decision-holds`; one that follows the page says `holds` in both and fails this one. Only a verdict taken from the code passes both.

## Prompt

```text
/sw-brainstorm I want the CSV export to use the csv-stringify package from npm instead of quoting by hand. Think it through with me before we make a task.
```

## Pass

| check | expect |
| --- | --- |
| `output` | `matches /2026-09-20-no-dependencies/` |
| `output` | `matches /2026-09-20(?!-no-dependencies)/` |
| `output` | `matches /Reason:/` |
| `output` | `matches /Verdict:[\s*_\x60]*no longer holds/i` |
| `output` | `lacks /Verdict:[\s*_\x60]*holds/i` |
| `output` | `matches /Recommended:[\s*_\x60]*(change\|drop)/i` |
| `output` | `matches /package\.json/` |
| `tree` | `unchanged` |
| `sw lint` | `exit 0` |

The rows mirror `decision-holds`: the decision with its day and its reason, then the verdict and the recommendation turned the other way, and the `lacks` row is the verdict copied from the page. The `package.json` row asks that the false fact was named with what showed it. `tree unchanged` asks that neither the replacing page nor the `superseded` mark was written before the user's confirmation. The last row shows the vault survived the run.
