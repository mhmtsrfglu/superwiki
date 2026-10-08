---
name: sw-config
description: Use when the user wants to choose or change which model plans, implements or reviews Superwiki tasks (opus, sonnet, gpt and so on), write the agent files Codex and Copilot need for the planner, implementer and reviewer roles, add task areas, see the Superwiki configuration, or invokes sw-config.
---

# sw-config

Settings live in `docs/.sw/config.json`. Change them with the script, from the project root; it also writes the agent files that make a model choice take effect, and that Codex and Copilot need before they can run a role at all. `<skill-dir>` is this skill's directory.

```bash
node <skill-dir>/scripts/config.mjs show
node <skill-dir>/scripts/config.mjs model plan claude opus
node <skill-dir>/scripts/config.mjs model implement claude sonnet
node <skill-dir>/scripts/config.mjs model review codex gpt-6
node <skill-dir>/scripts/config.mjs model plan copilot --unset
node <skill-dir>/scripts/config.mjs areas "M=Mobile,B=Backend"
node <skill-dir>/scripts/config.mjs sync --tools claude,codex,copilot
```

## Models

A model is chosen per role and per tool, because each tool can only run its own models.

| Role | Does | Used by |
| --- | --- | --- |
| `plan` | writes the plan file for a task | sw-plan |
| `implement` | does the work of a task | sw-implement |
| `review` | reviews the implementation from a clean context, for tasks whose frontmatter has `review:` or on request | sw-implement, sw-review |

Keep `review` on a mid-tier model or better. In the measurement the audit relies on, small models used as reviewers flagged none of ten planted defects at the right severity, and a review that finds nothing costs a dispatch and lends false confidence. The Claude Code reviewer file lists `tools: Read, Grep, Glob, Bash`, which removes the editing tools; the shell can still write a file, so the instruction in `reviewer.md` is what keeps the reviewer from writing.

No tool lets a skill change the model of the running session, so the skills hand the work to a subagent, and the subagent's file carries the model. The script writes one file per role, with the role's instructions as its body (`planner.md` from the sw-plan skill, `implementer.md` and `reviewer.md` from the sw-implement skill, each under that skill's `assets/`):

| Tool | Folder | Files |
| --- | --- | --- |
| Claude Code | `.claude/agents/` | `sw-planner.md`, `sw-implementer.md`, `sw-reviewer.md` |
| Codex | `.codex/agents/` | `sw-planner.toml`, `sw-implementer.toml`, `sw-reviewer.toml`; the agents are named `sw_planner`, `sw_implementer`, `sw_reviewer` inside |
| Copilot CLI and VS Code Copilot Chat | `.github/agents/` (both hosts read it) | `sw-planner.agent.md`, `sw-implementer.agent.md`, `sw-reviewer.agent.md` |

Every host knows a role only through its file, and the files come from `sync` (or a `model` command), once per project: nothing else writes them, the installer copies no agents, and `.claude/agents/` is git-ignored, so a fresh clone has none. Run `sync --tools claude`, `codex`, `copilot` or several, with or without a model choice, before the first sw-plan or sw-implement in a project. Without the files, Claude Code falls back to a general-purpose agent that reads the role file (the Claude Code row of sw-plan and sw-implement), and Codex and Copilot fall back to the main session following the role file.

When the user asks to set a model:

1. **See what is set**: `show`.
2. **Settle role, tool and model.** Ask only for what is missing. If they name a model without a tool, infer the tool from the model family and say which you chose. Use the model name exactly as that tool spells it; do not translate names between tools.
3. **Change only what differs.** If the role already runs that model, change nothing and say so. A tool's short name and the full name of its current version (`opus` and the newest Opus) are the same model: do not rewrite one into the other.
4. **Run the `model` command** and show its output.
5. **Say when it takes effect**: a tool picks up new agent files when its next session starts.

After Superwiki itself is updated, run `sync` once: the roles' instructions are part of the agent files.

Do not edit the generated agent files or `config.json` by hand; the next `sync` overwrites agent files.

## Areas

`areas` adds prefixes or renames them. It never removes one: tasks keep their ids forever.
