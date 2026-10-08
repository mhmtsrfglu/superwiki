---
name: sw-migrate
description: Use when the user wants to convert an existing docs folder, task index, markdown task tables, backlog or changelog into a Superwiki vault, or invokes sw-migrate.
---

# sw-migrate

Converts a project that tracks work in markdown tables into a Superwiki vault: one file per task, wikilinks, an append-only log. A script inspects the existing files and does the conversion from a mapping you write. You never read the index yourself; it can be hundreds of kilobytes.

Run everything from the project root. `<skill-dir>` is this skill's directory; `<init-dir>` is the sw-init skill's directory (a sibling folder).

## Preconditions

Stop and tell the user if any of these fails; do not work around them.

- The project is a git repository, and `git status --porcelain -- docs AGENTS.md CLAUDE.md` is empty: the files this skill rewrites have no uncommitted changes. Uncommitted changes elsewhere do not block; mention them in the report so the user does not mistake them for the migration's.
- `docs/.sw/config.json` does not exist (already a vault). Empty folders left by an earlier, undone attempt are not a vault; ignore them.
- Node 18 or newer.

## Steps

1. **Branch.** The conversion belongs on its own branch. If the project lets you run git, `git switch -c superwiki-migrate`; if it does not, or you are already on a branch the user made for this, ask the user to confirm the branch and stay on it. Never merge, push or delete a branch yourself.
2. **Inspect**: `node <skill-dir>/scripts/migrate.mjs --inspect`. It prints, for every file that lists tasks: the tables with their line, row count and columns, the values of status-like columns with their counts, and how many per-task headings a file has. It also warns when `docs/wiki/`, `docs/tasks/` or `docs/plans/` already exist. This output is all you need for the mapping; do not open the files.
3. **Write the mapping** to a temporary file outside the repo. `node <skill-dir>/scripts/migrate.mjs --help` prints the format. Decide, from the inspect output:
   - the index file, and which columns are id, title, status, dependencies, milestone, order and dates;
   - every status value → `todo`, `in-progress`, `done` or `cancelled`. Write the value as inspect shows it; decoration such as a check mark is already stripped;
   - the marker for soft dependencies, if the project has them;
   - other columns worth keeping: as frontmatter (`fields`, for short values such as a review class) or as a body section (`sections`, for prose such as sources and notes);
   - where per-task detail sections live and their heading prefix;
   - the table that is the changelog, if any. It may be in the index file itself;
   - `archiveAlso`: anything in `docs/wiki/`, `docs/tasks/` or `docs/plans/` that the mapping does not consume. Superwiki owns those folders.
4. **Dry run**: `node <skill-dir>/scripts/migrate.mjs --mapping <file> --dry-run`. The report has two parts:
   - `PROBLEMS`: each one must be fixed, in the mapping or in the files, and the dry run repeated until it says `no problems`. An unknown status is a question for the user, not a guess.
   - "For information": files whose links were rewritten, detail sections without a row, links that now point into the archive. Nothing to fix; pass the counts on.
5. **Show the user the mapping and the dry-run report, and wait for approval.** Put the task counts per status next to the project's own numbers (inspect's status counts, or the project's summary table). If they differ, find out why before going on.
6. **Convert**: the same command without `--dry-run`, then the `init.mjs` command the report prints, with real area names in place of the repeated ids, then `node docs/.sw/sw.mjs status` and `node docs/.sw/sw.mjs lint`.
7. **Verify.** `status` shows `ready` and `blocked` where the report said `todo`: their sum must equal the todo count, and the other counts must match as they are. `lint` must have 0 errors. An error here is a real inconsistency in the source (a task started before its dependency finished, a dependency cycle): report it; do not edit task files to make it pass.
8. **Report** what moved where, the counts, the lint result, and what is left for a human decision (next section). Commit only if the user asks.

## What the conversion does

So that you can tell the user without looking:

- every row of the task tables becomes `docs/tasks/<ID>.md`, with its detail section and the kept columns as the body;
- the changelog becomes `docs/log.md`, oldest entry first;
- the index, the detail files, the changelog and everything in `archiveAlso` move to `docs/legacy/`, keeping their layout;
- links to tasks become wikilinks everywhere under `docs/`, so other documents are edited too; the report lists them;
- `init.mjs` then adds `docs/index.md`, the viewer, the CLI and the Superwiki block in `AGENTS.md`.

## What it leaves for the user

Tell the user about each of these; act only on what they choose.

| Left over | Where it is | Options |
| --- | --- | --- |
| Rules and conventions written in the old index | `docs/legacy/` | most are replaced by the Superwiki block in `AGENTS.md`; project-specific ones go to `AGENTS.md` outside that block |
| Milestones, glossaries, decision records in the old index | `docs/legacy/` | turn into `docs/wiki/` pages with `type:` and `summary:`, and list them in `index.md` |
| Research, specs, decisions in other folders | in place, outside the vault | leave, or move into `raw/` (sources) or `wiki/` (maintained pages) |
| Plans written by other tools | in place, or in the archive if they were under `docs/plans/` | leave, or turn one into `docs/plans/<ID>-plan.md` when it belongs to exactly one task |
| The old viewer or scripts that parse the old index | in place | delete once `docs/viewer.html` shows the same numbers |
| Instructions in `AGENTS.md` / `CLAUDE.md`, and links in files outside `docs/`, that point at the old index | in place | rewrite to point at the Superwiki rules and the new task files; show the diff first |
| Task files that carry a long history (plan, review record, daily notes in one section) | `docs/tasks/` | leave; new tasks keep the plan in `docs/plans/` and history in the log |

`docs/legacy/` is an archive, not part of the vault. Delete it only when the user says so.

## Common mistakes

- Opening the index or the detail files to "understand them first". Inspect and the dry run tell you what is there and what did not parse.
- Mapping a status the script reported as unknown to `todo` without asking. Ask what it means.
- Leaving a line under `PROBLEMS` and converting anyway.
- Fixing lint errors by changing statuses. The old data was inconsistent; the user decides which side is right.
- Hand-editing links. If the script missed a link shape, report it.
