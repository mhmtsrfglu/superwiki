---
name: plan
description: Use when the user wants to plan a task or a piece of work in a Superwiki project before building it, asks what to work on next, or invokes sw:plan, with or without a task id.
---

# sw:plan

Produces `docs/plans/<ID>-plan.md` for one task. You clarify with the user and get approval; a planner subagent, running the model set in sw:config, reads the code and writes the plan file. You never read the code and never hold the plan text: that is what keeps planning cheap.

Needs the task module (`docs/tasks/`). If it is missing, say so and offer sw:init with `--tasks`. Run commands from the project root. `<skill-dir>` is the directory this SKILL.md is in; the planner's role file, `planner.md`, is `<skill-dir>/assets/planner.md`.

The plan is a file under `docs/plans/`, and a task is a file under `docs/tasks/`. When the host's plan mode, a memory tool or a rule of the host keeps this session from writing under `docs/` or from running the shell (a plan mode that holds its plan in the host's own memory or session folder is such a case), stop before the first write: name the obstacle to the user, ask them to lift it (leave plan mode, allow the writes, give the session a shell), and wait. A plan kept anywhere but `docs/plans/<ID>-plan.md` is not the plan: do not present it as one and do not record an approval of it.

## Steps

1. **Pick the task.**
   - Id given: `node docs/.sw/sw.mjs check <ID>`, then read `docs/tasks/<ID>.md`. Status `done` or `cancelled`: stop and ask what the user wants. A plan already exists: this run revises it; say so. Open deps do not prevent planning.
   - No id, existing work: `node docs/.sw/sw.mjs ready`, and let the user choose.
   - New work: agree on title, area and dependencies with the user, and get the id from `node docs/.sw/sw.mjs next-id <AREA>`. Then:
     - write `docs/tasks/<ID>.md` from `docs/.sw/templates/task.md` with `status: todo`, a "Goal" and a "Done when" list;
     - append `## [date] task | <ID> created` to `docs/log.md`;
     - run `node docs/.sw/sw.mjs index`, so the task list in `index.md` shows it.
2. **Does it need a plan?** Called from sw:plan-implement: the route is already chosen; skip this step. Otherwise judge by this rule, word for word as sw:plan-implement and sw:implement state it:

   A task is small when its task file alone shows all four: one area, meaning its work belongs to the configured area its id prefix names and to no other (`areas` in `docs/.sw/config.json`; with one configured area, every task is in one area); three "Done when" items or fewer, as the `done when:` line of `node docs/.sw/sw.mjs check <ID>` counts them; nothing left open in its "Notes"; and the files that change, named in the task file, three or fewer. A task whose file does not show how many files change is medium at least, never small.

   A small task needs no plan: say so and offer `sw:implement <ID>` directly. Go on with planning only if the user wants a plan anyway, or the task is not small.
3. **Clarify.** Ask the user only what the task file leaves open about scope or intent, one question at a time, each with your recommendation. Add the answers to the task's "Notes" now. Do not read code to find questions; the planner surfaces the technical ones. Skip this when nothing is open.
4. **Dispatch the planner.** Its prompt is: the task id, today's date, the project root if it is not your working directory, and, from the second round on, what the user's reply changed: the answers that differ from the ones the plan assumed, the feedback, the ids of the tasks a split created, or `split declined`. It writes the plan file as a draft and returns a short message.

   A second round goes to the planner that wrote the draft where the tool can continue it (a further message to that agent), otherwise to a fresh one.

   The agent is the one sw:config wrote for the host, named `sw-planner` (`sw_planner` in Codex), carrying `planner.md` and the model set under `models.plan`. Where the host's documentation does not say how a session runs a named custom agent, the row says so: ask for the agent by name, and if nothing runs it, take the last row.

   | Tool | How |
   | --- | --- |
   | Claude Code | agent `sw-planner`. If it is not among your agent types, use a general-purpose agent, tell it to read `planner.md` first and follow it, and pass the model from `models.plan.claude` in `docs/.sw/config.json` if set |
   | Codex | the custom agent `sw_planner`, from `.codex/agents/sw-planner.toml`. Codex spawns agents with its multi-agent tools (`spawn_agent` and the rest, on by default); whether a spawn can name a custom agent is not documented, so ask for `sw_planner` by name in the spawn, and if the spawned agent is not it, the last row |
   | Copilot CLI | the custom agent `sw-planner`, from `.github/agents/sw-planner.agent.md`. The CLI delegates to a subagent that runs a custom agent when the model chooses to; the tool it delegates with is not documented, so ask for the `sw-planner` agent by name in the prompt, and if no subagent runs it, the last row |
   | VS Code Copilot Chat | the same file, `.github/agents/sw-planner.agent.md`. An agent delegates with the `agent` tool to the agents its `agents` list names; how a plain chat session names one is not documented, so ask for the `sw-planner` agent by name, and if the delegation does not run it, the last row |
   | No subagents available, or the agent is not defined | follow `planner.md` yourself, in this session, and tell the user the configured model was not used |

