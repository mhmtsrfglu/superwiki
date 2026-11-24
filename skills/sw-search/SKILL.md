---
name: sw-search
description: Use when the user asks the Superwiki vault a question in plain words, such as what the wiki says about something, whether anything is recorded on a topic, or what was decided and where it is written down, or invokes sw-search. Not for a reported bug or failure (sw-triage) or a question about one task (sw-explain).
---

# sw-search

Answers a question from the vault, every claim with its reference and the day it was written for. A page says what was true or chosen on that day; where the question is about today, the answer says how far the page can still be trusted. Changes no file.

Run commands from the project root.

## Steps

1. Turn the question into two to five content words and any ids it names, in the language the vault is written in, and run `node docs/.sw/sw.mjs search <terms>`. It lists the pages, raw sources and log entries that mention the words, best match first, each with its kind and its day, `[concept 2026-10-02]`, the matching line and the heading it sits under; a page another has replaced names that page, `[decision 2026-09-01, superseded by <page>]`. No page: run it once more with synonyms or fewer terms. The vault is the only record of earlier sessions this skill can read; on Copilot the user can run `/chronicle search <words>` (Copilot CLI) or `/chronicle:search <words>` (VS Code Copilot Chat), which searches Copilot's own session store, to find an earlier session of the project and resume it. Name it when the vault has no record of the topic, and say that the skill cannot run it.
2. Read the catalog lines of `docs/index.md` that mention the terms. A page the catalog describes as the topic belongs in the answer even when the search ranked it low.
3. Open at most four hits, in this order: lessons and decisions, other wiki pages, tasks and plans, and of a raw source only the section the heading names. Log entries are used as the search printed them, not opened. Of a page marked `superseded`, open the page that replaced it instead, unless the question is about what was decided earlier.
4. **Sort the question.** It asks one of two things, and a page answers them differently:
   - **what is recorded**: what was decided and why, what a source said, what a task did, what happened. The page is the answer;
   - **what is the case today**: how the product behaves, what the code does, whether a decision still applies. The page is the answer as of its day, and the code and the data are the answer for today.
5. **Answer in the user's language.** Each claim carries its reference and its day:
   - a wiki page, task or plan: `[[page]] (2026-10-02)`, `[[T-12]] (done 2026-10-12)`, `[[T-12-plan]]`. The day is the one the search printed: a page's `updated:`, a decision's `date:`, a task's `finished:`. A page the search prints without a day takes the day of its file's last commit, `git log -1 --format=%as -- <the page's path>`; outside git, the answer says the page carries no date;
   - a raw source: `[title](docs/raw/<file>)`, naming the section;
   - a log entry: `log <date> <kind> | <title>`.

   A claim from a `superseded` page is given as the past, with the page that replaced it and what that page says now. A claim no page supports is said to be not recorded in the vault. No hit at all: say so and name the pages nearest the question.

   **What is recorded** is answered from the pages alone. Nothing is taken from the code or from memory; looking in the code is offered as a separate step.

   **What is the case today** is not answered from a page's word alone. For each page the answer rests on:
   - The page names code, by path, and the project is under git: `git log --oneline --since=<the page's day> -- <those paths>`, one command for all of them. No commit: give the claim with its day and say that the code it names has not changed since. Commits: the page may be out of date, so check the claim in the code, at the paths the page names and nowhere else; locate, then open the range. Answer from the code and name the path; where the page says otherwise, say that the page is out of date and since when.
   - The page names no code, or there is no git history: give the claim with its day, say that it is what the page recorded then and that it was not checked against the code, and offer the check.
   - A decision: give it with its day and its reason. Whether it still applies is a check of the facts under its "Holds while" against today's code and data. Asked whether it still applies, make that check, each fact by a command or one range of a file, and say what showed it; otherwise say that the decision is as of its day and offer the check. Never say that a decision still holds, or that it is wrong, without what showed it.

The answer is given in chat and nothing is written to the vault: no page, no log entry, no offer to save the answer. A page found out of date is named in the answer; correcting it is the user's to ask for.

## Common mistakes

- Answering what the product does today from a page, without its day. The page was true when it was written; the answer says when that was, and what the code says now where the code has moved.
- Reading code for a question about what is recorded, or beyond the paths a page names. The first is answered from the vault; the second is a survey nobody asked for.
- Giving a superseded decision as the decision. The search marks it; the page that replaced it is the current one.
