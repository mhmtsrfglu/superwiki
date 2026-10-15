---
name: sw-autopilot
description: Use when the user wants several Superwiki tasks worked through one after another without being asked at each step (run the backlog, do all tasks of an area, keep going until done or blocked, act as orchestrator, continue a run), or invokes sw-autopilot.
---

# sw-autopilot

Works through tasks in order, unattended, each one as the single-task skills run it. You are the orchestrator: subagents with clean contexts do the work; your session holds the queue, the reports and the decisions. Like a car's autopilot, the run knows its route before it engages, and hands back the wheel when it lacks the data.

Run commands from the project root. A message that continues a run starts at "Continuing a run".

## The skills a run follows

Load each once and follow it for every task:

- **sw-plan-implement**: step 1's `check` table, steps 2 and 3 (the rubric, the `Route:` line) and step 4's medium route (the Approach note);
- **sw-plan**: steps 4 to 6 and "An agreed split", on the large route;
- **sw-implement**: steps 2 to 10 and "Dispatching";
- **sw-verify**: all of it, as sw-implement step 8 calls it.

This skill takes the place of their other steps.

## Before the first task

1. **Scope**, from the user's message: an area, a list of ids, or everything that becomes ready. An area is a task id prefix; `areas` in `docs/.sw/config.json` maps each prefix to its name, so "the backend area" is the prefix named Backend. Its tasks are the ids with that prefix that `node docs/.sw/sw.mjs ready` lists at the start, in its order; tasks that become ready later join only when the message asks for them. No prefix matches: that is a question for step 4's message.
2. **Standing answers**, settled now and asked never. Each has a default; the user's message overrides a default only where it speaks to that question, and nothing else does: "don't commit" answers commit, not push; "finish them all" sets the scope and answers none; "don't ask me" rules out questions and answers none, so the run still stops when a task stops.

   | Question | Default |
   | --- | --- |
   | May plans and proposed splits be approved by the run? | yes |
   | May checks that start a service or need a local stack run? | yes, allowed |
   | May checks that change data run? | no, not allowed |
   | Commit after each task? | yes, each `done` task, message `<ID>: <title>` |
   | Push? | no |
   | Go on with other tasks when one stops? | no; stop the run |

   The answers are said in one line that starts `Standing answers:` and gives all six. That line is a message to the user, written as given, word for word, in this shape, each default kept where the message gave no answer and the user's answer in its place where it did (`commit each done task: no`):

   `Standing answers: plans and splits approved by the run: yes; checks that start a service or need a local stack: allowed; checks that change data: not allowed; commit each done task: yes, as <ID>: <title>; push: no; when a task stops: stop the run.`

   It is the first line of step 4's message, on its own line, before any task is touched. Settling the answers in your reasoning, reporting them in other words, or listing the defaults only in the report does not replace it, since a reader of the session finds the answers by those words; the run file and the report repeat the line.
3. **Check that the run can do what was agreed**, without changing anything:
   - `node docs/.sw/sw.mjs lint`: an error is a point for step 4's message, since the vault is not changed before it.
   - Commits are agreed: run one harmless git command. Refused by the project's settings or the tool: say so in step 4's message, and neither start the run nor work around the refusal.
   - `git status`: changes in the working tree that are neither a task of this run's (the files its Summary lists, its bookkeeping) nor the run file are a point for step 4's message: whether to leave them or commit them first.
