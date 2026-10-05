# Superwiki

Agent skills that turn a project's `docs/` folder into an **LLM-maintained wiki and task tracker**. Your coding agent writes it and keeps it current; you read it as an **Obsidian vault** or in a built-in viewer. Works with **Claude Code, Codex CLI and GitHub Copilot CLI**.

**[Live demo](https://mhmtsrfglu.github.io/superwiki/)** · [Install](#install) · [Use](#use) · [Design notes](DESIGN.md)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/viewer-waves-dark.png">
  <img alt="The Superwiki viewer: task counts per area, filters, and the dependency board with one task's chain highlighted" src="assets/viewer-waves-light.png">
</picture>

## Quick start

Requires Node 18 or newer.

```bash
npx superwiki install claude        # or: codex, copilot, all
```

Start a new agent session in your project and run `/sw-init`. It sets up `docs/` and asks whether you want the task tracker. From then on, ask for what you need in plain words, or use a [command](#use).

## What you get

```text
docs/
  index.md       the open tasks, then the catalog of the wiki, one line per page
  log.md         append-only history
  raw/           your sources, never modified
  wiki/          pages the agent writes
  tasks/         one file per task (optional)
  plans/         one plan per task
  viewer.html    the task board and the wiki in a browser
```

`sw-init` also adds a short block of rules to `AGENTS.md`, so the agent maintains the vault in every session, with or without a command.

Everything is plain markdown. `docs/` keeps working as an Obsidian vault without Superwiki.

### The wiki

Superwiki follows the LLM Wiki pattern described by Andrej Karpathy: you curate raw sources, the agent owns the wiki, and a short set of rules tells it how to maintain it. Hand the agent an article, a transcript or your notes, and it files a summary and links it into the catalog.

### The tasks

A task is one file with a goal, a "Done when" list and its dependencies. The agent will not start a task whose dependencies are open, and a task is `done` only when every "Done when" item has been checked by a command.

`index.md` opens with the task list, so you can follow the work without the viewer:

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

The list is generated from the task files. Do not edit it by hand: change the task file, and the agent (or `/sw-board`) rewrites the list.

### Built to be cheap for the agent

- **Little to read.** One small index, one file per task, and a script that answers "what is ready?" or "what blocks this?" without the agent reading the vault.
- **Work in clean contexts.** Planning, implementing and reviewing run in subagents, each on the model you choose. The main session only tracks the task's status, so it stays small.
- **Cost you can see.** `sw-stats` shows what a session used, per agent; `sw-doctor` shows what every session carries before it starts.

Measured on a real project with 165 tasks, converted from a single markdown index:

| | Before | After |
| --- | --- | --- |
| Read at the start of every session | 197 KB index | 7.7 KB index + 2.7 KB of rules |
| Read to start one task | the index, then the task's section | one file, 2 KB at the median |
| Marking a task done | a status cell, plus a ✅ at every reference to it (median 12 places) | one frontmatter line |

> Status: early. Not every skill has been run in every agent. [DESIGN.md](DESIGN.md#status) lists what has been proven and what has not.

## Install

```bash
npx superwiki install <target>...
```

| Target | Agent | Invoke a skill with |
| --- | --- | --- |
| `claude` | Claude Code | `/sw-init` |
| `codex` | Codex CLI | `$sw-init`, or "use the sw-init skill" |
| `copilot` | GitHub Copilot CLI | `/sw-init`, or "use the sw-init skill" |
| `all` | the three above | |

Start a new agent session after installing: a running session does not pick up new skills.

### Home folder or project

The installer asks where the skills should go:

- **Your home folder.** They serve every project on this machine. This is the usual choice.
- **This project**, the directory you run the command in. They are committed with the repository, so teammates and [cloud agents](#cloud-agents) have them too.

A flag answers in advance. Without a terminal (a script, CI) nothing is asked and the home folder is used.

```bash
npx superwiki install --global claude            # home folder, no question
npx superwiki install --project . claude codex   # this project, no question
```

| Target | In your home folder | In a project |
| --- | --- | --- |
| `claude` | `~/.claude/skills` | `.claude/skills` |
| `codex` | `~/.agents/skills` | `.agents/skills` |
| `copilot` | `~/.copilot/skills` | `.agents/skills` |

A skill folder of the same name that Superwiki did not install is kept and reported; `--force` replaces it.

### Cloud agents

A cloud agent (Claude Code on the web, Codex cloud, the GitHub Copilot coding agent) starts from a clone of your repository and never sees your home folder. It has the Superwiki skills only if they are in the repository.

1. Put the skills in the project. Either answer "this project" in the installer (`npx superwiki install --project . claude codex`), or, on a new vault, say yes when `/sw-init` asks whether to keep the skills in the repository.
2. Commit and push `.claude/skills` and `.agents/skills`.

| Cloud agent | Target | Reads the skills from |
| --- | --- | --- |
| Claude Code on the web | `claude` | `.claude/skills` |
| Codex cloud | `codex` | `.agents/skills` |
| GitHub Copilot coding agent | `copilot` | `.agents/skills` |

These folders are the ones each tool's documentation names. Superwiki has not yet been run in a cloud session.

### Other agents

Agents that load `SKILL.md` folders from `~/.agents/skills` get the skills with the target `global`. For an agent with its own skills folder (Cursor, Gemini CLI, OpenCode and others), copy the `skills/sw-*` folders from a clone into it. Neither has been tested. Expect these limits:

- planning, implementing and reviewing run in the main session, not in subagents;
- `sw-config` cannot set a model per role;
- `sw-stats` and `sw-doctor` do not work.

### With other skill sets

Superwiki works next to planning skill sets such as Superpowers.

- If another skill set answers a bare `/sw-...` command first, name the skill in a sentence: "use the sw-implement skill for T-02".
- Folders other tools create under `docs/` are left alone. Superwiki only reads and writes `index.md`, `log.md`, `raw/`, `wiki/`, `tasks/` and `plans/`.

### Update

```bash
npx superwiki@latest install claude      # the same command you installed with
```

Then run `/sw-init` again in each project. It updates the script, the templates and the viewer in `docs/`, and the skills kept in the repository if you chose that, and keeps your content. Commit the result.

If your session loaded `sw-init` from the project's own copy of the skills, update that copy with the installer instead: `npx superwiki@latest install --project . claude`.

### Uninstall

```bash
npx superwiki uninstall all                # from your home folder
npx superwiki uninstall --project . all    # from a project
```

Only the skills are removed. `docs/` stays.

### From a clone

To read the code first, or to change it:

```bash
git clone https://github.com/mhmtsrfglu/superwiki ~/.superwiki
~/.superwiki/install.sh claude       # same targets and options as npx superwiki install
```

`install.sh` links the skills instead of copying them, so `git pull` updates every agent. Links only work on your machine: for a project install add `--copy`. `--uninstall` removes.

## Use

Type a command, or just ask. The rules in `AGENTS.md` tell the agent which skill fits, so these reach the same skills:

```text
What should I work on next?
Implement P-15.
Why does M-06 exist, and what is it blocked by?
Users get the magic-link email twice. Have we seen this before?
```

Commands are shown as typed in Claude Code; in Codex write `$sw-plan` instead of `/sw-plan`. Task ids are an area prefix and a number, such as `P-15`.

### Set up

| Command | What it does |
| --- | --- |
| `/sw-init` | set up `docs/` in the current project, or upgrade it |
| `/sw-migrate` | convert task tables the project already has, on a git branch of its own |
| `/sw-config plan with opus, implement with sonnet` | choose the model for planning, implementing and reviewing; add task areas |

### Work on tasks

| Command | What it does |
| --- | --- |
| `/sw-do P-15` | take one task from todo to done. A small task goes straight to work; a large one gets a plan you approve first. Without an id, it offers the tasks that can start |
| `/sw-run the backend tasks` | work through several tasks in a row without asking at each step. It stops when a task needs you and reports every decision it made in your place |
| `/sw-explain M-06` | what a task is, why it exists, what it waits on and what it unblocks |
| `/sw-triage uploads hang at 100% since yesterday` | for a problem: has it happened before, what was learned, likely causes |

`sw-do` runs three steps that you can also run one at a time:

| Command | What it does |
| --- | --- |
| `/sw-plan P-15` | have a plan written and approve it. `/sw-plan add CSV export` creates the task first |
| `/sw-implement P-15` | build the task, have it reviewed if the task asks for a review, and record the result |
| `/sw-summarize P-15` | check each "Done when" item with a command and write the evidence into the task file |

### Keep the wiki

| Command | What it does |
| --- | --- |
| `/sw-ingest ~/Downloads/interview-notes.md` | file a source and summarize it into the wiki |
| `/sw-lint` | check links, frontmatter and task dependencies |
| `/sw-board` | rewrite the task list in `index.md` after you edited task files by hand |
| `/sw-visualize` | open the task board and the wiki in the browser |

### Watch the cost

| Command | What it does |
| --- | --- |
| `/sw-stats` | what the current session has used, per agent |
| `/sw-doctor` | what a session carries before any work, and what can be switched off for this project. It asks before changing anything |

`sw-stats` prints one row for the main session and one for each subagent. This is a real task, planned, implemented and reviewed in 37 minutes:

```text
agent           model              steps  first  peak   sent  cached  output  tools  min
main            claude-opus-5-5       27    79k  126k   2.8M     96%     18k     23   37
sw-planner      claude-opus-5-5       31    59k  154k   3.5M     96%      8k     32    6
sw-implementer  claude-sonnet-5-5     68    59k  252k  12.2M     96%     16k     76   26
sw-reviewer     claude-opus-5-5       23    60k  137k   2.4M     89%     372     24   12
total                                149      -     -  20.9M     95%     43k    155
```

`first` and `peak` are the tokens sent with one request; `sent` is that, summed over every step. Each step sends the whole context again, which is why Superwiki keeps contexts small.

### The CLI

The skills call a small script in your project. You can run it yourself, from the project root:

```bash
node docs/.sw/sw.mjs status                 # counts per area
node docs/.sw/sw.mjs ready                  # tasks that can start now
node docs/.sw/sw.mjs check P-15             # can it start, can it finish, what is open
node docs/.sw/sw.mjs explain P-15           # dependencies, what it unblocks, its plan
node docs/.sw/sw.mjs search sync timeout    # where something is mentioned
node docs/.sw/sw.mjs lint                   # broken links, bad frontmatter, dependency errors
node docs/.sw/sw.mjs board                  # rewrite the task list in index.md
node docs/.sw/sw.mjs serve --open           # the viewer
```

`node docs/.sw/sw.mjs` without a command lists the rest. A filled-in example vault is in [examples/demo/docs](examples/demo/docs).

## Contributing

How to build, test and release is in [CONTRIBUTING.md](CONTRIBUTING.md). Why Superwiki works the way it does is in [DESIGN.md](DESIGN.md).

## License

MIT
