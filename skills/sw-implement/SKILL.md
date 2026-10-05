---
name: sw-implement
description: Use when the user wants to implement, build, execute, start or continue a Superwiki task or its plan, or invokes sw-implement or sw:implement, with or without a task id.
---

# sw-implement

Runs one task. You keep the task's status true and judge the result. The work is done by subagents that start from a clean context, on the models set in sw-config: an implementer, and a reviewer when the task asks for one. You do not read the code or the plan: their reports are your input. Before the task is closed you summarize it yourself, with a command run for every "Done when" item.

That split is what keeps a task cheap. A long session sends its whole context again on every step; work done in a fresh context does not carry yours, and yours stays small because the work never enters it.

Run commands from the project root. `<skill-dir>` is the directory this SKILL.md is in.

## Steps

1. **Pick the task.** Id given: use it. Otherwise `node docs/.sw/sw.mjs ready` and let the user choose; tasks already in progress come first.
2. **Gate**: `node docs/.sw/sw.mjs check <ID>`.

   | `check` says | Do |
   | --- | --- |
   | `can start: no  open deps: ...` | stop. Tell the user which tasks block it and offer to run the first blocker instead; do not run it unasked. Do not start the task anyway, and do not edit `deps` to get past this |
   | `can start: n/a, status is in-progress` | this is a continuation; skip step 3 |
   | `can start: n/a, status is done` or `cancelled` | stop and ask what the user wants |
   | `plan: ... (draft, not approved)` | stop; the plan needs the user's approval (sw-plan) |
   | `plan: none` | fine for a small task: one area, three "Done when" items or fewer, nothing open in its notes, a few files. Also fine when the task's "Notes" hold an `Approach (sw-do, ...)` note: sw-do chose the medium route. For anything else, recommend sw-plan first and let the user choose |
   | `review: required (...)` | remember it for step 7 |
   | `can finish: no` and `summary: none` | expected before the work: the summary is written in step 8 |

3. **Mark it started** before any work:
   - in the frontmatter of `docs/tasks/<ID>.md`, `status: in-progress` and `started:` today;
   - in `docs/log.md`, a new entry `## [date] task | <ID> started`, in the layout its last entries use;
   - `node docs/.sw/sw.mjs board`, so the task list in `index.md` shows it.
4. **Checks that need the environment.** A check needs the environment when it starts a service, needs a running stack or changes data. Keep one list of them, each `allowed` or `not allowed`; it holds for the implementer, the reviewer and your own summary.
   - With a plan: each hit of `grep -n 'needs:' docs/plans/<ID>-plan.md` is such a check. Ask the user which may run; without a yes a check is `not allowed`.
   - Without a plan the list starts empty; step 6 fills it.
5. **Dispatch the implementer**: the first row under "Dispatching".
6. **Judge the report.** Its `Requirements:` list must name every "Done when" item and every scope, state or constraint item of the task; compare it with the task file.
   - `met` needs evidence: a command or test and its result. You do not re-run it here; step 8 runs a command for every item.
   - `built, not verified`: the item's only check needs the environment and was not allowed. Ask the user once, in one question, whether each such check not yet answered may run, and add the answers to the list. Then go on either way, with no new implementer: the reviewer and your summary run what is allowed, and a check that cannot run leaves its item `unverified` in the summary and the task `in-progress`.
   - `differs`: the item could not be built as worded. That is the user's call: show it and ask.
     - Accepted: rewrite that "Done when" item in the task file to what was built, and add to "Notes" `- Changed <date>, accepted by the user: item <n> was "<old wording>"; reason: <why>.` (`<n>`: its position under "Done when"). The reviewer and the summary then read one wording.
     - Not accepted: a fix round whose entry is the item in the task's wording.
   - `not met`, or missing from the list: the task is not done.

   A fix round's report marks each entry `fixed` or `not fixed`. A `not fixed` entry goes to the user with the implementer's reason. Unless they accept what stands, no review is spent on it: go to step 8.
7. **Review, if the task requires it.** It starts when every requirement is `met`, `built, not verified` or accepted: the review row under "Dispatching".
   - `Verdict: pass`: go on. Pass `important` and `minor` findings to the user in your report; they do not block.
   - `Verdict: changes needed`: a fix round with the blocking findings, then the review row again, with those findings under `Recheck:`; one that comes back `still open` is blocking. After two such rounds that still end in `changes needed`, stop and put the findings to the user.
   - Do not review the change yourself in place of the reviewer, and do not argue a blocking finding away. If you think a finding is wrong, say so to the user and let them decide.
