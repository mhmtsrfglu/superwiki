# Dry-run: chain brief

Source: the chain brief in appendix B of [the audit source](../../docs/raw/2026-10-05-prompt-quality-audit.md), made at commit `23c12e3`. Two changes from the audit: scenario 1 says why the implementer builds an item differently (the item contradicts the existing code), and scenario 3 is new, the same case where the implementer merely prefers another approach.

The brief follows one task through `sw-do` and the three roles it dispatches. Give the prompt below to a fresh agent in the root of this repository, copied whole, and nothing else.

## Prompt

```text
I maintain a set of agent skills (prompt files) and want a fresh reader to dry-run them, the way a skill author checks instructions for gaps before shipping: act as an agent that has just loaded the skill, simulate following it step by step on a concrete scenario, and flag every place where the text forces you to guess, where two texts disagree, or where the scenario hits a case the text does not cover. This is read-only: change no file, create no file, dispatch no subagent, do not actually carry out the scenarios.

Do not read DESIGN.md, README.md or the source code: an agent following a skill does not have them, and I want to know what the skill texts alone leave open.

Read these files in full: `skills/sw-do/SKILL.md`, `skills/sw-plan/SKILL.md`, `skills/sw-implement/SKILL.md`, `skills/sw-summarize/SKILL.md`; `skills/sw-config/assets/planner.md`, `skills/sw-config/assets/implementer.md`, `skills/sw-config/assets/reviewer.md`; `skills/sw-init/assets/templates/task.md` and `skills/sw-init/assets/templates/plan.md`; `AGENTS.md`. You may run `node docs/.sw/sw.mjs check <an existing id>` and `node docs/.sw/sw.mjs explain <the same id>` once each, to see the output the skills refer to. Walk each scenario role by role: the main session, then each subagent it would dispatch, reading that role's file as the subagent would.

Scenario 1. The user types "sw-do T-10". T-10 exists, status todo, no deps, `review:` empty, no plan. It has five "Done when" items, all in one area, nothing open in its notes. One of the five items can only be checked by starting the project's dev server and looking at a page. During the work the implementer finds that one item cannot be built as the task words it, because it contradicts the existing code; it builds the item differently and says so. The user, when asked, accepts that difference.

Scenario 2. The user types "sw-do T-11". T-11 exists, status todo, `review: required`, eight "Done when" items, no plan. The planner returns an approach, one question with an assumed answer, and a proposal to split the work into two tasks. The user gives a different answer to the question than the planner assumed, agrees to the split, and approves the revised plan. The implementer reports everything met. The reviewer returns `changes needed` with one blocking finding located in file A. The implementer's fix changes only file B. The review is run again.

Scenario 3. The same as scenario 1, with one difference: the item the implementer builds differently could be built as the task words it. The implementer merely prefers another approach, for a sensible reason.

For each place you get stuck, report one finding with:
- kind: `guess` (the text does not say; you must choose), `conflict` (two texts say different things) or `uncovered` (the scenario reaches a case no text handles);
- where: file and line number, with a quote of 20 words or fewer;
- what you would have to decide, and the two most likely ways different agents would decide it;
- consequence if agents decide differently: `wrong result`, `wasted work` or `cosmetic`.

Rules: report only what the scenarios actually reach, in the order you reach it. Say nothing about steps that were unambiguous, and do not propose rewrites. If a scenario runs through cleanly, say so in one line. End with a count of findings per kind and per consequence. Keep the whole report under 1100 words.
```

## Places to check

Not sent to the agent. Read each report at these places: a finding there means the text still leaves it open. Findings elsewhere are new places, worth reading, and not part of the comparison.

| Finding | What the reader must not have to guess there | Closed by |
| --- | --- | --- |
| F1 | what "more than one area" means in `sw-do`: the id prefix or a part of the code | T-06 |
| F2 | on a task without a plan, who asks before a check that starts the dev server runs | T-03 |
| F3 | what counts as a requirement beyond the "Done when" items | T-06 |
| F4 | when the implementer may build an item differently: only when it cannot be built as worded (scenario 1), or also for a better idea (scenario 3) | T-03 |
| F5 | the verdict for a `differs` item the user accepted, and where the acceptance is recorded | T-03 |
| F6 | whether the draft plan covers every item or only the items that stay after a split | T-05 |
| F7 | after an agreed split: who moves the "Done when" items, whether the new task inherits `review:`, what the original task keeps | T-05 |
| F8 | how the reviewer learns which checks need services or data, and whether they are allowed | T-03 |
| F9 | what a fix round is: what the implementer is given, and whether the same agent or a fresh one gets it | T-03 |
| F10 | what the second reviewer is given, and whether it rechecks the finding in file A that the fix did not touch | T-03 |
| F11 | which changed files belong to the task, bookkeeping files included | T-05 |
| F20 | how the implementer reports an item it built but could not verify, and whether the review starts then | T-03 |
