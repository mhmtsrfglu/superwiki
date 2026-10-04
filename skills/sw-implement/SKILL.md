---
name: sw-implement
description: Use when the user wants to implement, build, execute, start or continue a Superwiki task or its plan, or invokes sw-implement or sw:implement, with or without a task id.
---

# sw-implement

Runs one task. You keep the task's status true and judge the result; an implementer subagent, running the model set in sw-config, does the work from the task and plan files.

Run commands from the project root. `<skill-dir>` is the directory this SKILL.md is in.

## Steps

1. **Pick the task.** Id given: use it. Otherwise `node docs/.sw/sw.mjs ready` and let the user choose; tasks already in progress come first.
2. **Gate**: `node docs/.sw/sw.mjs check <ID>`.
   - `can start: no  open deps: ...`: stop. Tell the user which tasks block it and offer to run the first blocker instead; do not run it unasked. Do not start the task anyway, and do not edit `deps` to get past this.
   - `can start: n/a, status is in-progress`: this is a continuation; skip step 3.
   - `can start: n/a, status is done` or `cancelled`: stop and ask what the user wants.
   - `plan: none`: say so. Small tasks can run from "Goal" and "Done when"; for anything larger, recommend sw-plan first and let the user choose.
3. **Mark it started** before any work: in the frontmatter of `docs/tasks/<ID>.md` set `status: in-progress` and `started:` today. Append `## [date] task | <ID> started` to `docs/log.md`, in the layout its last entries use.
4. **Dispatch the implementer.** Its prompt is the task id, plus the project root if it is not your working directory. Do not paste the plan into the prompt; it reads the files.

   | Tool | How |
   |---|---|
   | Claude Code | agent `sw-implementer`. If it is not among your agent types, use a general-purpose agent, put the content of `<skill-dir>/../sw-config/assets/implementer.md` at the top of its prompt, and pass the model from `models.implement.claude` in `docs/.sw/config.json` if set |
   | Codex | spawn the custom agent `sw_implementer` |
   | Copilot CLI | `task` tool with agent `sw-implementer` |
   | No subagents available, or the agent is not defined | follow `implementer.md` yourself, in this session, and tell the user the configured model was not used |

5. **Judge the report** against the task's "Done when" list. Every item needs evidence: a command and its result. Re-run a verification command yourself when the report is vague. An item without evidence is not met.
6. **Record the outcome.**

   | Outcome | Task file | Log entry |
   |---|---|---|
   | Every item met, and `check <ID>` says `can finish: yes` | `status: done`, `finished:` today | `task \| <ID> done`, then one body line on what was verified |
   | Items met but soft deps open | stays `in-progress` | `task \| <ID> waiting on <ids>` |
   | Blocked or partly done | stays `in-progress`; add what is left to "Notes" | `task \| <ID> blocked: <reason>` |

7. **File what was learned.** If the implementer reported a decision or constraint the wiki should hold, offer to save it as a wiki page (`type: decision` or `concept`) and add it to `index.md`. If the task fixed a problem whose cause is now known, offer a `type: lesson` page (Symptom, Cause, Fix, How to notice it earlier); sw-triage finds these later. If it reported follow-up work, offer to create the tasks. These are separate offers: act on each only when the user says yes to that one.
8. **Report** to the user: outcome, evidence per "Done when" item, files changed, deviations from the plan, and which tasks this unblocked (`node docs/.sw/sw.mjs ready`). Commit only if the user asks.

## Common mistakes

- Marking `done` because the implementer said so. Done means every "Done when" item has evidence.
- Starting work before the task file says `in-progress`. If the session dies, nobody knows the task was touched.
- Letting the implementer edit the task file or the log. One writer for status: you.