8. **Summarize.** Follow sw-summarize for the task, yourself, in this session: it runs one command per "Done when" item, writes the `## Summary` section into the task file and appends the `summary` log entry. This step is not optional and is not delegated to the implementer. Run it whenever the implementer's work is in, also when an item is not met: the summary then records what is open. It does not set the status; step 9 does.
9. **Record the outcome**, then run `node docs/.sw/sw.mjs board`.

   | Outcome | Task file | Log entry, after the `summary` entry |
   | --- | --- | --- |
   | No requirement `not met`, every `differs` item accepted, review passed where required, and `check <ID>` says `can finish: yes` (every item in the summary is `verified`) | `status: done`, `finished:` today | `task \| <ID> done`, then one body line with the summary's count and, where it ran, the review verdict |
   | Requirements met and verified but soft deps open | stays `in-progress` | `task \| <ID> waiting on <ids>` |
   | The summary holds an `unverified` or `failed` item | stays `in-progress`; add to "Notes" what each open item needs | `task \| <ID> blocked: <n> unverified, <m> failed` |
   | Anything else not met, not reviewed or awaiting the user's call | stays `in-progress`; add what is left to "Notes" | `task \| <ID> blocked: <reason>` |

10. **Keep the area guide, if the area has one.** `node docs/.sw/sw.mjs explain <ID>` prints `area guide:` with a path or `none`.
    - A guide exists: add the reports' `Guide:` lines to it, one line per fact under Layout, Patterns, Verify or Gotchas. Replace a line the new fact corrects, and keep the page under 60 lines.
    - No guide: do nothing. A guide is worth starting once several tasks in an area have needed the same facts; if the user asks for one, create `docs/wiki/guide-<area, lowercase>.md` from `docs/.sw/templates/guide.md` and list it in `index.md`.
11. **File what else was learned.** These are separate offers: act on each only when the user says yes to that one.
    - A report held a decision or constraint the wiki should keep: offer a wiki page (`type: decision` or `concept`), added to `index.md`.
    - The task fixed a problem whose cause is now known, or the review caught a defect worth remembering: offer a `type: lesson` page (Symptom, Cause, Fix, How to notice it earlier); sw-triage finds these later.
    - A report named follow-up work, or the review left `important` findings open: offer to create the tasks. A finding that lives only in the log is forgotten.
12. **Report** to the user, in this order. Commit only if the user asks.
    - the outcome;
    - what was planned, and what was built with each deviation from the plan, as the Summary's Plan and Implementation parts say it;
    - each "Done when" item with its verdict and command, taken from the Summary, and each item rewritten after an accepted difference, with its old wording;
    - the review verdict and its findings, and the implementer's open decisions;
    - the files changed, as the Summary lists them;
    - the tasks this unblocked (`node docs/.sw/sw.mjs ready`);
    - what the task cost: run `node docs/.sw/sw.mjs stats` and show its table as printed;
    - one last line: the task is recorded, so the next task is cheapest in a new session.

## Dispatching

What each dispatch gets:

| Dispatch | Goes to | Prompt |
| --- | --- | --- |
| implementer | a fresh implementer | `<ID>`; `Checks:` |
| fix round | the implementer that did the work where the tool can continue it (a further message to that agent), otherwise a fresh one | first line `Fix round for <ID>:`, then each entry word for word; `Checks:` |
| review | a fresh reviewer, every time | `<ID>`; `Files:`, every file the task has changed (the implementer's list plus each fix round's); `Checks:`; from the second review on `Recheck:`, the previous review's blocking findings word for word |

`Checks:` is the list of step 4, one line per check, `- <check>: allowed` or `- <check>: not allowed`; leave the block out while the list is empty. Every prompt names the project root if it is not your working directory.

How to dispatch is the same for both roles: `sw-implementer` with `implementer.md`, `sw-reviewer` with `reviewer.md`, model from `models.implement` or `models.review`.

| Tool | How |
| --- | --- |
| Claude Code | the agent by name. If it is not among your agent types, use a general-purpose agent, tell it to read `<skill-dir>/../sw-config/assets/<role file>` first and follow it, and pass the model from `docs/.sw/config.json` (`models.<role>.claude`) if set |
| Codex | spawn the custom agent `sw_implementer` or `sw_reviewer` |
| Copilot CLI | `task` tool with the agent name |
| No subagents available, the agent is not defined, or the project's rules forbid subagents | follow the role file yourself, in this session, and tell the user the configured model and the clean context were not used. A review done this way is weaker: say so |

## Common mistakes

- Marking `done`, or writing `verified`, from the implementer's report. The report is a claim; the check is the summary's commands, run in this session.
- Accepting a `differs` item on the user's behalf. A sensible alternative is still not what the task asked for.
- Giving a later review only the files the fix touched. A finding in an untouched file is then never rechecked.
- Letting a subagent edit the task file, the log or the task list. One writer for status and for the summary: you.
- Reading the plan or the code "to follow along". The subagents already paid for that; the summary reads only the plan's approach and verification.
