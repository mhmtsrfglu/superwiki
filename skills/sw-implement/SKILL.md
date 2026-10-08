---
name: sw-implement
description: Use when the user wants to implement, build, execute, start or continue a Superwiki task or its plan, or invokes sw-implement, with or without a task id.
---

# sw-implement

Runs one task. You keep the task's status true and judge the result. The work is done by subagents that start from a clean context, on the models set in sw-config: an implementer, and a reviewer when the task asks for one. You do not read the code or the plan: their reports are your input. Before the task is closed you verify it yourself, with a command run for every "Done when" item.

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
   | `plan: none` | fine for a small task, by the rule below this table. Also fine when the task's "Notes" hold an `Approach (sw-plan-implement, ...)` note: sw-plan-implement chose the medium route. For anything else, recommend sw-plan first and let the user choose |
   | `review: required (...)` | remember it for step 7 |
   | `can finish: no` and `summary: none` | expected before the work: the summary is written in step 8 |

   The rule for a small task, word for word as sw-plan-implement and sw-plan state it:

   A task is small when its task file alone shows all four: one area, meaning its work belongs to the configured area its id prefix names and to no other (`areas` in `docs/.sw/config.json`; with one configured area, every task is in one area); three "Done when" items or fewer, as the `done when:` line of `node docs/.sw/sw.mjs check <ID>` counts them; nothing left open in its "Notes"; and the files that change, named in the task file, three or fewer. A task whose file does not show how many files change is medium at least, never small.

3. **Mark it started** before any work. The status lives in the task file, under `docs/`. When the host's plan mode, a memory tool or a rule of the host keeps this session from writing under `docs/` or from running the shell, stop here, before the status changes: name the obstacle to the user, ask them to lift it (leave plan mode, allow the writes, give the session a shell), and wait; do not do the task's work in the meantime. Then:
   - in the frontmatter of `docs/tasks/<ID>.md`, `status: in-progress` and `started:` today;
   - in `docs/log.md`, a new entry `## [date] task | <ID> started`, in the layout its last entries use;
   - `node docs/.sw/sw.mjs index`, so the task list in `index.md` shows it.
4. **Checks that need the environment.** A check needs the environment when it starts a service, needs a running stack or changes data. Keep one list of them, each `allowed` or `not allowed`; it holds for the implementer, the reviewer and your own summary.
   - With a plan: each hit of `grep -n 'needs:' docs/plans/<ID>-plan.md` is such a check. Ask the user which may run; without a yes a check is `not allowed`.
   - Without a plan the list starts empty; step 6 fills it.
   - The question is asked also when the plan's approval was waived: a waiver of approval says nothing about checks. Only a standing answer in the user's first message ("the dev server may run", "none may run") replaces it, here and in step 6; a first message that gives none leaves the question to ask.
