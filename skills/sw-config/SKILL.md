---
name: sw-config
description: Use when the user wants to choose or change which model plans or implements Superwiki tasks (opus, sonnet, gpt and so on), add task areas, see the Superwiki configuration, or invokes sw-config or sw:config.
---

# sw-config

Settings live in `docs/.sw/config.json`. Change them with the script, from the project root; it also writes the agent files that make a model choice take effect. `<skill-dir>` is this skill's directory.

```bash
node <skill-dir>/scripts/config.mjs show
node <skill-dir>/scripts/config.mjs model plan claude opus
node <skill-dir>/scripts/config.mjs model implement codex gpt-6
node <skill-dir>/scripts/config.mjs model plan copilot --unset
node <skill-dir>/scripts/config.mjs areas "M=Mobile,B=Backend"
node <skill-dir>/scripts/config.mjs sync --tools claude,codex,copilot
```

## Models

A model is chosen per role (`plan`, `implement`) and per tool (`claude`, `codex`, `copilot`), because each tool can only run its own models. No tool lets a skill change the model of the running session, so sw-plan and sw-implement hand the work to a subagent, and the subagent's file carries the model.

| Tool | File the script writes | Read-only planner by |
|---|---|---|
| Claude Code | `.claude/agents/sw-planner.md`, `sw-implementer.md` | `tools:` list |
| Codex | `.codex/agents/sw-planner.toml`, `sw-implementer.toml` | `sandbox_mode` |
| Copilot CLI | `.github/agents/sw-planner.agent.md`, `sw-implementer.agent.md` | `tools:` list |

When the user asks to set a model:

1. Ask only for what is missing: role, tool, model. If they name a model without a tool, infer the tool from the model family and say which you chose. Use the model name exactly as that tool spells it; do not translate names between tools.
2. Run the `model` command. Show its output.
3. Say that a tool picks up new agent files when its next session starts.

Do not edit the generated agent files or `config.json` by hand; the next `sync` overwrites agent files.

## Areas

`areas` adds prefixes or renames them. It never removes one: tasks keep their ids forever.
