---
name: sw-explain
description: Use when the user asks what a Superwiki task is, why it exists, what it depends on, what it blocks or what changes once it is done, or invokes sw-explain or sw:explain with a task id.
---

# sw-explain

Explains one task so that someone who has not followed the project understands it. Changes no file.

Run commands from the project root.

## Steps

1. `node docs/.sw/sw.mjs explain <ID>`. It prints the task's state, what it depends on, what it blocks, what becomes ready when it is done, its plan and the wiki pages it links, each with a one-line summary. No id given: ask which task, offering the ones from `node docs/.sw/sw.mjs ready`.

   The state is derived: `ready` is a `todo` task whose dependencies are done, `blocked` is a `todo` task still waiting on one, `progress` is `in-progress`. Say it in words, not as a label.
2. Read `docs/tasks/<ID>.md`.
3. Read more only when the answer needs it:
   - the plan's `## Approach` section, if the user will want to know how it is to be done;
   - one linked page, if the task's "Goal" does not itself say why the task exists: a `decision` page if there is one, otherwise the page whose summary is closest to the goal;
   - nothing else. Summaries from step 1 stand in for the other pages.
4. **Answer in the user's language**, in this order, one to a few sentences each:
   - **What**: the task in plain words, without restating its title.
   - **Why**: the reason it exists and the decision or source behind it, as `[[page]]`. If neither the task nor the page you read gives a reason, say the brain does not record one.
   - **Depends on**: each dependency with its state. A dependency listed under "depends on" must be done before the task can start; one under "soft depends on" lets it start but must be done before it can finish.
   - **Blocks**: the tasks waiting on it, and which of them become ready the moment it is done.
   - **What changes when it is done**: for the product or the user, from "Done when", and for the project, from what it unblocks.
   - **Where it stands**: state, dates, whether a plan exists, and the next step. Ready or in progress: `sw-implement <ID>` (or `sw-plan <ID>` first if there is no plan and the task is not small). Blocked: name the tasks to finish first; planning it meanwhile with `sw-plan <ID>` is allowed.

Leave out a heading that has nothing to say rather than writing "none" under each. If the task file is thin (no "Goal", no "Done when"), say that this is all the brain records; do not fill the gap with guesses from the code.
