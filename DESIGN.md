# Superwiki design

Superwiki is a set of agent skills that turn a project's `docs/` folder into an LLM-maintained wiki with an optional task tracker. The folder is an Obsidian vault for the human and a cheap-to-read knowledge base for the agent. The wiki pattern follows Andrej Karpathy's "LLM Wiki" note: raw sources, a wiki the agent owns, and a schema that tells the agent how to maintain it.

This file records the decisions. Status of the build is at the end.

## Layout

```
AGENTS.md        short always-on schema (CLAUDE.md imports it)
docs/            the vault
  index.md       catalog: one line per wiki page
  log.md         append-only: ## [YYYY-MM-DD] kind | title
  raw/           immutable sources
  wiki/          flat; frontmatter `type` and `summary`
  tasks/<ID>.md  one task per file (optional module)
  plans/<ID>-plan.md   one plan per task
  viewer.html    static viewer
  .sw/           sw.mjs (CLI), config.json, templates/
```

- The vault root is `docs/`, not the repo root: Obsidian would otherwise index `node_modules`.
- No code repository is required; a bare folder works as a wiki-only vault.
- Anything else under `docs/` belongs to other tools (for example a planning skill's own folders). Lint and the viewer ignore it.
- Page kind is the `type` frontmatter field, not a folder. Decisions are `type: decision` wiki pages; solved problems are `type: lesson` pages (Symptom, Cause, Fix, How to notice it earlier), which is what triage searches for.

## Token rules

The design is driven by what an agent must read and write per task.

1. The only mandatory read is `index.md`: one line per page.
2. `log.md` is appended to and read with `tail`, never whole.
3. A fact has one home. A task's status is in its frontmatter only; counts, waves and blockers are computed, never stored.
4. Ingest touches few files by default: a source summary, `index.md`, `log.md`. Wider cross-updates happen in lint passes.
5. Mechanical questions are answered by `docs/.sw/sw.mjs`, not by reading files.

## Single projects and several repositories

- A single-project repository uses one area (default `T`). The viewer hides area cards and the area filter when there is only one area. `soft_deps`, `milestone` and `priority` are optional.
- Each repository has its own vault. Dependencies between tasks in different repositories are written as plain text in the task's notes; lint and the viewer do not follow them. A shared vault for several repositories is possible later (the CLI already takes `--docs`) but is not built.

## Formats

- Links inside the vault are wikilinks, `[[file-name]]`. File names are unique across `wiki/`, `tasks/` and `plans/`. `raw/` files and URLs use normal markdown links; code is referred to by plain path.
- Task frontmatter: required `id`, `title`, `status`, `deps`; optional `soft_deps`, `milestone`, `priority`, `started`, `finished`.
- Statuses: `todo`, `in-progress`, `done`, `cancelled`. Cancelled tasks stay on disk; ids are never reused.
- `deps` must be done before a task starts. `soft_deps` allow starting but block finishing.
- Execution order is derived from dependencies plus optional `priority`. There is no stored sequence number.
- A plan lives in its own file and is linked to its task by name. Design shared by several tasks is a decision page.
- Everything Superwiki ships is in English. Content an agent writes into a user's vault follows that user's language.

## Commands

| Skill | Purpose |
|---|---|
| `sw-init` | scaffold the vault, viewer and schema block |
| `sw-ingest` | turn a raw source into wiki pages |
| `sw-plan` | clarify with the user, have a planner subagent write the plan, get approval |
| `sw-implement` | run a task with an implementer subagent and keep its status current |
| `sw-lint` | script checks first; semantic review as a separate, approved pass |
| `sw-explain` | explain one task from the script's dependency summary and the task file |
| `sw-triage` | for a reported problem: search the vault for earlier occurrences, lessons and likely causes; fixes nothing |
| `sw-visualize` | open the viewer |
| `sw-config` | areas, and per-tool models for planning and implementing |
| `sw-migrate` | convert a similar docs structure, on a new git branch |

Asking questions of the wiki and starting or finishing a task are always-on rules in `AGENTS.md`, not commands, so they hold when no command is used.

## Tools

One `skills/` directory serves every agent; each tool gets a thin manifest. Invocation differs by tool: `/sw:init` (Claude Code plugin), `$sw-init` (Codex), `/sw-init` (Copilot CLI and plain skill installs).

A skill cannot switch the main session's model in any of the three tools, and only Claude Code lets a skill enter plan mode. Both needs are met the same way everywhere: planning and implementing run in subagents defined by files that carry a model (`.claude/agents/*.md`, `.codex/agents/*.toml`, `.agent.md`). `sw-config` writes those files. The planner is read-only by permission, not by instruction.

## Viewer and CLI

`src/core.js` holds the vault model, derived task state and lint. It is bundled into `docs/.sw/sw.mjs` for Node and inlined into `docs/viewer.html` for the browser, so both report the same findings. The viewer is one static file that reads the folder through the File System Access API and never writes.

`sw-visualize` runs `sw.mjs serve --open`: a small server on 127.0.0.1 (started once per project, reused, gone after two idle hours) serves the viewer and the vault's pages, read from disk on every Refresh. The user picks nothing and any browser works. Without the server, `sw.mjs snapshot` writes the pages to `docs/.sw/data.js` and `docs/viewer.html` opens as a file, frozen at that moment; picking the folder by hand remains as a third way in Chromium browsers. `data.js` and the server's address file are git-ignored.

`sw-init` copies the CLI and viewer into the project. Skills then call `node docs/.sw/sw.mjs`, which works the same in every agent regardless of where skills are installed.

## Migration

`sw-migrate` samples the existing structure, proposes a mapping for the user to approve, converts in bulk with a script on a new git branch, and compares counts before and after. It never merges.

## Build order and status

| Step | State |
|---|---|
| 1. Schema, templates, `sw-init` | done; skill exercised by a fresh agent on a scratch project |
| 2. Core and CLI (`status`, `ready`, `check`, `next-id`, `lint`) | done; unit tests |
| 3. Viewer | done; browser-tested in headless Chromium on the demo vault and on a 165-task migrated project |
| 4. `sw-migrate` | script run on the real 165-task project, on a test branch, and measured against an independent parse of the source: every field of every task equal, all detail text and cells preserved, 0 broken links, 0 lint findings, other files changed only in their task links. The measurement found and fixed two defects (titles containing quotes; a link pattern that could swallow a bracket inside inline code). The skill text was followed by its author, not yet by a fresh agent |
| 5. `sw-ingest`, `sw-lint`, `sw-visualize` | ingest and lint exercised by a fresh agent on a copy of the demo vault and revised; visualize not exercised |
| 6. `sw-config`, `sw-plan`, `sw-implement` | `sw-config` script tested; plan and implement run end to end by a fresh agent on a small code project (plan, dependency gate, implement, done) through the fallback agents and revised. Not yet run with the generated `sw-planner` / `sw-implementer` agents or with real plan mode |
| 7. Codex and Copilot | Copilot CLI 1.0.31: skills found in `.agents/skills`, the generated `sw-planner` / `sw-implementer` agents found in `.github/agents`, the dependency gate and a full `sw-plan` run (planner dispatched through the `task` tool, plan saved, lint clean) verified non-interactively. Codex CLI 0.153.4: skills found in `.agents/skills`, the dependency gate and a full `sw-plan` run (planner spawned with `spawn_agent`, `agent_type: "sw_planner"`, model taken from the generated agent file; plan saved, lint clean) verified non-interactively |

## Open questions

- Codex: a skill cannot enter plan mode (confirmed). Whether `sandbox_mode = "read-only"` in the generated planner file is enforced is undetermined: the planner said its sandbox allowed writes, and when asked to write a probe file it declined on its instructions, so the sandbox was never exercised.
- Copilot CLI: a skill cannot enter plan mode (confirmed; the user starts with `--mode plan` or `/plan`). Whether the `model:` field and the `tools: ["read", "search"]` allow-list of a generated agent are honoured is untested; no model was set in the test run.
- Copilot CLI with another skills plugin installed (superpowers) answered a bare `/sw-implement T-02` prompt in `-p` mode by loading that plugin's bootstrap skill instead. Naming the skill in a sentence worked. Interactive slash invocation is untested.
- Whether Claude Code plan mode allows dispatching the planner subagent, as `sw-plan` assumes.
- Command names as a Claude Code plugin: `commands/*.md` wrappers are meant to give `/sw:init`; skills also appear under their own names. `claude plugin validate` passes; an actual install has not been tried.
- `.codex-plugin/plugin.json` is modelled on another plugin's manifest and has not been installed.
