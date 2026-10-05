---
name: sw-run
description: Use when the user wants several Superwiki tasks worked through one after another without being asked at each step (run the backlog, do all tasks of an area, keep going until done or blocked, act as orchestrator), or invokes sw-run or sw:run.
---

# sw-run

Works through tasks in order, unattended: for each one, plan it if it needs a plan, implement it, have it reviewed if it requires that, summarize it with evidence, record it, and go on to the next. You are the orchestrator. Every piece of work goes to a subagent with a clean context; your session holds only the queue, the reports and the decisions.

Each task is run exactly as sw-implement runs it. This skill adds what a run of many needs: answers agreed once at the start, decisions you make in the user's place and write down, and rules for when to stop.

Run commands from the project root.

## Before the first task

1. **Scope.** Which tasks: an area, a list of ids, or everything that becomes ready. Take it from the user's message. Default order is the order of `node docs/.sw/sw.mjs ready`.
2. **Standing answers.** The user will not be asked again, so these are settled now. Ask only for the ones their message leaves open, in one question:

   | Question | If the user does not say |
   | --- | --- |
   | May plans be approved without them? | yes; that is what unattended means |
   | Which `needs:` checks (starting services, changing data) may run? | none |
   | Commit after each task? Push? | no commit, no push |
   | Go on with other tasks when one stops? | no; stop the run |

3. **Check that the run can do what was agreed**, before any task is touched:
   - `node docs/.sw/sw.mjs lint`: errors are fixed or reported first.
   - Commits were agreed: run one harmless git command. If the project's settings or the tool refuse git, say so now. Do not start a run whose terms cannot be met, and do not look for another way to run the refused command.
   - The working tree holds changes that belong to no task of this run: say what they are and ask once whether to leave them or commit them first.
4. **A clean session per task.** You cannot open a new session; a fresh subagent per role is the clean context. If the user asked for sessions, say this is how it is done.

## Each task

1. **Next task**: `node docs/.sw/sw.mjs ready`. A task in progress comes first, then the first ready task in scope. None left: go to "The report".
2. **Run it as sw-implement does**: gate, mark it started, checks that need the environment, implementer, judge the report, review if required, summarize (sw-summarize, a command run for every "Done when" item), record, task list. Load sw-implement and sw-summarize once and follow it for every task. What differs in a run:

   | In sw-implement or sw-plan | In a run |
   | --- | --- |
   | a task that is not small: "recommend sw-plan and let the user choose" | plan it. Mark the task started first, then dispatch the planner as sw-plan step 4 says |
   | the planner's `Questions` go to the user | answer each with the planner's assumed answer, unless the task file, a wiki page or a recorded lesson says otherwise (`node docs/.sw/sw.mjs search <words>`). Write every answer into the task's "Notes" as `decided without the user: ...` |
   | the plan waits for approval | approve it, if that was agreed, with a log entry that says it was approved under the run's standing answer |
   | a `differs` item is the user's call | send it back to the implementer once with the task's wording. Still differs: stop |
   | offers after a task (wiki pages, lessons, follow-up tasks) | do not ask and do not act. List them in the report |

3. **Close the task.** Commit, if agreed: only the files this task changed, message `<ID>: <title>`. Push only if agreed. A refused commit or push stops the run.
4. **Check your own size**: `node docs/.sw/sw.mjs stats`, row `main`. If its `peak` is above 200k tokens, stop here, between tasks: every further step would pay for all of it. Tell the user to start a new session and run sw-run again; the queue is in the files, so nothing is lost.

## When to stop

Stop the run, leave the task `in-progress` with what is open in its "Notes", and report. Do not skip the task and take the next one unless that was agreed and the next task does not depend on it.

- A requirement is `not met` or still `differs` after one more round with the implementer.
- The review still says `changes needed` after two rounds.
- The summary leaves an item unverified or failed.
- The task cannot be verified without a `needs:` check that was not allowed.
- A commit or push that was agreed is refused.
- `lint` reports an error after the task was recorded.
- Your `peak` is above 200k (this one is between tasks, with nothing left open).

## Keeping the run cheap

A run pays for the orchestrator's context once per step, for every task. What keeps it small:

- **A fresh subagent for every task and every role.** Never continue the agent that planned or implemented the previous task.
- **Prompts as the role files ask**: task id, date, project root, the checks it may run, the standing answers that concern it. No reading lists and no project summary; each role knows what to read.
- **Reports, not files.** Do not read code, plans or the other tasks' files. `ready`, `check` and `explain` answer what you need about the queue.
- **One load of each skill.** Do not load a skill again to re-read it.
- **Edit frontmatter with your edit tool**, not with `sed` or another text substitution: a pattern that does not match fails silently and the status is then wrong without an error.

## The report

At the end, or when the run stops:

1. A table: task, outcome, review verdict, commit.
2. **Decisions made without the user**, one line each with the task id. This is the list the user must read.
3. What stopped the run, if it stopped, and what would let it continue.
4. Offers and open findings collected along the way.
5. `node docs/.sw/sw.mjs stats`, as printed.
6. What is ready next.

## Common mistakes

- Asking the user mid-run something the standing answers cover, or not asking at the start something they do not.
- Deciding a `needs:` check may run because the run is unattended. Unattended means fewer questions, not more permission.
- Piling several tasks into one uncommitted tree after a commit was refused.
- Running one long subagent that plans, implements and reviews a task. Measured on a real project, such an agent reached a context of almost a million tokens and sent over ten times what the three separate roles sent on another task of the same project.
- Carrying on past 200k because the next task looks small.
