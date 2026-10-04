---
name: sw-init
description: Use when the user asks to set up, initialize, scaffold or upgrade a second brain, LLM wiki or Superwiki vault in a project's docs folder, or invokes sw-init or sw:init.
---

# sw-init

Turns `docs/` into a Superwiki vault: an LLM-maintained wiki that is also an Obsidian vault, with an optional task module. A script does the scaffolding; do not create the files by hand.

The vault is always `<project root>/docs`. Run every command below from the project root. `<skill-dir>` is the directory this SKILL.md is in.

## Steps

1. **Check Node**: `node --version` must be 18 or newer. If not, go to "Without Node".
2. **Upgrade or new?** If `docs/.sw/config.json` exists this is an upgrade: skip step 3 and run the script with no flags; it reuses the saved choices.
3. **Ask the user, in one message** (new vault only):
   - Task module on or off. Recommend on when the project is mainly code, off for a pure knowledge base.
   - If on, the area prefixes for task ids (`M-01`, `B-01`). Recommend the single default area `T` unless the project already has separately named parts. Area names are optional labels; do not ask for them separately.
4. **Run the script**, with the flags that match the answer:

   ```bash
   node <skill-dir>/scripts/init.mjs --tasks                               # tasks on, default area T
   node <skill-dir>/scripts/init.mjs --tasks --areas "M=Mobile,B=Backend"  # tasks on, named areas
   node <skill-dir>/scripts/init.mjs --no-tasks                            # wiki only
   node <skill-dir>/scripts/init.mjs                                       # upgrade
   ```

5. **Check**: run `node docs/.sw/sw.mjs lint`. A new vault reports `0 errors, 0 warnings`. On an upgrade, findings are about the user's existing pages: show them, do not fix them unasked.
6. **Report** to the user from the script's output. Each line starts with a status:

   | Status | Say |
   |---|---|
   | `created`, `updated` | what is new or changed |
   | `kept`, `unchanged` | that user content and settings were not touched (one sentence, no list) |
   | `missing` | that this Superwiki build lacks the file; name it, and do not point the user at it |
   | `note` about `CLAUDE.md` | offer to add the `@AGENTS.md` line. Add it only after the user agrees to that specific change |
   | "docs/ already had content" | that content is untouched and outside the vault; sw-migrate converts it |

   End with how to look at the result: open `docs/` as an Obsidian vault, or open `docs/viewer.html` in Chrome or Edge and pick the project folder (only if the viewer was not reported `missing`).

## What the script guarantees

| File | On re-run |
|---|---|
| `docs/index.md`, `docs/log.md`, everything in `raw/`, `wiki/`, `tasks/`, `plans/` | kept |
| `docs/.sw/sw.mjs`, `docs/.sw/templates/`, `docs/viewer.html` | replaced with this version |
| `AGENTS.md` | only the Superwiki block (from the `sw:start` comment to the `sw:end` comment) is replaced |
| `docs/.sw/config.json` | areas and models kept unless new flags are passed |

## Without Node

The script and `docs/.sw/sw.mjs` need Node 18 or newer. If `node` is missing or older, say so and stop; continue by hand only if the user asks for that. By hand: create `docs/{raw/assets,wiki}` (plus `tasks`, `plans`), copy `assets/templates/` to `docs/.sw/templates/` and `assets/viewer.html` to `docs/`, write `index.md` and `log.md` as the script would, and paste `assets/agents-block.md` into `AGENTS.md` with the `{{...}}` lines resolved. Tell the user the `sw.mjs` commands in that block will not work until Node is installed.
