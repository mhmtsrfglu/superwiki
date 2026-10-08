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

A task is one file with a goal, a "Done when" list and its dependencies. The agent will not start a task whose dependencies are open. A task is `done` only when every "Done when" item has been checked by a command run in the closing session, one that would have failed if the item did not hold. The evidence is written into the task file, so you can read later how each item was proven.

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

The list is generated from the task files. Do not edit it by hand: change the task file, and the agent (or `/sw-index`) rewrites the list.

### Built to be cheap for the agent

- **Little to read.** One small index, one file per task, and a script that answers "what is ready?" or "what blocks this?" without the agent reading the vault.
- **Work in clean contexts.** Planning, implementing and reviewing run in subagents, each on the model you choose. The main session only tracks the task's status and checks the result, so it stays small.
- **Cost you can see.** `sw-usage` shows what a session used, per agent; `sw-doctor` shows what every session carries before it starts.

Measured on a real project with 165 tasks, converted from a single markdown index:

| | Before | After |
| --- | --- | --- |
| Read at the start of every session | 197 KB index | 7.7 KB index + 2.7 KB of rules |
| Read to start one task | the index, then the task's section | one file, 2 KB at the median |
| Marking a task done | a status cell, plus a ✅ at every reference to it (median 12 places) | one frontmatter line |

