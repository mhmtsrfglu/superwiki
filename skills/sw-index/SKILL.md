---
name: sw-index
description: Use when the user wants the task list in docs/index.md refreshed, updated or rebuilt, says the index is out of date after editing tasks by hand, or invokes sw-index.
---

# sw-index

Rewrites the task list at the top of `docs/index.md` from the task files. One command; do not read the task files or write the list yourself.

Run from the project root:

```bash
node docs/.sw/sw.mjs index
```

It prints whether the list changed and the counts. Tell the user that, in one line. Only its own section of `index.md` is rewritten; what the user wrote around it stays.

The list is a view. A task's status lives in the frontmatter of `docs/tasks/<ID>.md`: to change what the list shows, change the task file and run the command again. Never edit the list by hand.

## If it fails

| Output | Do |
| --- | --- |
| `unknown command index` | the project's `docs/.sw/sw.mjs` is older than this skill; offer to run sw-init, which updates it and writes the list |
| `this vault has no task module` | say so; sw-init with `--tasks` adds it |
| `docs/index.md is missing` | offer to run sw-init |

If the user asks what is ready, what blocks a task or how many are done, answer with `node docs/.sw/sw.mjs ready|check <ID>|status` instead of reading the list.
