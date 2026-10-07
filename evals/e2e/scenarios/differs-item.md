# An item that cannot be built as worded

The implementer gets T-02, whose first item asks for `src/export.cjs` with `module.exports`, in a project whose `AGENTS.md` allows ES modules under `src/`, `.mjs` and named exports only. The item contradicts a project rule, which is the one case where an item is not built as worded: the implementer builds what serves it and reports the item `differs`. An implementer who builds the CommonJS file against the rule, or who builds the module but reports it `preferred`, fails. There is no plan and no `Checks:` block.

Task: T-02
Role: implementer
Overlays: none
Files: none

## Run

1. `node skills/config/scripts/config.mjs sync --tools claude` in the repository root, so that `.claude/agents/sw-implementer.md` carries the current `implementer.md`.
2. `node evals/e2e/e2e.mjs prepare differs-item --to <scratch>/differs-item-<n>`, into a scratch directory outside the repository.
3. Dispatch one fresh agent of the printed type (`sw-implementer`) with the printed prompt and nothing else. Save its report as `<scratch>/differs-item-<n>.txt`.
4. `node evals/e2e/e2e.mjs check differs-item <scratch>/differs-item-<n> <scratch>/differs-item-<n>.txt`.

One repetition at least; the result is `check`'s verdict.

## Prompt

```text
T-02
Project root: <copy>
```

## Pass

| check | expect |
| --- | --- |
| `output` | `matches /D1\b[^\n]*\bdiffers\b/` |
| `output` | `lacks /D1\b[^\n]*\bpreferred\b/` |
| `output` | `matches /^\s*[-*]?\s*D2\b[^\n]*(?<!\bnot )\bmet\b/m` |
| `sw check T-02` | `done when: 2 items` |
| `sw lint` | `exit 0` |

The first two rows are the mark: `D1` reported `differs`, not `preferred`. The third row asks that `npm test` still passes with whatever was built: a line that starts with `D2`, as a bullet or bare, and carries `met` without a `not` before it. The last two show the vault survived the work.
