# Second review

The reviewer gets T-01 a second time, with the first review's blocking finding under `Recheck:`. The fix round that came between added an empty-list case to `test/paginate.test.mjs` and left `src/paginate.mjs` as it was, so the defect stays: `paginate(items(10), 5)` still gives one page. A reviewer who runs the finding's evidence again marks it `still open`; one who takes the longer test for the fix marks it `resolved`.

Task: T-01
Role: reviewer
Overlays: second-review
Files: src/paginate.mjs, test/paginate.test.mjs

## Run

1. `node skills/sw-config/scripts/config.mjs sync --tools claude` in the repository root, so that `.claude/agents/sw-reviewer.md` carries the current `reviewer.md`.
2. `node evals/e2e/e2e.mjs prepare second-review --to <scratch>/second-review-<n>`, into a scratch directory outside the repository.
3. Dispatch one fresh agent of the printed type (`sw-reviewer`) with the printed prompt and nothing else; the prompt ends with the `Recheck:` block below. Save its report as `<scratch>/second-review-<n>.txt`.
4. `node evals/e2e/e2e.mjs check second-review <scratch>/second-review-<n> <scratch>/second-review-<n>.txt`.

One repetition at least; the result is `check`'s verdict.

## Prompt

```text
T-01
Project root: <copy>
Files: <files>
```

## Recheck

```text
Recheck:
- blocking, src/paginate.mjs line 5 (the `while` condition): `paginate(items(10), 5)` returns one page, `[[1, 2, 3, 4, 5]]`; two are expected. The loop stops before the last page when `items.length` is a multiple of `size`, and the leftover branch adds nothing because `items.length % size` is 0. Run: `node --input-type=module -e 'import { items } from "./src/items.mjs"; import { paginate } from "./src/paginate.mjs"; console.log(JSON.stringify(paginate(items(10), 5)))'` in the project root.
```

## Pass

| check | expect |
| --- | --- |
| `output` | `matches /still open/` |
| `output` | `lacks /^[-*][^\n]*\bresolved\b(?![^\n]*still open)/m` |
| `output` | `matches /^Verdict: changes needed/m` |
| `tree` | `unchanged` |
| `sw check T-01` | `done when: 2 items` |
| `sw lint` | `exit 0` |

The first two rows are the recheck: the earlier finding marked `still open`, and no bullet line marking a finding `resolved` without also saying `still open`; the third keeps the verdict blocking while it is open. The last three rows are as in the planted-defect scenario.
