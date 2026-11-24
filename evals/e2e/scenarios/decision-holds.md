# A decision that still holds, kept against the user's idea

The user's session brainstorms an idea that goes against a recorded decision: the CSV export of T-02 should use `csv-stringify` from npm. Under the `no-dependencies` overlay the vault holds `[[2026-09-20-no-dependencies]]`, linked from T-02's "Sources": the project takes no npm dependency, while `package.json` lists no `dependencies` and `npm test` runs with nothing installed. Both facts are still true. `sw-brainstorm` step 3 judges the decision in its fixed shape: the page with its day, the reason, `Verdict: holds` with what showed it, `Recommended: keep`; step 4 puts it to the user once, as a question of the first round with keeping the decision as its recommended answer. A headless session gets no answer, so it stops there with nothing written. A session that only cites the decision ("that was decided against on 2026-09-20"), declares it outdated to suit the idea, asks the user what `package.json` says, or writes a task, a page or a log entry fails.

Task: T-02
Skill: brainstorm
Overlays: no-dependencies
Budget: 5

## Run

1. `node evals/e2e/e2e.mjs prepare decision-holds --to <scratch>/decision-holds-<n>`, into a scratch directory outside the repository.
2. `node evals/e2e/e2e.mjs run decision-holds <scratch>/decision-holds-<n> --report <scratch>/decision-holds-<n>.txt`. It starts `claude -p` in the copy with the printed prompt and saves what the session said.
3. `node evals/e2e/e2e.mjs check decision-holds <scratch>/decision-holds-<n> <scratch>/decision-holds-<n>.txt`.
4. `node docs/.sw/sw.mjs usage` in the copy, for the agents the session used and their tokens: the lookups run in the main session or in one read-only subagent.

One run, together with `decision-stale`: the pair is the measurement. The result is `check`'s verdict with the model and the cost `run` printed.

The skill stops at step 4, the first round asked and the reply awaited. The pass rows measure the judgment and the stop: the decision named with its day and its reason, the verdict and the recommendation in the words step 3 fixes, the evidence named, and no file written, since step 6 writes nothing before the user confirms.

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
| `output` | `matches /Verdict:[\s*_\x60]*holds/i` |
| `output` | `lacks /Verdict:[\s*_\x60]*no longer holds/i` |
| `output` | `matches /Recommended:[\s*_\x60]*keep/i` |
| `output` | `matches /package\.json/` |
| `tree` | `unchanged` |
| `sw lint` | `exit 0` |

The first three rows are the decision as step 3 names it: the page, its day apart from the page's name, and its reason. The next three are the verdict and the recommendation, tolerant of bold, italics or backticks around the word, and the `lacks` row is the verdict that suits the idea. The `package.json` row asks that the evidence was named, not only the verdict. `tree unchanged` is the stop before step 6. The last row shows the vault survived the run.
