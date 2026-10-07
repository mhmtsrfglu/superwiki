---
name: triage
description: Use when the user reports a bug, failure, error, regression, incident or unexpected behavior in a Superwiki project and wants to know whether it happened before, what was learned, or what the likely causes are, or invokes sw:triage.
---

# sw:triage

Answers "have we seen this before, and what does the vault say about it?" before anyone starts debugging. It searches the vault with a script, reads only the best matches, and reports. It does not fix anything and does not change files unless the user accepts an offer at the end.

Run commands from the project root.

## Steps

1. **State the problem in one line**: the symptom, where it shows, since when. If the user gave no symptom, ask for it. If "since when" is missing, go on and say in the report that recent changes cannot be matched to the problem's start.
2. **Search the vault**, two or three times with different words: the error text or code, the component or feature name, the symptom in plain words. Search in the language the vault is written in (look at the lines of `docs/index.md`), whatever language the user wrote in; translate their words.

   ```bash
   node docs/.sw/sw.mjs search <three to six distinctive words>
   ```

   Each result has the page's type and summary and the first matching line; matching log entries follow, with their first line. A page is listed when any word matches, best match first, so the tail of the list is often noise.
3. **Look at what changed recently**: `tail -40 docs/log.md` and `node docs/.sw/sw.mjs ready` (the "in progress" part). Work finished or under way in the same area just before the problem appeared is a suspect.
4. **Read at most four files**, plans included, in this order of preference: `lesson` pages, `decision` pages, tasks that touched the same area (done or in progress), then the rest. Read a task's plan only if steps 2 and 3 point at that task as the cause.
5. **Report in the user's language**, under these headings. Give the source of each claim: a page as `[[page]]`, a log entry as "log, <date>".
   - **Seen before**: earlier occurrences, what the cause was, how it was fixed. If no page records this problem, say plainly that the vault has no record of it; do not stretch a weak match. If a recorded fix exists and the problem is back, say so: it is a regression.
   - **Lessons that apply**: rules or warnings from lesson and decision pages that bear on this problem.
   - **Likely causes**: ranked, each with the evidence for it and one concrete check that would confirm or rule it out. Where the vault records no cause, these are hypotheses drawn from what the pages say about the area: label them as hypotheses.
   - **Recent changes in the area**: tasks and log entries from step 3.
   - **Gaps**: what the vault does not cover and would have helped.
6. **Offer, and act only on a yes to that offer**:
   - a task for the fix. Say which area you would file it under and let the user correct it; then the id comes from `node docs/.sw/sw.mjs next-id <AREA>`, the file from `docs/.sw/templates/task.md`, with the related pages under "Sources" and the confirming check as the first "Done when" item;
   - running the top check now, if it is one you can run from this session (a command, a test, reading code). Otherwise say who can run it and what to look for.

## After the problem is solved

When the cause is known and fixed (in this session or a later one), offer to save a lesson: `docs/wiki/<slug>.md` with `type: lesson`, a one-line `summary:` that names the symptom, and the sections **Symptom**, **Cause**, **Fix**, **How to notice it earlier**; linked from the task that fixed it and listed in `index.md`. This page is what the next triage finds.

## Common mistakes

- Reading code or reproducing the bug before searching. Triage is the lookup; debugging comes after, with the report in hand.
- Opening every search result. Summaries and matching lines decide which four are worth reading.
- Presenting a guess as history. "Seen before" is only for what a page actually records.
