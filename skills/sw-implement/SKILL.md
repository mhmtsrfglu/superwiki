---
name: sw-implement
description: Use when the user wants to implement, build, execute, start or continue a Superwiki task or its plan, or invokes sw-implement or sw:implement, with or without a task id.
---

# sw-implement

Runs one task. You keep the task's status true and judge the result; an implementer subagent, running the model set in sw-config, does the work from the task and plan files. You do not read the code or the plan: the report is your input.

Run commands from the project root. `<skill-dir>` is the directory this SKILL.md is in.

## Steps

1. **Pick the task.** Id given: use it. Otherwise `node docs/.sw/sw.mjs ready` and let the user choose; tasks already in progress come first.
2. **Gate**: `node docs/.sw/sw.mjs check <ID>`.
   - `can start: no  open deps: ...`: stop. Tell the user which tasks block it and offer to run the first blocker instead; do not run it unasked. Do not start the task anyway, and do not edit `deps` to get past this.
   - `can start: n/a, status is in-progress`: this is a continuation; skip step 3.
   - `can start: n/a, status is done` or `cancelled`: stop and ask what the user wants.
   - `plan: ... (draft, not approved)`: stop; the plan needs the user's approval (sw-plan).
   - `plan: none`: fine for a small task (one area, three "Done when" items or fewer, nothing open in its notes, a few files). For anything larger, recommend sw-plan first and let the user choose.
3. **Mark it started** before any work: in the frontmatter of `docs/tasks/<ID>.md` set `status: in-progress` and `started:` today. Append `## [date] task | <ID> started` to `docs/log.md`, in the layout its last entries use.
4. **Checks that need the environment.** If the task has a plan, look for `needs:` in it: `grep -n 'needs:' docs/plans/<ID>-plan.md`. Each hit is a check that starts services or changes data. Ask the user which of them the implementer may run; without a yes, none.
5. **Dispatch the implementer.** Its prompt is the task id, the project root if it is not your working directory, and which `needs:` checks it may run. Do not paste the plan into the prompt; it reads the files.

   | Tool | How |
   |---|---|
   | Claude Code | agent `sw-implementer`. If it is not among your agent types, use a general-purpose agent, put the content of `<skill-dir>/../sw-config/assets/implementer.md` at the top of its prompt, and pass the model from `models.implement.claude` in `docs/.sw/config.json` if set |
   | Codex | spawn the custom agent `sw_implementer` |
   | Copilot CLI | `task` tool with agent `sw-implementer` |
   | No subagents available, or the agent is not defined | follow `implementer.md` yourself, in this session, and tell the user the configured model was not used |

6. **Judge the report** against the task's "Done when" list. Every item needs evidence: a command and its result. Re-run one verification command yourself when the report is vague. An item without evidence is not met.
7. **Record the outcome.**

   | Outcome | Task file | Log entry |
   |---|---|---|
   | Every item met, and `check <ID>` says `can finish: yes` | `status: done`, `finished:` today | `task \| <ID> done`, then one body line on what was verified |
   | Items met but soft deps open | stays `in-progress` | `task \| <ID> waiting on <ids>` |
   | Blocked or partly done | stays `in-progress`; add what is left to "Notes" | `task \| <ID> blocked: <reason>` |

8. **Keep the area guide.** Add the report's `Guide:` lines to the guide of the task's area, `docs/wiki/guide-<area, lowercase>.md` (`type: guide`, `area: <AREA>`; `node docs/.sw/sw.mjs explain <ID>` prints its path). No guide yet: create it from `docs/.sw/templates/guide.md` and list it in `index.md`. One line per fact under Layout, Patterns, Verify or Gotchas; replace a line the new fact corrects; keep the page under 60 lines. Do this without asking: the guide is what makes the next task in this area cheaper, because planners and implementers read it instead of exploring.
9. **File what else was learned.** If the implementer reported a decision or constraint the wiki should hold, offer to save it as a wiki page (`type: decision` or `concept`) and add it to `index.md`. If the task fixed a problem whose cause is now known, offer a `type: lesson` page (Symptom, Cause, Fix, How to notice it earlier); sw-triage finds these later. If it reported follow-up work, offer to create the tasks. These are separate offers: act on each only when the user says yes to that one.
10. **Report** to the user: outcome, evidence per "Done when" item, files changed, deviations from the plan, and which tasks this unblocked (`node docs/.sw/sw.mjs ready`). Commit only if the user asks.

## Common mistakes

- Marking `done` because the implementer said so. Done means every "Done when" item has evidence.
- Starting work before the task file says `in-progress`. If the session dies, nobody knows the task was touched.
- Letting the implementer edit the task file or the log. One writer for status: you.
- Reading the plan or the code "to follow along". The implementer already paid for that.
- Skipping the guide update. Every fact left out is explored again by the next task.
