---
name: sw-migrate
description: Use when the user wants to convert an existing docs folder, task index, markdown task tables, backlog or changelog into a Superwiki vault, or invokes sw-migrate or sw:migrate.
---

# sw-migrate

Converts a project that tracks work in markdown tables into a Superwiki vault: one file per task, wikilinks, an append-only log. A script does the bulk conversion from a mapping you write; you only read samples, never the whole index.

Run everything from the project root. `<skill-dir>` is this skill's directory; `<init-dir>` is the sw-init skill's directory (a sibling folder).

## Preconditions

Stop and tell the user if any of these fails; do not work around them.

- The project is a git repository, and `git status --porcelain -- docs AGENTS.md CLAUDE.md` is empty: the files this skill rewrites have no uncommitted changes. Uncommitted changes elsewhere do not block; mention them in the report so the user does not mistake them for the migration's.
- `docs/.sw/config.json` does not exist (already a vault). Empty folders left by an earlier, undone attempt are not a vault; ignore them.
- Node 18 or newer.

## Steps

1. **Branch**: `git switch -c sw-migrate`. All changes stay on this branch. Never merge, push or delete the branch yourself.
2. **Sample, do not read.** The index can be hundreds of kilobytes.
   - `ls docs docs/*/ | head -60` for the layout.
   - `grep -n '^|' docs/<index> | awk 'length > 0' | cut -c1-200 | head -40` for table headers and a few rows.
   - `grep -n '^## ' docs/<detail file> | head` and about 30 lines of one section, if tasks have detail files.
   - The status values in use: `grep -o '| *[A-Za-z ✅]* *|' ... | sort | uniq -c` on the status column, or read ten rows.
3. **Write the mapping** to a temporary file outside the repo. `node <skill-dir>/scripts/migrate.mjs --help` prints the format. Decide:
   - which columns are id, title, status, dependencies, milestone, order, dates;
   - every status value → `todo`, `in-progress`, `done` or `cancelled`;
   - the marker for soft dependencies, if the project has them;
   - which other columns to keep as body sections (sources, notes);
   - where per-task detail sections live and their heading prefix;
   - the changelog file and its columns, if any.
4. **Dry run**: `node <skill-dir>/scripts/migrate.mjs --mapping <file> --dry-run`.
5. **Show the user the mapping and the dry-run report, and wait for approval.** State the task counts per status next to the project's own numbers (its summary table, or a `grep -c`). If they differ, find out why before going on. Fix every line under `problems`.
6. **Convert**: the same command without `--dry-run`, then the `init.mjs` command the report prints (replace the area names with real ones), then `node docs/.sw/sw.mjs status` and `node docs/.sw/sw.mjs lint`.
7. **Verify**: `status` totals equal the dry-run counts and the project's own numbers; `lint` has 0 errors. Lint errors here are real inconsistencies in the source (a task started before its dependency finished, a dependency cycle). Report them; do not edit task files to make them pass.
8. **Report** what moved where, the counts, the lint result, and what is left for a human decision (next section). Commit only if the user asks.

## What the script does not do

Tell the user about each of these; act only on what they choose.

| Left over | Where it is | Options |
|---|---|---|
| Rules and conventions written in the old index | `docs/legacy/` | most are replaced by the Superwiki block in `AGENTS.md`; project-specific ones go to `AGENTS.md` outside the Superwiki block |
| Milestones, glossaries, decision records in the old index | `docs/legacy/` | turn into `docs/wiki/` pages with `type:` and `summary:`, and list them in `index.md` |
| Research, specs, decisions in other folders | unchanged, outside the vault | leave, or move into `raw/` (sources) or `wiki/` (maintained pages) |
| Plans written by other tools | unchanged | leave, or move to `docs/plans/<ID>-plan.md` when a plan belongs to exactly one task |
| The old viewer or scripts that parse the old index | unchanged | delete once `docs/viewer.html` shows the same numbers |
| Instructions in `AGENTS.md` / `CLAUDE.md` that describe the old index | unchanged | rewrite to point at the Superwiki rules; show the diff first |

`docs/legacy/` is an archive, not part of the vault. Delete it only when the user says so.

## Common mistakes

- Reading the whole index to "understand it first". Samples are enough; the dry run tells you what did not parse.
- Mapping a status the script reported as unknown to `todo` without asking. Ask what it means.
- Fixing lint errors by changing statuses. The old data was inconsistent; the user decides which side is right.
- Hand-editing hundreds of links. If the script missed a link shape, fix the mapping or report it.
