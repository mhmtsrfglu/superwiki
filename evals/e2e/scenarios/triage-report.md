# A bug report, triaged without touching a file

The user's session gets a bug report about the fixture: with the `planted-defect` overlay laid over the copy, `paginate(items(10), 5)` returns one page where two were expected. `sw-triage` searches the vault, looks at what changed, reads at most four files and reports under its headings; it offers a task and the top check, and acts on neither, since nobody answers. A session that reads the code first, reproduces the bug before searching, writes the fix, files a task on its own or records a cause the vault does not hold fails. The vault has no lesson page, so "Seen before" must say so plainly.

Task: T-01
Skill: triage
Overlays: planted-defect
Budget: 3

## Run

1. `node evals/e2e/e2e.mjs prepare triage-report --to <scratch>/triage-report-<n>`, into a scratch directory outside the repository.
2. `node evals/e2e/e2e.mjs run triage-report <scratch>/triage-report-<n> --report <scratch>/triage-report-<n>.txt`. It starts `claude -p` in the copy with the printed prompt and saves what the session said.
3. `node evals/e2e/e2e.mjs check triage-report <scratch>/triage-report-<n> <scratch>/triage-report-<n>.txt`.
4. `node docs/.sw/sw.mjs usage` in the copy, for the agents the session used and their tokens.

One run; the result is `check`'s verdict with the model and the cost `run` printed.

The skill stops after its report, with its two offers open: a headless session gets no answer, so the pass rows measure the report and that nothing in the copy changed. The planted defect itself is under `T-01`, in progress, and its test is green, so the vault records no cause: the report may name the exact-multiple case as a hypothesis, and must not present it as history.

## Prompt

```text
/sw-triage `paginate(items(10), 5)` from src/paginate.mjs returns one page of five items; I expected two pages. It has been like this since T-01's change today.
```

## Pass

| check | expect |
| --- | --- |
| `output` | `matches /Seen before/` |
| `output` | `matches /Likely causes/` |
| `output` | `matches /Gaps/` |
| `output` | `matches /T-01/` |
| `tree` | `unchanged` |
| `sw check T-01` | `done when: 2 items` |
| `sw lint` | `exit 0` |

The first three rows are the headings of the report; the fourth asks that the task in progress in the same area was found as a suspect. `tree unchanged` is the mark of the skill's discipline: no fix, no task file, no lesson page without a yes. The last two show the vault survived the run.
