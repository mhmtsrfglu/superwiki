# Superwiki

Agent skills that turn a project's `docs/` folder into an **LLM-maintained wiki and task tracker**. Your coding agent writes it and keeps it current; you read it as an **Obsidian vault** or in a built-in viewer. Works with **Claude Code, Codex CLI and GitHub Copilot CLI**.

**[Live demo](https://mhmtsrfglu.github.io/superwiki/)** · [Install](#install) · [Commands](#use) · [Design notes](DESIGN.md)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/viewer-waves-dark.png">
  <img alt="The Superwiki viewer: task counts per area, filters, and the dependency board with one task's chain highlighted" src="assets/viewer-waves-light.png">
</picture>

```bash
npx superwiki install claude        # or: codex, copilot, global, all
```

Then, in a project: `/sw-init`.

## Why

Superwiki follows the LLM Wiki pattern described by Andrej Karpathy: raw sources you curate, a wiki the agent owns, and a short schema that tells the agent how to maintain it. On top of that it adds what a software project needs: tasks with dependencies, plans, reviews, and a record of decisions and lessons.

It is built to be cheap for the agent:

- **Little to read.** One small index, one file per task, and a script that answers "what is ready?", "what blocks this?" or "is anything broken?" without the agent reading the vault.
- **Work in clean contexts.** Planning, implementing and reviewing run in subagents, each on the model you choose for it. The main session only keeps the task's status true, so it stays small.
- **Cost you can see.** `sw-stats` shows what a session used, per agent; `sw-doctor` shows what every session carries before it starts, and what can go.

Measured on a real project with 165 tasks, converted from a single markdown index:

| | Before | After |
| --- | --- | --- |
| Read at the start of every session | 197 KB index | 7.7 KB index (the 97 open tasks, a line each) + 2.7 KB of rules |
| Read to start one task | the index, then the task's section | one file, 2 KB at the median |
| Marking a task done | a status cell, plus a ✅ at every reference to it (median 12 places) | one frontmatter line |

> Status: early. The CLI, the viewer, `sw-init` and the migration script are tested. Planning, implementing and reviewing have been run end to end on real projects in Claude Code, and the planning flow in Codex and Copilot CLI; some skills have only been exercised once. [DESIGN.md](DESIGN.md) lists what has and has not been proven.

## What you get

```text
docs/
  index.md       the open tasks, then the catalog of the wiki, one line per page
  log.md         append-only history
  raw/           your sources, never modified
  wiki/          pages the agent writes
  tasks/         one file per task (optional)
  plans/         one plan per task
  viewer.html    opened by sw-visualize, in any browser
```

`AGENTS.md` gets a short block of rules so the agent maintains the vault in every session, with or without a command.

You can follow the work without the viewer: `index.md` opens with the task list, written from the task files. Each open task is a line that links to its file; finished ones are listed by id.

```markdown
## Tasks

ready 9 · in progress 1 · blocked 18 · done 20

**In progress**

- [[B-20]] Portfolio sync · M5

**Ready**

- [[F-01]] Frontend skeleton and guards · M0
- [[B-18]] Valuation · M4

**Blocked**

- [[B-21]] Journal and thesis gates · M5 · waits on B-20

**Done (20)** [[B-01]] [[B-02]] [[B-03]] ...
```

A task's status still lives only in its own file. The list is a view: the agent rewrites it with `sw.mjs board` whenever a task changes, and `lint` says when it has fallen behind.

## Install

Requires Node 18 or newer.

```bash
npx superwiki install claude
```

This copies the skills into the folder your agent reads. Name one or more targets:

| Target | Installs into | For |
| --- | --- | --- |
| `claude` | `~/.claude/skills` | [Claude Code](#claude-code) |
| `codex` | `~/.agents/skills` | [Codex CLI](#codex-cli) |
| `copilot` | `~/.copilot/skills` | [GitHub Copilot CLI](#github-copilot-cli) |
| `global` | `~/.agents/skills` | the shared folder: Codex, Copilot CLI and [other agents](#other-agents) that read it. Claude Code does not |
| `all` | all of the above | |

```bash
npx superwiki install claude codex                   # several agents at once
npx superwiki install --project ~/code/my-app all    # one project only, not your home folder
npx superwiki uninstall claude                       # remove
npx superwiki --help
```

Start a new agent session after installing: a running session does not pick up new skills.

### From a clone

If you would rather read the code first, or want to change it:

```bash
git clone https://github.com/mhmtsrfglu/superwiki ~/.superwiki
~/.superwiki/install.sh claude            # same targets and options; links instead of copying
```

A linked install follows the clone: `git pull` updates every agent. `install.sh --copy` copies instead, `--uninstall` removes.

### Per agent

All three agents were checked the same way: the agent found the skills, refused to start a task with an unfinished dependency, and ran `sw-plan` end to end with the planner subagent.

The model for each role (planning, implementing, reviewing) is set with `sw-config`, which writes one agent file per role into the project. The skills dispatch those agents by name.

#### Claude Code

```bash
npx superwiki install claude
```

Invoke with a slash: `/sw-init`, `/sw-plan T-01`.

- Claude Code reads `~/.claude/skills/` (and a project's `.claude/skills/`). It does not read `~/.agents/skills/`, so `global` is not enough for it.
- `sw-plan` enters plan mode when the session offers it.
- Agent files: `.claude/agents/sw-planner.md`, `sw-implementer.md` and `sw-reviewer.md`. They load when a session starts; in a session that began before they existed, the skills fall back to built-in agents with the same model.

#### Codex CLI

```bash
npx superwiki install codex
```

Invoke with a dollar sign, or by name in a sentence: `$sw-init`, `$sw-plan T-01`, "use the sw-plan skill for T-01". Checked with CLI 0.153.

- A skill cannot switch Codex into plan mode. Start planning yourself with `/plan` if you want the mode, or let `sw-plan` proceed without it: it changes no file before you approve.
- Agent files: `.codex/agents/sw-planner.toml`, `sw-implementer.toml` and `sw-reviewer.toml`. Subagents must be enabled; they are by default in current releases.

#### GitHub Copilot CLI

```bash
npx superwiki install copilot
```

Invoke with a slash, or by name in a sentence: `/sw-init`, "use the sw-plan skill for T-01". Checked with CLI 1.0.31.

- Copilot CLI also reads `~/.agents/skills/`, so if you installed `codex` or `global` it already has the skills.
- A skill cannot switch Copilot into plan mode. Start with `copilot --mode plan` or `/plan` if you want it.
- Agent files: `.github/agents/sw-planner.agent.md`, `sw-implementer.agent.md` and `sw-reviewer.agent.md`, dispatched with the `task` tool. Whether Copilot honours the `model:` field of those files has not been checked.

#### Other agents

```bash
npx superwiki install global
```

Agents that load `SKILL.md` folders from `~/.agents/skills` pick the skills up from there. For an agent with its own skills folder (Cursor, Gemini CLI, OpenCode and others), copy the `skills/sw-*` folders from a clone into it by hand. Nothing has been run in these agents. What will differ:

- the skills name Claude Code, Codex and Copilot tools when they dispatch subagents; elsewhere they fall back to doing the work in the main session, and say so;
- `sw-config` writes agent files only for `claude`, `codex` and `copilot`, so a per-role model cannot be set;
- `sw-stats` and `sw-doctor` read the session records of those three tools only.

Everything else (the vault, the CLI, the viewer, ingest, lint, explain, triage) depends only on Node and on the agent following the skill text.

### With other skill sets

Superwiki works next to planning skill sets such as Superpowers. Two things to know:

- Their bootstrap may claim a bare `/sw-...` prompt before Superwiki's skill loads. Naming the skill in a sentence ("use the sw-implement skill for T-02") avoids that.
- Folders they create under `docs/` are left alone: Superwiki only reads and writes `index.md`, `log.md`, `raw/`, `wiki/`, `tasks/` and `plans/`.

### Update and uninstall

```bash
npx superwiki@latest install claude      # update: same command, newest release
npx superwiki uninstall all
```

After an update, run `sw-init` again in each project: it replaces `docs/.sw/sw.mjs`, the templates and `docs/viewer.html` with the new version and keeps your content. Until then the project keeps the script it was set up with, and a skill that needs a newer command says so.

A project's `docs/` folder is plain markdown and keeps working as an Obsidian vault without Superwiki.

## Use

| Skill | What it does |
| --- | --- |
| `sw-init` | set up `docs/` in the current project, or upgrade it |
| `sw-migrate` | convert an existing table-based task index, on a git branch of its own |
| `sw-ingest` | file a source into the wiki |
| `sw-plan` | plan a task with the planner subagent and get your approval |
| `sw-implement` | run a task with the implementer subagent, have it reviewed if the task asks for that, summarize it with evidence, and record the result |
| `sw-summarize` | close a task with a `## Summary` in its file: plan, implementation, changed files from git, and a freshly run command for each "Done when" item. A task is `done` only when every item is verified |
| `sw-run` | work through several tasks in a row, unattended: plan, implement, review and record each, and stop when one needs you |
| `sw-explain` | explain a task: what, why, dependencies, what it unblocks |
| `sw-triage` | for a problem: seen before? lessons, likely causes |
| `sw-board` | refresh the task list in `index.md` from the task files |
| `sw-lint` | structural checks by script, semantic review on request |
| `sw-visualize` | open the viewer |
| `sw-stats` | what the current session has cost: tokens, context, steps and tool calls, per agent |
| `sw-doctor` | what a session carries before any work, and what to remove to make every step cheaper |
| `sw-config` | the model each tool uses for planning, implementing and reviewing; task areas |

### Examples

Shown as typed in Claude Code. In Codex, write `$sw-plan` instead of `/sw-plan`. Task ids are an area prefix and a number, such as `P-15`.

```text
/sw-init                          set up the vault; asks whether you want tasks
/sw-migrate                       convert the task tables this project already has

/sw-plan                          what can start now? pick one and plan it
/sw-plan P-15                     plan task P-15 (a small task is sent straight to sw-implement)
/sw-plan add CSV export to the sources page
                                  new work: creates the task, then plans it

/sw-implement P-15                run P-15; refuses if a dependency is not done
/sw-implement                     continue what is in progress, or pick a ready task
/sw-summarize P-15                verify each "Done when" item of P-15 with a command and write
                                  the summary into its task file (sw-implement does this itself)
/sw-run the backend tasks, commit after each
                                  one task after another without asking at each step;
                                  stops when a task needs you, and reports what it decided

/sw-explain M-06                  what M-06 is, why it exists, what it waits on and unblocks
/sw-triage photo uploads hang at 100% on mobile since yesterday
                                  has this happened before? lessons and likely causes
/sw-ingest ~/Downloads/interview-notes.md
                                  file a source and summarise it into the wiki

/sw-config plan with opus, implement with sonnet, review with opus
/sw-board                         refresh the task list in index.md after you edited tasks by hand
/sw-lint                          check links, frontmatter and task dependencies
/sw-visualize                     open the task board and the wiki in the browser
/sw-stats                         what this session has cost so far, per agent
/sw-doctor                        what fills the context before any work, and what can go
```

You do not have to type a command. The rules `sw-init` adds to `AGENTS.md` tell the agent which skill fits, so a plain request should reach the same skill:

```text
What should I work on next?
Implement P-15.
Why does M-06 exist, and what is it blocked by?
Users get the magic-link email twice. Have we seen this before?
```

A filled-in example vault is in [examples/demo/docs](examples/demo/docs).

### What a session cost

`sw-stats` reads the record your agent keeps of the session and prints one row for the main session and one for each subagent. It writes nothing. `sw-implement` ends its report with the same table. This one is a real task: planned, implemented and reviewed in 37 minutes.

```text
session  claude  fe4cbd6c-8abf-4db6-9755-469dc7321dc7  2026-10-05 10:27 to 11:04, 37 min
agent           model              steps  first  peak   sent  cached  output  tools  min
main            claude-opus-5-5       27    79k  126k   2.8M     96%     18k     23   37
sw-planner      claude-opus-5-5       31    59k  154k   3.5M     96%      8k     32    6
sw-implementer  claude-sonnet-5-5     68    59k  252k  12.2M     96%     16k     76   26
sw-reviewer     claude-opus-5-5       23    60k  137k   2.4M     89%     372     24   12
total                                149      -     -  20.9M     95%     43k    155
```

`first` and `peak` are the tokens sent with one request. `sent` is that, summed over every step: each step sends the whole context again, which is why a long session in one context is expensive. In Copilot CLI the token columns fill in once the session has closed.

### What a session starts with

Every agent above began at 59k to 79k tokens before it had read anything, and paid for that on each of its steps. `sw-doctor` shows what that start is made of, from the same session record, and proposes what to switch off for this project. The same session:

```text
context at session start  claude  fe4cbd6c-8abf-4db6-9755-469dc7321dc7
first request: 79k tokens
part                             size  holds
rule and memory files           30 KB  memory/MEMORY.md 18 KB, my-app/AGENTS.md 11 KB, ...
skill list                      29 KB  213: marketing-skills 41, (none) 37, claude-seo 25, claude-ads 23, +11 more
tool names (loaded on demand)   17 KB  381: claude_ai_higgsfield 116, claude_ai_meta_ads 98, +9 more
agent list                      14 KB  46: claude-seo 18, (none) 12, claude-ads 10, +4 more
MCP server instructions        8.3 KB  claude.ai higgsfield 2.0 KB, notebooklm 2.0 KB, ...
session-start hooks            3.3 KB
```

Here most of the skills, agents and tools came from advertising and SEO plugins that this project never uses. The skill proposes changes and asks before making any; it touches project-local settings only, and never uninstalls a plugin or deletes a memory. Sizes are characters of text: a skill cannot run your agent's own context command (`/context` in Claude Code and Copilot CLI, `/status` in Codex), which shows the same in tokens.

### The CLI

The skills call a small script that answers questions without the agent reading the vault. You can run it yourself, from the project root:

```bash
node docs/.sw/sw.mjs status                 # counts per area
node docs/.sw/sw.mjs ready                  # tasks that can start now
node docs/.sw/sw.mjs check P-15             # can it start or finish, what is open, its summary's verdicts, is a review required
node docs/.sw/sw.mjs explain P-15           # dependencies, what it unblocks, plan, area guide
node docs/.sw/sw.mjs search sync timeout    # where something is mentioned
node docs/.sw/sw.mjs next-id P              # next free id in an area
node docs/.sw/sw.mjs board                  # rewrite the task list in index.md from the task files
node docs/.sw/sw.mjs lint                   # broken links, bad frontmatter, dependency errors, a done task with an unverified summary, a stale task list
node docs/.sw/sw.mjs stats                  # tokens, context and steps of the agent session here
node docs/.sw/sw.mjs doctor                 # what that session carried before it read anything
node docs/.sw/sw.mjs serve --open           # the viewer, reading files live
node docs/.sw/sw.mjs snapshot               # or: freeze the vault into docs/viewer.html, no server
```

## Develop

```bash
npm test       # builds skills/sw-init/assets/sw.mjs and viewer.html, then runs the tests
```

Edit sources in `src/`:

| File | What it is |
| --- | --- |
| `src/core.js` | the vault model, derived task state, lint and search; shared by the CLI and the viewer |
| `src/board.js` | the task list in `index.md` |
| `src/sessions.js` | finds the record an agent keeps of a session |
| `src/stats.js` | reduces a session record to cost per agent |
| `src/doctor.js` | reduces a session record to what the session started with |
| `src/cli.js` | the commands |
| `src/viewer.html` | the viewer |

`scripts/build.mjs` bundles them into `skills/sw-init/assets/sw.mjs` and `viewer.html`. Those two files are generated: do not edit them.

`node scripts/build-demo.mjs` builds the public demo into `site/` (the viewer with the example vault baked in); the Pages workflow deploys it on every push to `main`.

Releases are cut by the `Release` workflow (Actions → Release → Run workflow): it tests, bumps the version in `package.json` and the plugin manifests, publishes to npm, tags, and creates a GitHub release. It publishes with the repository secret `NPM_TOKEN`, an npm access token allowed to publish `superwiki`.

## License

MIT
