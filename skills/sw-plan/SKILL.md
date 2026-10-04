---
name: sw-plan
description: Use when the user wants to plan a task or a piece of work in a Superwiki project before building it, asks what to work on next, or invokes sw-plan or sw:plan, with or without a task id.
---

# sw-plan

Produces `docs/plans/<ID>-plan.md` for one task. You clarify with the user and get approval; a planner subagent, running the model set in sw-config, reads the code and writes the plan. Nothing but task and plan files changes during planning.

Needs the task module (`docs/tasks/`). If it is missing, say so and offer sw-init with `--tasks`. Run commands from the project root. `<skill-dir>` is the directory this SKILL.md is in.

## Steps

1. **Pick the task.**
   - Id given: `node docs/.sw/sw.mjs check <ID>`, then read `docs/tasks/<ID>.md`. Status `done` or `cancelled`: stop and ask what the user wants. A plan already exists: this run revises it; say so. Open deps do not prevent planning.
   - No id, existing work: `node docs/.sw/sw.mjs ready`, and let the user choose.
   - New work: agree on title, area and dependencies with the user, get the id from `node docs/.sw/sw.mjs next-id <AREA>`, and write `docs/tasks/<ID>.md` from `docs/.sw/templates/task.md` with `status: todo`, a "Goal" and a "Done when" list. Append `## [date] task | <ID> created` to `docs/log.md`.
2. **Clarify.** Ask the user only what the task file leaves open about scope or intent, one question at a time, each with your recommendation. Add the answers to the task's "Notes" now. Do not read code to find questions; the planner surfaces the technical ones in step 5. Skip this when nothing is open.
3. **Enter plan mode** if this tool gives you a way to (Claude Code: `EnterPlanMode`). Otherwise continue. From here on you change no file until step 6.
4. **Dispatch the planner.** Its prompt is: the task id, today's date, the project root if it is not your working directory, and any feedback from an earlier round. Do not read the code yourself; that is the planner's job and its context, not yours.

   | Tool | How |
   |---|---|
   | Claude Code | agent `sw-planner`. If it is not among your agent types, use the read-only `Plan` agent, put the content of `<skill-dir>/../sw-config/assets/planner.md` at the top of its prompt, and pass the model from `models.plan.claude` in `docs/.sw/config.json` if set |
   | Codex | spawn the custom agent `sw_planner` |
   | Copilot CLI | `task` tool with agent `sw-planner` |
   | No subagents available, or the agent is not defined | follow `planner.md` yourself, in this session, and tell the user the configured model was not used |

5. **Show the plan and get approval.** Present the approach, the steps and the planner's notes (Claude Code: through `ExitPlanMode`; anywhere else, as a normal message). The planner returns the plan, then a line `=== notes ===`, then its notes.
   - Open questions in the notes: ask them, each with the planner's assumed answer as your recommendation. If an answer differs from what the plan assumed, dispatch the planner again with the answers.
   - The user wants changes: dispatch the planner again with their feedback.
   - The planner says the work needs splitting: propose the tasks; create them (step 1, "New work") only when the user agrees.
6. **Write**, after approval:
   - `docs/plans/<ID>-plan.md`: the text before `=== notes ===`, unchanged. If something in it is wrong, send it back to the planner; do not edit it yourself.
   - answers given in step 5: add to the task's "Notes".
   - `docs/log.md`: append `## [date] plan | <ID>`, in the layout the log's last entries use.

   Then run `node docs/.sw/sw.mjs lint`.
7. **Stop.** Do not start implementing. Tell the user the plan is saved and that sw-implement `<ID>` runs it.

## Common mistakes

- Exploring the codebase before dispatching. You pay for it twice.
- Writing the plan file before approval.
- Setting the task to `in-progress`. Planning does not change status.
- Planning several tasks in one plan file. One task, one plan; shared design goes to a `type: decision` wiki page that the plans link.