4. **Readiness check**, the one place the run asks. Read, for every task in scope: its task file, the pages its "Sources" link, the area guide `node docs/.sw/sw.mjs explain <ID>` names, and the vault's `decision` pages on its subject: one call per task, `node docs/.sw/sw.mjs search <the task's title, whole>`, then, of the hits under `docs/wiki/`, those whose frontmatter says `type: decision`; no other search. Read no code and no plan file: the technical points are the planner's and the implementer's, raised mid-run.

   List every point that needs a decision. Before the first task those are only what the task files and the message show without a planner:
   - every `Open:` line in a task's "Notes";
   - every "Done when" item whose check changes data, deletes a file or pushes, by the item's own words: it names a database, a store or a service beyond the project that the check writes to, a file to delete, or a push. An item whose check starts the project's own server or needs a local stack is not one;
   - every point the message leaves ambiguous: a scope that matches nothing, an answer it half gives;
   - a request, in the message or in a task, that contradicts a `decision` page;
   - step 3's findings: a lint error, a refused git command, changes in the tree that belong to no task.

   It lists nothing else: a "Done when" item that leaves a design choice open is the planner's or the implementer's to raise. Judge each point by "Points that need a decision" below.

   **Then say the readiness message**, as text in your output. It is:
   - first line: the `Standing answers:` line of step 2;
   - then the settled points, one per line: `- <ID>: <decision>; settled by <source>` (the source as "Points that need a decision" names it);
   - then the questions for the user, one per line, each with the task id and what the run would need; or, with no question, exactly `Nothing left to ask: the run starts.` on its own line.

   With a question left, the message stands alone and the run waits for the answer: no file changed, no subagent started. With none, step 5 writes the run file, and the first task's `Route:` line ("Each task" step 3) follows the message, with only that file and the `ready` and `check` commands of steps 1 and 2 between them, and the run goes on without waiting. The message is said before anything is touched: a task file edited or a subagent started before it is the run started without its readiness check.
5. **The run file**, `docs/.sw/run.md` in Superwiki's folder, written once no question is left or the user has answered them, before any task is touched. It holds what the task files do not, in this shape, and never a task's status, which lives in the task's frontmatter:

   ```markdown
   ---
   type: run
   started: <date>
   scope: <the ids in order, as `T-02, T-03`; `, and what becomes ready` added when such tasks join>
   ---

   ## Decisions made without the user

   <the `Standing answers:` line as said>
   <the readiness message's close as said: `Nothing left to ask: the run starts.`, or each question with the user's answer>
   - <ID or run>: <decision>; settled by <source>
   ```

   Later decisions are appended ("Each task" step 6); "The report" item 2 prints the section; a new session continues from the file ("Continuing a run").

## Points that need a decision

One rule judges every point, before the first task and mid-run:

- **Settled by the sources**: the task's Goal, "Done when" or "Notes", a page read in the readiness check (a linked page, the area guide, a `decision` page), or a lesson `node docs/.sw/sw.mjs search` finds, answers it. The run decides as the source says, and writes the decision with its source, as "Decisions made without the user" says. The source is named as `the task file (Goal)`, `the task file (D<n>)`, `the task file (N<n>)` or `[[page]]`; a plan or split approved under a standing answer names `the standing answer`.
- **Settled by nothing**: that is a critical question, and it goes to the user. The run never takes the answer a planner or an implementer assumed as its own, adds no requirement to a task, and neither widens nor narrows a task's Goal: an answer the sources do not give is not invented, however sensible. Before the first task the question is in the readiness message; mid-run it closes the task, as "Decisions made without the user" says, and the run stops.
- **Never settled from the sources**, whatever they say: a push, a check that changes data, deleting a file, and a request that contradicts a `decision` page. Each goes to the user in every case. A check changes data when it writes to a database, a store or a service that outlives it, beyond the working tree.

A point mid-run is a planner's question (sw-plan step 5), a `differs` item or a `not fixed` entry (sw-implement step 6), a proposed split, or a `needs:` check that changes data (sw-implement step 4). A `preferred` item is never one: the task file settles it, as "What differs in a run" says, where each point is judged.

A line the run writes into "Notes" while the task runs (`decided without the user`, `goes to the user`) is a record, like a `Changed` line: it asks for nothing, a report that lists it marks it `n/a`, and a report written before the line was added is complete without it.

## Each task

1. **Next task**: `node docs/.sw/sw.mjs ready`. A task in scope that is in progress comes first, then the first ready one in scope. None left: go to "The report".
2. **Gate**: sw-implement step 2, with sw-plan-implement's `check` table. A task whose plan is approved goes to step 5.
3. **Route it** with sw-plan-implement's rubric, from the task file and the readiness check's settled points: an `Open:` note the readiness check settled is not "a question left open". Say sw-plan-implement step 3's `Route:` line, written as given there, word for word, on its own line in your output; the route in the report's table does not replace it. For a session's first task the readiness message, or a continuing session's `Standing answers:` line, stands above this line. A standing answer is no waiver by the user. A draft plan means large.
4. **Mark it started**, unless it already is: first the readiness check's settled points for this task into its "Notes", as "Decisions made without the user" says, and on the medium route the `Approach (sw-plan-implement, <date>):` note, as sw-plan-implement step 4 writes it, unless one is there; then sw-implement step 3 whole, every part of it. Then follow the route:
   - Small and medium: step 5.
   - Large: sw-plan steps 4 to 6; step 6 runs whole, so the plan is `approved`. A planner's question that nothing settles closes the task instead, under "Decisions made without the user".
5. **Implement**: sw-implement steps 4 to 10, with the differences below. Every task gets the review of step 7, `review:` set or not. Step 10 keeps the area guide for every task.
6. **Close the task**, also one that stops the run:
   - Append the task's decisions made without the user, not its questions, to the run file's section, as its shape shows.
   - `node docs/.sw/sw.mjs lint`. An error stops the run.
   - Commit, if agreed and the task is `done`: the files under its Summary's `### Changes` plus its bookkeeping (task file, plan, `docs/log.md`, `docs/index.md`, the area guide if changed, `docs/.sw/run.md`), message `<ID>: <title>`. Push only if agreed. A refused commit or push stops the run.
