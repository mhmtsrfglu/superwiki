# Superwiki design

Superwiki is a set of agent skills that turn a project's `docs/` folder into a wiki the coding agent writes and keeps current, with an optional task tracker. The folder is an Obsidian vault for the human and a cheap-to-read knowledge base for the agent. The wiki follows the LLM Wiki pattern described by Andrej Karpathy: raw sources, a wiki the agent owns, and a schema that tells the agent how to maintain it.

This file records the decisions and, at the end, what has and has not been proven.

## Layout

```text
AGENTS.md        short always-on schema (CLAUDE.md imports it)
docs/            the vault
  index.md       catalog: one line per wiki page
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
- A page's kind is its `type` frontmatter field, not a folder. Types with a defined shape: `source` (summary of one raw file), `decision`, `lesson` (Symptom, Cause, Fix, How to notice it earlier), `guide` (how to work in one task area).

## Formats

- Links inside the vault are wikilinks, `[[file-name]]`; file names are unique across `wiki/`, `tasks/` and `plans/`. `raw/` files and URLs use normal markdown links; code is referred to by plain path.
- Task frontmatter: required `id`, `title`, `status`, `deps`; optional `soft_deps`, `milestone`, `priority`, `started`, `finished`.
- Statuses: `todo`, `in-progress`, `done`, `cancelled`. Cancelled tasks stay on disk; ids are never reused.
- `deps` must be done before a task starts. `soft_deps` allow starting but block finishing.
- Execution order is derived from dependencies plus optional `priority`. There is no stored sequence number, summary table or dependency table.
- A single-project repository uses one area (default `T`); the viewer hides area cards and the area filter then.
- Everything Superwiki ships is in English. Content an agent writes into a vault follows that vault's language.

## What the agent reads

The design is driven by what an agent must read and write per task.

1. The only mandatory read is `index.md`: one line per page.
2. `log.md` is appended to and read with `tail`, never whole.
3. A fact has one home. A task's status is in its frontmatter only; counts, waves and blockers are computed.
4. Ingest touches few files: a source summary, `index.md`, `log.md`. Wider cross-updates are recorded as follow-ups and done in lint passes.
5. Mechanical questions are answered by `docs/.sw/sw.mjs`, not by reading files.

## Cost of a task

Measured on a real project, a 65-line change that was planned by one subagent and implemented by another used about 234k tokens of context: both explored the same code, and the plan was long. Four rules follow.

- **Small tasks skip planning.** One area, three "Done when" items or fewer, nothing left open, a few files: `sw-implement` runs straight from the task file.
- **Reading is bounded.** The planner reads to answer three questions (which files change, which pattern to copy, how to verify) and stops. The implementer opens what the plan lists under "Read first". Plans aim for 40 to 60 lines.
- **Exploration is filed, not repeated.** Each task area has a guide page with layout, patterns, verification commands and gotchas. Planner and implementer read it first and report what it lacked; `sw-implement` adds those lines. The next task in the area starts from the guide.
- **The plan does not pass through the main session.** The planner writes the plan file as `status: draft` and returns a few lines; approval changes it to `approved`. The main session reads neither the code nor the plan.

A check that starts services or changes data is marked `needs:` in the plan and runs only with the user's yes.

These rules are new and have not been measured yet.

## Skills

| Skill | Purpose |
| --- | --- |
| `sw-init` | scaffold the vault, the viewer and the schema block |
| `sw-migrate` | convert a table-based task index, on a new git branch |
| `sw-ingest` | turn a raw source into wiki pages |
| `sw-plan` | decide whether a plan is needed; have the planner subagent write it; get approval |
| `sw-implement` | run a task with the implementer subagent, record the result, keep the area guide |
| `sw-explain` | explain one task: what, why, dependencies, what it unblocks |
| `sw-triage` | for a reported problem: earlier occurrences, lessons, likely causes; fixes nothing |
| `sw-lint` | script checks first; semantic review as a separate, approved pass |
| `sw-visualize` | open the viewer |
| `sw-config` | areas, and the model each tool uses for planning and implementing |

The schema block in `AGENTS.md` holds the rules that must apply without any command: read the index first, keep task status and the log current, read the area guide before changing code. It also tells the agent which skill to reach for without being asked, ahead of other planning or debugging skills; a skill's description alone proved too weak a trigger when another skill set competes for the same words.

## Tools

One `skills/` directory serves every agent. `npx superwiki install <target>` copies the skills into the folder a tool reads; `install.sh` links them from a clone. Invocation differs by tool: `/sw-init` (Claude Code, Copilot CLI), `$sw-init` (Codex).

No tool lets a skill change the running session's model, and only Claude Code lets a skill enter plan mode. Model choice therefore works the same way everywhere: planning and implementing run in subagents defined by files that carry a model (`.claude/agents/*.md`, `.codex/agents/*.toml`, `.github/agents/*.agent.md`), written by `sw-config`.

## Viewer and CLI

`src/core.js` holds the vault model, derived task state, lint and search. It is bundled into `docs/.sw/sw.mjs` for Node and inlined into `docs/viewer.html` for the browser, so both report the same findings.

`sw-init` copies the CLI and the viewer into the project, so skills call `node docs/.sw/sw.mjs` the same way in every agent, and a project keeps working with the version it was set up with.

`sw-visualize` runs `sw.mjs serve --open`: a small server on 127.0.0.1, started once per project, reused, and gone after two idle hours. It serves the viewer and the vault's pages, read from disk on every Refresh, so the user picks nothing and any browser works. Without the server, `sw.mjs snapshot` writes the pages to `docs/.sw/data.js` and the viewer opens as a file, frozen at that moment. `data.js` and the server's address file are git-ignored.

## Migration

`sw-migrate` samples the existing structure, writes a mapping, shows a dry run for approval, converts in bulk with a script on a new git branch and compares counts before and after. It never merges. What it does not convert (rules and milestones in the old index, other document folders, instruction files that describe the old index) is listed for the user to decide.

## What has been proven

| Part | Evidence |
| --- | --- |
| Core, CLI, installer | unit tests (`npm test`) |
| Viewer | headless Chromium on the demo vault and on a migrated 165-task project |
| `sw-init` | followed by a fresh agent on a scratch project |
| `sw-migrate` | followed by a fresh agent on a real 165-task project; an independent parse of the source confirmed every field of every task, all detail text, zero broken links |
| `sw-ingest`, `sw-lint`, `sw-explain`, `sw-triage` | followed once by a fresh agent on a copy of the demo vault, then revised |
| `sw-plan`, `sw-implement` | run end to end on a small code project and on a real task (planned on one model, implemented on another); both skills were rewritten afterwards and the new versions have not been run |
| Codex CLI 0.153, Copilot CLI 1.0.31 | skills found; a blocked task refused; `sw-plan` run with the generated planner agent (older skill version) |

## Open questions

- Whether the cost rules above cut tokens as intended.
- Whether the schema block makes agents reach for the skills unprompted.
- Claude Code: `sw-plan` presenting through plan mode has not been tried.
- Copilot CLI: whether the `model:` field of a generated agent file is honoured.
- `sw-visualize` skill text has not been followed by an agent.
- Plugin manifests (`.claude-plugin`, `.codex-plugin`) validate but have not been installed.
- Migration leaves links in files outside `docs/` (for example `architecture.md`) pointing at archived files, and its sampling commands do not fit every index layout.
