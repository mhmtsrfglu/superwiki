---
name: review
description: Use when the user asks for a task's implementation or change to be reviewed, or wants a second pair of eyes on it, without implementing anything, or invokes sw:review with a task id.
---

# sw:review

Has one task's change reviewed by the reviewer role, on request and on a task of any status. It changes no file and no status: the review is a report, and what follows it is the user's call. The one file it may write is a follow-up task, on a `done` task with blocking findings, after the user says yes.

It defines no role and repeats no review rule: the reviewer is `reviewer.md`, dispatched as sw:implement's review row dispatches it. Run commands from the project root. `<skill-dir>` is the directory this SKILL.md is in.

## Steps

1. **Pick the task.** Id given: `node docs/.sw/sw.mjs check <ID>`, then read `docs/tasks/<ID>.md`. No id: ask which task, offering the tasks `in-progress` and the most recently `done` ones from `node docs/.sw/sw.mjs status`. Any status is reviewable; a blocked or `done` task is no reason to stop.
2. **Find the files.** A `done` task: the files its `## Summary` lists under "Changes". Otherwise the files the user names; without any, `git status --porcelain` and the files the task file names. Show the list and ask when it is empty: a review with no files reviews nothing.
3. **Checks that need the environment.** As sw:implement step 4: each `needs:` in the plan, if there is one, and any check the user names; ask which may run, unless a standing answer in the user's first message already says. Without a yes a check is `not allowed`.
4. **Dispatch the reviewer**: the review row of sw:implement's "Dispatching", to a fresh reviewer by its "How to dispatch" table, with `<ID>`, `Files:` from step 2 and `Checks:` from step 3. `Recheck:` only when the user hands over the findings of an earlier review, word for word. Do not review the change yourself in place of the reviewer, and do not fix anything it finds.
5. **Report** the verdict, the claims, each finding with its severity and the `Not checked:` list as the reviewer gives them, in the user's language, then the next step:
   - a task `in-progress` or `todo`: the blocking findings are entries for sw:implement's fix round; say so and stop;
   - a task `done` with blocking findings: offer one follow-up task. Create it only on yes, as sw:plan step 1 creates new work: id from `node docs/.sw/sw.mjs next-id <AREA>`, file from `docs/.sw/templates/task.md` with a "Goal" that links `[[<ID>]]` and the findings as its "Done when" items, `## [date] task | <NEW> created` appended to `docs/log.md`, then `node docs/.sw/sw.mjs index`;
   - a defect worth remembering: offer a `type: lesson` page, as sw:implement step 11 does, and write it only on yes.

   Nothing else is written: not the task's status, not its file, not the log, not the task list.