7. **Check your own size**: `node docs/.sw/sw.mjs usage`, row `main`. A `peak` above the limit stops the run here, between tasks; a new session continues from the run file. The limit is `autopilot.peak` in `docs/.sw/config.json`, in tokens, set with sw-config's `peak` command; 200000 when absent.

### What differs in a run

| In the single-task skills | In a run |
| --- | --- |
| sw-implement step 2: a draft plan stops; a task that is not small and has no plan goes to the user | step 3's route decides |
| sw-plan step 5: the user sees the plan, answers its questions, approves it and any split | nothing is presented. Each question of the planner is judged by "Points that need a decision": one the sources settle gets their answer, and when that answer differs from the one the plan assumed, the planner gets a second round (sw-plan step 4) with it; one nothing settles closes the task, and the run stops. With every question settled the plan is approved under the standing answer. A split is approved under the standing answer when it only moves the task's own "Done when" items to new tasks, as "An agreed split" does; one that adds or drops work is a point nothing settles. A split's new task joins the queue only if it is in scope |
| sw-plan step 6: the answers go into "Notes"; the `plan` log entry | the answers go into "Notes" once, as decisions made without the user, each with its source; the log entry gets the body line `Approved under the run's standing answer.` |
| sw-implement steps 4 and 6: the user allows checks that need the environment | the `Standing answers:` line is the standing answer in the user's first message that sw-implement step 4 means, its defaults included: a check that starts a service or needs a local stack is `allowed`, one that changes data is `not allowed` and, found in a plan's `needs:` line or an implementer's report, a point that goes to the user: the task closes and the run stops. No question |
| sw-implement step 6: a `differs` or `preferred` item is the user's call | the mark stands as the report gives it: the run sees no code, re-marks nothing, and reads no difference into an item the report marks `met` (its check in sw-verify decides that item). `preferred`: the task file settles it, by `the task file (D<n>)`: one fix round, its entry `D<n>: <the item, word for word as the task words it>`, and the implementer rebuilds it. `differs`: settled only by the Goal, and only where the Goal states, in its own sentences, the behaviour the report says was built; a Goal that implies it, or says nothing of it, settles nothing. The Goal states it: accept the difference as sw-implement step 6 does for an accepted item, with `accepted by the run` in place of `accepted by the user` and `settled by the task file (Goal)` at the end of the `Changed` line, which is the item's only record. Otherwise the item goes to the user. A `not fixed` entry is a point nothing settles |
| sw-implement step 7: review if the task requires it | every task is reviewed by a fresh reviewer, `review:` set or not, with the review row of "Dispatching", once every requirement is `met`, `n/a`, `built, not verified` or accepted, as step 7 starts it; a task with an item that goes to the user gets no review, as step 6 says, and goes to step 8. The stop after a second fix round that still ends in `changes needed` stays |
| sw-implement steps 11 and 12: offers, and the report | offers, open decisions and open findings go into the run's report; the rest is in each task's Summary |

### Decisions made without the user

Every answer you give in the user's place is recorded where it was made, with the source that settled it:

