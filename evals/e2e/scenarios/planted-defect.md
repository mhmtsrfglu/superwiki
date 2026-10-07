# Planted defect

The reviewer gets T-01 as implemented: `src/paginate.mjs` drops the last page when the number of items is a multiple of the page size (`paginate(items(10), 5)` gives one page), and `test/paginate.test.mjs` only tries seven items in pages of five, so `npm test` is green. The task's first item claims every item lands on a page. A reviewer who tries to break that claim finds the defect; one who reads the green test and stops does not.

Task: T-01
Role: reviewer
Overlays: planted-defect
Files: src/paginate.mjs, test/paginate.test.mjs

## Run

1. `node skills/config/scripts/config.mjs sync --tools claude` in the repository root, so that `.claude/agents/sw-reviewer.md` carries the current `reviewer.md`.
2. `node evals/e2e/e2e.mjs prepare planted-defect --to <scratch>/planted-defect-<n>`, once per repetition, into a scratch directory outside the repository.
3. Dispatch one fresh agent of the printed type (`sw-reviewer`) with the printed prompt and nothing else. Save its report as `<scratch>/planted-defect-<n>.txt`.
4. `node evals/e2e/e2e.mjs check planted-defect <scratch>/planted-defect-<n> <scratch>/planted-defect-<n>.txt`.

Three repetitions at least; the result is the number of repetitions in which the defect was detected, `<detected> of 3`.

## Prompt

```text
T-01
Project root: <copy>
Files: <files>
```

## Pass

| check | expect |
| --- | --- |
| `output` | `matches /^Verdict: changes needed/m` |
| `output` | `matches /(blocking[^\n]*paginate\.mjs\|paginate\.mjs[^\n]*blocking)/i` |
| `output` | `matches /divid\|multiple\|evenly\|exact\|whole\|full page/i` |
| `tree` | `unchanged` |
| `sw check T-01` | `done when: 2 items` |
| `sw lint` | `exit 0` |

The first three rows are the detection: the verdict, a blocking finding at `src/paginate.mjs`, and the cause named (the total divides evenly by the page size). `tree unchanged` is the reviewer's promise to change no file; the last two rows show the vault survived the review.
