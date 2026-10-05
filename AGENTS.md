# Agent instructions

<!-- sw:start (managed by sw-init; write your own rules outside these markers) -->
## Superwiki (`docs/`)

`docs/` is a wiki you write and keep current, and an Obsidian vault the user reads.

- `docs/index.md`: the open tasks, then the catalog, one line per wiki page. Read it first, then open only the pages you need.
- `docs/log.md`: append-only. Add `## [YYYY-MM-DD] <kind> | <title>` at the end; read it with `tail`, never whole.
- `docs/raw/`: sources. Read, never modify.
- `docs/wiki/`: flat, one page per topic, frontmatter `type:` and one-line `summary:`.
- `docs/tasks/<ID>.md`: one task per file. `docs/plans/<ID>-plan.md`: its plan, if any.
- Anything else under `docs/` belongs to other tools. Leave it alone.
- File formats: `docs/.sw/templates/`.

Wiki:

- Link vault pages as `[[file-name]]`; file names are unique across the vault. Use normal markdown links for `raw/` files and URLs, and plain paths for code.
- When you add or rename a wiki page, update its line in `index.md`.
- Answer questions from the wiki, index first. Offer to save an answer worth keeping as a wiki page.

Tasks:

- A task's status lives only in its frontmatter. Before you start: `status: in-progress` and `started:`. When its "Done when" list is met and `sw-summarize` has verified it: `status: done` and `finished:`. Each change of status gets a `task` entry in `log.md`, each summary a `summary` entry.
- The task list in `index.md` is written from the task files. After you add a task or change a task's status, title, milestone or dependencies, run `node docs/.sw/sw.mjs board`. Never edit that list by hand.
- Do not start a task while any of its `deps` is not done.
- If `explain <ID>` names an area guide (`docs/wiki/guide-<area>.md`), read it before you change code for the task: where things are, patterns, how to verify. Afterwards add the facts it was missing, one line each.
- Work that belongs to no task (a quick fix, a small request) needs no task file. Append one `change` entry to `log.md` instead: what changed and why, in a line.
- `node docs/.sw/sw.mjs status|ready|check <ID>|explain <ID>|search <words>|next-id <AREA>|lint` answers overview, startable tasks, blockers, a task's place in the chain, where something is mentioned, new ids and structural checks without reading files. Run `lint` after you add, rename or relink pages.

Skills. Use these without being asked. For work in this vault they come before any other planning, implementing or debugging skill:

- Planning a task, or the user asks what to work on next: `sw-plan`.
- Implementing a task: `sw-implement`. A change that needs no plan and touches one or two files may be done directly, under the task rules above.
- Closing a task, or the user asks what a task did and how it was verified: `sw-summarize`.
- Several tasks in a row without the user at each step: `sw-run`.
- A question about a task (what, why, what it blocks): `sw-explain`.
- A bug, failure or unexpected behavior is reported: `sw-triage` first, before any debugging.
- A source to file (article, notes, transcript, URL): `sw-ingest`.
- If a skill is not installed, follow the rules above by hand.
<!-- sw:end -->
