---
name: sw-brainstorm
description: Use when the user has an idea to think through before it is a task, is not sure what to build or what is in scope, wants a task's goal and scope grilled or stress-tested before work starts, or invokes sw-brainstorm, with or without a task id. Not for planning a task or adding a named feature; that is sw-plan.
---

# sw-brainstorm

Settles, with the user, what a piece of work is for, what is in and out of it, what is decided, and what is still open and who can answer it, before any work starts. The result is what sw-plan needs and does not produce: task files with a Goal, a "Done when" list and the user's answers in "Notes", and a `decision` page when several tasks share a design. The questions are about intent and scope, which only the user can settle; the technical questions stay with the planner. You change no code, set no status, implement nothing, and never invoke sw-plan or sw-implement.

What the vault records on the subject is history to learn from, not a list of answers. A decision made earlier is weighed against today's code and data, and you say whether it still holds. The user's idea is weighed the same way, and you say so when a recorded decision or another course is the better one: once, with the evidence, and then the user decides.

Needs the task module (`docs/tasks/`). If it is missing, say so and offer sw-init with `--tasks`. Run commands from the project root.

## Steps

1. **Subject.**
   - Id given: `node docs/.sw/sw.mjs check <ID>`, then read `docs/tasks/<ID>.md` and, if `docs/plans/<ID>-plan.md` exists, its `## Approach`. Status `done` or `cancelled`: stop and ask what the user wants. The subject is the task as written: its "Goal", its "Done when" items, its "Notes" and the plan's Approach.
   - No id: the subject is the idea as the user states it. Repeat it in one line so the user can correct it.
2. **Prior art.** Read the lines of `docs/index.md` that concern the subject, then search the vault two or three times with different words: the name of the feature or component, the problem in plain words, a term the user used. Search in the language the vault is written in, whatever language the user wrote in.

   ```bash
   node docs/.sw/sw.mjs search <three to six distinctive words>
   ```

   Each hit is printed with its kind and its day, `[concept 2026-10-02]`, and a page another has replaced with that page, `[decision 2026-09-01, superseded by <page>]`. With an id, the pages the task's "Sources" link are hits as well.

   Before the first question, say what the vault already records on the subject: one line per hit, each with its `[[link]]` and its day, whether a decision page, a task done or open, a lesson or a log entry. Leave out a hit that changes no answer. Say plainly when nothing is recorded. A page marked `superseded` is named only together with the page that replaced it, and that page is the one read.
3. **Judge the decisions.** A `decision` page among the hits is a choice made on its day, for a reason. It is not a rule to follow and not a closed question: it is evidence, and you say what it is worth today. Judge each decision the subject rests on or goes against, and no other.

   Read the page. Its reason is the facts under its "Holds while"; on a page without that section, the facts its Context and Decision give as the reason. Check each fact against today's code and data: a command, a count, one range of a file. A fact is looked up, by you or by one read-only subagent for all of them; it is never asked of the user and never assumed. The check reads: it starts no service and changes no data. A fact that only a service that is not running, or a store the session cannot already read, could show is `not checked`, with what would settle it; the user is present and may run that check or allow it. Then say, for each decision, in this shape:

   ```text
   [[2026-09-15-search-engine-choice]] (2026-09-15): search runs on the database's full-text index, no search service.
   Reason: the corpus is small, and it is one system fewer to run.
   Verdict: no longer holds. "The corpus is under 200,000 recipes": `select count(*) from recipes` gives 412,000.
   Recommended: change it. A search service is what the idea asks for, and the reason against one is gone.
   ```

   The verdict is one of three, in these words:
   - `holds`: every fact was checked and is still true. Name what showed it.
   - `no longer holds`: a fact is false today. Name the fact and what showed it.
   - `not checked`: a fact you could not look up. Name it and what would settle it. A verdict you cannot back with a file, a command or a number is this one, never one of the other two.

   The recommendation is to keep, change or drop the decision. It follows from the verdict and the evidence, not from what the user asked for: a decision that holds is recommended kept, also when the idea goes against it, and a decision that no longer holds is recommended changed or dropped, also when the idea rests on it.
4. **Rounds.** The questions form a tree: the purpose; who it is for; what is in scope and what is out; the constraints (time, compatibility, what must not change); the success criteria, each one checkable; the pieces of work and their order; the open questions of each piece. A round asks every question whose prerequisites are settled, and a question that depends on an answer still open waits for a later round. A fact is never a question to the user: what exists, what a file says, what a task's status is, you look up with the script or a read-only subagent; a lookup still running is an unsettled prerequisite, so the question that needs it waits.

   The questions of a round are numbered, and each has a recommended answer worded so that "yes" accepts it:

   ```text
   Q3. Scope of the first release
   Does the first release sync every list, or only the ones the user marked?
   Recommended: only the marked ones, because the sync conflicts come from the shared lists.
   ```

   A judged decision is a question of the first round, ahead of the others, when the user has something to decide about it: the idea goes against a decision that `holds`; the verdict is `no longer holds`, whether the subject rests on the decision or goes against it; or the verdict is `not checked`. The question is whether the decision stands, and its recommended answer is step 3's recommendation. The question comes after step 3's lines and does not replace them: the verdict and its `Recommended:` line are said in that shape first, whole, for every judged decision. Against a decision that holds, this question is your objection to the idea: it is made here, once, with the evidence. Whatever the user answers is the answer: the rounds go on from it, the work is shaped as the user decided, and the objection is not raised again. A decision that holds and that the idea follows is no question; it is prior art the work rests on.

   With an id, the first round also challenges the task as written: each "Done when" item (is it checkable, is it the right thing to check), the why of the "Goal", and the Approach if there is one. The rounds end when the frontier is empty: no question is left whose prerequisites are settled, and every question still open has a person who can answer it.