- on a task (a point of the readiness check, a planner's question, a plan or split approved, a `preferred` item sent back): in its "Notes" as `- <date>, decided without the user: <decision>; settled by <source>.`, the source as "Points that need a decision" names it, and, at close, in the run file with the task's id. A `differs` item accepted has its `Changed` line as its only record in "Notes", and its line in the run file. A plan approved gets one such line, `plan approved; settled by the standing answer`, with the planner's questions and their answers in it where there were any, and a split approved one more. A decision on an `Open:` note goes under that note, as its sub-bullet, so the note reads as settled; every other one is a top-level bullet at the end of "Notes";
- a point mid-run that nothing settles: in the task's "Notes" as `- <date>, goes to the user: <question>; asked by <the planner | the implementer, D<n> differs | the fix round, D<n> not fixed>; settled by none of the sources.` Then the task closes and the run stops. A planner's question, or a `needs:` check in the plan that changes data, comes before any work: no implementer is dispatched, the plan stays `draft`, and the task takes sw-implement step 9's last row, `task | <ID> blocked: a question for the user`. An implementer's item comes after the work: sw-implement step 8 runs, the item is `unverified` in the summary, and the task takes step 9's `blocked: <n> unverified, <m> failed` row. In both cases "Each task" step 6 closes it;
- for the run: the `Standing answers:` line, in the run file and the report as it was said, is the record of every default and of every check a standing answer allowed or disallowed; neither gets a line of its own. A `run` line is written only for another decision of the run: the harmless git command of step 3, when commits are agreed and it ran (`git status` is a read and gets no line), and working-tree changes left alone as the user said.

## Continuing a run

A message that asks to continue the run, or names no scope while `docs/.sw/run.md` exists, continues that file's run; without the file, say so and stop. A message that names a scope starts a new run; step 5 replaces the file.

Scope, standing answers and the readiness check's points are the file's; the check is not repeated. Read the file; your next message, before any further tool call, is its `Standing answers:` line as recorded, on its own line: a sentence that promises it, or the line in the report alone, is not that message. Then step 3 of "Before the first task", whose findings are questions said under that line, on which the run waits; with none, "Each task" follows, step 1 giving the next task in the recorded scope. A closed task (`check <ID>` says so) has its files under its Summary's `### Changes`, there and in sw-verify's account.

## When to stop

A stop on a task fires once the task is closed (step 6), with its summary and outcome recorded where the work was done; a summary with an `unverified` or `failed` item takes step 9's `blocked: <n> unverified, <m> failed` row. Then stop and report, also on the last task in scope. Take the next task instead only if agreed and independent of this one.

- A point mid-run that nothing settles (a planner's question, a `differs` item, a split that changes the work, a check that changes data, a `not fixed` entry), closed as "Decisions made without the user" says.
- A requirement is `not met`.
- The review after the second fix round still says `changes needed`.
- The summary leaves an item `failed` or `unverified`, also one whose check was not allowed: after the summary, never before the work.
- `lint` reports an error, or an agreed commit or push is refused.
- A large task, when the user's message says plans are not approved by the run: stop before its planner.
- Your `peak` is above the limit of "Each task" step 7.

## Keeping the run cheap

- **A fresh subagent for every task and role.** Only a fix round continues one: the implementer of the same task.
- **Prompts exactly as sw-plan step 4 and sw-implement's "Dispatching" give them.** No reading lists, no project summary, no word on commits: the role files say changes stay uncommitted and committing is yours.
- **Reports, not files.** Beyond the current task's file and area guide, the readiness check and a closed task's `### Changes` you read no task's files, and code only as sw-verify's steps need it. Of a plan you read what sw-verify reads, `## Approach` and `## Verification`, and its frontmatter when sw-plan step 6 approves it.
- **Edit frontmatter with your edit tool**: a `sed` pattern that does not match fails silently.

## The report

At the end or on a stop:

1. A table, one row per task in scope (`not reached` for the rest; a task an earlier session closed: its status as outcome, `-` elsewhere): task, route, outcome, the last review verdict with the number of reviews and the reviewer's agent type (`pass, 1 review by sw-reviewer`), commit; `-` where none.
2. **Decisions made without the user**: the run file's section, copied as it stands, earlier sessions' lines included, under this heading word for word: not reworded to address the user or shortened, since a reader of the report finds the decisions by those words.
3. What stopped the run, and what would let it continue: for a question nothing settled, the question as the task's "Notes" hold it and the user's answer, applied as the single-task skill says (sw-plan step 5 for a planner's, sw-implement step 6 for an item's); for a check that changes data, the user's yes; for a failed review, its blocking findings; for your size, a new session that continues the run. A session that leaves nothing in scope to do says `Nothing stopped the run.`
4. Offers, open decisions, and every review's `important` and `minor` findings.
5. `node docs/.sw/sw.mjs usage`, as printed.
6. What is ready next.
