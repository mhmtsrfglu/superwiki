---
name: usage
description: Use when the user asks what the current agent session has cost or used (tokens, context size, steps, tool calls, time, per subagent), wants a session summary or statistics, or invokes sw:usage.
---

# sw:usage

Shows what this session has cost so far: one row for the main session and one for each subagent it started. A script reads the record your tool keeps of the session; you read nothing yourself and write no file.

Run from the project root:

```bash
node docs/.sw/sw.mjs usage
```

It reports the session it runs in. For another session of this project, add `--session <id or its first characters>`; to look only at one tool's sessions, `--tool claude|codex|copilot`.

## Answer

1. **Show the table as printed**, in a code block. Do not round, reorder or translate it.
2. **Add at most three observations**, in the user's language, each one a number from the table and what it means. Pick the ones that apply:

   | In the table | Say |
   | --- | --- |
   | one agent's `sent` is most of the total | which agent, and its share. That is where the session's cost is |
   | an agent's `peak` is several times its `first` | its context grew during the work; `steps` times a large context is what makes `sent` large |
   | `first` is large, for `main` or for the subagents | every agent starts heavy before it reads anything: rules, memory, and the lists of skills and tools. sw:doctor shows what fills it and what can go |
   | `cached` is well below the others for one agent | much of what it sent was not served from the cache, which costs more per token. Long pauses do that |
   | `main` has many `steps` or a `peak` far above its `first` | work is running in the main session that a subagent could do in a clean context |

3. Nothing else: no advice the table does not support, and no price. The table counts tokens; what a token costs depends on the user's plan.

## Columns

So that you can answer a question about them:

- `steps`: model requests. `tools`: tool calls. `min`: minutes between the agent's first and last record.
- `first`, `peak`: tokens sent with the first request and with the largest one.
- `sent`: tokens sent, summed over every step. A step sends the whole context again, so this is far larger than `peak`.
- `cached`: the share of `sent` that was read from the cache.
- `output`: tokens the model wrote.
- `-`: the tool's record does not hold that number.

## If it fails

| Output | Do |
| --- | --- |
| `unknown command usage` | the project's `docs/.sw/sw.mjs` is older than this skill; offer to run sw:init, which updates it |
| `no agent session record found` | say so, and name the tool's own command instead: `/cost` or `/context` (Claude Code), `/status` (Codex), `/usage` (Copilot CLI). A session started in a subfolder of the project is recorded under that folder and is not found |
| a note that Copilot has not written token counts yet | pass the note on; steps and tool calls are still valid |
