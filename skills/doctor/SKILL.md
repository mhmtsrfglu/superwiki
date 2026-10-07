---
name: doctor
description: Use when the user wants to make agent sessions lighter or cheaper to start, asks what fills the context window before any work (rules, memory, skills, plugins, MCP tools), why a session starts with so many tokens, or invokes sw:doctor.
---

# sw:doctor

Shows what a session carries before it has read anything, and proposes what to remove. Rule and memory files, the lists of skills, agents and tools, and what plugins and hooks add are sent again with every step of every agent, subagents included, so a smaller start makes every step cheaper.

You cannot run the tool's own context command: it is typed by the user. A script reads the same blocks from the record the tool keeps of this session. You read nothing yourself and write no report.

Run from the project root:

```bash
node docs/.sw/sw.mjs doctor
```

It reports the session it runs in. `--session <id or its first characters>` picks another session of this project, `--tool claude|codex|copilot` looks only at one tool's sessions.

## Steps

1. **Show the table as printed**, in a code block. Sizes are characters of text, not tokens.
2. **Propose changes**, largest saving first, at most five. For each: the part and its size from the table, what to change, and where. Use the table under "What to propose". Propose only what the output supports, and say plainly when a part cannot be made smaller.
3. **Ask before changing anything**, one proposal at a time. Which plugin or server a project needs is the user's call: say what a group appears to be for and let them decide.
4. **Apply what the user approved**, within the limits under "Limits".
5. **Have it measured.** A change takes effect in a new session. Ask the user to open one and run the tool's own command there: `/context` in Claude Code and Copilot CLI, `/status` in Codex. Compare its figures with the ones from before; a setting that changed nothing is reported as such and taken out again.

If the user pastes the output of that command, use its token figures in place of the character sizes; the parts are the same.

## What to propose

| In the table | Propose | What it saves |
| --- | --- | --- |
| `rule and memory files`: one file is most of the part | name the file. A rules file (`AGENTS.md`, `CLAUDE.md`): move sections that are needed only for some work into a document the agent opens on demand, and leave a one-line pointer. A memory index: one line per entry holding one lesson; dates, counts and status belong in the entry's own file | its full size |
| `agent list`: groups that have nothing to do with this project | switch those plugins off for this project (how: "Limits"). The group label is the plugin's name; `(none)` is the user's own and built-in entries | the lines of those agents |
| `skill list`: groups that have nothing to do with this project | the same switch. Say what to expect: the tool gives the list a fixed budget and shortens descriptions to fit, so fewer skills usually means fuller descriptions for the rest, not a smaller list. Worth doing so the agent picks skills better; not a token saving | little or nothing |
| `tool names (loaded on demand)`: servers the project does not use | the user disables those MCP servers for this project. Only names are loaded, so the saving is the size shown, not the size of the tool definitions | the names of those tools |
| `MCP server instructions` | goes away with the server; no separate change | with the server |
| `session-start hooks` | name the hook and the plugin it belongs to, if the user can say; it goes away with that plugin | its full size |
| Codex: `skills instructions` is large | skills are listed from `~/.agents/skills` and from plugins; remove or move the ones this user does not use | not measured |
| Copilot CLI: `custom instruction` is large | the project's instruction files; same advice as for a rules file | its full size |
| `first request` is far above what the parts add up to | the rest is the tool's own system prompt and built-in tool definitions. Say so; it cannot be changed from here | nothing |

Give a saving as the size in the table. Do not turn it into a token or money figure unless the user pasted token numbers.

## Limits

- **Project-local settings only.** Never edit the user's global settings, and never uninstall a plugin or remove a server: switching it off for this project is enough and is undone by deleting a line.
- **Claude Code**:
  - a plugin off: in `.claude/settings.local.json` (personal, normally git-ignored; keep what is already there), `"enabledPlugins": { "<plugin>@<marketplace>": false }`. The full key is in `~/.claude/settings.json` under `enabledPlugins`; read only that key.
  - an MCP server or a claude.ai connector off: the user does it with `/mcp` in the session. Do not edit `~/.claude.json`, and do not set environment variables for it in the project's settings: that was tried and changed nothing.
  - plugins synced from the user's claude.ai account are not in that settings file; they are removed in the account's settings.
- **Codex and Copilot CLI**: propose, and let the user change their configuration; this skill does not edit it.
- **Memory and rule files are the user's.** Shorten an index or move a section only when asked, keep a copy of the previous version next to the file, and never delete an entry.
- If the project's own rules forbid a change, they win.

## If it fails

| Output | Do |
| --- | --- |
| `unknown command doctor` | the project's `docs/.sw/sw.mjs` is older than this skill; offer to run sw:init, which updates it |
| `no agent session record found` | say so and ask the user to run the tool's context command and paste the output; work from that |
| a note that the session has not made a request yet | another session of this project is newer than yours; run again with `--session` and the id of the one you mean |
| a note that Copilot has not counted its tool definitions | pass it on; the other parts are valid |
