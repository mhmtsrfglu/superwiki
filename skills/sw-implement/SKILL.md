---
name: sw-implement
description: Use when the user wants to implement, build, execute, start or continue a Superwiki task or its plan, or invokes sw-implement or sw:implement, with or without a task id.
---

# sw-implement

Runs one task. You keep the task's status true and judge the result. The work is done by subagents that start from a clean context, on the models set in sw-config: an implementer, and a reviewer when the task asks for one. You do not read the code or the plan: their reports are your input.

That split is what keeps a task cheap. A long session re-sends its whole context on every step; work done in a fresh context does not carry yours, and yours stays small because the work never enters it.

Run commands from the project root. `<skill-dir>` is the directory this SKILL.md is in.

## Steps

1. **Pick the task.** Id given: use it. Otherwise `node docs/.sw/sw.mjs ready` and let the user choose; tasks already in progress come first.
2. **Gate**: `node docs/.sw/sw.mjs check <ID>`.
   - `can start: no  open deps: ...`: stop. Tell the user which tasks block it and offer to run the first blocker instead; do not run it unasked. Do not start the task anyway, and do not edit `deps` to get past this.
   - `can start: n/a, status is in-progress`: this is a continuation; skip step 3.
   - `can start: n/a, status is done` or `cancelled`: stop and ask what the user wants.
   - `plan: ... (draft, not approved)`: stop; the plan needs the user's approval (sw-plan).
   - `plan: none`: fine for a small task (one area, three "Done when" items or fewer, nothing open in its notes, a few files). For anything larger, recommend sw-plan first and let the user choose.
   - `review: required (...)`: remember it for step 7.
3. **Mark it started** before any work: in the frontmatter of `docs/tasks/<ID>.md` set `status: in-progress` and `started:` today. Append `## [date] task | <ID> started` to `docs/log.md`, in the layout its last entries use.
4. **Checks that need the environment.** If the task has a plan, look for `needs:` in it: `grep -n 'needs:' docs/plans/<ID>-plan.md`. Each hit is a check that starts services or changes data. Ask the user which of them may run; without a yes, none.
5. **Dispatch the implementer** (how: "Dispatching" below). Its prompt is the task id, the project root if it is not your working directory, and which `needs:` checks it may run. Do not paste the plan into the prompt; it reads the files.
6. **Judge the report.** Its `Requirements:` list must name every "Done when" item and every scope, state or constraint item of the task; compare it with the task file.
   - `met` needs evidence: a command or test and its result. Re-run one verification command yourself when the evidence is vague.
   - `not met`, or missing from the list: the task is not done.
   - `differs`: the implementer built something other than what the task says. That is the user's call: show it and ask. Until they accept it, the item is not met.
7. **Review, if the task requires it.** Only when every requirement is met or accepted: dispatch the reviewer with the task id, the files the implementer changed, and which `needs:` checks it may run.
   - `Verdict: pass`: go on. Pass `important` and `minor` findings to the user in your report; they do not block.
   - `Verdict: changes needed`: dispatch the implementer again with the blocking findings, word for word, then the reviewer again with the files changed since. After two rounds that still end in `changes needed`, stop and put the findings to the user.
   - Do not review the change yourself in place of the reviewer, and do not argue a blocking finding away. If you think a finding is wrong, say so to the user and let them decide.
8. **Record the outcome.**

   | Outcome | Task file | Log entry |
   | --- | --- | --- |
   | Every requirement met or accepted, review passed where required, and `check <ID>` says `can finish: yes` | `status: done`, `finished:` today | `task \| <ID> done`, then one body line on what was verified and, where it ran, the review verdict |
   | Requirements met but soft deps open | stays `in-progress` | `task \| <ID> waiting on <ids>` |
   | Anything not met, unverified, not reviewed or awaiting the user's call | stays `in-progress`; add what is left to "Notes" | `task \| <ID> blocked: <reason>` |

9. **Keep the area guide, if the area has one.** `node docs/.sw/sw.mjs explain <ID>` prints `area guide:` with a path or `none`.
   - A guide exists: add the reports' `Guide:` lines to it, one line per fact under Layout, Patterns, Verify or Gotchas. Replace a line the new fact corrects, and keep the page under 60 lines.
   - No guide: do nothing. A guide is worth starting once several tasks in an area have needed the same facts; if the user asks for one, create `docs/wiki/guide-<area, lowercase>.md` from `docs/.sw/templates/guide.md` and list it in `index.md`.
10. **File what else was learned.** If a report held a decision or constraint the wiki should keep, offer to save it as a wiki page (`type: decision` or `concept`) and add it to `index.md`. If the task fixed a problem whose cause is now known, or the review caught a defect worth remembering, offer a `type: lesson` page (Symptom, Cause, Fix, How to notice it earlier); sw-triage finds these later. If a report named follow-up work, offer to create the tasks. These are separate offers: act on each only when the user says yes to that one.
11. **Report** to the user: outcome, each requirement with its evidence, the review verdict and findings, anything that differs from the task, files changed, and which tasks this unblocked (`node docs/.sw/sw.mjs ready`). Commit only if the user asks. End with one line: the task is recorded, so the next task is cheapest in a new session.

## Dispatching

The same table serves both roles: `sw-implementer` with `implementer.md`, `sw-reviewer` with `reviewer.md`, model from `models.implement` or `models.review`.

| Tool | How |
| --- | --- |
| Claude Code | the agent by name. If it is not among your agent types, use a general-purpose agent, tell it to read `<skill-dir>/../sw-config/assets/<role file>` first and follow it, and pass the model from `docs/.sw/config.json` (`models.<role>.claude`) if set |
| Codex | spawn the custom agent `sw_implementer` or `sw_reviewer` |
| Copilot CLI | `task` tool with the agent name |
| No subagents available, the agent is not defined, or the project's rules forbid subagents | follow the role file yourself, in this session, and tell the user the configured model and the clean context were not used. A review done this way is weaker: say so |

## Common mistakes

- Marking `done` because the implementer said so. Done means every requirement has evidence.
- Accepting a `differs` item on the user's behalf. A sensible alternative is still not what the task asked for.
- Skipping the review on a task that requires it, or doing it yourself in the same context that judged the implementation.
- Starting work before the task file says `in-progress`. If the session dies, nobody knows the task was touched.
- Letting a subagent edit the task file or the log. One writer for status: you.
- Reading the plan or the code "to follow along". The subagents already paid for that.
- Running the next task in the same session out of momentum.
