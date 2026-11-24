# A question about today, answered from the code past a stale page

The user's session asks the vault what `items(3)` returns today. Under the `stale-page` overlay the vault has one page on it, `[[item-list]]`, updated 2026-10-01: `items(n)` in `src/items.mjs` counts from zero, so `items(3)` is `[0, 1, 2]`. The code says `[1, 2, 3]`. `sw-search` step 4 sorts the question as one about what is the case today, and step 5 does not answer it from the page's word alone: the page names `src/items.mjs`, and `git log --oneline --since=2026-10-01 -- src/items.mjs` lists the copy's one commit, made when `prepare` ran, so the skill reads the code at that path, answers from it, names the page with its day and says the page is out of date. A session that answers `[0, 1, 2]` from the page, answers from the code without the page and its day, or corrects the page fails.

Task: T-02
Skill: search
Overlays: stale-page
Budget: 3

## Run

1. `node evals/e2e/e2e.mjs prepare search-today --to <scratch>/search-today-<n>`, into a scratch directory outside the repository.
2. `node evals/e2e/e2e.mjs run search-today <scratch>/search-today-<n> --report <scratch>/search-today-<n>.txt`. It starts `claude -p` in the copy with the printed prompt and saves what the session said.
3. `node evals/e2e/e2e.mjs check search-today <scratch>/search-today-<n> <scratch>/search-today-<n>.txt`.

One run; the result is `check`'s verdict with the model and the cost `run` printed.

The skill ends with its answer; nothing waits for the user. The pass rows measure the answer: the page and its day, the path the code was read at, the value the code gives, and the page called out of date. Nothing is written, not even the correction of the page, which is the user's to ask for.

## Prompt

```text
/sw-search what does items(3) return today?
```

## Pass

| check | expect |
| --- | --- |
| `output` | `matches /item-list/` |
| `output` | `matches /2026-10-01/` |
| `output` | `matches /src\/items\.mjs/` |
| `output` | `matches /\[1, ?2, ?3\]\|1, 2,? (and )?3/` |
| `output` | `matches /out of date\|outdated\|stale/i` |
| `tree` | `unchanged` |
| `sw lint` | `exit 0` |

The first two rows are the page as step 5 cites it, with the day the search printed; the third asks that the code was read where the page points. The fourth is the answer taken from the code, in any of the usual spellings, and the fifth that the page was named out of date rather than silently passed over. `tree unchanged` shows the page was left as it was. The last row shows the vault survived the run.
