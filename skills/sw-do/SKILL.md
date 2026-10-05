---
name: sw-do
description: Use when the user wants to plan and implement a Superwiki task in one go, says "do this task" or asks to take a task from todo to done without choosing between planning and implementing, or invokes sw-do or sw:do, with or without a task id.
---

# sw-do

Takes one task from `todo` to `done` with one command. It judges the task's size from the task file, picks one of three routes, and then follows sw-plan and/or sw-implement.

It is a thin orchestrator. Changing the task's status, the log entries, the review and sw-summarize as the gate before `done` all come from sw-plan and sw-implement: follow those skills as they are written, and do not repeat or shorten their steps here. The only thing sw-do itself writes is a note in the task's "Notes".

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

2. **Classify** from the task file alone: no code, no plan file. Take the first row that matches, from the top.

   | Class | The task file shows | Route |
   | --- | --- | --- |
   | large | any of: more than six "Done when" items; more than one area; a question left open in "Notes"; `review:` set; a new format, interface or migration other work will depend on | sw-plan, the user's approval, then sw-implement |
   | small | all of: one area, three "Done when" items or fewer, nothing left open in its notes, the change confined to a few files | sw-implement directly; no plan, no note |
   | medium | everything else: one area, four to six "Done when" items or more than a few files, nothing open | an "Approach" note in "Notes", then sw-implement |

3. **Say the route** in one line before acting: `Route: <class> (<the rubric conditions that decided it>).` Do not wait for an answer.

   **Override.** A route the user names wins over the rubric, whether in the invocation ("as small", "with a plan", "no plan") or at any later point. When the override lowers the class, record it in the task's "Notes" as `- Route: <class>, chosen by the user.`
4. **Follow the route.**
   - **Small:** follow sw-implement from its step 1.
   - **Medium:** write one bullet into the task's "Notes", starting `- Approach (sw-do, <date>):`, three to five lines long: the order of the work, which "Done when" items belong together, the constraints the notes set, and how the result is checked. Its sources are the task file and the area guide, if `node docs/.sw/sw.mjs explain <ID>` names one. No planner, no code reading, no plan file, no log entry. Then follow sw-implement from its step 1; its gate accepts `plan: none` with this note.
   - **Large:** follow sw-plan, which skips its own size test when called from here; it clarifies, dispatches the planner, gets the user's approval and records it. That approval is the one planned stop of sw-do. Plan approved: continue with sw-implement in the same run. Plan dropped: stop; the task stays `todo`.

## Common mistakes

- Restating, shortening or skipping steps of sw-plan or sw-implement. They are followed whole, as written.
- Reading code or a plan file to classify. The rubric uses the task file only.
- Asking the user to confirm the route. Say it and go on; the user interrupts if they disagree.
- Treating the Approach note as a plan. `check` still says `plan: none`, and the note holds no steps or verification list.
- Writing a long Approach note, or exploring the code to write it. Past five lines the task is large: use the large route.
- Implementing after a plan that was not approved, or going on after the user dropped it.
- Setting the task to `done` here. sw-implement does that, after sw-summarize has verified every item.
