---
name: sw-plan-implement
description: Use when the user wants to plan and implement a Superwiki task in one go, says "do this task" or asks to take a task from todo to done without choosing between planning and implementing, or invokes sw-plan-implement, with or without a task id.
---

# sw-plan-implement

Takes one task from `todo` to `done` with one command. It judges the task's size from the task file, picks one of three routes, and then follows sw-plan and/or sw-implement.

It is a thin orchestrator. Changing the task's status, the log entries, the review and sw-verify as the gate before `done` all come from sw-plan and sw-implement: follow those skills as they are written, and do not repeat or shorten their steps here. The only thing sw-plan-implement itself writes is a note in the task's "Notes".

Needs the task module (`docs/tasks/`). If it is missing, say so and offer sw-init with `--tasks`. Run commands from the project root.

## Steps

1. **Pick the task.**
   - Id given: `node docs/.sw/sw.mjs check <ID>`, then read `docs/tasks/<ID>.md`.
   - No id: `node docs/.sw/sw.mjs ready`, and let the user choose.
   - New work without a task file: sw-plan step 1 ("New work") creates it; then continue here.

   `check` may settle the route before any classifying:

   | `check` says | Do |
   | --- | --- |
   | status `done` or `cancelled` | stop and ask what the user wants |
   | status `in-progress`, or a plan with `status: approved` | sw-implement, nothing else |
   | a draft plan | large route; sw-plan revises it |
   | open deps | stop, as sw-implement's gate does. Do not plan around it unasked |

2. **Classify** from the task file alone: no code, no plan file. The rule for a small task, word for word as sw-plan and sw-implement state it:

   A task is small when its task file alone shows all four: one area, meaning its work belongs to the configured area its id prefix names and to no other (`areas` in `docs/.sw/config.json`; with one configured area, every task is in one area); three "Done when" items or fewer, as the `done when:` line of `node docs/.sw/sw.mjs check <ID>` counts them; nothing left open in its "Notes"; and the files that change, named in the task file, three or fewer. A task whose file does not show how many files change is medium at least, never small.

   Take the first row that matches, from the top. "Area" and the count of "Done when" items mean what the rule above says.

   | Class | The task file shows | Route |
   | --- | --- | --- |
   | large | any of: more than six "Done when" items; more than one area; a question left open in "Notes"; `review:` set; a new format, interface or migration other work will depend on | sw-plan, the user's approval, then sw-implement |
   | small | all four conditions of the rule above: one area, three "Done when" items or fewer, nothing left open, three files or fewer named | sw-implement directly; no plan, no note |
   | medium | everything else: one area, nothing open, and four to six "Done when" items or more than three files or the files not shown | an "Approach" note in "Notes", then sw-implement |

3. **Say the route** in one line before acting: `Route: <class> (<the rubric conditions that decided it>).` Do not wait for an answer. When the user has waived the plan's approval, the line says so: `Route: <class>, plan approval waived by the user (<the rubric conditions that decided it>).`

   **Override.** A route the user names wins over the rubric, whether in the invocation ("as small", "with a plan", "no plan") or at any later point. When the override lowers the class, record it in the task's "Notes" as `- Route: <class>, chosen by the user.` Only a named route lowers the class. A waiver of approval ("without presenting the plan for approval", "no need to approve it") names no route: the class stays what the rubric decided.
4. **Follow the route.**
   - **Small:** follow sw-implement from its step 1.
   - **Medium:** write one bullet into the task's "Notes", starting `- Approach (sw-plan-implement, <date>):`, three to five lines long: the order of the work, which "Done when" items belong together, the constraints the notes set, and how the result is checked. Its sources are the task file and the area guide, if `node docs/.sw/sw.mjs explain <ID>` names one. No planner, no code reading, no plan file, no log entry. Then follow sw-implement from its step 1; its gate accepts `plan: none` with this note.
   - **Large:** follow sw-plan, which skips its own size test when called from here; it clarifies, dispatches the planner, gets the user's approval and records it. That approval is the one planned stop of sw-plan-implement. Plan approved: continue with sw-implement in the same run. Plan dropped: stop; the task stays `todo`.
   - **Large, approval waived by the user:** the planner runs all the same; the waiver removes the stop, not the plan. Follow sw-plan steps 4 to 6 with these differences. Nothing is presented. Each question of the planner gets its assumed answer, unless the task file, a wiki page or a lesson says otherwise (`node docs/.sw/sw.mjs search`), as under sw-autopilot's standing answer, and the answers count as the user's: step 6 runs whole, so the plan is `approved`, and "Notes" gets the answers once, as `- <date>, answered under the user's waiver of approval: ...`. The `plan` log entry gets the body line `Approved under the user's waiver.` A `Split:` the planner proposes is still put to the user, as sw-plan step 5 says: the waiver covers the plan's approval, not the creation of tasks. Then continue with sw-implement in the same run. Its question about checks that need the environment is still asked.

## Common mistakes

- Restating, shortening or skipping steps of sw-plan or sw-implement. They are followed whole, as written.
- Reading code or a plan file to classify. The rubric uses the task file only.
- Counting files or areas from the code. A task file that does not name the files that change makes the task medium at least; an area is a configured one, never a part of the code.
- Asking the user to confirm the route. Say it and go on; the user interrupts if they disagree.
- Skipping the planner, or lowering the route, because the user waived the plan's approval. A waiver removes the stop, not the plan; only a named route lowers the class.
- Treating the Approach note as a plan. `check` still says `plan: none`, and the note holds no steps or verification list.
- Writing a long Approach note, or exploring the code to write it. Past five lines the task is large: use the large route.
- Implementing after a plan that was not approved, or going on after the user dropped it.
- Setting the task to `done` here. sw-implement does that, after sw-verify has verified every item.