5. **Present the plan and get approval.** Show the user, in a normal message, the planner's `Approach`, its `Questions` (each with the assumed answer as your recommendation), its `Split`, and the path of the plan file so they can read it. Plan mode is not used: a reply can need files written before the plan is shown again. Read the plan file into your own context only if the user asks you about its content.

   Handle the reply in this order:
   1. The user agrees to a split: carry it out first, as "An agreed split" below says.
   2. An answer differs from the one the plan assumed, the user wants changes, or the user declines a split: dispatch the planner again (step 4) with all of it in one prompt, and with the ids of any tasks the split created. Then present the revised plan the same way and wait for the reply again.
   3. The user accepts the plan as presented, with nothing left to change: that is the approval; go to step 6. A split agreed in the same reply needs no second round, since the plan already covers only the items that stay.
   4. The user drops the plan: delete the draft file and stop. Tasks a split already created stay; say so.

   Called from sw:plan-implement, every presentation up to the approval belongs to its one planned stop.
6. **Record**, after approval:
   - in the plan file, change `status: draft` to `status: approved`: read only its frontmatter (the first lines, up to the closing `---`) and change that line with your edit tool;
   - in the task's "Done when", the mark: end each item that `Marks:` in the planner's latest return quotes with " (test)", unless it already ends so. Only that return counts, and `Marks: none` marks nothing;
   - in the task's "Notes", the answers given in step 5, each with its question;
   - in the area guide, if `node docs/.sw/sw.mjs explain <ID>` names one, the planner's `Guide:` lines, one line per fact;
   - in `docs/log.md`, a new entry `## [date] plan | <ID>`, in the layout the log's last entries use.

   Then run `node docs/.sw/sw.mjs lint`. If it reports `stale-board`, a task's title, milestone or dependencies changed along the way: run `node docs/.sw/sw.mjs index`.
7. **Stop.** Do not start implementing. Tell the user the plan is approved and that sw:implement `<ID>` runs it. Called from sw:plan-implement: return to it; it continues with sw:implement.

## An agreed split

The planner's `Split:` names, per new task, its title, its dependencies and the "Done when" items of `<ID>` it takes over, by their `D<n>` ids (`D<n>` is the n-th "Done when" item, as the `done when:` line of `node docs/.sw/sw.mjs check <ID>` counts them). Once the user agrees:

1. For each new task:
   - its id from `node docs/.sw/sw.mjs next-id <AREA>`, where `<AREA>` is the id prefix of `<ID>` (`T` for `T-11`);
   - `docs/tasks/<NEW>.md` from `docs/.sw/templates/task.md`, without the template's comment: `status: todo`; the title and `deps` the `Split:` line names; `review:`, `milestone:` and `priority:` copied from `<ID>`; `soft_deps:` empty; a "Goal" of one or two lines drawn from the items it takes over; under "Done when" those items, word for word; under "Sources" every link of `<ID>`'s "Sources"; in "Notes" `- Split from [[<ID>]] on <date>.`, then a copy of every note of `<ID>` and every answer the user gave in this round, with its question, so that the new task is later planned on them;
   - in `docs/log.md`, `## [date] task | <NEW> created`.
2. In `docs/tasks/<ID>.md`: remove the moved items from "Done when"; add to `deps` each new task the `Split:` line says `<ID>` must wait for; add to the end of "Notes" `- Split <date>: D<n>, ... moved to [[<NEW>]].`, with the ids the items had before the split, one line per new task.
3. Run `node docs/.sw/sw.mjs index`.

## Common mistakes

- Planning a small task. The plan costs more than the work.
- Exploring the codebase before dispatching, or reading the plan back. You pay for it twice.
- Editing the plan yourself. If something in it is wrong, send it back to the planner.
- Presenting a plan the host's plan mode wrote into its own memory or session folder as the plan. The plan is the file in `docs/plans/`; without it there is nothing to approve.
- Setting the task to `in-progress`. Planning does not change status; only sw:autopilot marks a task started before planning it.
- Creating the tasks of a proposed split before the user agrees to it.
- Approving a revised plan the user has not been shown.
- Planning several tasks in one plan file. One task, one plan; shared design goes to a `type: decision` wiki page that the plans link.
- Adding the new task to the list in `index.md` by hand. `index` writes that list from the task files.