5. **Dispatch the implementer**: the first row under "Dispatching".
6. **Judge the report.** Its `Requirements:` list must name every requirement of the task by the id every role derives from position: `D1` to `D<n>` for the "Done when" items, n from the `done when:` line of step 2's `check`, and `N1` to `N<m>` for the top-level bullets of "Notes", in order. Compare it with the task file.
   - `n/a` is for a note that asks for nothing: a record or a piece of evidence, or a line the skills write about the task's course, which is an `Approach (sw-plan-implement, ...)` note (its work is the requirements it orders) or a `Route:`, `Split` or `Changed` line. An answer the user gave, or one assumed for them, asks for something when it bears on a "Done when" item of the task: it is met when the work follows it, shown by that item's check; an answer that bears on none of them asks for nothing. A note that asks for something and comes back `n/a` is `not met`.
   - `met` needs evidence: a command or test and its result. You do not re-run it here; step 8 runs a command for every item.
   - An item marked "(test)" also needs a `red:` line in the report: the run in which its test failed before the code. Keep each such line, from the first report and from each fix round's, for step 8. A line that is missing or says `none` is no reason for a new implementer; the summary marks that item `unverified`.
   - `built, not verified`: the item's only check needs the environment and was not allowed. Ask the user once, in one question, whether each such check not yet answered may run, and add the answers to the list. Then go on either way, with no new implementer: the reviewer and your summary run what is allowed, and a check that cannot run leaves its item `unverified` in the summary and the task `in-progress`.
   - `differs` or `preferred`: the item was built differently from its wording. `differs`: it could not be built as worded. `preferred`: it could, and the implementer chose another way. Either is the user's call: show the wording, what was built and why, and ask. For a `preferred` item the question says that it could have been built as worded. A sensible reason does not accept it.
     - Accepted: rewrite that item in the task file to what was built, and add to the end of "Notes" `- Changed <date>, accepted by the user: D<n> was "<old wording>"; reason: <why>.` (`D<n>`: the item's id; `N<n>` for a note; for a `preferred` item the reason begins `preferred:`). The reviewer and the summary then read one wording.
     - Not accepted: a fix round whose entry is the item in the task's wording; the implementer rebuilds a `preferred` item as worded.
   - `not met`, or missing from the list: the task is not done.

   A fix round's report marks each entry `fixed` or `not fixed`. A `not fixed` entry goes to the user with the implementer's reason. Unless they accept what stands, no review is spent on it: go to step 8.
7. **Review, if the task requires it.** It starts when every requirement is `met`, `n/a`, `built, not verified` or accepted: the review row under "Dispatching".
   - `Verdict: pass`: go on. Pass `important` and `minor` findings to the user in your report; they do not block.
   - `Verdict: changes needed`: a fix round with the blocking findings, then the review row again, with those findings under `Recheck:`; one that comes back `still open` is blocking. After two such rounds that still end in `changes needed`, stop and put the findings to the user.
   - Do not review the change yourself in place of the reviewer, and do not argue a blocking finding away. If you think a finding is wrong, say so to the user and let them decide.
8. **Verify.** Follow sw-verify for the task, yourself, in this session: it runs one command per "Done when" item, each one a command that could fail, makes the mutation run for a "(test)" item, ends on the project's full guard run, writes the `## Summary` section into the task file and appends the `summary` log entry. The `red:` lines of step 6 are part of its input: they are in this session's reports, and an item marked "(test)" without one is `unverified` in the summary. This step is not optional and is not delegated to the implementer. Run it whenever the implementer's work is in, also when an item is not met: the summary then records what is open. It does not set the status; step 9 does.
9. **Record the outcome**, then run `node docs/.sw/sw.mjs index`.

   | Outcome | Task file | Log entry, after the `summary` entry |
   | --- | --- | --- |
   | No requirement `not met`, every `differs` and `preferred` item accepted, review passed where required, and `check <ID>` says `can finish: yes` (every item in the summary is `verified`) | `status: done`, `finished:` today | `task \| <ID> done`, then one body line with the summary's count and, where it ran, the review verdict |
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
    - what the task cost: run `node docs/.sw/sw.mjs usage` and show its table as printed;
    - one last line: the task is recorded, so the next task is cheapest in a new session.

## Dispatching

What each dispatch gets:

| Dispatch | Goes to | Prompt |
| --- | --- | --- |
| implementer | a fresh implementer | `<ID>`; `Checks:` |
| fix round | the implementer that did the work where the tool can continue it (a further message to that agent), otherwise a fresh one | first line `Fix round for <ID>:`, then each entry word for word; `Checks:` |
| review | a fresh reviewer, every time | `<ID>`; `Files:`, every file the task has changed (the implementer's list plus each fix round's); `Checks:`; from the second review on `Recheck:`, the previous review's blocking findings word for word |

`Checks:` is the list of step 4, one line per check, `- <check>: allowed` or `- <check>: not allowed`; leave the block out while the list is empty. Every prompt names the project root if it is not your working directory.

How to dispatch is the same for both roles: `sw-implementer` with `implementer.md` and the model key `models.implement`, `sw-reviewer` with `reviewer.md` and the model key `models.review`. The key is the role's verb, not the agent's name. The role files are `<skill-dir>/assets/implementer.md` and `<skill-dir>/assets/reviewer.md`. The agent is the one sw-config wrote for the host, carrying the role file and the model set under its key; in Codex its name is `sw_implementer` or `sw_reviewer`. Where the host's documentation does not say how a session runs a named custom agent, the row says so: ask for the agent by name, and if nothing runs it, take the last row.

| Tool | How |
| --- | --- |
| Claude Code | the agent by name. If it is not among your agent types, use a general-purpose agent, tell it to read the role file first and follow it, and pass the model from `docs/.sw/config.json` if set: `models.implement.claude` for the implementer, `models.review.claude` for the reviewer |
| Codex | the custom agent `sw_implementer` or `sw_reviewer`, from `.codex/agents/`. Codex spawns agents with its multi-agent tools (`spawn_agent` and the rest, on by default); whether a spawn can name a custom agent is not documented, so ask for the agent by name in the spawn, and if the spawned agent is not it, the last row |
| Copilot CLI | the custom agent `sw-implementer` or `sw-reviewer`, from `.github/agents/`. The CLI delegates to a subagent that runs a custom agent when the model chooses to; the tool it delegates with is not documented, so ask for the agent by name in the prompt, and if no subagent runs it, the last row |
| VS Code Copilot Chat | the same files in `.github/agents/`. An agent delegates with the `agent` tool to the agents its `agents` list names; how a plain chat session names one is not documented, so ask for the agent by name, and if the delegation does not run it, the last row |
| No subagents available, the agent is not defined, or the project's rules forbid subagents | follow the role file yourself, in this session, and tell the user the configured model and the clean context were not used. A review done this way is weaker: say so |

## Common mistakes

- Marking `done`, or writing `verified`, from the implementer's report. The report is a claim; the check is the summary's commands, run in this session.
- Passing an item marked "(test)" on a green test alone. Without the `red:` line the test has not been seen to fail, and the summary marks the item `unverified`.
- Doing the task's work while the host keeps the session from writing under `docs/`. The status change comes first; a host that blocks it is told to the user, not worked around.
- Accepting a `differs` or `preferred` item on the user's behalf. A sensible alternative is still not what the task asked for.
- Leaving the question about checks that need the environment unasked because the plan's approval was waived. Only a standing answer in the first message replaces it.
- Giving a later review only the files the fix touched. A finding in an untouched file is then never rechecked.
- Letting a subagent edit the task file, the log or the task list. One writer for status and for the summary: you.
- Reading the plan or the code "to follow along". The subagents already paid for that; the summary reads only the plan's approach and verification.
