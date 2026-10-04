<!-- sw:start (managed by sw-init; write your own rules outside these markers) -->
## Superwiki (`docs/`)

`docs/` is a wiki you write and keep current, and an Obsidian vault the user reads.

- `docs/index.md`: catalog, one line per wiki page. Read it first, then open only the pages you need.
- `docs/log.md`: append-only. Add `## [YYYY-MM-DD] <kind> | <title>` at the end; read it with `tail`, never whole.
- `docs/raw/`: sources. Read, never modify.
- `docs/wiki/`: flat, one page per topic, frontmatter `type:` and one-line `summary:`.
{{#tasks}}
- `docs/tasks/<ID>.md`: one task per file. `docs/plans/<ID>-plan.md`: its plan, if any.
{{/tasks}}
- Anything else under `docs/` belongs to other tools. Leave it alone.

Rules:

- Link vault pages as `[[file-name]]`; file names are unique across the vault. Use normal markdown links for `raw/` files and URLs, and plain paths for code.
- When you add or rename a wiki page, update its line in `index.md`.
- Answer questions from the wiki, index first. Offer to save an answer worth keeping as a wiki page.
{{#tasks}}
- A task's status lives only in its frontmatter. Before you start: `status: in-progress` and `started:`. When its "Done when" list is met: `status: done` and `finished:`. Each change gets a `task` entry in `log.md`.
- Do not start a task while any of its `deps` is not done.
- `node docs/.sw/sw.mjs status|ready|check <ID>|explain <ID>|search <words>|next-id <AREA>|lint` answers overview, startable tasks, blockers, a task's place in the chain, where something is mentioned, new ids and structural checks without reading files. Run `lint` after you add, rename or relink pages.
{{/tasks}}
{{^tasks}}
- `node docs/.sw/sw.mjs search <words>` finds where something is mentioned; `lint` checks links and frontmatter. Neither needs you to read files. Run `lint` after you add, rename or relink pages.
{{/tasks}}
- File formats: `docs/.sw/templates/`.
<!-- sw:end -->
