# Superwiki design

This file explains why Superwiki works the way it does. How to install and use it is in [README.md](README.md); how to build it is in [CONTRIBUTING.md](CONTRIBUTING.md).

Superwiki is a set of agent skills that turn a project's `docs/` folder into a wiki the coding agent writes and keeps current, with an optional task tracker. The wiki follows the LLM Wiki pattern described by Andrej Karpathy: raw sources, a wiki the agent owns, and a schema that tells the agent how to maintain it.

Contents: [Principles](#principles) · [The vault](#the-vault) · [How a task runs](#how-a-task-runs) · [Why the work is split](#why-the-work-is-split) · [Running many tasks](#running-many-tasks) · [Measuring a session](#measuring-a-session) · [Across agents](#across-agents) · [Viewer and CLI](#viewer-and-cli) · [Migration](#migration) · [Status](#status)

## Principles

Every decision below follows from one observation: what a task costs is what the agents read, and each step of a session sends everything read so far again.

1. **Little to read.** The only mandatory read is `index.md`. `log.md` is read with `tail`, never whole.
2. **A fact has one home.** A task's status is in its frontmatter only. Counts, blockers and the task list are computed from the task files.
3. **Scripts answer mechanical questions.** "What is ready?", "what blocks this?" and "is anything broken?" are answered by `docs/.sw/sw.mjs`, not by reading files.
4. **Work happens in clean contexts.** Planning, implementing and reviewing each run in a subagent that starts empty and ends with the task.
5. **Done means verified.** A task closes on a command run for each requirement, not on an agent's word.

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
- Execution order is derived from dependencies plus optional `priority`. There is no stored sequence number or dependency table.
- A single-project repository uses one area (default `T`); the viewer hides area cards and the area filter then.

### The summary that closes a task

A closed task ends with a `## Summary` section, written by `sw-summarize`:

| Part | Holds |
| --- | --- |
| `### Plan` | the approach as planned |
| `### Implementation` | what was built, and each deviation |
| `### Changes` | the task's files, taken from git. For uncommitted work: the files that both git and the implementer's reports name, since the working tree can hold other tasks' changes |
| `### Verification` | one numbered entry per "Done when" item: a bold verdict (`verified`, `unverified` or `failed`), then the command and its result |

An item without an entry counts as unverified. `check` says `can finish: yes` only when every item is verified. `lint` reports `done-unverified` for a `done` task whose summary holds an unverified or failed item. A `done` task with no summary predates the rule and is not a finding.

### The task list in the index

`index.md` opens with a generated section: the counts, then the tasks in progress, ready and blocked, a line each with a link, the milestone and what a blocked task waits on; finished tasks by id only. It exists so that a person who reads the vault as files, in an editor or in Obsidian, can follow the work without the viewer.

- **It is a view.** Status still has one home. The agent runs `sw.mjs board` after it changes a task. `lint` warns (`stale-board`, `missing-board`) when the section does not match the task files, so a status edited by hand is caught at the next check. Nothing rewrites the file as a side effect of a read.
- **It lives in the index, not in a file of its own.** That is where a person looks, and the agent reads the index first anyway, so it sees what is ready without a command.
- **It costs what the open work costs.** A finished task takes nine characters. Open tasks take a line each: 2 KB on a project with 28 open tasks, 7.7 KB on one with 97. A backlog of hundreds of blocked tasks would make this the largest thing a session reads; listing blocked tasks by id only is the next cut, not made yet.

### The rules in AGENTS.md

`sw-init` writes a block of rules into `AGENTS.md`. It holds what must apply without any command: read the index first, keep task status, the task list and the log current, and log work that belongs to no task. It also tells the agent which skill to reach for, ahead of other planning or debugging skills. A skill's description alone proved too weak a trigger when another skill set competes for the same words.

## How a task runs

Three roles do the work, each in its own subagent on the model set with `sw-config`: a planner, an implementer and a reviewer. The main session dispatches them, reads their reports and records the task's status. It reads neither the code nor the plan.

### Three routes

`sw-do` sorts a task from its task file alone.

| Size | When | What happens |
| --- | --- | --- |
| Small | one area, three "Done when" items or fewer, nothing left open, a few files | the implementer runs straight from the task file |
| Large | any of: more than six "Done when" items, more than one area, an open question, a required review, or a new format, interface or migration other work will depend on | the planner writes a plan and the user approves it |
| Medium | everything between | an "Approach" note of three to five lines in the task's "Notes", then the implementer |

The reasoning is cost. A plan costs a planner run that reads the code; a note costs a few lines. The note is written without reading code, so it orders the work and names the checks but settles no technical question. Skipping the plan has a price too: questions a planner would have put to the user are decided by the implementer and reported afterwards.

### Planning

The planner writes the plan file as `status: draft` and returns a few lines. The main session shows those to the user in a normal message; approval changes the file to `approved`. Plan mode is not used: a reply that agrees to a split or changes an answer needs files written before the plan is shown again.

### Implementing

- **Reading follows rules.** Locate before opening, open the range and not the file, one example per pattern, trust generated types, batch lookups, never read twice.
- **The task text decides the work.** The implementer lists every requirement the task states and marks each `met`, `built, not verified`, `not met` or `differs`. A missing or differing item is not done until the user accepts it.
- **`differs` is narrow.** It is allowed only where an item cannot be built as worded, because the wording contradicts the code, another requirement or a project rule. A mere preference is built as worded and reported as an open decision.
- **An accepted difference is written into the task.** The "Done when" item is reworded to what was built, and the old wording and the reason go into "Notes", so the reviewer and the summary read one wording. A difference the user does not accept goes back to the implementer.
- **The roles do not commit.** They leave their changes in the working tree. Committing belongs to the main session, which records the status too.

### Checks that need the environment

A check that starts a service, needs a running stack or changes data runs only with the user's yes. A plan marks such a check `needs:`, but the rule lives in the role files: the implementer and the reviewer run one only when their input lists it as allowed. An item whose only check was not allowed is reported `built, not verified`. `sw-implement` then asks the user once whether the check may run and goes on to the review either way. If the check could not run, the summary records the item as `unverified` and the task stays open.

### Reviewing

A task whose frontmatter has `review:` is reviewed after the implementer's report passes. The reviewer lists what the change claims, tries to break each claim, and classifies what it finds. It sees the change, not the reasoning that produced it, and its instructions forbid editing the repository.

Blocking findings go back as a fix round: to the implementer that did the work where the tool can continue it, otherwise to a fresh one. Each later review is done by a fresh reviewer that is given every file the task changed and the earlier blocking findings; it rechecks those first. After two rounds that still fail, the findings go to the user.

### Closing

A report that says `met` is a claim, and the session that receives it is inclined to believe it. Before `sw-implement` sets `done` it follows `sw-summarize`: one command per "Done when" item, run then, with the verdicts written into the task file where `check` reads them.

The summary runs in the main session, not in the implementer and not in a fourth subagent. The agent that did the work is the one whose word is being checked, and the commands are few and their output short, so the main session can afford them.

`sw-implement` ends by telling the user to start the next task in a new session. The task is recorded in files, so nothing is lost, and the next task does not pay for this one's history.

### Area guides

A guide page per task area (layout, patterns, verification commands, gotchas) is read first where it exists and extended after each task. It is optional: in two measured runs it saved nothing visible, because it held what the previous task had needed and the next task needed something else. It stays for areas where several tasks keep needing the same facts.

## Why the work is split

The rules above come from session records of two real projects. Each figure is a single run on a different task: read it as direction, not as a number to expect elsewhere.

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

### What every agent starts with

Every agent in the table above began at 59k to 79k tokens before it had read anything, and sent that again with each step: roughly eight of the twenty-one million tokens. Almost none of it was Superwiki's. The vault adds a 2.7 KB block of rules (1.7 KB without the task module). The rest was the user's environment:

| Part | Tokens | What it was |
| --- | --- | --- |
| Rule and memory files | 16.8k | the project's rules and a memory index of 67 entries |
| Built-in tool definitions | 15.1k | the tool's own |
| Skill list | 9.9k | 213 skills, most from plugins the project never uses |
| Agent list | 4.0k | 46 agents, most from the same plugins |
| System prompt and MCP server instructions | 6.1k | |

Part of that can be switched off per project. A first attempt took the start from 52k to 41.5k tokens by shortening the memory index and switching off four unused plugins. It also taught the two rules `sw-doctor` now follows:

- **A change is measured in a new session before it is called a saving.** One setting that should have dropped the account's connectors had no effect.
- **Fewer skills buys better descriptions, not fewer tokens.** The tool gives the skill list a fixed budget and shortens descriptions to fit, so the list stayed the same size.

## Running many tasks

`sw-implement` is written for one task with the user present. `sw-run` works through several unattended. Each task goes through the same steps as a single one: `sw-do`'s routes, `sw-plan` for a large task, then `sw-implement` and `sw-summarize`. On top of that `sw-run` adds four things.

- **Standing answers.** What the single-task skills ask along the way is settled once: plan and split approval, which checks that need the environment may run, commit and push, whether to go on when a task stops. The answers are checked against what the project allows before the first task is touched. A message that rules out questions gets the defaults, stated in one `Standing answers:` line.
- **Decisions in the user's place, written down.** A planner's question answered with its assumed answer, a plan approved, a split accepted, a default applied, a `differs` item sent back: each goes into the task's notes and into the run's report. Unattended means fewer questions, not more permission. A check that starts services or changes data still needs a yes given in advance.
- **Closing each task.** The outcome is recorded as for a single task. Then `lint` runs, so a lint error stops the run at the task that caused it, and the task is committed if that was agreed. Without commits the tasks' changes share one working tree, which is why the summary lists only the files that both git and the implementer's reports name.
- **Stop rules.** The run stops, with the task left in progress, on a requirement that stays unmet, a difference still there after one fix round, a review that fails twice, a summary item that is failed or unverified, a lint error or a refused commit. A check that was not allowed stops it after the summary, not before the work: the task is built, reviewed and summarized, and the item stays `unverified`.

The orchestrating session watches its own size as well. After each task it reads its row in `sw.mjs stats` and stops between tasks above 200k tokens; the queue is in the files, so a new session resumes it at no cost. The limit is a first guess, not a measured optimum.

A skill cannot open a new session, so "a clean session per task" means a fresh subagent per role.

## Measuring a session

Two commands read the record an agent keeps of its own session. Neither writes anything: the numbers describe a session, not the project.

- **`sw.mjs stats`** (skill `sw-stats`) prints one row per agent, the main session and each subagent: steps, the context of the first and the largest request, tokens sent in total, the cached share, output, tool calls and minutes. `sw-implement` closes its report with it, and `sw-run` uses it to watch its own size.
- **`sw.mjs doctor`** (skill `sw-doctor`) prints what the session started with: each part with its size and where it comes from, files by name, skills and agents by plugin, tools by server. The skill proposes what to switch off, asks, and changes project-local settings only. It never uninstalls a plugin or deletes a memory.

| Tool | Record | What it holds |
| --- | --- | --- |
| Claude Code | `~/.claude/projects/<project>/<session>.jsonl`, subagents in a folder beside it | usage per request; one block per piece of context the session was given |
| Codex | `~/.codex/sessions/<date>/rollout-*.jsonl`, one file per agent, joined by session id | usage per request; base instructions and the tagged blocks sent before the first request |
| Copilot CLI | `~/.copilot/session-state/<session>/events.jsonl` | totals per agent, written when the session closes; the system message; tool definitions counted at a usage checkpoint |

- The commands read the session they run in where the tool names it (Claude Code sets its id in the environment), otherwise the project's most recently written one.
- `doctor` reports characters of text. A skill cannot run a tool's own context command (`/context`, `/status`), which shows the same parts in tokens; the skill uses those figures when the user pastes them.
- In Copilot CLI the token figures appear once the session has closed.
- These formats are not documented by their vendors and can change with a release. The commands then report less; the tests pin the shapes they read.

## Across agents

One `skills/` directory serves every agent. `npx superwiki install <target>` copies the skills into the folder a tool reads; `install.sh` links them from a clone.

### Where the skills live

The skills live in the home folder, where they serve every project on the machine, or in the repository, where they are committed. The second exists for cloud agents (Claude Code on the web, Codex cloud, the Copilot coding agent): they start from a clone and see no home folder, so without it they get the rules in `AGENTS.md` and none of the skills those rules name.

| Agent | Home folder | Project |
| --- | --- | --- |
| Claude Code | `~/.claude/skills` | `.claude/skills` |
| Codex | `~/.agents/skills` | `.agents/skills` |
| Copilot | `~/.copilot/skills` (it also reads `~/.agents/skills`) | `.agents/skills` |

- **Both entry points ask.** The installer asks when it runs in a terminal without `--global` or `--project`; `sw-init` asks with its other questions on a new vault. They are reached on different paths: a first install, and a vault set up from skills that are already in the home folder. Without a terminal the installer asks nothing and uses the home folder, so scripts behave as before.
- **`init.mjs` copies from the folders next to its own skill folder**, not through the installer. An installed skill folder does not contain the installer, and the copy has to work offline and from a plugin install. The two entry points share a convention and no code.
- **A marker file decides ownership.** A skill folder that carries `.sw-installed` is replaced with the current version. A folder of the same name without it, or a link, is someone else's: it is kept and reported, and only the installer's `--force` replaces it.
- **The choice is saved** as `skills` in `docs/.sw/config.json`, a list of agent names, so an upgrade run of `init.mjs` updates the repository's copies along with the other tool-owned files. Nothing is deleted: not when the choice is withdrawn, and not when a later version drops a skill.
- **The project's own copy does not update itself.** When `init.mjs` runs from `.claude/skills` or `.agents/skills` of the project it is setting up, it touches neither folder and says so. Those copies are updated by the installer or by a run from a home or plugin install.
- **Links stay in the home folder.** A link into a project points into one machine. The installer warns and goes on, since a project that is never cloned elsewhere can still use one.

### Models and subagents

No tool lets a skill change the running session's model. Model choice therefore works the same way everywhere: `sw-config` writes one agent file per role, and each file carries a model.

| Agent | Agent files |
| --- | --- |
| Claude Code | `.claude/agents/sw-planner.md`, `sw-implementer.md`, `sw-reviewer.md` |
| Codex | `.codex/agents/sw-planner.toml`, `sw-implementer.toml`, `sw-reviewer.toml` |
| Copilot CLI | `.github/agents/sw-planner.agent.md`, `sw-implementer.agent.md`, `sw-reviewer.agent.md` |

The skills dispatch those agents by name. Where they are missing (a session that began before the files existed, a tool without subagents, a project whose rules forbid them), the skills follow the role's instructions in the main session and say that the configured model and the clean context were not used.

## Viewer and CLI

`src/core.js` holds the vault model, derived task state, lint and search. It is bundled into `docs/.sw/sw.mjs` for Node and inlined into `docs/viewer.html` for the browser, so both report the same findings. That includes a task's `## Summary`: `check`, `lint` and the viewer's task drawer read the same verdicts.

`sw-init` copies the CLI and the viewer into the project. Skills therefore call `node docs/.sw/sw.mjs` the same way in every agent, and a project keeps working with the version it was set up with. The price: after Superwiki is updated, a project has the old script until `sw-init` runs there again. A skill that needs a command the script lacks says so and offers to run it.

`sw-visualize` runs `sw.mjs serve --open`: a small server on 127.0.0.1, started once per project, reused, and gone after two idle hours. It reads the vault from disk on every refresh, so any browser works. Without the server, `sw.mjs snapshot` writes the pages to `docs/.sw/data.js` and the viewer opens as a file, frozen at that moment. `data.js` and the server's address file are git-ignored.

Some skills are a single command. `sw-board` and `sw-visualize` exist so that the user has something to type, and so that the agent runs the command instead of doing the job by hand.

## Migration

`sw-migrate` converts a table-based task index without the agent reading it. The script's `--inspect` prints the task tables, their columns, the values of status-like columns and the files with per-task headings; from that the agent writes a mapping. A dry run lists the problems that must be fixed and, separately, what is only for information. The conversion runs on a branch of its own and never merges.

- A mapping can keep any column as a frontmatter field (a review class becomes `review:`) or as a body section.
- Superwiki owns `docs/wiki/`, `docs/tasks/` and `docs/plans/`. A file already there that the mapping does not consume is a problem until it is named in `archiveAlso`.
- Everything consumed or archived moves to `docs/legacy/` with its layout and with working links.
- What is not converted (rules and milestones in the old index, other document folders, instruction files that describe the old index) is listed for the user to decide.

## Status

Superwiki is early. This section says what rests on evidence and what does not.

### Proven

| Part | Evidence |
| --- | --- |
| Core, task list, CLI, installer, session readers | unit tests (`npm test`) |
| Viewer | headless Chromium on the demo vault and on a migrated 165-task project |
| `sw-init` | followed by a fresh agent on a scratch project |
| `sw-migrate` | an earlier version followed twice by a fresh agent on a 165-task project, checked by an independent parse of the source. The current version converted a 48-task project with matching counts and a clean lint, run by the session that wrote the skill |
| `sw-ingest`, `sw-lint`, `sw-explain`, `sw-triage` | followed once by a fresh agent on a copy of the demo vault |
| `sw-implement` without a plan | run three times on real tasks with the implementer on a cheaper model; code, tests and repository checks passed, the visual checks were not allowed to run |
| `sw-plan`, `sw-implement` and the review | run end to end once in Claude Code on a real task that required a review: the agents were dispatched by name on their configured models, the reviewer found one blocking defect, the implementer fixed it and the second review passed |
| `sw.mjs stats`, `sw-stats` | run on real session records of Claude Code 2.1, Codex CLI 0.153 and Copilot CLI 1.0.91. The Copilot totals match the tool's own closing record |
| `sw.mjs doctor` | run on the same records. For Claude Code the parts agree with the tool's `/context` |
| `sw.mjs board` | run on two real projects, 48 and 165 tasks; lint clean afterwards |
| Codex CLI 0.153, Copilot CLI 1.0.31 | skills found; a blocked task refused; `sw-plan` run with the generated planner agent, on an earlier skill version |

### Not yet proven

Skills that have not been followed by an agent, or not everywhere:

- `sw-run` has not been run: how much the orchestrating session grows per task, and whether 200k is the right place to stop, is unknown.
- The texts of `sw-visualize`, `sw-doctor`, `sw-board`, `sw-summarize` and `sw-do` have not been followed by a fresh agent.
- Codex and Copilot CLI: `sw-implement`, the review and the current `sw-plan` have not been run there.
- Copilot CLI: whether the `model:` field of a generated agent file is honoured.
- Skills kept in the repository: no cloud session has been run. That Claude Code on the web, Codex cloud and the Copilot coding agent load skills committed to `.claude/skills` or `.agents/skills` is known from their documentation only, for Codex cloud partly from a secondary source. `sw-init`'s question about it has not been followed by an agent. The installer's question was checked by hand in a pseudo-terminal; the tests cover the flags and the run without a terminal.
- Plugin manifests (`.claude-plugin`, `.codex-plugin`) validate but have not been installed.
- Agents other than the three named: nothing has been run.

Cost:

- Whether the cost rules hold on projects unlike the two they were measured on.
- What splitting the work between roles saves on one task run both ways.
- Whether a fix after a review is cheaper in the implementer that did the work or in a fresh one.
- Whether listing tools in a generated agent file (`tools:`) keeps a subagent from carrying the skill and tool lists.
- How to switch an account's connectors off for one project from a file. Only the tool's own `/mcp` panel is known to do it, and its effect on the start has not been measured.

Behaviour:

- Whether the rules in `AGENTS.md` make agents reach for the skills unprompted.
- Whether agents keep the task list current. The rule is in `AGENTS.md` and in the skills, and only lint notices when it is not followed.
- Whether a reviewer told not to edit the repository always complies: its instructions forbid it, its permissions do not.

Known gaps:

- Session records: a Copilot session that was resumed closes more than once, and `stats` adds the closing records up; whether each one covers only its own run has not been checked. Codex and Copilot sessions longer than a few steps have not been read. The `doctor` output for Codex and Copilot has not been compared with those tools' own commands.
- The summary in the viewer's task drawer has not been looked at in a browser; its parsing is unit-tested.
- Migration leaves links in files outside `docs/` (for example `architecture.md`) pointing at archived files.
