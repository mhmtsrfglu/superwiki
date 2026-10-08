# Dry-run: run brief

Source: the run brief in appendix B of [the audit source](../../docs/raw/2026-10-05-prompt-quality-audit.md), made at commit `23c12e3`. Three changes from the audit: the user's message is in English, where the audit gave it in Turkish; the scenario states that its project's `areas` names the prefix `B` Backend, with the tasks `B-20` to `B-22` in place of the audit's `T-20` to `T-22`, since this repository's `areas` names only `T`, Tasks; and the skills carry the names they have had since T-14: `sw-<name>`, with the audit's `run` now `sw-autopilot`, its `do` now `sw-plan-implement` and its `summarize` now `sw-verify`.

The brief follows an unattended `sw-autopilot` over three tasks, as the orchestrating session. Give the prompt below to a fresh agent in the root of this repository, copied whole, and nothing else.

## Prompt

```text
I maintain a set of agent skills (prompt files) and want a fresh reader to dry-run them, the way a skill author checks instructions for gaps before shipping: act as an agent that has just loaded the skill, simulate following it step by step on a concrete scenario, and flag every place where the text forces you to guess, where two texts disagree, or where the scenario hits a case the text does not cover. This is read-only: change no file, create no file, dispatch no subagent, do not actually carry out the scenarios.

Do not read DESIGN.md, README.md or the source code: an agent following a skill does not have them, and I want to know what the skill texts alone leave open.

The skill under test is `skills/sw-autopilot/SKILL.md`, invoked as `sw-autopilot`; every skill is invoked by its folder name. Read it in full, then whatever it says to load or follow (`sw-implement`, `sw-verify`, `sw-plan`, and the three role files, `skills/sw-plan/assets/planner.md`, `skills/sw-implement/assets/implementer.md` and `skills/sw-implement/assets/reviewer.md`), `AGENTS.md`, and `skills/sw-plan-implement/SKILL.md` for comparison. You may run `node docs/.sw/sw.mjs ready`, `node docs/.sw/sw.mjs check <an existing id>` and `node docs/.sw/sw.mjs usage` once each. Walk the whole run as the orchestrating session: everything before the first task, each task from picking it to closing it, then the report. Where the skill hands work to a subagent, read that role's file and note what the role is and is not told.

Scenario. The scenario's project differs from this repository in one setting: `areas` in its `docs/.sw/config.json` maps the prefix `B` to Backend (this repository's maps only `T`). The user types: "sw-autopilot: finish the ready tasks in the backend area one after another, don't ask me. Don't commit." At the start, `node docs/.sw/sw.mjs ready` lists three tasks with the prefix `B`, none with a plan:
- B-20: two "Done when" items, one area, nothing open in its notes.
- B-21: five "Done when" items, one area, nothing open in its notes. Its implementer reports four items met and one built differently from the task's wording.
- B-22: four "Done when" items, `review: required`. One of its items can only be checked by starting the dev server. The reviewer's first verdict is `changes needed`.
The working tree is clean at the start, and git works.

For each place you get stuck, report one finding with:
- kind: `guess` (the text does not say; you must choose), `conflict` (two texts say different things) or `uncovered` (the scenario reaches a case no text handles);
- where: file and line number, with a quote of 20 words or fewer;
- what you would have to decide, and the two most likely ways different agents would decide it;
- consequence if agents decide differently: `wrong result`, `wasted work` or `cosmetic`.

Rules: report only what the scenarios actually reach, in the order you reach it. Say nothing about steps that were unambiguous, and do not propose rewrites. If a scenario runs through cleanly, say so in one line. End with a count of findings per kind and per consequence. Keep the whole report under 1100 words.
```

## Places to check

Not sent to the agent. Read each report at these places: a finding there means the text still leaves it open. Findings elsewhere are new places, worth reading, and not part of the comparison. B-21's item built differently also reaches the places of F4 and F5; the chain brief checks those.

| Finding | What the reader must not have to guess there | Closed by |
| --- | --- | --- |
| F2 | B-22 has no plan and one item needs the dev server: who asks before that check runs | T-03 |
| F8 | how B-22's reviewer learns which checks need services or data, and whether they are allowed | T-03 |
| F9 | what the fix round after `changes needed` is, and whether the same implementer or a fresh one gets it | T-03 |
| F10 | what the second reviewer is given, and whether it rechecks the first findings | T-03 |
| F11 | which changed files belong to each task in a run without commits | T-05 |
| F12 | how to learn which ready tasks belong to the named area | T-05 |
| F13 | what to do with the answers the message leaves open when it also says not to ask | T-05 |
| F14 | whether "don't commit" is passed on to each subagent | T-05 |
| F15 | when `lint` runs, so that the stop on a lint error can fire | T-05 |
| F16 | which of sw-implement's closing steps (area guide, report) run for every task | T-05 |
| F17 | whether sw-plan is loaded and which of its steps apply, so that no plan is left `draft` | T-05 |
| F18 | whether the summary may read the plan's Approach and Verification during a run | T-05 |
| F19 | when the stop for a check that was not allowed fires: before the implementer, or after the summary | T-05 |
| F20 | how an item built but not verified is reported, and whether the review starts | T-03 |
| F21 | what counts as a decision made without the user in the run's report | T-05 |
