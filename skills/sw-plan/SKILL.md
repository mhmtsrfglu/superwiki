---
name: sw-plan
description: Use when the user wants to plan a task or a piece of work in a Superwiki project before building it, asks what to work on next, or invokes sw-plan or sw:plan, with or without a task id.
---

# sw-plan

Produces `docs/plans/<ID>-plan.md` for one task. You clarify with the user and get approval; a planner subagent, running the model set in sw-config, reads the code and writes the plan file. You never read the code and never hold the plan text: that is what keeps planning cheap.

Needs the task module (`docs/tasks/`). If it is missing, say so and offer sw-init with `--tasks`. Run commands from the project root. `<skill-dir>` is the directory this SKILL.md is in.

## Steps

1. **Pick the task.**
   - Id given: `node docs/.sw/sw.mjs check <ID>`, then read `docs/tasks/<ID>.md`. Status `done` or `cancelled`: stop and ask what the user wants. A plan already exists: this run revises it; say so. Open deps do not prevent planning.
   - No id, existing work: `node docs/.sw/sw.mjs ready`, and let the user choose.
   - New work: agree on title, area and dependencies with the user, get the id from `node docs/.sw/sw.mjs next-id <AREA>`, and write `docs/tasks/<ID>.md` from `docs/.sw/templates/task.md` with `status: todo`, a "Goal" and a "Done when" list. Append `## [date] task | <ID> created` to `docs/log.md`.
2. **Does it need a plan?** Judge from the task file alone. A task is small when all of these hold: one area, three "Done when" items or fewer, nothing left open in its notes, and the change it describes is confined to a few files. A small task needs no plan: say so and offer `sw-implement <ID>` directly. Go on with planning only if the user wants a plan anyway, or the task is not small.
3. **Clarify.** Ask the user only what the task file leaves open about scope or intent, one question at a time, each with your recommendation. Add the answers to the task's "Notes" now. Do not read code to find questions; the planner surfaces the technical ones. Skip this when nothing is open.
4. **Dispatch the planner.** Its prompt is: the task id, today's date, the project root if it is not your working directory, and any feedback from an earlier round. It writes the plan file as a draft and returns a short message.

   | Tool | How |
   | --- | --- |
   | Claude Code | agent `sw-planner`. If it is not among your agent types, use a general-purpose agent, tell it to read `<skill-dir>/../sw-config/assets/planner.md` first and follow it, and pass the model from `models.plan.claude` in `docs/.sw/config.json` if set |
   | Codex | spawn the custom agent `sw_planner` |
   | Copilot CLI | `task` tool with agent `sw-planner` |
   | No subagents available, or the agent is not defined | follow `planner.md` yourself, in this session, and tell the user the configured model was not used |

5. **Get approval.** Show the user the planner's `Approach`, its `Questions` (each with the assumed answer as your recommendation) and its `Split`, and name the plan file so they can read it. Do not read the plan file into your own context unless the user asks you about its content. (Claude Code: enter plan mode with `EnterPlanMode` now and present through `ExitPlanMode`, if those tools are available; anywhere else, a normal message.)
   - An answer differs from what the plan assumed, or the user wants changes: dispatch the planner again with the answers or feedback; it revises the file.
   - The planner proposes a split: create the tasks (step 1, "New work") only when the user agrees.
   - The user drops the plan: delete the draft file.
6. **Record**, after approval:
   - in the plan file, change `status: draft` to `status: approved`;
   - in the task's "Notes", the answers given in step 5;
   - in the area guide, if `node docs/.sw/sw.mjs explain <ID>` names one, the planner's `Guide:` lines, one line per fact;
   - in `docs/log.md`, a new entry `## [date] plan | <ID>`, in the layout the log's last entries use.

   Then run `node docs/.sw/sw.mjs lint`.
7. **Stop.** Do not start implementing. Tell the user the plan is approved and that sw-implement `<ID>` runs it.

## Common mistakes

- Planning a small task. The plan costs more than the work.
- Exploring the codebase before dispatching, or reading the plan back. You pay for it twice.
- Editing the plan yourself. If something in it is wrong, send it back to the planner.
- Setting the task to `in-progress`. Planning does not change status.
- Planning several tasks in one plan file. One task, one plan; shared design goes to a `type: decision` wiki page that the plans link.
