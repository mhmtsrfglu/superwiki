---
name: sw-autopilot
description: Use when the user wants several Superwiki tasks worked through one after another without being asked at each step (run the backlog, do all tasks of an area, keep going until done or blocked, act as orchestrator), or invokes sw-autopilot.
---

# sw-autopilot

Works through tasks in order, unattended, each one as the single-task skills run it. You are the orchestrator: subagents with clean contexts do the work; your session holds the queue, the reports and the decisions.

Run commands from the project root.

## The skills a run follows

Load each once and follow it for every task:

- **sw-plan-implement**: step 1's `check` table, steps 2 and 3 (the rubric, the `Route:` line) and step 4's medium route (the Approach note);
- **sw-plan**: steps 4 to 6 and "An agreed split", on the large route;
- **sw-implement**: steps 2 to 10 and "Dispatching";
- **sw-verify**: all of it, as sw-implement step 8 calls it.

This skill takes the place of their other steps.

## Before the first task

1. **Scope**, from the user's message: an area, a list of ids, or everything that becomes ready. An area is a task id prefix; `areas` in `docs/.sw/config.json` maps each prefix to its name, so "the backend area" is the prefix named Backend. Its tasks are the ids with that prefix that `node docs/.sw/sw.mjs ready` lists at the start, in its order; tasks that become ready later join only when the message asks for them. No prefix matches: ask, or, when questions are ruled out, stop and say so.
2. **Standing answers**, settled now, since the user will not be asked again:

   | Question | If the message does not answer it |
   | --- | --- |
   | May plans and proposed splits be approved without them? | yes |
   | Which checks that start a service, need a running stack or change data may run? | none |
   | Commit after each task? Push? | no commit, no push |
   | Go on with other tasks when one stops? | no; stop the run |

   A question is answered only where the message speaks to it: "finish them all" sets the scope and "don't ask me" rules out questions, and neither answers one; "don't commit" answers commit, not push. Ask for the open ones in one question. When the message rules out questions, ask nothing: write one line that starts `Standing answers:` and gives all four, the user's where given and the default otherwise, and start.
3. **Check that the run can do what was agreed**, before any task is touched:
   - `node docs/.sw/sw.mjs lint`: errors are fixed or reported first.
   - Commits were agreed: run one harmless git command. Refused by the project's settings or the tool: say so now, and neither start the run nor work around the refusal.
   - Changes in the working tree that belong to no task of this run: say what they are and ask once whether to leave them or commit them first. Questions ruled out: leave them.

## Each task

1. **Next task**: `node docs/.sw/sw.mjs ready`. A task in scope that is in progress comes first, then the first ready one in scope. None left: go to "The report".
2. **Gate**: sw-implement step 2, with sw-plan-implement's `check` table. A task whose plan is approved goes to step 5; one already in progress skips step 3.
3. **Mark it started** (sw-implement step 3), before routing.
4. **Route it** with sw-plan-implement's rubric, from the task file alone, and say sw-plan-implement step 3's `Route:` line; a standing answer is no waiver by the user. A draft plan means large.
   - Small: step 5.
   - Medium: the `Approach (sw-plan-implement, <date>):` note into "Notes", as sw-plan-implement writes it, unless one is there; then step 5.
   - Large: sw-plan steps 4 to 6; step 6 runs whole, so the plan is `approved`.
5. **Implement**: sw-implement steps 4 to 10, with the differences below. Step 10 keeps the area guide for every task.
6. **Close the task**, also one that stops the run:
   - `node docs/.sw/sw.mjs lint`. An error stops the run.
   - Commit, if agreed and the task is `done`: the files under its Summary's `### Changes` plus its bookkeeping (task file, plan, `docs/log.md`, `docs/index.md`, the area guide if changed), message `<ID>: <title>`. Push only if agreed. A refused commit or push stops the run.
7. **Check your own size**: `node docs/.sw/sw.mjs usage`, row `main`. A `peak` above 200k tokens stops the run here, between tasks.

### What differs in a run

| In the single-task skills | In a run |
| --- | --- |
| sw-implement step 2: a draft plan stops; a task that is not small and has no plan goes to the user | step 4's route decides |
| sw-plan step 5: the user sees the plan, answers its questions, approves it and any split | nothing is presented. Each question gets the assumed answer, unless the task file, a wiki page or a lesson says otherwise (`sw.mjs search`); the plan and any split are approved under the standing answer. A split's new task joins the queue only if it is in scope |
| sw-plan step 6: the answers go into "Notes"; the `plan` log entry | the answers go into "Notes" once, as decisions made without the user; the log entry gets the body line `Approved under the run's standing answer.` |
| sw-implement steps 4 and 6: the user allows checks that need the environment | the `Standing answers:` line is the first message's standing answer, its defaults included; no question |
| sw-implement step 6: a `differs` or `preferred` item is the user's call | one fix round, its entry the item in the task's wording |
| sw-implement steps 11 and 12: offers, and the report | offers, open decisions and open findings go into the run's report; the rest is in each task's Summary |

### Decisions made without the user

Every answer you give in the user's place, recorded where it was made:

- on a task (a planner question answered, a plan or split approved under the standing answer, a `differs` or `preferred` item sent back): in its "Notes" as `- <date>, decided without the user: ...`, and in the report with its id;
- for the run (each default in the `Standing answers:` line, working-tree changes left alone): in the report under `run` only. A check a default disallows adds no line.

## When to stop

A stop on a task fires once the task is closed (step 6), with its summary and outcome recorded; a summary with an `unverified` or `failed` item takes step 9's `blocked: <n> unverified, <m> failed` row. Then stop and report, also on the last task in scope. Take the next task instead only if agreed and independent of this one.

- A requirement is `not met`, or a fix round reports an entry `not fixed`. A `differs` or `preferred` item not fixed is a difference the user has not decided: `unverified` in the summary.
- The review after the second fix round still says `changes needed`.
- The summary leaves an item `failed` or `unverified`, also one whose check was not allowed: that stop too fires after the summary, never before the work, with the task built and reviewed where required.
- `lint` reports an error, or an agreed commit or push is refused.
- A large task, when plans may not be approved without the user: stop before its planner.
- Your `peak` is above 200k.

## Keeping the run cheap

- **A fresh subagent for every task and role.** Only a fix round continues one: the implementer of the same task.
- **Prompts exactly as sw-plan step 4 and sw-implement's "Dispatching" give them.** No reading lists, no project summary, no word on commits: the role files say changes stay uncommitted and committing is yours.
- **Reports, not files.** You read no other task's files, and code only as sw-verify's steps need it. Of a plan you read what sw-verify reads, `## Approach` and `## Verification`, and its frontmatter when sw-plan step 6 approves it.
- **Edit frontmatter with your edit tool**: a `sed` pattern that does not match fails silently.

## The report

At the end or on a stop:

1. A table, one row per task in scope (`not reached` for the rest): task, route, outcome, the last review verdict with the number of reviews, commit; `-` where none.
2. **Decisions made without the user**, one line each with the task id, or `run`.
3. What stopped the run, and what would let it continue: for a difference, the user's call on it, applied as sw-implement step 6 says; for a check not allowed, the user's yes; for a failed review, its blocking findings.
4. Offers, open decisions, and every review's `important` and `minor` findings.
5. `node docs/.sw/sw.mjs usage`, as printed.
6. What is ready next.
