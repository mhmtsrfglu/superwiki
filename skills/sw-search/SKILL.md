---
name: sw-search
description: Use when the user asks the Superwiki vault a question in plain words, such as what the wiki says about something, whether anything is recorded on a topic, or what was decided and where it is written down, or invokes sw-search. Not for a reported bug or failure (sw-triage) or a question about one task (sw-explain).
---

# sw-search

Answers a question from the vault, every claim with its reference. Changes no file.

Run commands from the project root.

## Steps

1. Turn the question into two to five content words and any ids it names, in the language the vault is written in, and run `node docs/.sw/sw.mjs search <terms>`. It lists the pages, raw sources and log entries that mention the words, best match first, each with the matching line and the heading it sits under. No page: run it once more with synonyms or fewer terms. The vault is the only record of earlier sessions this skill can read; on Copilot the user can run `/chronicle search <words>` (Copilot CLI) or `/chronicle:search <words>` (VS Code Copilot Chat), which searches Copilot's own session store, to find an earlier session of the project and resume it. Name it when the vault has no record of the topic, and say that the skill cannot run it.
2. Read the catalog lines of `docs/index.md` that mention the terms. A page the catalog describes as the topic belongs in the answer even when the search ranked it low.
3. Open at most four hits, in this order: lessons and decisions, other wiki pages, tasks and plans, and of a raw source only the section the heading names. Log entries are used as the search printed them, not opened.
4. **Answer in the user's language.** Each claim carries its reference:
   - a wiki page, task or plan: `[[page]]`, `[[T-12]]`, `[[T-12-plan]]`;
   - a raw source: `[title](docs/raw/<file>)`, naming the section;
   - a log entry: `log <date> <kind> | <title>`.

   A claim no page supports is said to be not recorded in the vault. It is not taken from the code or from memory; looking in the code is offered as a separate step. No hit at all: say so and name the pages nearest the question.

The answer is given in chat and nothing is written to the vault: no page, no log entry, no offer to save the answer.
