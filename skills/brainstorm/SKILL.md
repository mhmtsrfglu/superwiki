---
name: brainstorm
description: Use when the user has an idea to think through before it is a task, is not sure what to build or what is in scope, wants a task's goal and scope grilled or stress-tested before work starts, or invokes sw:brainstorm, with or without a task id. Not for planning a task or adding a named feature; that is sw:plan.
---

# sw:brainstorm

Settles, with the user, what a piece of work is for, what is in and out of it, what is decided, and what is still open and who can answer it, before any work starts. The result is what sw:plan needs and does not produce: task files with a Goal, a "Done when" list and the user's answers in "Notes", and a `decision` page when several tasks share a design. The questions are about intent and scope, which only the user can settle; the technical questions stay with the planner. You change no code, set no status, implement nothing, and never invoke sw:plan or sw:implement.

Needs the task module (`docs/tasks/`). If it is missing, say so and offer sw:init with `--tasks`. Run commands from the project root.

## Steps

1. **Subject.**
   - Id given: `node docs/.sw/sw.mjs check <ID>`, then read `docs/tasks/<ID>.md` and, if `docs/plans/<ID>-plan.md` exists, its `## Approach`. Status `done` or `cancelled`: stop and ask what the user wants. The subject is the task as written: its "Goal", its "Done when" items, its "Notes" and the plan's Approach.
   - No id: the subject is the idea as the user states it. Repeat it in one line so the user can correct it.
2. **Prior art.** Read the lines of `docs/index.md` that concern the subject, then search the vault two or three times with different words: the name of the feature or component, the problem in plain words, a term the user used. Search in the language the vault is written in, whatever language the user wrote in.

   ```bash
   node docs/.sw/sw.mjs search <three to six distinctive words>
   ```

   Before the first question, say what the vault already records on the subject: one line per hit, each with its `[[link]]`, whether a decision page, a task done or open, a lesson or a log entry. Say plainly when nothing is recorded. A decision the vault records is settled: cite it, do not ask it again.
3. **Rounds.** The questions form a tree: the purpose; who it is for; what is in scope and what is out; the constraints (time, compatibility, what must not change); the success criteria, each one checkable; the pieces of work and their order; the open questions of each piece. A round asks every question whose prerequisites are settled, and a question that depends on an answer still open waits for a later round. A fact is never a question to the user: what exists, what a file says, what a task's status is, you look up with the script or a read-only subagent; a lookup still running is an unsettled prerequisite, so the question that needs it waits.

   The questions of a round are numbered, and each has a recommended answer worded so that "yes" accepts it:

   ```text
   Q3. Scope of the first release
   Does the first release sync every list, or only the ones the user marked?
   Recommended: only the marked ones, because the sync conflicts come from the shared lists.
   ```

   With an id, the first round challenges the task as written: each "Done when" item (is it checkable, is it the right thing to check), the why of the "Goal", and the Approach if there is one. The rounds end when the frontier is empty: no question is left whose prerequisites are settled, and every question still open has a person who can answer it.
4. **Write back the understanding** in a normal message, under these headings: Purpose; In scope; Out of scope; Constraints; Success criteria; Open questions, each with who answers it; Pieces of work, each with its title, its area, its dependencies on the other pieces and its size by the rule in step 6. Keep what the user said apart from what you assumed. The user confirms it or corrects it; on a correction, revise and show it again. Nothing is written to the vault before the confirmation.
5. **Record**, after the confirmation.
   - No id, one or more pieces of work: for each piece, in dependency order, `node docs/.sw/sw.mjs next-id <AREA>`, then `docs/tasks/<ID>.md` from `docs/.sw/templates/task.md` without the template's comment: `status: todo`; `deps` the new tasks it waits for; a "Goal" from the purpose; under "Done when" the piece's success criteria, one checkable item each; under "Sources" the links of step 2 and the decision page if one is written; in "Notes", one line per answer with the question it answers, `- <question>? <answer> (user, <date>).`, and one line per open question with the person who can answer it, `- Open: <question>? Answered by <who>.`. An open question does not hold the task back: the task is created with the question in its "Notes", and the answer is never guessed. Then `## [date] task | <ID> created` in `docs/log.md`, in the layout the log's last entries use. Run `node docs/.sw/sw.mjs index` once, after the last task.
   - Several tasks share a design: write it once, as `docs/wiki/<date>-<topic>.md` from `docs/.sw/templates/page.md` with `type: decision` and the sections Context, Decision, Alternatives rejected and Consequences; link it from each task's "Sources"; add its line to the catalog in `docs/index.md`; run `node docs/.sw/sw.mjs lint`.
   - Id given: revise `docs/tasks/<ID>.md` in place, "Goal", "Done when" and "Notes", as the confirmed understanding says, with the answers and the open questions appended to "Notes" in the lines above. A note already there is never deleted; one the rounds overturned gets a line that says so. Then `## [date] task | <ID> revised` in `docs/log.md`, and `node docs/.sw/sw.mjs index` if the title changed.
   - The idea is dropped: no task file. A `change` entry in `docs/log.md` says what was dropped and why, or a `decision` page when the reason is worth keeping.
6. **Name the next step, then stop.** Judge each task by this rule, word for word as sw:plan-implement, sw:plan and sw:implement state it:

   A task is small when its task file alone shows all four: one area, meaning its work belongs to the configured area its id prefix names and to no other (`areas` in `docs/.sw/config.json`; with one configured area, every task is in one area); three "Done when" items or fewer, as the `done when:` line of `node docs/.sw/sw.mjs check <ID>` counts them; nothing left open in its "Notes"; and the files that change, named in the task file, three or fewer. A task whose file does not show how many files change is medium at least, never small.

   For each task: `sw:implement <ID>` when it is small, `sw:plan <ID>` otherwise. Say so and stop; neither is invoked here, the user starts it. A dropped idea has no next step.

## Common mistakes

- Asking the user a fact. What exists and what a file says is looked up, with the script or a read-only subagent.
- Asking the technical questions: how it is built, which files change. The planner surfaces them; this skill settles intent and scope.
- Asking a question the vault has already decided. A `decision` page is cited, not reopened.
- Writing a task file, a decision page or a log entry before the user confirms the understanding.
- Guessing the answer of an open question, or holding a task back until it is answered. The question goes into "Notes" with the person who answers it.
- Starting the plan or the implementation. The next step is named; the user starts it.
- Adding the new task to the list in `index.md` by hand. `index` writes that list from the task files.
