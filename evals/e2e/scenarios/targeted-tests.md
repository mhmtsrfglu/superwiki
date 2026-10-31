# One test per behaviour, the third write refused

The user's session runs `sw-plan-implement` on T-02 under the `targeted-tests` overlay: four items in one area, nothing open, so the rubric says small and no plan. Two items are marked "(test)", the third, the quoting of a comma or a double quote, is not, and the fourth is `npm test`. The implementer's rule allows three test cases, one per marked item and one that exercises the Goal end to end. The fixture's T-01 is in progress too, with one marked item, and adds two to the allowance, five in all. The overlay also leaves `test/scratch.test.mjs` in the copy, uncommitted, with three stray cases from before the task: `prepare` commits the fixture and lays the overlay over it afterwards, so the file is untracked, and the hook counts its cases toward the allowance, which leaves two. `prepare` registered the vault's hook in the copy's `.claude/settings.json` through `sw-init`, so the implementer's write of its three cases is refused, with the Write tool or a shell heredoc alike, with a message that names the rule, and it has to adapt: fold a case, or remove the stray one, which the hook allows. The task reaches `done` with two item tests and a Goal test, the summary's `Tests:` line names them, and its `surplus:` line names the stray cases when they are still in the tree (they are uncommitted, whoever wrote them) or is `none` when the implementer removed them. A session whose implementer is never refused, or that closes the task with a surplus of its own, fails.

Task: T-02
Skill: plan-implement
Overlays: targeted-tests
Budget: 12

## Run

1. `node evals/e2e/e2e.mjs prepare targeted-tests --to <scratch>/targeted-tests-<n>`, into a scratch directory outside the repository. The copy then holds `test/scratch.test.mjs` untracked (`git status --short` shows `?? test/`).
2. Sonnet agents: in the repository root, `node skills/sw-config/scripts/config.mjs model implement claude sonnet --root <scratch>/targeted-tests-<n>` and the same with `review`; then `node skills/sw-config/scripts/config.mjs sync --root <scratch>/targeted-tests-<n> --tools claude`. The copy's agent files now carry `model: sonnet`; the main session runs at the account's default model.
3. `node evals/e2e/e2e.mjs run targeted-tests <scratch>/targeted-tests-<n> --report <scratch>/targeted-tests-<n>.txt`. It starts `claude -p` in the copy with the printed prompt and saves what the session said.
4. `node evals/e2e/e2e.mjs check targeted-tests <scratch>/targeted-tests-<n> <scratch>/targeted-tests-<n>.txt`.
5. `node docs/.sw/sw.mjs usage` in the copy, for the agents the session used and their tokens.

One run; the result is `check`'s verdict with the model and the cost `run` printed.

The stray cases force the refusal: with three cases already counted against an allowance of five (three for T-02, two for the fixture's T-01, in progress with one marked item), two are left, and an implementer that writes its three cases at once, or two and then one, is refused at least once. The `events` row asks for that refusal; the `surplus:` row accepts both ways out, the stray cases kept and named, or removed; one row cannot tie the two to the file's presence, so a summary that says `none` while the file is still there passes the row and is read by hand from the copy.

## Prompt

```text
/sw-plan-implement T-02
```

## Pass

| check | expect |
| --- | --- |
| `events` | `matches /^hook: PreToolUse:\S+ hook error: .*one test per behaviour/im` |
| `file docs/tasks/T-02.md` | `matches /^status: done$/m` |
| `file docs/tasks/T-02.md` | `matches /^Tests: D1 [^;]+; D2 [^;]+; Goal /m` |
| `file docs/tasks/T-02.md` | `matches /^surplus: (none\|[^\n]*scratch\.test\.mjs[^\n]*)$/m` |
| `sw check T-02` | `done when: 4 items` |
| `sw lint` | `exit 0` |

The first row is the refusal: the hook's message, in the implementer's turn, in the session's events. The next three show the task closed under the rule: `done`, the summary's tests named per marked item and for the Goal, and in git nothing beyond them but the stray cases, named, or nothing at all. The last two show the task file kept its items and the vault survived the run.