A pilot run on 2026-10-06 compared Superwiki with a single-session workflow on two backend tasks of one project, two runs each, with a blind review of the results. On the small task Superwiki cost $2.79 and $3.23 against $4.18 and $4.81. On the medium task the two overlapped, and the review scored quality a tie. Two tasks, one project, one day: read it as a direction. [DESIGN.md](DESIGN.md#the-pilot-of-2026-10-06) has the figures and the limits.

> Status: early. Not every skill has been run in every agent. [DESIGN.md](DESIGN.md#status) lists what has been proven and what has not.

## Install

```bash
npx superwiki install <target>...
```

| Target | Agent | What is installed | Invoke a skill with |
| --- | --- | --- | --- |
| `claude` | Claude Code | a copy of each skill | `/sw-<name>`, or the skill named in a sentence |
| `codex` | Codex CLI | a copy of each skill | `$sw-<name>`, or the skill named in a sentence |
| `copilot` | GitHub Copilot CLI | a copy of each skill | `/sw-<name>`, or the skill named in a sentence |
| `all` | the three above | | |

The skills are named `sw-<name>` in every agent: `sw-plan`, `sw-implement`, `sw-plan-implement`. Each is a folder of that name, and every install is a copy of those folders, or a link to them.

If you installed an earlier version for Claude Code, `install claude` also removes its plugin `sw@superwiki` and the marketplace `superwiki` at the same scope, so the skills are not listed twice. That needs the `claude` command on your PATH; without it, remove them with `claude plugin uninstall sw@superwiki` and `claude plugin marketplace remove superwiki`.

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

Skills kept in a project are markdown and scripts inside your repository, so the project's own linter and formatter may pick them up. If they report on `.claude/skills` or `.agents/skills`, add those folders to their ignore lists.

### Cloud agents

A cloud agent (Claude Code on the web, Codex cloud, the GitHub Copilot coding agent) starts from a clone of your repository and never sees your home folder. It has the Superwiki skills only if they are in the repository.

1. Put the skills in the project: `npx superwiki install --project . claude codex`, or answer "this project" in the installer. On a new vault, `/sw-init` also asks whether to keep the skills in the repository, and for which agents.
2. Commit and push `.claude/skills` and `.agents/skills`.

| Cloud agent | Target | Reads the skills from |
| --- | --- | --- |
| Claude Code on the web | `claude` | `.claude/skills` |
| Codex cloud | `codex` | `.agents/skills` |
| GitHub Copilot coding agent | `copilot` | `.agents/skills` |

These places are the ones each tool's documentation names. Superwiki has not yet been run in a cloud session.

### Other agents

Agents that load `SKILL.md` folders from `~/.agents/skills` get the skills with the target `global`. For an agent with a skills folder of its own (Cursor, Gemini CLI, OpenCode and others), copy each `skills/sw-<name>` folder from a clone into it, unchanged. Neither has been tested. Expect these limits:

- planning, implementing and reviewing run in the main session, not in subagents;
- `sw-config` cannot set a model per role;
- `sw-usage` and `sw-doctor` do not work.

### Next to other skill sets

Superwiki can be installed next to a planning skill set that runs in the main session.

- The rules in `AGENTS.md` tell the agent to use the Superwiki skills first for work in the vault. If another skill answers instead, name the skill in a sentence: "use the sw-implement skill for T-02".
- Folders other tools create under `docs/` are left alone. Superwiki only reads and writes `index.md`, `log.md`, `raw/`, `wiki/`, `tasks/` and `plans/`.
- Your project's own rules can contradict the Superwiki block. A rule that forbids subagents, for instance, makes the main session plan and implement itself, which costs more. Nothing detects such a conflict, so read your rules after `/sw-init`.

### Update

```bash
npx superwiki@latest install claude      # the same command you installed with
```

Then run `/sw-init` again in each project. It updates the script, the templates and the viewer in `docs/`, and the copies of the skills kept in the repository if you chose that, and keeps your content. Commit the result.

If your session loaded `sw-init` from the project's own copy of the skills, update that copy with the installer instead: `npx superwiki@latest install --project . claude codex`.

### Uninstall

```bash
npx superwiki uninstall all                # from your home folder
npx superwiki uninstall --project . all    # from a project
```

Only the skills are removed, and for `claude` the plugin of an earlier version. `docs/` stays.

### From a clone

To read the code first, or to change it:

```bash
git clone https://github.com/mhmtsrfglu/superwiki ~/.superwiki
~/.superwiki/install.sh claude       # same targets and options as npx superwiki install
```

`install.sh` links each skill folder to the clone instead of copying it, for every agent, so `git pull` updates them all. Links only work on your machine: for a project install add `--copy`. `--uninstall` removes.

## Use

Type a command, or just ask. The rules in `AGENTS.md` tell the agent which skill fits, so these reach the same skills:

```text
What should I work on next?
Implement P-15.
Why does M-06 exist, and what is it blocked by?
Users get the magic-link email twice. Have we seen this before?
```

Commands are shown as typed in Claude Code and Copilot CLI. In Codex write `$sw-<name>` for `/sw-<name>`. Task ids are an area prefix and a number, such as `P-15`.

### Set up

| Command | What it does |
| --- | --- |
| `/sw-init` | set up `docs/` in the current project, or upgrade it |
| `/sw-migrate` | convert task tables the project already has, on a git branch of its own |
| `/sw-config plan with opus, implement with sonnet` | choose the model for planning, implementing and reviewing; add task areas |

### Work on tasks

| Command | What it does |
| --- | --- |
| `/sw-brainstorm offline sync for the mobile app` | think an idea through before it is a task, or stress-test a task's goal and scope (`/sw-brainstorm P-15`): what the vault already records, questions in rounds with a recommended answer each, a written-back understanding you confirm, then the task files with your answers in their notes and the open questions with who answers them. It names the next step per task and starts neither |
| `/sw-plan-implement P-15` | take one task from todo to done. A small task goes straight to work; a large one gets a plan you approve first. Say "without presenting the plan" to skip the approval: the plan is still written, its assumed answers are recorded as yours, and you are still asked about a proposed split and about checks that start services. Without an id, it offers the tasks that can start |
| `/sw-autopilot the backend tasks` | work through several tasks in a row without asking at each step. It stops when a task needs you and reports every decision it made in your place |
| `/sw-explain M-06` | what a task is, why it exists, what it waits on and what it unblocks |
| `/sw-search what do we know about offline sync?` | answer a question from the vault, every claim with its reference: a wiki page, task, plan, log entry or raw source. What the vault does not record is said to be not recorded |
| `/sw-review P-15` | have the change reviewed by the reviewer role, on a task of any status, without changing it; for a done task it offers a follow-up task for blocking findings |
| `/sw-triage uploads hang at 100% since yesterday` | for a problem: has it happened before, what was learned, likely causes |

`sw-plan-implement` runs three steps that you can also run one at a time:

| Command | What it does |
| --- | --- |
| `/sw-plan P-15` | have a plan written and approve it. Items the plan proves by a test are marked "(test)" in the task. `/sw-plan add CSV export` creates the task first |
| `/sw-implement P-15` | build the task, have it reviewed if the task asks for a review, and record the result. An item built differently from its wording comes back to you to accept or send back |
| `/sw-verify P-15` | check each "Done when" item with a command that could have failed and write the evidence into the task file. A "(test)" item also needs its test seen failing before the code, and one deliberate break of the task's central rule; the last command is the project's full check, then `git status` |

### Keep the wiki

| Command | What it does |
| --- | --- |
| `/sw-ingest ~/Downloads/interview-notes.md` | file a source and summarize it into the wiki |
| `/sw-lint` | check links, frontmatter and task dependencies |
| `/sw-index` | rewrite the task list in `index.md` after you edited task files by hand |
| `/sw-view` | open the task board and the wiki in the browser |

### Watch the cost

| Command | What it does |
| --- | --- |
| `/sw-usage` | what the current session has used, per agent |
| `/sw-doctor` | what a session carries before any work, and what can be switched off for this project. It asks before changing anything |

`sw-usage` prints one row for the main session and one for each subagent. This is a real task, planned, implemented and reviewed in 37 minutes:

```text
agent           model              steps  first  peak   sent  cached  output  tools  min
main            claude-opus-5-5       27    79k  126k   2.8M     96%     18k     23   37
sw-planner      claude-opus-5-5       31    59k  154k   3.5M     96%      8k     32    6
sw-implementer  claude-sonnet-5-5     68    59k  252k  12.2M     96%     16k     76   26
sw-reviewer     claude-opus-5-5       23    60k  137k   2.4M     89%     372     24   12
total                                149      -     -  20.9M     95%     43k    155
```

`first` and `peak` are the tokens sent with one request; `sent` is that, summed over every step. Each step sends the whole context again, which is why Superwiki keeps contexts small.

`sw-usage` reads the session of the project it runs in. Run it from the same working directory as the task, or it reports another session.

### The CLI

The skills call a small script in your project. You can run it yourself, from the project root:

```bash
node docs/.sw/sw.mjs status                 # counts per area
node docs/.sw/sw.mjs ready                  # tasks that can start now
node docs/.sw/sw.mjs check P-15             # can it start or finish, its "done when:" item count, what is open
node docs/.sw/sw.mjs explain P-15           # dependencies, what it unblocks, its plan
node docs/.sw/sw.mjs search sync timeout    # where something is mentioned
node docs/.sw/sw.mjs lint                   # broken links, bad frontmatter, dependency errors
node docs/.sw/sw.mjs index                  # rewrite the task list in index.md
node docs/.sw/sw.mjs serve --open           # the viewer
```

`node docs/.sw/sw.mjs` without a command lists the rest. A filled-in example vault is in [examples/demo/docs](examples/demo/docs).

## Contributing

How to build, test and release is in [CONTRIBUTING.md](CONTRIBUTING.md). Why Superwiki works the way it does is in [DESIGN.md](DESIGN.md). The evals of the skill texts are in [evals/](evals/README.md).

## License

MIT