5. **Write back the understanding** in a normal message, under these headings: Purpose; In scope; Out of scope; Constraints; Recorded decisions, each one the work rests on or replaces, with its day and whether it is kept, changed or dropped; Success criteria; Open questions, each with who answers it; Pieces of work, each with its title, its area, its dependencies on the other pieces and its size by the rule in step 7. Keep what the user said apart from what you assumed. The user confirms it or corrects it; on a correction, revise and show it again. Nothing is written to the vault before the confirmation.
6. **Record**, after the confirmation.
   - No id, one or more pieces of work: for each piece, in dependency order, `node docs/.sw/sw.mjs next-id <AREA>`, then `docs/tasks/<ID>.md` from `docs/.sw/templates/task.md` without the template's comment: `status: todo`; `deps` the new tasks it waits for; a "Goal" from the purpose; under "Done when" the piece's success criteria, one checkable item each; under "Sources" the links of step 2 and the decision page if one is written; in "Notes", one line per answer with the question it answers, `- <question>? <answer> (user, <date>).`, and one line per open question with the person who can answer it, `- Open: <question>? Answered by <who>.`. An open question does not hold the task back: the task is created with the question in its "Notes", and the answer is never guessed. Then `## [date] task | <ID> created` in `docs/log.md`, in the layout the log's last entries use. Run `node docs/.sw/sw.mjs index` once, after the last task.
   - Several tasks share a design: write it once, as `docs/wiki/<date>-<topic>.md` from `docs/.sw/templates/decision.md` without the template's comment, with the sections Context, Decision, Holds while, Alternatives rejected and Consequences. "Holds while" lists the facts the choice rests on, one line each, worded so that a later reader can check it against the code or the data; a reason nobody can check belongs in Context. Link the page from each task's "Sources"; add its line to the catalog in `docs/index.md`; run `node docs/.sw/sw.mjs lint`.
   - A recorded decision was changed or dropped: it is replaced, never edited. Write the page that replaces it, from the same template, with `supersedes: <the old page>`, why it changed in its Context (the fact that failed and what showed it, or, when none failed, the user's answer: the user may overrule a decision that still holds), and what stands now in its Decision; for a dropped decision that is one line saying that nothing takes its place. In the old page change the frontmatter only: `status: superseded` and `superseded_by: <the new page>`. Both belong to this step: `lint` warns `superseded-unmarked` while the old page is unmarked. A decision kept after its verdict gets nothing written.
   - Id given: revise `docs/tasks/<ID>.md` in place, "Goal", "Done when" and "Notes", as the confirmed understanding says, with the answers and the open questions appended to "Notes" in the lines above. A note already there is never deleted; one the rounds overturned gets a line that says so. Then `## [date] task | <ID> revised` in `docs/log.md`, and `node docs/.sw/sw.mjs index` if the title changed.
   - The idea is dropped: no task file. A `change` entry in `docs/log.md` says what was dropped and why, or a `decision` page when the reason is worth keeping.
7. **Name the next step, then stop.** Judge each task by this rule, word for word as sw-plan-implement, sw-plan and sw-implement state it:

   A task is small when its task file alone shows all four: one area, meaning its work belongs to the configured area its id prefix names and to no other (`areas` in `docs/.sw/config.json`; with one configured area, every task is in one area); three "Done when" items or fewer, as the `done when:` line of `node docs/.sw/sw.mjs check <ID>` counts them; nothing left open in its "Notes"; and the files that change, named in the task file, three or fewer. A task whose file does not show how many files change is medium at least, never small.

   For each task: `sw-implement <ID>` when it is small, `sw-plan <ID>` otherwise. Say so and stop; neither is invoked here, the user starts it. A dropped idea has no next step.

## Common mistakes

- Asking the user a fact. What exists and what a file says is looked up, with the script or a read-only subagent.
- Asking the technical questions: how it is built, which files change. The planner surfaces them; this skill settles intent and scope.
- Answering an idea with a decision's date. "That was decided against on <day>" is where the judging starts: the reason, whether it still holds and what you recommend come with it.
- Giving a verdict without a lookup, or one that suits the idea. No file, command or number behind it: `not checked`, with what would settle it.
- Judging decisions the subject does not touch, or raising an objection a second time. Only the decisions the work rests on or goes against; once the user has answered, the work follows the answer.
- Editing a decision page that changed. A new page replaces it, and the old one is marked in the same step.
- Writing a task file, a decision page or a log entry before the user confirms the understanding.
- Guessing the answer of an open question, or holding a task back until it is answered. The question goes into "Notes" with the person who answers it.
- Starting the plan or the implementation. The next step is named; the user starts it.
- Adding the new task to the list in `index.md` by hand. `index` writes that list from the task files.
