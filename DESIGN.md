# Superwiki design

Superwiki is a set of agent skills that turn a project's `docs/` folder into a wiki the coding agent writes and keeps current, with an optional task tracker. The folder is an Obsidian vault for the human and a cheap-to-read knowledge base for the agent. The wiki follows the LLM Wiki pattern described by Andrej Karpathy: raw sources, a wiki the agent owns, and a schema that tells the agent how to maintain it.

This file records the decisions and, at the end, what has and has not been proven.

## Layout

```text
AGENTS.md        short always-on schema (CLAUDE.md imports it)
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
- A page's kind is its `type` frontmatter field, not a folder. Types with a defined shape: `source` (summary of one raw file), `decision`, `lesson` (Symptom, Cause, Fix, How to notice it earlier), `guide` (how to work in one task area; optional).

## Formats

- Links inside the vault are wikilinks, `[[file-name]]`; file names are unique across `wiki/`, `tasks/` and `plans/`. `raw/` files and URLs use normal markdown links; code is referred to by plain path.
- Task frontmatter: required `id`, `title`, `status`, `deps`; optional `soft_deps`, `milestone`, `priority`, `review`, `started`, `finished`. Any value in `review` asks for a separate review before the task can be done.
- Statuses: `todo`, `in-progress`, `done`, `cancelled`. Cancelled tasks stay on disk; ids are never reused.
- `deps` must be done before a task starts. `soft_deps` allow starting but block finishing.
- Execution order is derived from dependencies plus optional `priority`. There is no stored sequence number or dependency table. The one summary, the task list in `index.md`, is generated and never edited.
- A single-project repository uses one area (default `T`); the viewer hides area cards and the area filter then.
- Everything Superwiki ships is in English. Content an agent writes into a vault follows that vault's language.

## What the agent reads

The design is driven by what an agent must read and write per task.

1. The only mandatory read is `index.md`: the open tasks and one line per wiki page.
2. `log.md` is appended to and read with `tail`, never whole.
3. A fact has one home. A task's status is in its frontmatter only; counts, waves and blockers are computed, and the task list in `index.md` is written from them.
4. Ingest touches few files: a source summary, `index.md`, `log.md`. Wider cross-updates are recorded as follow-ups and done in lint passes.
5. Mechanical questions are answered by `docs/.sw/sw.mjs`, not by reading files.

### The task list in the index

The first design had no task list anywhere in markdown: the viewer showed the tasks, and `index.md` held only the wiki catalog. That left a person who reads the vault as files, in an editor or in Obsidian, with an empty index and no way to follow the work without opening the viewer.

`index.md` therefore opens with a generated section (`src/board.js`, `sw.mjs board`, skill `sw-board`): the counts, then the tasks in progress, ready and blocked, a line each with a link, the milestone and what a blocked task waits on; finished tasks by id only. Three decisions:

- **It is a view.** Status still has one home. The agent runs `board` after it changes a task; `lint` warns (`stale-board`, `missing-board`) when the section does not match the task files, so a hand edit of a status in Obsidian is caught the next time anything is checked. Nothing rewrites the file as a side effect of a read.
- **It lives in the index, not in a file of its own.** That is where a person looks, and the agent, which reads the index first anyway, sees what is ready without a command.
- **It costs what the open work costs.** Finished tasks take nine characters each, so the section shrinks as a project is worked off. Open tasks do not: 2 KB on a project with 28 open tasks, 7.7 KB on one with 97, read once by every agent. A backlog of hundreds of blocked tasks would make this the largest thing a session reads; listing blocked tasks by id only is the obvious next cut, not made yet.

`sw-init` writes the section, also into an index that existed before it, above the text that was there.

## Cost of a task

What a task costs is what the agents read, and each extra step sends everything read so far again. The rules below come from measurements on two real projects. Each figure is a single run: read it as direction, not as a number to expect elsewhere.

### What one subagent reads

Measured on a large monorepo with small panel tasks, the planner on one model and the implementer on a cheaper one. The figure is the context a flow's subagents used.

| Flow | Context used |
| --- | --- |
| Planner subagent, then implementer subagent | about 234k tokens |
| Implementer only, no plan | 141k to 144k |
| Implementer only, with the reading rules | about 115k |

- **Small tasks skip planning.** One area, three "Done when" items or fewer, nothing left open, a few files: `sw-implement` runs straight from the task file. This was the largest saving. Its price: questions a planner would have put to the user are decided by the implementer and reported afterwards.
- **Reading follows rules.** Locate before opening, open the range and not the file, one example per pattern, trust generated types, batch lookups, never read twice. On the same task from the same starting point this cut context by about a fifth and tool calls by a third.
- **The task text decides the work.** In the measured run the cheaper implementation left out one of the states the task listed. The implementer therefore lists every requirement the task states and marks each `met`, `not met` or `differs`; `sw-implement` treats a missing or differing item as not done until the user accepts it.
- **The plan does not pass through the main session.** The planner writes the plan file as `status: draft` and returns a few lines; approval changes it to `approved`. The main session reads neither the code nor the plan.
- **Area guides are optional.** A guide page per task area (layout, patterns, verification commands, gotchas) is read first where it exists and extended after each task. In two measured runs it saved nothing visible: it held what the previous task had needed, and the next task needed something else. It stays as an option for areas where several tasks keep needing the same facts.

A check that starts services or changes data is marked `needs:` in the plan and runs only with the user's yes.

### Why the work is split between roles

The second project's session records hold three ways of working, one after the other, on tasks of the same kind. They are the reason for the split.

| Flow | Steps | Largest request | Tokens sent |
| --- | --- | --- | --- |
| One long session plans, implements and reviews | 352, over several tasks | 640k | 100M |
| An orchestrator gives each task to one agent for analysis, plan and implementation, then to a reviewer | about 495 per task agent | 967k | 260M to 290M per task |
| Superwiki: a planner, an implementer and a reviewer per task | 149 for the task | 252k | 21M for the task |

- **One long session** pays for its whole history on every step: an average of 284k per step, with contexts between 250k and 640k.
- **One agent per task** is a clean context to start with, and that was not enough. An agent that does everything for a task fills its own context to the limit, and every one of its five hundred steps pays for it. Two tasks measured: 277M and 239M for the task agents, 17M for each reviewer, 11M for the orchestrating session.
- **A role per agent** keeps each context to what that role reads. One task measured, planned, implemented, reviewed, one blocking finding fixed and reviewed again, done in 37 minutes:

| Agent | Steps | Context, first to largest request | Tokens sent |
| --- | --- | --- | --- |
| Main session | 27 | 79k to 126k | 2.8M |
| Planner | 31 | 59k to 154k | 3.5M |
| Implementer | 68 | 59k to 252k | 12.2M |
| Reviewer | 23 | 60k to 137k | 2.4M |

These are different tasks, so the ratios are not measurements. An order of magnitude between the second flow and the third is hard to explain by the tasks alone.

What follows from it in the design:

- **The main session stays out of the work.** It reads the task file and the reports; the code, the plan and the review are read in subagents that start clean and end with the task.
- **A review is a separate, clean context.** A task whose frontmatter has `review:` is reviewed by a reviewer subagent after the implementer's report passes: it lists what the change claims, tries to break each claim, and classifies what it finds. It sees the change, not the reasoning that produced it, and its instructions forbid editing the repository. Blocking findings go back to the implementer, twice at most, then to the user.
- **One task, one session.** `sw-implement` ends by saying so. The task is recorded in files, so nothing is lost by starting fresh, and the next task does not pay for this one's history.

What the measured task also shows is where the cost now sits. The implementer sent more than half of the tokens, and its context grew fourfold, partly because the fix rounds continued the same agent, which keeps what it has read. Sending a fix to a fresh implementer would start small but read the code again; which is cheaper has not been measured. And every agent started at 59k to 79k before it had read anything.

### What every agent starts with

A session's start is sent again with every step of every agent, so in the measured task it was roughly eight of the twenty-one million tokens sent. Almost none of it was Superwiki's: the vault adds a 2.7 KB block of rules (1.7 KB without the task module). The tool's own count for the main session, in tokens:

| Part | Tokens | What it was |
| --- | --- | --- |
| Rule and memory files | 16.8k | the project's rules (12 KB) and a memory index of 67 entries (20 KB) |
| Built-in tool definitions | 15.1k | the tool's own |
| Skill list | 9.9k | 213 skills, most from plugins for advertising, SEO and marketing |
| Agent list | 4.0k | 46 agents, most from the same plugins |
| System prompt and MCP server instructions | 6.1k | |

The definitions of MCP tools were not in it: 370k tokens of them were loaded on demand, and only their names were sent.

So the start is the user's environment, and part of it can be switched off per project without losing anything the project uses. The first attempt on that project, measured with the tool's own count in a new session, took the start from 52k to 41.5k tokens:

| Change | Result |
| --- | --- |
| Memory index rewritten to one lesson per line, 20 KB to 9 KB | rule and memory files 16.8k to 10.7k |
| Four unused plugins switched off in the project's local settings | agent list 4.0k to 1.6k. Built-in tool definitions also fell, 15.1k to 12.6k; why is not established |
| The same four plugins, for the skill list | no change, 9.9k: the tool gives the list a fixed budget and shortens descriptions to fit, so the remaining skills got fuller descriptions instead |
| An environment variable in the project's settings to drop the account's connectors | no effect; the connectors were still listed |

Two lessons went into `sw-doctor`, the skill that now does this: a change is measured in a new session before it is called a saving, and fewer skills buys better descriptions, not fewer tokens.

## Running many tasks

`sw-implement` is written for one task with the user present, and ends by sending the user to a new session. A user who wants a backlog worked off overnight asks for the opposite. The first attempt to do that with the single-task skills showed what was missing:

- the agent loaded both skills "to learn the process" and then improvised its own;
- the terms the user had set, a commit after every task, turned out to be refused by the project's own settings only after work had begun;
- nothing said when the orchestrating session itself had grown too large.

`sw-run` is the skill for this. It changes nothing about how a task is run; it adds three things.

- **Standing answers.** What the single-task skills ask along the way (plan approval, which `needs:` checks may run, commit and push, whether to go on when a task stops) is settled once, and checked against what the project allows before the first task is touched.
- **Decisions in the user's place, written down.** A planner's questions get its own assumed answer unless the vault says otherwise, and each such answer goes into the task's notes and the final report. Unattended means fewer questions, not more permission: a check that starts services or changes data still needs a yes given in advance.
- **Stop rules.** A requirement that stays unmet, a review that fails twice, a refused commit and a lint error stop the run with the task left in progress. So does the orchestrator's own size: after each task it reads its row in `sw.mjs stats` and stops between tasks above 200k tokens, because the queue is in the files and a new session resumes it at no cost.

A skill cannot open a new session, so "a clean session per task" is a fresh subagent per role. The 200k limit is a first guess, not a measured optimum.

## Reading the session record

The cost measurements in this file were first made by hand, from the session records the tools keep. Two commands now make them for any project. Neither writes anything: the numbers describe a session, not the project.

| Tool | Record | What it holds |
| --- | --- | --- |
| Claude Code | `~/.claude/projects/<project>/<session>.jsonl`, subagents in a folder beside it | usage per request; one block per piece of context the session was given |
| Codex | `~/.codex/sessions/<date>/rollout-*.jsonl`, one file per agent, joined by session id | usage per request; base instructions and the tagged blocks sent before the first request |
| Copilot CLI | `~/.copilot/session-state/<session>/events.jsonl` | totals per agent, written when the session closes; the system message; tool definitions counted at a usage checkpoint |

`src/sessions.js` finds the record: the session a command runs in where the tool names it (Claude Code sets its id in the environment), otherwise the project's most recently written one.

- **`sw.mjs stats`** (`src/stats.js`, skill `sw-stats`) reduces the record to one row per agent, the main session and each subagent: steps, the context of the first and the largest request, tokens sent in total, the cached share, output, tool calls and minutes. `sw-implement` closes its report with it, and `sw-run` uses it to watch its own size.
- **`sw.mjs doctor`** (`src/doctor.js`, skill `sw-doctor`) reduces it to what the session started with: each part with its size and where it comes from, files by name, skills and agents by plugin, tools by server. The skill proposes what to switch off, asks, and changes project-local settings only.

A skill cannot run a tool's own context command, which is typed by the user. `doctor` therefore reports characters of text, read from the record; the tool's command shows the same parts in tokens, and the skill uses those figures when the user pastes them.

These formats are not documented by their vendors and can change with a release. The commands then report less; the tests pin the shapes they read.

## Skills

| Skill | Purpose |
| --- | --- |
| `sw-init` | scaffold the vault, the viewer and the schema block |
| `sw-migrate` | convert a table-based task index, on a git branch of its own |
| `sw-ingest` | turn a raw source into wiki pages |
| `sw-plan` | decide whether a plan is needed; have the planner subagent write it; get approval |
| `sw-implement` | run a task with the implementer subagent, check every requirement, have it reviewed where the task asks for that, record the result |
| `sw-run` | work through several tasks unattended, with answers agreed up front, decisions recorded and rules for stopping |
| `sw-explain` | explain one task: what, why, dependencies, what it unblocks |
| `sw-triage` | for a reported problem: earlier occurrences, lessons, likely causes; fixes nothing |
| `sw-board` | rewrite the task list in `index.md` from the task files |
| `sw-lint` | script checks first; semantic review as a separate, approved pass |
| `sw-visualize` | open the viewer |
| `sw-stats` | what the current session has cost, per agent; prints, writes nothing |
| `sw-doctor` | what a session starts with and what to switch off; changes project-local settings only, after asking |
| `sw-config` | areas, and the model each tool uses for planning, implementing and reviewing |

The schema block in `AGENTS.md` holds the rules that must apply without any command: read the index first, keep task status, the task list and the log current, log work that belongs to no task. It also tells the agent which skill to reach for without being asked, ahead of other planning or debugging skills; a skill's description alone proved too weak a trigger when another skill set competes for the same words.

Some skills are a single command. `sw-board` and `sw-visualize` exist so that the user has something to type, and so that the agent runs the command instead of doing the job by hand.

## Tools

One `skills/` directory serves every agent. `npx superwiki install <target>` copies the skills into the folder a tool reads; `install.sh` links them from a clone. Invocation differs by tool: `/sw-init` (Claude Code, Copilot CLI), `$sw-init` (Codex).

No tool lets a skill change the running session's model, and only Claude Code lets a skill enter plan mode. Model choice therefore works the same way everywhere: planning, implementing and reviewing run in subagents defined by files that carry a model (`.claude/agents/*.md`, `.codex/agents/*.toml`, `.github/agents/*.agent.md`), written by `sw-config`. A project whose own rules forbid subagents still works: the skills then follow the role's instructions in the main session and say that the clean context was not used.

## Viewer and CLI

`src/core.js` holds the vault model, derived task state, lint and search. It is bundled into `docs/.sw/sw.mjs` for Node, together with the task list, the session readers and the commands, and inlined into `docs/viewer.html` for the browser, so both report the same findings.

`sw-init` copies the CLI and the viewer into the project, so skills call `node docs/.sw/sw.mjs` the same way in every agent, and a project keeps working with the version it was set up with. The price: after Superwiki is updated, a project has the old script until `sw-init` runs there again. A skill that needs a command the script lacks says so and offers to run it.

`sw-visualize` runs `sw.mjs serve --open`: a small server on 127.0.0.1, started once per project, reused, and gone after two idle hours. It serves the viewer and the vault's pages, read from disk on every Refresh, so the user picks nothing and any browser works. Without the server, `sw.mjs snapshot` writes the pages to `docs/.sw/data.js` and the viewer opens as a file, frozen at that moment. `data.js` and the server's address file are git-ignored.

## Migration

`sw-migrate` never reads the old index. The script's `--inspect` prints the task tables, their columns, the values of status-like columns and the files with per-task headings; from that the agent writes a mapping. A dry run lists problems that must be fixed and, separately, what is only for information. The conversion runs on a branch of its own and never merges.

A mapping can keep any column as a frontmatter field (a review class becomes `review:`) or as a body section. Superwiki owns `docs/wiki/`, `docs/tasks/` and `docs/plans/`: a file already there that the mapping does not consume is a problem until it is named in `archiveAlso`. Everything consumed or archived moves to `docs/legacy/` with its layout and with working links. What is not converted (rules and milestones in the old index, other document folders, instruction files that describe the old index) is listed for the user to decide.

## What has been proven

| Part | Evidence |
| --- | --- |
| Core, task list, CLI, installer, session readers | unit tests (`npm test`) |
| Viewer | headless Chromium on the demo vault and on a migrated 165-task project |
| `sw-init` | followed by a fresh agent on a scratch project |
| `sw-migrate` | an earlier version followed twice by a fresh agent on a 165-task project; an independent parse of the source confirmed every field of every task, all detail text and zero broken links. The current version converted a second, 48-task project in place: counts matched the old tables and lint found nothing. That run was made by the session that wrote the skill, not by a fresh agent |
| `sw-ingest`, `sw-lint`, `sw-explain`, `sw-triage` | followed once by a fresh agent on a copy of the demo vault, then revised |
| `sw-implement` without a plan | run three times on real tasks with the implementer on a cheaper model; code, tests and repository checks passed each time, the visual checks were not allowed to run |
| `sw-plan`, `sw-implement` and the review | run end to end once in Claude Code on a real task that required a review, before the task list existed. The generated `sw-planner`, `sw-implementer` and `sw-reviewer` agents were dispatched by name on their configured models; the reviewer returned one blocking finding, the implementer fixed it, the second review passed. A later reading of the code and a run of the project's checks found the work sound |
| `sw.mjs stats`, `sw-stats` | run on real session records: Claude Code 2.1 (the task above, three subagents, and an orchestrated session of two tasks), Codex CLI 0.153 and Copilot CLI 1.0.91 (one short session each, with one subagent). The Copilot totals match the tool's own closing record. The skill was followed in Claude Code, including the case of a project whose script was too old |
| `sw.mjs doctor` | run on the same three records. For Claude Code the parts agree with the categories of the tool's `/context`; the Codex and Copilot output has not been compared with those tools' own commands |
| `sw.mjs board` | run on the two real projects, 48 and 165 tasks; lint clean afterwards |
| Codex CLI 0.153, Copilot CLI 1.0.31 | skills found; a blocked task refused; `sw-plan` run with the generated planner agent, earlier skill version |

## Open questions

- Whether the cost rules hold on projects unlike the two they were measured on.
- What splitting the work between roles saves on one task run both ways.
- Whether a fix after a review is cheaper in the implementer that did the work or in a fresh one.
- `sw-run` has not been run: how much the orchestrating session grows per task, and whether 200k is the right place to stop.
- Whether agents keep the task list current: the rule is in the schema block and in the skills, and only lint notices when it is not followed.
- How to switch an account's connectors off for one project from a file: only the tool's own `/mcp` panel is known to do it, and its effect on the start has not been measured.
- Whether listing tools in a generated agent file (`tools:`) keeps a subagent from carrying the skill and tool lists.
- Whether the schema block makes agents reach for the skills unprompted.
- Whether a reviewer told not to edit the repository always complies: its instructions forbid it, its permissions do not.
- Claude Code: presenting a plan through plan mode has not been tried.
- Codex and Copilot CLI: `sw-implement`, the review and the current `sw-plan` have not been run there.
- Copilot CLI: whether the `model:` field of a generated agent file is honoured.
- Session records: a Copilot session that was resumed closes more than once, and `stats` adds the closing records up; whether each one covers only its own run has not been checked. Codex and Copilot sessions longer than a few steps have not been read.
- `sw-visualize`, `sw-doctor`, `sw-run` and `sw-board` skill texts have not been followed by an agent.
- Plugin manifests (`.claude-plugin`, `.codex-plugin`) validate but have not been installed.
- Migration leaves links in files outside `docs/` (for example `architecture.md`) pointing at archived files.
