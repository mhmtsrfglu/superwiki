# Superwiki design

This file explains why Superwiki works the way it does. How to install and use it is in [README.md](README.md); how to build it is in [CONTRIBUTING.md](CONTRIBUTING.md).

Superwiki is a set of agent skills that turn a project's `docs/` folder into a wiki the coding agent writes and keeps current, with an optional task tracker. The wiki follows the LLM Wiki pattern described by Andrej Karpathy: raw sources, a wiki the agent owns, and a schema that tells the agent how to maintain it.

Contents: [Principles](#principles) · [The vault](#the-vault) · [How a task runs](#how-a-task-runs) · [Why the work is split](#why-the-work-is-split) · [Running many tasks](#running-many-tasks) · [Measuring a session](#measuring-a-session) · [Across agents](#across-agents) · [Viewer and CLI](#viewer-and-cli) · [Migration](#migration) · [Evals](#evals) · [Status](#status)

## Principles

Every decision below follows from one observation: what a task costs is what the agents read, and each step of a session sends everything read so far again.

1. **Little to read.** The only mandatory read is `index.md`. `log.md` is read with `tail`, never whole.
2. **A fact has one home.** A task's status is in its frontmatter only. Counts, blockers and the task list are computed from the task files.
3. **Scripts answer mechanical questions.** "What is ready?", "what blocks this?" and "is anything broken?" are answered by `docs/.sw/sw.mjs`, not by reading files.
4. **Work happens in clean contexts.** Planning, implementing and reviewing each run in a subagent that starts empty and ends with the task.
5. **Done means verified.** A task closes on a command run for each requirement, one that could have come out the other way, not on an agent's word.

## The vault

```text
AGENTS.md        short always-on rules (CLAUDE.md imports it)
docs/            the vault
  index.md       the open tasks (generated), then the catalog: one line per wiki page
  log.md         append-only: ## [YYYY-MM-DD] kind | title
  raw/           immutable sources
  wiki/          flat; frontmatter `type` and `summary`
  tasks/<ID>.md  one task per file (optional module)
  plans/<ID>-plan.md   one plan per task
  viewer.html    the viewer
  .sw/           sw.mjs (CLI), config.json, templates/
```

- The vault root is `docs/`, not the repository root: Obsidian would otherwise index `node_modules`.
- No code repository is required. A bare folder works as a wiki-only vault.
- Each repository has its own vault. A dependency on a task in another repository is written as plain text in the task's notes.
- Anything else under `docs/` belongs to other tools. Lint and the viewer ignore it.
- Everything Superwiki ships is in English. Content an agent writes into a vault follows that vault's language.

### Pages and links

- A page's kind is its `type` frontmatter field, not a folder. Types with a defined shape: `source` (summary of one raw file), `decision`, `lesson` (Symptom, Cause, Fix, How to notice it earlier) and `guide` (how to work in one task area; optional).
- Links inside the vault are wikilinks, `[[file-name]]`; file names are unique across `wiki/`, `tasks/` and `plans/`. `raw/` files and URLs use normal markdown links; code is referred to by plain path.
- Ingest touches few files: a source summary, `index.md` and `log.md`. Wider cross-updates are recorded as follow-ups and done in lint passes.

### Tasks

- Frontmatter: required `id`, `title`, `status`, `deps`; optional `soft_deps`, `milestone`, `priority`, `review`, `started`, `finished`.
- Statuses: `todo`, `in-progress`, `done`, `cancelled`. Cancelled tasks stay on disk; ids are never reused.
- `deps` must be done before a task starts. `soft_deps` allow starting but block finishing.
- Any value in `review` asks for a separate review before the task can be done.
- A "Done when" item that ends in "(test)" is proven by a test, written first and seen failing before the code. The task template defines the mark; the planner proposes it and `sw:plan` writes it at approval; a user may write it by hand. The mark is what makes the closing summary ask for the test's failing run and a mutation run.
- Execution order is derived from dependencies plus optional `priority`. There is no stored sequence number or dependency table.
- A single-project repository uses one area (default `T`); the viewer hides area cards and the area filter then.

### The summary that closes a task

A closed task ends with a `## Summary` section, written by `sw:verify`:

| Part | Holds |
| --- | --- |
| `### Plan` | the approach as planned, or `No plan` with the Approach note if there was one |
| `### Implementation` | what was built, and each deviation, including an item rewritten after an accepted difference, with its old wording |
| `### Changes` | the task's files, taken from git. For uncommitted work: the files that both git and the implementer's reports name, since the working tree can hold other tasks' changes |
| `### Verification` | one numbered entry per "Done when" item: a bold verdict (`verified`, `unverified` or `failed`), the command, a `falsifies:` line saying how that command would have failed, and the result; a "(test)" item adds the implementer's `red:` line. The part ends with a `Guard run:` line |

An item without an entry counts as unverified. `check` says `can finish: yes` only when every item is verified. `lint` reports `done-unverified` for a `done` task whose summary holds an unverified or failed item. A `done` task with no summary predates the rule and is not a finding.

### The task list in the index

`index.md` opens with a generated section: the counts, then the tasks in progress, ready and blocked, a line each with a link, the milestone and what a blocked task waits on; finished tasks by id only. It exists so that a person who reads the vault as files, in an editor or in Obsidian, can follow the work without the viewer.

- **It is a view.** Status still has one home. The agent runs `sw.mjs index` after it changes a task. `lint` warns (`stale-board`, `missing-board`) when the section does not match the task files, so a status edited by hand is caught at the next check. Nothing rewrites the file as a side effect of a read.
- **It lives in the index, not in a file of its own.** That is where a person looks, and the agent reads the index first anyway, so it sees what is ready without a command.
- **It costs what the open work costs.** A finished task takes nine characters. Open tasks take a line each: 2 KB on a project with 28 open tasks, 7.7 KB on one with 97. A backlog of hundreds of blocked tasks would make this the largest thing a session reads; listing blocked tasks by id only is the next cut, not made yet.

### The rules in AGENTS.md

`sw:init` writes a block of rules into `AGENTS.md`. It holds what must apply without any command: read the index first, keep task status, the task list and the log current, and log work that belongs to no task. It also tells the agent which skill to reach for, ahead of other planning or debugging skills. A skill's description alone proved too weak a trigger when another skill set competes for the same words; with the block, the routing eval's agents picked the expected skill for every message that has one, with and without a competing set in context. Where the project's own rules contradict the block, the skills give way: a rule against subagents makes the main session do the roles' work itself. Nothing reports such a conflict (see [Known gaps](#known-gaps)).

## How a task runs

Three roles do the work, each in its own subagent on the model set with `sw:config`: a planner, an implementer and a reviewer. The main session dispatches them, reads their reports, runs the closing checks and records the task's status. It reads neither the code nor the plan.

Before a task exists, or before one that exists is trusted, `sw:brainstorm` settles what the planner cannot: intent and scope. It says what the vault already records on the subject, so a settled decision is not decided again; asks in rounds, every question whose prerequisites are settled at once, numbered, each with a recommended answer that "yes" accepts; looks facts up instead of asking them; writes the understanding back for the user to confirm; and only then writes task files, with the answers in their "Notes" and each open question with the person who can answer it, and a `decision` page when several tasks share a design. The vault is the artifact, so there is no spec file: `sw:plan` takes over from the task file, and the skill names the next step by the small-task rule and starts neither. It is the one skill that creates tasks from a conversation rather than from a split, and it never sets a status.

### Three routes

`sw:plan-implement` sorts a task from its task file alone, taking the first row that matches.

| Size | When | What happens |
| --- | --- | --- |
| Large | any of: more than six "Done when" items, more than one area, an open question, a required review, or a new format, interface or migration other work will depend on | the planner writes a plan and the user approves it |
| Small | one area, three "Done when" items or fewer, nothing left open, and the task file names the files that change, three or fewer | the implementer runs straight from the task file |
| Medium | everything between, including a task whose file does not show how many files change | an "Approach" note of three to five lines in the task's "Notes", then the implementer |

Each condition can be decided from the task file. "Area" has the vault's one meaning, the configured area a task's id prefix names (`areas` in `docs/.sw/config.json`), never a part of the code; in a project with one configured area every task is in one area. The items are counted by `check`'s `done when:` line. "A few files" was dropped because no reader could decide it: a task file that does not name its files is medium at least. The small-task rule is one line, word for word the same in `sw:plan-implement`, `sw:plan`, `sw:implement` and `sw:brainstorm`, since the latter three must work without `sw:plan-implement` loaded and `sw:brainstorm` names the next step by it; `test/skills.test.mjs` keeps the four copies equal.

The reasoning is cost. A plan costs a planner run that reads the code; a note costs a few lines. The note is written without reading code, so it orders the work and names the checks but settles no technical question. Skipping the plan has a price too: questions a planner would have put to the user are decided by the implementer and reported afterwards.

`sw:plan-implement` states the route in one `Route:` line and goes on without waiting. A route the user names ("as small", "no plan") overrides the rubric and is recorded in the task's notes when it lowers the class. Only a named route lowers it.

**A waiver of approval is not a waiver of the plan.** "Without presenting the plan for approval" removes the stop, not the planner. The class stays what the rubric decided; on the large route the planner runs, each of its questions gets its assumed answer unless the task file or the wiki says otherwise, and those answers count as the user's: they go into the task's notes, the plan is recorded `approved`, and the log entry says it was approved under the waiver. The `Route:` line names the waiver. Two things stay with the user: a split the planner proposes, since the waiver covers the plan and not the creation of tasks, and the question about checks that need the environment. In the pilot the same waiver made `sw:plan-implement` skip the planner in one run of three, and that run was the dearest of the eight.

### Planning

The planner writes the plan file as `status: draft` and returns a few lines: the approach, the questions only the user can answer with the answer the plan assumes, a proposed split if the work does not fit one session, and `Marks:`, the items its verification proves by a test. The main session shows the approach, questions and split to the user in a normal message; approval changes the file to `approved` and writes the "(test)" marks into the task. Plan mode is not used: a reply that agrees to a split or changes an answer needs files written before the plan is shown again. `Marks:` comes back in every round and names items by their first words, never by number. A split renumbers the items, and a round that left the line out would otherwise keep stale marks; only the latest return counts.

A plan is bounded at 1,000 words, counted with `wc -w`; most need 400 to 800. The earlier bound, 40 to 60 lines, could not be checked: the plans of T-01 and T-02 ran to 109 and 81 lines, with lines up to 472 characters. The planner describes a text deliverable (a skill, a document) by what each part must contain and writes exact text only for strings a test or another file matches; T-02's steps had held the skill text that was still to be written.

### Implementing

- **Reading follows rules.** Locate before opening, open the range and not the file, one example per pattern, trust generated types, batch lookups, never read twice.
- **The task text decides the work.** The implementer lists every requirement the task states and marks each `met`, `built, not verified`, `differs`, `preferred` or `not met`. A `met` carries the command that shows it.
- **Requirements have ids from position.** `D<n>` is the n-th "Done when" item, as `check`'s `done when:` line counts them; `N<n>` is the n-th top-level bullet of "Notes". The planner, the implementer, the reviewer, `sw:implement` and `sw:verify` all derive them the same way, so a requirement is named alike in the plan's verification, the implementer's report, the reviewer's claims and the summary's entry n. A note that asks for nothing is reported `n/a`: a record, a piece of evidence, or a line the skills write about the task's course (`sw:plan-implement`'s Approach note, whose work is the requirements it orders, and the `Route:`, `Split` and `Changed` lines). An answer the user gave, or one assumed for them, asks for something when it bears on a "Done when" item of the task, and is met when the work follows it; one that bears on none, such as an answer about work a split moved to another task, asks for nothing there. A split therefore copies every answer to the new task, and no one has to judge which items an answer concerns before the code is read. Without these rules the dry-run readers could not tell whether the Approach note or a recorded answer was a requirement, and one reading left a verified task `in-progress`. Before the ids each role made its own list of what counted as a requirement beyond "Done when" (F3).
- **`differs` is narrow.** It is allowed only where an item cannot be built as worded because the wording contradicts another requirement of the task or a project rule. The code is never the contradiction, since code can be changed.
- **`preferred` records a departure, not a licence.** The rule stays "build as worded". An implementer that built an item another way although it could have been built as worded says so, with what it built, what the wording asked and why. The main session reads no code and cannot tell a sensible alternative from the requirement; without the mark such an item had no honest report, since `differs` needs a contradiction and `met` claims the wording.
- **Both are the user's call.** The main session shows the wording, what was built and why; for `preferred` the question says the item could have been built as worded. Accepted: the "Done when" item is rewritten to what was built, and the old wording and reason go into "Notes", so the reviewer and the summary read one wording, and the summary names it as a deviation. Not accepted: a fix round with the item in the task's wording; a `preferred` item is rebuilt as worded, a `differs` item comes back `not fixed` unless the entry makes room for it.
- **A "(test)" item is written test first.** The implementer runs the test before the code; it must fail for the reason the item names. The command and the failing line are the item's `red:` line in the report. A test that passes before the code does not test the item.
- **The roles do not commit.** They leave their changes in the working tree. Committing belongs to the main session, which records the status too.

### Checks that need the environment

A check that starts a service, needs a running stack or changes data runs only with the user's yes. A plan marks such a check `needs:`, but the rule lives in the role files: the implementer and the reviewer run one only when their input lists it as allowed. An item whose only check was not allowed is reported `built, not verified`. `sw:implement` then asks the user once whether the check may run and goes on to the review either way. If the check could not run, the summary records the item as `unverified` and the task stays open.

The question is asked also when the plan's approval was waived. Only a standing answer in the user's first message ("the dev server may run") replaces it. In every unattended Superwiki run of the pilot the main session had treated the check as not allowed without asking.

### Reviewing

A task whose frontmatter has `review:` is reviewed after the implementer's report passes. The reviewer lists what the change claims, tries to break each claim, checks whether a test would fail if the claim were false, and classifies what it finds. It sees the change, not the reasoning that produced it, and its instructions forbid editing the repository.

Blocking findings go back as a fix round: to the implementer that did the work where the tool can continue it, otherwise to a fresh one. Each later review is done by a fresh reviewer that is given every file the task changed and the earlier blocking findings; it rechecks those first. After two rounds that still fail, the findings go to the user.

The same review can be asked for on its own. `sw:review` dispatches the reviewer for one task of any status, with the files the task changed, and reports the verdict; it changes no file and no status, and on a `done` task with blocking findings it offers one follow-up task, created only when the user says yes. It adds no role and no second set of review rules: the reviewer and the dispatch are those of `sw:implement`.

### Closing

A report that says `met` is a claim, and the session that receives it is inclined to believe it. Before `sw:implement` sets `done` it follows `sw:verify`: one command per "Done when" item, run then, with the verdicts written into the task file where `check` reads them.

The summary runs in the main session, not in the implementer and not in a fourth subagent. The agent that did the work is the one whose word is being checked, and the commands are few and their output short, so the main session can afford them.

`sw:implement` ends by telling the user to start the next task in a new session. The task is recorded in files, so nothing is lost, and the next task does not pay for this one's history.

### Evidence that can fail

A command per item is not enough: the pilot's summaries all accepted an assertion against a `NOT NULL` column as proof that "every movement is dated". The database enforces that constraint, so the test passes whatever the code does. The closing rules now ask for evidence that could have come out the other way.

- **`falsifies:`.** Each entry that names a command says how that command would have failed if the item did not hold: the exit code, the missing line, the changed count, for this item's rule. A command for which no such line can be written proves nothing, and the item is `unverified` with the reason `the command cannot fail`. `sw:verify` names three shapes of it: an assertion on a schema constraint, a test of what a mock returns, and a concurrency test whose threads are serialised before the lock.
- **Text and behaviour.** An item about text is proven by `grep`, `test -f` or `lint`. An item about behaviour, including what an agent following a prompt does, is proven by running the thing; finding the code or text that should cause it proves only that the text is there.
- **`red:`.** A "(test)" item carries the implementer's line from the run in which its test failed before the code. Without it the test has not been seen to fail, and the item is `unverified`.
- **One mutation run.** When an item is marked "(test)", the summary breaks the task's central rule on purpose, by removing the line that enforces it or inverting its condition, runs the test, notes which test went red, and restores the code from a saved copy. `git checkout` would also drop the task's uncommitted work. Nothing red means the test does not hold the rule. One run per task, not per item: each took under a minute in the pilot, and one per item would double a summary's time.
- **The guard run, last.** After every other command, the project's full check (its whole test or build command, with no filter) and the vault's `lint`, then `git status --porcelain` again. A filtered run as the last command can delete generated files and say nothing: in the pilot, one run's final filtered test command deleted the generated contract files, and its claim no longer matched its tree. A file deleted that the task did not delete makes the item that touched it `failed`.

### Area guides

A guide page per task area (layout, patterns, verification commands, gotchas) is read first where it exists and extended after each task. It is optional: in two measured runs it saved nothing visible, because it held what the previous task had needed and the next task needed something else. It stays for areas where several tasks keep needing the same facts.

## Why the work is split

The rules above come from session records of real projects. Each figure below is a single run or a pilot: read it as direction, not as a number to expect elsewhere.

### Three ways of working

| Flow | Steps | Largest request | Tokens sent |
| --- | --- | --- | --- |
| One long session plans, implements and reviews | 352, over several tasks | 640k | 100M |
| An orchestrator gives each task to one agent for analysis, plan and implementation, then to a reviewer | about 495 per task agent | 967k | 260M to 290M per task |
| Superwiki: a planner, an implementer and a reviewer per task | 149 for the task | 252k | 21M for the task |

- **One long session** pays for its whole history on every step.
- **One agent per task** starts clean, and that is not enough: an agent that does everything for a task fills its own context to the limit, and each of its five hundred steps pays for it.
- **A role per agent** keeps each context to what that role reads.

The tasks differ, so the ratios are not measurements. An order of magnitude between the second flow and the third is hard to explain by the tasks alone.

The Superwiki task in the last row was planned, implemented, reviewed, fixed after one blocking finding and reviewed again, in 37 minutes:

| Agent | Steps | Context, first to largest request | Tokens sent |
| --- | --- | --- | --- |
| Main session | 27 | 79k to 126k | 2.8M |
| Planner | 31 | 59k to 154k | 3.5M |
| Implementer | 68 | 59k to 252k | 12.2M |
| Reviewer | 23 | 60k to 137k | 2.4M |

The implementer sent more than half of the tokens, and its context grew fourfold, partly because the fix round continued the same agent, which keeps what it has read. A fresh implementer would start small but read the code again; which is cheaper has not been measured.

### Skipping the plan

Measured on a large monorepo with small tasks, as the context the subagents used:

| Flow | Context used |
| --- | --- |
| Planner, then implementer | about 234k tokens |
| Implementer only | 141k to 144k |
| Implementer only, with the reading rules | about 115k |

Skipping the plan for small tasks was the largest saving. The reading rules cut context by about a fifth and tool calls by a third on the same task. In that run the cheaper implementation also left out one of the states the task listed, which is why the implementer now reports on every requirement.

### The pilot of 2026-10-06

The first comparison on the same tasks. Two backend tasks of one project, one small and one medium, were each run from the same commit in two arms, Superwiki and a single-session workflow, twice per cell: eight runs. An evaluator checked every result against the task's "Done when" and scope items, and a blind review scored each on four criteria, 0 to 3 each. The summary is in [docs/wiki/benchmark-pilot.md](docs/wiki/benchmark-pilot.md).

| | Superwiki | Single session |
| --- | --- | --- |
| Small task, cost | $3.23, $2.79 | $4.81, $4.18 |
| Medium task, cost | $6.32 (no plan), $5.20 | $5.32, $5.19 |
| Peak context, all runs | 142k, 151k, 225k, 372k | 217k, 233k, 242k, 262k |
| Blind review, sum of four scores (0 to 12) | 9, 10, 10, 10 | 10, 9, 9, 9 |

On the small task the arms do not overlap: Superwiki was at least 23% cheaper. On the medium task they overlap. Quality was a tie, and every run passed the evaluator's acceptance. What it does not show: two backend tasks of one project, one operator, one day. Nothing about UI work, nothing about an approval stop in both arms, nothing about a second model mix. The single-session arm ran everything on Opus 5.5 in three of four runs, against the project's rule that implementation runs on Sonnet 5.5, so its token counts are not on the same model mix as Superwiki's.

What it found, and what each finding changed:

| Finding | Closed by |
| --- | --- |
| Evidence that cannot fail passed the summary gate, where three of four single-session runs had broken the rule on purpose to see the test go red; and a filtered last command deleted generated files ([Evidence that can fail](#evidence-that-can-fail)) | T-10: `falsifies:`, `red:`, the mutation run, the guard run; T-12: the "(test)" mark they read |
| A waiver of approval skipped the planner in one run of three, at 372k peak context; the environment question was never asked ([Three routes](#three-routes)) | T-11 |
| Three runs of the medium task built a lazy expiry where the task said "deleted once expired", and nobody was asked | T-13: the `preferred` mark; one item still open |

### What every agent starts with

Every agent in the 37-minute task above began at 59k to 79k tokens before it had read anything, and sent that again with each step: roughly eight of the twenty-one million tokens. Almost none of it was Superwiki's. The vault adds a block of rules of about 3 KB (2.7 KB when that task was measured). The rest was the user's environment:

| Part | Tokens | What it was |
| --- | --- | --- |
| Rule and memory files | 16.8k | the project's rules and a memory index of 67 entries |
| Built-in tool definitions | 15.1k | the tool's own |
| Skill list | 9.9k | 213 skills, most from plugins the project never uses |
| Agent list | 4.0k | 46 agents, most from the same plugins |
| System prompt and MCP server instructions | 6.1k | |

Part of that can be switched off per project. A first attempt took the start from 52k to 41.5k tokens by shortening the memory index and switching off four unused plugins. It also taught the two rules `sw:doctor` now follows:

- **A change is measured in a new session before it is called a saving.** One setting that should have dropped the account's connectors had no effect.
- **Fewer skills buys better descriptions, not fewer tokens.** The tool gives the skill list a fixed budget and shortens descriptions to fit, so the list stayed the same size.

## Running many tasks

`sw:implement` is written for one task with the user present. `sw:autopilot` works through several unattended. Each task goes through the same steps as a single one: `sw:plan-implement`'s routes, `sw:plan` for a large task, then `sw:implement` and `sw:verify`. On top of that `sw:autopilot` adds four things.

- **Standing answers.** What the single-task skills ask along the way is settled once: plan and split approval, which checks that need the environment may run, commit and push, whether to go on when a task stops. A question counts as answered only where the user's message speaks to it; the open ones are asked in one question. A message that rules out questions gets the defaults (approve, no such check, no commit, stop), stated in one `Standing answers:` line. Before the first task, the run checks that it can do what was agreed: lint is clean, an agreed commit is not refused, and changes in the tree that belong to no task are named.
- **Decisions in the user's place, written down.** A planner's question answered with its assumed answer, a plan approved, a split accepted, a `differs` or `preferred` item sent back for one fix round in the task's wording: each goes into the task's notes and into the run's report. Unattended means fewer questions, not more permission. A check that starts services or changes data still needs a yes given in advance.
- **Closing each task.** The outcome is recorded as for a single task. Then `lint` runs, so a lint error stops the run at the task that caused it, and the task is committed if that was agreed. Without commits the tasks' changes share one working tree, which is why the summary lists only the files that both git and the implementer's reports name.
- **Stop rules.** The run stops, with the task left in progress, on a requirement that stays unmet or a fix-round entry `not fixed`, a review that fails twice, a summary item that is failed or unverified, a lint error, a refused commit or push, or a large task when plans may not be approved without the user. A check that was not allowed stops it after the summary, not before the work: the task is built, reviewed and summarized, and the item stays `unverified`.

The orchestrating session watches its own size as well. After each task it reads its row in `sw.mjs usage` and stops between tasks above 200k tokens; the queue is in the files, so a new session resumes it at no cost. The limit is a first guess, not a measured optimum.

A skill cannot open a new session, so "a clean session per task" means a fresh subagent per role.

## Measuring a session

Two commands read the record an agent keeps of its own session. Neither writes anything: the numbers describe a session, not the project.

- **`sw.mjs usage`** (skill `sw:usage`) prints one row per agent, the main session and each subagent: steps, the context of the first and the largest request, tokens sent in total, the cached share, output, tool calls and minutes. `sw:implement` closes its report with it, and `sw:autopilot` uses it to watch its own size.
- **`sw.mjs doctor`** (skill `sw:doctor`) prints what the session started with: each part with its size and where it comes from, files by name, skills and agents by plugin, tools by server. The skill proposes what to switch off, asks, and changes project-local settings only. It never uninstalls a plugin or deletes a memory.

| Tool | Record | What it holds |
| --- | --- | --- |
| Claude Code | `~/.claude/projects/<project>/<session>.jsonl`, subagents in a folder beside it | usage per request; one block per piece of context the session was given |
| Codex | `~/.codex/sessions/<date>/rollout-*.jsonl`, one file per agent, joined by session id | usage per request; base instructions and the tagged blocks sent before the first request |
| Copilot CLI | `~/.copilot/session-state/<session>/events.jsonl` | totals per agent, written when the session closes; the system message; tool definitions counted at a usage checkpoint |

- The commands look for the session among the records of the project they run in: where the tool names it (Claude Code sets its id in the environment) that one, otherwise the project's most recently written one. A task whose session ran in another working directory is therefore not the one reported.
- `doctor` reports characters of text. A skill cannot run a tool's own context command (`/context`, `/status`), which shows the same parts in tokens; the skill uses those figures when the user pastes them.
- In Copilot CLI the token figures appear once the session has closed.
- These formats are not documented by their vendors and can change with a release. The commands then report less; the tests pin the shapes they read.

## Across agents

One `skills/` directory serves every agent. Claude Code loads it as the plugin `sw` (`.claude-plugin/`), which `npx superwiki install claude` installs through Claude Code's own plugin CLI; Codex, Copilot CLI and other agents that read `~/.agents/skills` get a copy of each skill in the folder they read. `install.sh` does the same from a clone: the plugin with the checkout as its marketplace, the copies as links.

### Names

Every skill is written and invoked as `sw:<name>`: `sw:plan`, `sw:implement`, `sw:plan-implement`. `sw:` is the namespace Claude Code gives the skills of the plugin `sw`, and a colon is not allowed in a skill's `name:` field, so the only way to the name is the plugin: the folders are `skills/plan/`, `skills/implement/` and so on, each `SKILL.md` carries the bare name, and the plugin prefixes it. A folder named with the prefix would show as `sw:sw-<name>` in a plugin install and as `sw-<name>` in a copy, two names for one thing, which is what the skills had until T-14. Bare-named copies under `.claude/skills` are not an option either: `init` and `review` would collide with Claude Code's built-in `/init` and `/review`. So for Claude Code it is the plugin or nothing.

Codex and Copilot CLI have no namespace. There the installer and `init.mjs --skills` copy each skill as `sw-<name>` and rewrite the `name:` line of the copy to match its folder; a link made by `install.sh` keeps the bare name, since the file is the checkout's. The `AGENTS.md` block says once that these two agents see the skills as `sw-<name>`, and the skill texts, the role files, the README and the evals say `sw:<name>` everywhere else. The routing eval lists the skills as the plugin shows them, with the plugin name read from `.claude-plugin/plugin.json`.

Each name says the skill's scope. `plan-implement` takes one task to done, planned first when its size calls for a plan: the composition of `sw:plan` and `sw:implement`, which the name spells out; a single verb would hide the plan, or read as finishing a half-done job. `autopilot` is many tasks, unattended. `verify` is a command per "Done when" item, then the close, rather than a summary written from memory. `usage` is what the session has cost. `index` rewrites the task list in `index.md`, and `view` opens the vault in the browser; both are named after the thing the user wants, since each is a single command. The CLI follows the last two: `sw.mjs index` and `sw.mjs usage` are the commands, and `board` and `stats` work as aliases, so a vault whose script predates them keeps working with the skills of either version.

The plugin install supersedes the `commands/` folder and T-07's work on it. A plugin loads `commands/*.md` as skills, so the folder had put a second description of every skill into the model's context, and each file carried `disable-model-invocation: true` to hide it; the plugin names the skills `/sw:<name>` on its own, so the folder, the field and the test that kept the two folders in step are gone. `test/skills.test.mjs` now checks the folder names, the `name:` of each `SKILL.md` and that `commands/` does not exist.

### Where the skills live

The skills live in the home folder, where they serve every project on the machine, or in the repository, where they are committed. The second exists for cloud agents (Claude Code on the web, Codex cloud, the Copilot coding agent): they start from a clone and see no home folder, so without it they get the rules in `AGENTS.md` and none of the skills those rules name.

| Agent | Home folder | Project |
| --- | --- | --- |
| Claude Code | the plugin at user scope (`~/.claude/settings.json`) | the plugin at project scope (`.claude/settings.json`) |
| Codex | `~/.agents/skills` | `.agents/skills` |
| Copilot | `~/.copilot/skills` (it also reads `~/.agents/skills`) | `.agents/skills` |

- **The installer runs Claude Code's CLI, not a file writer.** `claude plugin marketplace add <source> --scope user|project` then `claude plugin install sw@superwiki --scope user|project`, from the project folder for project scope; `uninstall` reverses it. Checked on 2026-10-07 in a scratch `CLAUDE_CONFIG_DIR`: a project install writes `.claude/settings.json` with `"enabledPlugins": {"sw@superwiki": true}` (an object, not the array one documentation page shows) and `"extraKnownMarketplaces"` with the marketplace's source, `claude plugin details sw` lists the seventeen skills by their bare names, and both commands exit 0 when run again. Settings alone install nothing: with them written by hand, `claude plugin list` shows no plugin. The marketplace source is the GitHub repository `mhmtsrfglu/superwiki` for an npm install and the checkout's path with `--link`.
- **Both entry points ask.** The installer asks when it runs in a terminal without `--global` or `--project`; `sw:init` asks with its other questions on a new vault whether to keep the Codex and Copilot copies in the repository. They are reached on different paths: a first install, and a vault set up from skills that are already in the home folder. Without a terminal the installer asks nothing and uses the home folder, so scripts behave as before.
- **`init.mjs` copies from the folders next to its own skill folder**, not through the installer. An installed skill folder does not contain the installer, and the copy has to work offline and from a plugin install. The two entry points share a convention and no code. Which siblings are its own it tells from its own folder's name: under `skills/` of a checkout or a plugin, bare-named, every sibling with a `SKILL.md` is Superwiki's; in an agent's skills folder, where it is itself an `sw-<name>` copy, only the siblings with the same prefix are, since other skills sit there too.
- **A marker file decides ownership.** A skill folder that carries `.sw-installed` is replaced with the current version. A folder of the same name without it, or a link, is someone else's: it is kept and reported, and only the installer's `--force` replaces it. The marker kept its name through the rename, so a copy made before it is recognised and replaced without `--force`.
- **The choice is saved** as `skills` in `docs/.sw/config.json`, a list of agent names, so an upgrade run of `init.mjs` updates the repository's copies along with the other tool-owned files. Nothing is deleted: not when the choice is withdrawn, and not when a later version drops a skill. A saved `claude`, from before the plugin install, is skipped without a word.
- **The project's own copy does not update itself.** When `init.mjs` runs from `.agents/skills` of the project it is setting up, it touches that folder not at all and says so. Those copies are updated by the installer or by a run from a home or plugin install.
- **Links stay in the home folder.** A link into a project points into one machine. The installer warns and goes on, since a project that is never cloned elsewhere can still use one.

### Models and subagents

No tool lets a skill change the running session's model. Model choice therefore works the same way everywhere: `sw:config` writes one agent file per role, and each file carries a model.

| Agent | Agent files |
| --- | --- |
| Claude Code | `.claude/agents/sw-planner.md`, `sw-implementer.md`, `sw-reviewer.md` |
| Codex | `.codex/agents/sw-planner.toml`, `sw-implementer.toml`, `sw-reviewer.toml` |
| Copilot CLI and VS Code Copilot Chat | `.github/agents/sw-planner.agent.md`, `sw-implementer.agent.md`, `sw-reviewer.agent.md`; both hosts read that folder |

The Claude Code reviewer file also carries `tools: Read, Grep, Glob, Bash`: reading, searching and the shell, none of the editing tools. The Codex and Copilot files carry no tools list: the Codex file format has no field for one, and the `tools` field of a Copilot agent file is not written because its values are not known for the shell; their reviewers are kept from editing by instruction only.

The skills dispatch those agents by name. Where they are missing (a session that began before the files existed, a tool without subagents, a project whose rules forbid them), the skills follow the role's instructions in the main session and say that the configured model and the clean context were not used. A review done that way is weaker, and the skills say so.

**Where the role files live.** `planner.md` is `skills/plan/assets/planner.md`; `implementer.md` and `reviewer.md` are `skills/implement/assets/`. Each sits in the skill that dispatches it, so a skill names its role file as `<skill-dir>/assets/<role>.md`, a path that resolves in the plugin, in an `sw-<name>` copy and through a link alike. Until T-27 they were in the sw:config skill's `assets/` folder and the skills named them by a path through `../config/`, which holds only where the folders carry bare names: in a copy the folder is `sw-config`, and the first Copilot run of this version (VS Code Copilot Chat, 2026-10-08) searched `~/.copilot/skills/config/` for the implementer's file, found nothing, and improvised the implementer's work in the main session. `config.mjs` reads the role files from its sibling skill folders, found the way `init.mjs` finds the skills it copies: by its own folder's name, bare siblings under `skills/` of a checkout or a plugin, `sw-` siblings in an agent's skills folder; a linked script runs at its real path, so it sees the checkout. No vault holds a role file, so a vault of an earlier version needs no migration: `sw:config sync` regenerates the agent files from the new places.

#### Read from the vendors' documentation (2026-10-08)

The hosts' rows in `sw:plan`, `sw:implement` and `sw:config` carry only facts from these tables. Each cell names the page it was read from; "not documented" means the pages listed were read on 2026-10-08 and do not give the fact. A fact the skills used before this date and the pages do not give (Copilot CLI's `task` tool, VS Code's `runSubagent`, a snake_case rule for Codex agent names) is not in the skills any more.

Copilot CLI:

| Fact | What the documentation says | Read from |
| --- | --- | --- |
| Agent folder | project: `.github/agents/`; user: `~/.copilot/agents/`; organization and enterprise: `/agents` in the `.github` or `.github-private` repository | [create-custom-agents-for-cli](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli), [invoke-custom-agents](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/invoke-custom-agents) |
| File format | Markdown with YAML frontmatter, extension `.agent.md` (the id is the file name without `.agent.md` or `.md`); `description` and the body (the prompt) are required, `name` and `tools` optional; `include-custom-instructions` is also shown | [about-custom-agents](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-custom-agents), [create-custom-agents-for-cli](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli) |
| Subagent invocation | the user selects an agent with `/agent`, names it in the prompt ("Use the refactoring agent to ..."), or starts the CLI with `copilot --agent <name>`; "the AI model being used by the CLI can choose to delegate a task to a subsidiary subagent process, that operates using a custom agent". The name of the tool the model delegates with: not documented. A `task` tool: not documented (the reference lists a built-in "Task" agent that runs commands such as tests and builds, which is something else) | [invoke-custom-agents](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/invoke-custom-agents), [cli-command-reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference) |
| Skills folders | project: `.github/skills`, `.claude/skills`, `.agents/skills`; personal: `~/.copilot/skills`, `~/.agents/skills`; another location with `/skills add`. A skill is used as `/<name>` in the prompt | [add-skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills) |
| Plan mode | `Shift+Tab` or `/plan`; Copilot asks clarifying questions, "saves the plan to `plan.md` in your session folder" and "waits for your approval before implementing"; `Ctrl+y` opens the plan in the editor. Whether the shell is available in plan mode: not documented | [cli-best-practices](https://docs.github.com/en/copilot/how-tos/copilot-cli/cli-best-practices), [cli-command-reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference) |

VS Code Copilot Chat:

| Fact | What the documentation says | Read from |
| --- | --- | --- |
| Agent folder | workspace: `.github/agents` (and `.claude/agents` in Claude's format); user: `~/.copilot/agents` or `~/.claude/agents` | [custom-agents](https://code.visualstudio.com/docs/agent-customization/custom-agents) |
| File format | `.agent.md`, YAML frontmatter with `name` (optional, defaults to the file name), `description`, `tools`, `model`, `agents`, `handoffs`, `user-invocable`, `disable-model-invocation`, `target`; the Markdown body is the instructions | [custom-agents](https://code.visualstudio.com/docs/agent-customization/custom-agents) |
| Subagent invocation | the user picks a custom agent in the Agent dropdown of the Chat view; an agent delegates with the `agent` tool to the agents its `agents` frontmatter lists (`*` for all, `[]` for none), and that tool must be in its `tools`; "each subagent works in its own context ... In the Local harness, subagents receive the delegated task and applicable instructions, not the main conversation history". Which custom agent a delegation from the main session runs when the session itself has no `agents` list, and a tool named `runSubagent`: not documented | [custom-agents](https://code.visualstudio.com/docs/agent-customization/custom-agents), [concepts/agents](https://code.visualstudio.com/docs/agents/concepts/agents) |
| Skills folders | workspace: `.github/skills`, `.claude/skills`, `.agents/skills`; user: `~/.copilot/skills`, `~/.claude/skills`, `~/.agents/skills`; `chat.agentSkillsLocations` is deprecated. A skill is used by `/` in the chat or picked by description | [agent-skills](https://code.visualstudio.com/docs/agent-customization/agent-skills) |
| Plan mode | `/plan` or Plan in the agent picker; "by default, this agent researches your project without editing project files"; in Local sessions "the plan is stored in session memory at `/memories/session/plan.md`, not as a project file"; after approval, "Implement Plan" or "Approve Plan Only" | [run/planning](https://code.visualstudio.com/docs/agents/run/planning) (the address `docs/copilot/agents/planning` redirects there) |

Codex:

| Fact | What the documentation says | Read from |
| --- | --- | --- |
| Agent folder | personal: `~/.codex/agents/`; project: `.codex/agents/`; a role can also be declared in `config.toml` under `[agents]` with `config_file` and `description` | [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) (the address `developers.openai.com/codex/subagents` redirects there), [config-reference](https://learn.chatgpt.com/docs/config-file/config-reference) |
| File format | TOML; `name`, `description` and `developer_instructions` required; `model`, `model_reasoning_effort`, `sandbox_mode`, `mcp_servers`, `skills.config` optional; the `name` field is authoritative, a matching file name is recommended. A rule on the form of the name (snake_case): not documented | [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) |
| Subagent invocation | the user instructs it ("spawn two agents", "use one agent per point"); the model's tools are `spawn_agent`, `send_input`, `resume_agent`, `wait_agent`, `close_agent`, under `features.multi_agent` and `agents.enabled`, both on by default. Whether `spawn_agent` takes a custom agent's name: not documented | [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents), [config-reference](https://learn.chatgpt.com/docs/config-file/config-reference) |
| Skills folders | `.agents/skills` of the working directory, of each parent up to the repository root, and of the repository root; `$HOME/.agents/skills`; `/etc/codex/skills`. A skill is used as `$<name>` or picked by description | [build-skills](https://learn.chatgpt.com/docs/build-skills) (the address `developers.openai.com/codex/build-skills` redirects there) |
| Plan mode | not documented on these pages | [config-reference](https://learn.chatgpt.com/docs/config-file/config-reference) |

## Viewer and CLI

`src/core.js` holds the vault model, derived task state, lint and search. It is bundled into `docs/.sw/sw.mjs` for Node and inlined into `docs/viewer.html` for the browser, so both report the same findings. That includes a task's `## Summary`: `check`, `lint` and the viewer's task drawer read the same verdicts.

`sw:init` copies the CLI and the viewer into the project. Skills therefore call `node docs/.sw/sw.mjs` the same way in every agent, and a project keeps working with the version it was set up with. The price: after Superwiki is updated, a project has the old script until `sw:init` runs there again. A skill that needs a command the script lacks says so and offers to run it.

`sw:view` runs `sw.mjs serve --open`: a small server on 127.0.0.1, started once per project, reused, and gone after two idle hours. It reads the vault from disk on every refresh, so any browser works. Without the server, `sw.mjs snapshot` writes the pages to `docs/.sw/data.js` and the viewer opens as a file, frozen at that moment. `data.js` and the server's address file are git-ignored.

Some skills are a single command. `sw:index` and `sw:view` exist so that the user has something to type, and so that the agent runs the command instead of doing the job by hand.

## Migration

`sw:migrate` converts a table-based task index without the agent reading it. The script's `--inspect` prints the task tables, their columns, the values of status-like columns and the files with per-task headings; from that the agent writes a mapping. A dry run lists the problems that must be fixed and, separately, what is only for information. The conversion runs on a branch of its own and never merges.

- A mapping can keep any column as a frontmatter field (a review class becomes `review:`) or as a body section.
- Superwiki owns `docs/wiki/`, `docs/tasks/` and `docs/plans/`. A file already there that the mapping does not consume is a problem until it is named in `archiveAlso`.
- Everything consumed or archived moves to `docs/legacy/` with its layout and with working links.
- What is not converted (rules and milestones in the old index, other document folders, instruction files that describe the old index) is listed for the user to decide.

## Evals

The tests cover the scripts. The skills are texts an agent follows, and a text is tested by having an agent follow it. Two evals in [evals/](evals/README.md) do that, with fixed inputs, so they can be repeated after any change to a description or a skill text; each run is a row in `evals/results.md`. Both came from an audit of the skill texts on 2026-10-05, which found the main path sound, the exception paths not, and nothing that measured behaviour.

| Eval | Question | How |
| --- | --- | --- |
| Routing | Which skill does an agent pick first for a user's message? | A script builds a probe from the current descriptions, named `sw:<name>` as the plugin shows them, and the `AGENTS.md` block; three fresh agents per condition say which skill they would invoke for each of 36 typical first messages; the script scores the answers against an expectation per message. Run without and with a competing skill set's descriptions and session-start text |
| Dry-run | Where does a fresh reader of the skill texts have to guess? | Fresh agents follow the texts alone through concrete scenarios, one task through `sw:plan-implement` and the three roles, or an unattended `sw:autopilot` over three tasks, and report each place they must guess, find two texts that disagree, or reach a case no text covers, with what it could cause |

- **Places, not totals.** A dry-run reader's total varies from 11 to 16 findings on nearly the same text. What is compared is whether a reader still reports something at the places a change was about.
- **What they do not show.** The routing eval is an agent's statement on one model, not a skill firing in a live session. The dry-run builds nothing, so a clean one does not show that the workflow works end to end.
- **They close text tasks.** By `sw:verify`'s own rule, a requirement about what an agent following a prompt does is proven by an agent following it. Each of T-10 to T-13 was closed, or held open, on fresh readers of the chain brief.

## Status

Superwiki is early. This section says what rests on evidence and what does not.

### Proven

| Part | Evidence |
| --- | --- |
| Core, task list, CLI, installer, session readers | unit tests (`npm test`) |
| Viewer | headless Chromium on the demo vault and on a migrated 165-task project |
| The plugin install | `claude plugin marketplace add <checkout> --scope project` and `claude plugin install sw@superwiki --scope project` in a scratch `CLAUDE_CONFIG_DIR` on Claude Code 2.1: `claude plugin details sw` lists the seventeen skills by their bare names, the settings hold the plugin and the marketplace, and `claude plugin uninstall` removes it |
| `sw:init` | followed by a fresh agent on a scratch project |
| `sw:migrate` | an earlier version followed twice by a fresh agent on a 165-task project, checked by an independent parse of the source. The current version converted a 48-task project with matching counts and a clean lint, run by the session that wrote the skill |
| `sw:ingest`, `sw:lint`, `sw:explain`, `sw:triage`, `sw:search` | followed once by a fresh agent on a copy of the demo vault |
| `sw:plan-implement`, `sw:implement`, `sw:verify` | run on real tasks in Claude Code many times: M-03, M-04 and the four Superwiki runs of the pilot on one backend project, unattended under a waiver; T-10 to T-13 on this repository, attended, on the small and medium routes. The summaries of T-10 to T-13 carry a `falsifies:` line per item and a guard run |
| `sw:plan` and the review | run end to end once in Claude Code on a real task that required a review: the agents were dispatched by name on their configured models, the reviewer found one blocking defect, the implementer fixed it and the second review passed. The planner also ran in two of the pilot's runs |
| `sw:implement` on a cheaper model | three real tasks with the implementer on a cheaper model; code, tests and repository checks passed, the visual checks were not allowed to run |
| Skill texts after T-10 to T-13 | dry-run: eighteen fresh readers in nine rounds of two (six for T-10, two for T-11, ten for T-12 and T-13 together) |
| Skill names `sw:<name>` and the six renames (T-14) | routing on 2026-10-07: 36 of 36 expectations matched in every repetition in both conditions, three fresh agents each, agreement 36 of 36 in both; the thirteen messages aimed at a renamed skill reached it in 3 of 3, with and without the competing set. Unsure marks stayed where they were: 23 in every repetition, 27 and 32 in some. Run twice more the same day, on the name `plan-implement` and then with the descriptions stripped of every former name: alone, 36 of 36 both times; with the competing set, 35 of 36 both times, the one miss message 32 ("write a unit test for the React component", expected `none`) to the competing TDD skill in 1 of 3, a message that names no sw skill; the three messages aimed at `sw:plan-implement` reached it in 3 of 3 in every run, citing "do this task" or "plan and implement" from the description |
| `sw.mjs usage`, `sw:usage` | run on real session records of Claude Code 2.1, Codex CLI 0.153 and Copilot CLI 1.0.91. The Copilot totals match the tool's own closing record |
| `sw.mjs doctor` | run on the same records. For Claude Code the parts agree with the tool's `/context` |
| `sw.mjs index` | run on two real projects, 48 and 165 tasks; lint clean afterwards |
| Codex CLI 0.153, Copilot CLI 1.0.31 | skills found; a blocked task refused; `sw:plan` run with the generated planner agent, on an earlier skill version |

### Not yet proven

Skills and rules that have not been followed by an agent, or not everywhere:

- `sw:autopilot` has not been run as itself; the pilot's unattended runs were `sw:plan-implement` under a waiver. How much the orchestrating session grows per task, and whether 200k is the right place to stop, is unknown.
- The rules added after the pilot are proven as texts, by readers and the routing eval, not by a live run: no task with a "(test)" item has been closed under them, so the `red:` line, the mutation run and the planner's `Marks:` have not been used; the waiver path has not run since T-11 changed it.
- The texts of `sw:view`, `sw:doctor` and `sw:index` have not been followed by a fresh agent.
- `sw:brainstorm` has not been followed by a fresh agent on an idea or on a task: whether the rounds end, whether the written-back understanding is confirmed before anything is written, and whether the task files it writes are what `sw:plan` needs, is known from the text and the routing eval only.
- `sw:review` has not been followed by a fresh agent; T-08's scenarios cover it.
- Codex and Copilot CLI: `sw:plan-implement`, `sw:implement`, the review and the current `sw:plan` have not been run there, and the `sw-<name>` copies have not been loaded there since the rename.
- Copilot CLI: whether the `model:` field of a generated agent file is honoured.
- The plugin from the GitHub marketplace: only the local checkout has been added as a marketplace. That `claude plugin marketplace add mhmtsrfglu/superwiki` finds `.claude-plugin/marketplace.json` at the repository root is known from the documentation. The Codex plugin manifest (`.codex-plugin`) validates but has not been installed.
- Skills kept in the repository: no cloud session has been run. That Claude Code on the web enables the plugin named in `.claude/settings.json`, and that Codex cloud and the Copilot coding agent load skills committed to `.agents/skills`, is known from their documentation only, for Codex cloud partly from a secondary source. `sw:init`'s question about it has not been followed by an agent. The installer's question was checked by hand in a pseudo-terminal; the tests cover the flags and the run without a terminal.
- Agents other than the three named: nothing has been run.

Cost:

- Whether the pilot's saving on a small task holds beyond two tasks of one project, on UI work, with an approval stop in both arms, or with both arms on the same model mix.
- Whether a fix after a review is cheaper in the implementer that did the work or in a fresh one.
- What the mutation run and the guard run add to a summary on a project with a slow full check.
- Whether listing tools in a generated agent file (`tools:`) keeps a subagent from carrying the skill and tool lists. The Claude Code reviewer file now carries one, so the next `usage` on a review can answer it.
- How to switch an account's connectors off for one project from a file. Only the tool's own `/mcp` panel is known to do it, and its effect on the start has not been measured.

Behaviour:

- Whether the rules in `AGENTS.md` make agents reach for the skills unprompted in a live session. The routing eval shows what agents say they would pick, not what fires.
- Whether agents keep the task list current. The rule is in `AGENTS.md` and in the skills, and only lint notices when it is not followed.
- Whether a reviewer told not to edit the repository always complies. The Claude Code reviewer has no editing tools, so it cannot edit through them; whether it writes through the shell despite its instruction is still open. The Codex and Copilot CLI reviewers are kept from editing by instruction only.

### Known gaps

- `sw.mjs usage` reads the sessions of the project it runs in. A task run from another working directory reports the wrong session.
- Skills kept in a project are picked up by the project's own lint and format checks unless they are told to ignore the folders. Nothing sets that up.
- A project's existing rules can contradict the Superwiki block, and nothing detects it. In the pilot, a rule against subagents made the main session plan and implement itself, at a higher cost.
- Under a waiver, the main session treated a check that needs the environment as not allowed without asking. Fixed by T-11; not yet observed in a live run since.
- Dry-run places still open: the command for an item that needs the dev server, and who stops the server afterwards; the Goal and file of a task created by a split, the Goal being what the mutation run aims at; how much the medium route's Approach note may say about checks, and what counts as one of its five lines; what "two such rounds" of review counts; and AGENTS.md's `sw:triage` rule before a review's fix round.
- Session records: a Copilot session that was resumed closes more than once, and `usage` adds the closing records up; whether each one covers only its own run has not been checked. Codex and Copilot sessions longer than a few steps have not been read. The `doctor` output for Codex and Copilot has not been compared with those tools' own commands.
- The summary in the viewer's task drawer has not been looked at in a browser; its parsing is unit-tested.
- Migration leaves links in files outside `docs/` (for example `architecture.md`) pointing at archived files.
