---
name: sw-verify
description: Use when a Superwiki task's work is finished and it has to be closed with evidence, when the user asks what a task did, what it changed or how it was verified, or invokes sw-verify with a task id. sw-implement runs it as the gate before `done`.
---

# sw-verify

Closes a task with a `## Summary` section in its task file: what was planned, what was built, what changed, and the evidence for each "Done when" item. `status: done` then means verified, and the task file says how.

One rule carries the skill: **no verdict without a command run in this session.** Name the command that proves the item, run it now, read its exit code and its output, then write the verdict. An earlier run, the implementer's report, a passing test you remember, or "should pass" is not evidence.

A second rule goes with it: **the command must be one that could have come out the other way.** For each item, say how its command would have failed if the item did not hold. A command that passes whatever the code does proves nothing.

It runs in the session that invokes it: by hand as `sw-verify <ID>`, or as a step of sw-implement. It is not handed to the implementer; the one who did the work does not also sign it off.

Run commands from the project root.

## Steps

1. **Read the task**: `docs/tasks/<ID>.md`. Its "Done when" items are `D1` to `D<n>` in the order they are written, n from the `done when:` line of `node docs/.sw/sw.mjs check <ID>`, which counts the top-level bullets; entry n of the verification list is `D<n>`. If the task has a plan, read only its `## Approach` and `## Verification`.
2. **Take the changes from git**, never from memory:
   - uncommitted work: `git status --porcelain`;
   - work already committed: `git log --name-status --format='%h %s' --grep='^<ID>:'`, the commits whose message starts with `<ID>:`;
   - the short HEAD for the source line: `git rev-parse --short HEAD`.

   List the files that belong to this task, without its bookkeeping (the task file, its plan, `docs/log.md`, `docs/index.md`, the area guide, a run's `docs/.sw/run.md`). Uncommitted work can sit next to other tasks' changes, so a file belongs to the task when it is both in `git status --porcelain` and in the "files changed" of this task's implementer reports, the first report and each fix round's. A session that ran several tasks holds other tasks' reports too; they do not count. Invoked by hand with no report in this session: the whole list, when the tree holds nothing else; otherwise ask the user which files belong to the task. No git repository, or the vault is ignored by git: say so in the section instead of listing files from recollection.
3. **Pick one command per "Done when" item.**

   | Where the command comes from | When |
   | --- | --- |
   | the plan's `## Verification` | the task has a plan |
   | the commands the implementer reported | no plan, and a report is in this session |
   | you choose it | otherwise, or the listed command does not prove the item |

   A requirement about text (a document mentions something, a file exists, a format is described) is proven by `grep`, `test -f` or `lint`, not by having written the text. A requirement about behaviour (what a program, an endpoint or an agent following a prompt does) is proven by running the thing and observing it: run the program, call the endpoint, or dispatch a fresh agent on the scenario and read what it does. Finding the code or text that should cause the behaviour proves only that the text is there; without a run the item is `unverified`. A check needs the environment when it starts a service, needs a running stack or changes data. It runs only if the user allowed it: under sw-implement the answer is on that skill's list of such checks; when you verify outside it, ask the user before you run one.

   For each command, write down how it would have failed if the item did not hold: the exit code, the missing line, the changed count. That is the item's `falsifies:` line, and it names the item's own rule, not "the test would fail". If you cannot write it, the command does not prove the item: choose another. When none can fail, the item is `unverified` in step 4.

   An item marked "(test)" is proven by a test. Take its `red:` line from the implementer's reports in this session, the first one's and each fix round's: the run in which that test failed before the code existed.
4. **Run every command now and read the result.** Exit code first, then the line that shows the item holds: the test count, the matching line, the `0 errors`.

   | What you have | Verdict |
   | --- | --- |
   | the command ran in this session, exited as expected, and its output shows the item | `verified` |
   | the command ran and shows the item does not hold | `failed` |
   | the command ran and passes, but no state of the thing it checks would have made it fail (see "Common mistakes") | `unverified`, reason `the command cannot fail` |
   | an item marked "(test)" has no `red:` line in the reports of this session, or the line says `none` | `unverified`, reason `no red: line` |
   | no command was run: a check that needs the environment and was not allowed, a difference from the item's wording that the user has not decided (run no command for it), nothing that can prove it, or only someone's word | `unverified`, with the reason |
   | the command proves part of the item | `unverified`, saying which part is open |

   Whenever the task has an item marked "(test)" or a Goal test (the implementer's `Goal test:` line), make one **mutation run** for the task's central rule, the rule its Goal states. Break that rule in the code on purpose: remove the line that enforces it, or invert its condition. Run the project's full test command, not one item's file, and read which tests went red: a marked item's test or the Goal test, in whichever file it lives. Then restore the code and run the command again until it is green. Save a copy of the file before you change it and restore from the copy, then compare the two; `git checkout` and `git restore` also drop the task's uncommitted work. Record what was removed, which test went red, and that it was restored: in the result of the marked item whose test went red, or, when the task has no marked item, on the `Tests:` line after the Goal test. Nothing went red: the tests do not hold the rule; the marked item whose rule it is, or every marked item when none is closer, is `unverified`, reason `the command cannot fail`, and a task with no marked item records `mutation: nothing went red` on the `Tests:` line. One run per task, not one per item. The run needs the same permission as the test it uses: a test command that needs the environment and was not allowed gets no mutation run.

   **Last, the guard run.** After every other command, including the mutation run, run the project's full guard. It is two commands, and both always run:
   - the project check: the whole-project test or build command its rules (`AGENTS.md` and the like) name, otherwise the full test command its build files define. The vault's `lint` is not this command. The project has neither: the check is `none defined`;
   - `node docs/.sw/sw.mjs lint`, since vault pages changed.

   Run the project check with no filter by test name, class, file or module: a filtered run leaves out what the item's tests do not reach, and can delete generated files. A project check that needs the environment and was not allowed is not run, and the guard line says so. Then read `git status --porcelain` again and compare it with the list of step 2:
   - a file shown as deleted that this task did not delete is unexpected: the item whose files or command touched it is `failed`, and its result names the file;
   - a modified or untracked file that step 2 did not account for goes under Changes. Accounted for are the files on its list, any task's bookkeeping, and another task's files, by that task's implementer report, its Summary's `### Changes` or the user's word;
   - a non-zero exit, or a failing test, makes the item it concerns `failed`.

   **Then the tests the task added**, for the two lines after the guard line. The task's tests are one test case per "(test)"-marked item and one for the Goal, none else; the hook `sw.mjs hook` refuses a surplus write while the task is in progress, and this count is its backstop for the writes it does not see. `Tests:` lists them from the implementer's reports in this session, the `test:` line of each marked item and the `Goal test:` line: `Tests: D<n> <file>::<case>; ...; Goal <file>::<case>`. The Goal test is due whenever the Goal names a behaviour the project's test command can exercise from a clean checkout, marked items or none; a task without one writes `Goal none, <the implementer's reason>` in its place (a text or document deliverable, or a check that needs the environment and was not allowed), and `Tests: Goal none, <reason>` is the whole line when there is no marked item either. `surplus:` lists every test case in the tree that is not on that line, taken from git, whoever wrote it and whenever: the added `test(`, `it(`, `def test_` (and the like) lines of `git diff HEAD` in test files, and every case in an untracked test file, each as `<file>::<case>`; `surplus: none` only when there is none. A case that predates the task but is uncommitted is listed, with `(not this task's)` after it when the session knows so; "it predates the task" or "it belongs to no task" is not a reason to leave it out, since the hook counted it against the task's allowance and the user reads the line to see what the tree holds. Both lines are always written. A surplus case is not a verdict on an item; it goes to the user with the summary, as something the rule did not allow.

5. **Write the section** in the format below. It is the last section of the file. If the file already has a `## Summary`, replace it whole; every verdict in the new one comes from this session. Leave the frontmatter and the other sections as they are.
6. **Log it**: append `## [date] summary | <ID> <verified> of <items> verified` to `docs/log.md`, in the layout its last entries use.
7. **Ask the gate**: `node docs/.sw/sw.mjs check <ID>`. It prints `summary:` with the counts, and `can finish: yes` only when every item is verified and no dependency is open.
8. **Close or hand back.**

   | Invoked | Do |
   | --- | --- |
   | from sw-implement | return to its next step; it records the outcome, and its report shows the summary, so step 9 is skipped |
   | by hand, and every item is verified, `check` says `can finish: yes`, and the task's `review:` is empty | set `status: done` and `finished:` today, append `## [date] task \| <ID> done` to the log, run `node docs/.sw/sw.mjs index` |
   | by hand, and the task requires a review | write the summary only; the status stays. Say that sw-implement runs the review |
   | by hand, and an item is unverified or failed | the status stays. Say what each open item needs |

9. **Report**, when invoked by hand: show the user the summary itself, not only its counts. In this order: what was planned, what was built and each deviation, the files changed, the verdict for each item with its command and how that command would have failed, the guard run with what `git status` showed after it, and whether the task can be closed. Say it in the language of the conversation; the section in the file stays as written.

## The section

```text
## Summary

Summarized <date>: <verified> of <items> verified.

### Plan
<the approach as planned, two to four lines>

### Implementation
<what was built; each deviation from the plan, or from the task's wording when there was no plan; or "No deviations.">

### Changes
- `path` (added | modified | deleted | renamed)

Source: `git status --porcelain` at <short HEAD>, matched against the implementer's reports.

### Verification
1. **verified**: <"Done when" item 1>
   - command: `<command>`
   - falsifies: <how this command would have failed if the item did not hold>
   - result: <exit code and the line that shows it>
2. **verified**: <item 2, marked "(test)", the one whose test went red in the mutation run>
   - command: `<command>`
   - falsifies: <how this command would have failed if the item did not hold>
   - red: <the implementer's line: the run in which the test failed before the code>
   - result: <exit code and the line that shows it>; mutation: <what was removed>; <the test that went red>; restored, green again
3. **unverified**: <item 3>
   - reason: <what it needs>
4. **unverified**: <item 4>
   - command: `<command>`
   - reason: the command cannot fail
5. **failed**: <item 5>
   - command: `<command>`
   - falsifies: <how this command would have failed if the item did not hold>
   - result: <exit code and the line that shows the failure>

Guard run: project check `<command>` (or `none defined`), exit <code>, <test count>; `node docs/.sw/sw.mjs lint`, exit <code>, <errors and warnings>. `git status --porcelain` after it: <as before | the differences>.
Tests: D2 `<file>::<case>`; D4 `<file>::<case>`; Goal `<file>::<case>`
surplus: none
```

- The four parts are always there, in this order.
- A task that had no plan: the Plan part reads `No plan: implemented directly from the task.`, followed, when sw-plan-implement wrote an Approach note in "Notes", by that note in one or two lines.
- An item rewritten after an accepted difference is a deviation, with or without a plan: name it under Implementation by its id, `D<n>` for a "Done when" item or `N<n>` for a note, with its old wording, both from the `- Changed <date>` line in the task's "Notes". When that line's reason begins `preferred:`, the item could have been built as worded: name the deviation as a preference, with the reason.
- "Verification" is a numbered list with one entry per "Done when" item, numbered as the items are: entry n is `D<n>`. Each entry starts with the verdict in bold: `verified`, `unverified` or `failed`. `check`, `lint` and the viewer read exactly that; an item without an entry counts as unverified.
- Every entry that names a command has a `falsifies:` line: the output that command would have given if the item did not hold, written for this item ("exit 1, no `status: done` line in the file"), not a general "the test would fail". An item with no command has a `reason:` instead.
- `red:` belongs to each item marked "(test)". `mutation:` is written once per task: in the result of the marked item whose test went red, or, when the task has no marked item and a Goal test, on the `Tests:` line after the Goal test.
- The Verification part ends with the guard line, after the numbered list. It is not an item and has no number. Its command is the last one you run to verify; steps 6 and 7 verify nothing. The reads of git that follow it, `git status --porcelain` for the guard line and the `git diff HEAD` and untracked files for `surplus:`, are not verification commands: they record what the tree holds and come after the guard.
- The `Tests:` and `surplus:` lines follow the guard line, both always, from step 4: the tests per marked item and for the Goal, by `D<n>` and `Goal`, from the implementer's reports, and, for a task with no marked item, the mutation run's result after the Goal test (`Tests: Goal <file>::<case>; mutation: <what was removed>; <the test that went red>; restored, green again`); and every other test case the task added, from git, or `none`.
- The source line says how the files were picked. Changes taken from commits: name the commits instead of `git status --porcelain`. Picked without reports: `the whole tree` or `chosen by the user` in place of `matched against the implementer's reports`.
- Keep the plan and implementation parts short. The section is a record, not a retelling of the log.

## Common mistakes

- Writing `verified` from the implementer's report. The report says where to look; the command you run says whether it is true.
- One `npm test` as the evidence for every item. Each item gets the command that shows that item; a suite proves only what its tests cover.
- "The file was written, so the item is met." Run the `grep` or `test -f`.
- Closing a behavioural item with `grep`. The line exists; whether anything follows it is what the item asks.
- Evidence that cannot fail passes the gate if you let it. Three shapes, each `unverified` with the reason `the command cannot fail` until a command can fail on the rule itself:
  - an assertion on a schema constraint: a test that a `NOT NULL` column holds a date passes whatever the code does, because the database enforces the constraint, not the code;
  - a test of what a mock returns: the assertion reads back the answer the test itself put in the stub, so the code under test is never reached;
  - a concurrency test whose threads are serialised before the lock: they run one after another whatever the lock does, so removing the lock leaves the test green.
- Ending on a filtered test run. The last command is the full guard run, then `git status --porcelain`; a filtered run can delete generated files and say nothing.
- Listing changed files from what you remember of the session. Git knows; ask it.
- Softening a `failed` or `unverified` into `verified` with a note. A note does not open the gate; the verdict does.
- Running a check that needs the environment and was not allowed, because the summary would otherwise stay incomplete. It stays incomplete, and the task stays open.
- Setting `done` by hand on a task that requires a review.
- Keeping parts of an old summary. Evidence from another session is not fresh.
