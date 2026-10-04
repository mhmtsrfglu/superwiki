---
name: sw-visualize
description: Use when the user wants to see, open, browse or visualize the Superwiki vault, task board, dependency waves or wiki in a browser, or invokes sw-visualize or sw:visualize.
---

# sw-visualize

Opens the viewer on this project's vault. One command; the user picks nothing. Do not read vault files or generate HTML yourself.

Run from the project root:

```bash
node docs/.sw/sw.mjs serve --open
```

It starts a small local server for this project (or reuses the one already running), prints its address, and opens it in the default browser. The page reads the files as they are: after the vault changes, **Refresh** in the page shows the new state. The server answers only on this machine and stops by itself after two hours without use.

Tell the user the address it printed and that Refresh re-reads the files. Nothing else.

## If it fails

| Problem | Do |
|---|---|
| `docs/.sw/sw.mjs` or `docs/viewer.html` missing | say so; offer to run sw-init, which installs them |
| "could not start the viewer server" | `node docs/.sw/sw.mjs snapshot`, then open `docs/viewer.html` as a file (`open`, `xdg-open` or `start`). Tell the user this view is frozen at the moment of the snapshot; running sw-visualize again refreshes it |
| No browser on this machine (remote session) | give the user the snapshot path instead: `docs/viewer.html` opens on any machine that has the `docs/` folder |

If the user asks a question the viewer answers (counts, what is ready, what blocks a task), answer it with `node docs/.sw/sw.mjs status|ready|check <ID>` instead of opening the browser.
