---
type: decision
summary: One line; this is what index.md shows.
date: YYYY-MM-DD
status: active
supersedes:
superseded_by:
sources: []
---

# Decision: title

## Context

What made a choice necessary, as things stood on the date above.

## Decision

What was chosen, and why, in a few sentences.

## Holds while

- One line per fact the choice rests on, worded so that it can be checked against the code, the data or a number: `package.json` lists no dependencies; the corpus is under 200,000 recipes.

## Alternatives rejected

- The alternative, and why it lost.

## Consequences

- What follows from the choice: for the code, for other tasks.

<!--
A decision page records a choice made on one day, for a reason. It is history, not a rule: whoever
relies on it later checks the "Holds while" lines against the code and the data of that later day,
and when a line no longer holds, the decision is open again: the user decides whether it changes.
File name: YYYY-MM-DD-topic.md. `date` is the day it was decided and never changes.
`status`: active or superseded. A decision that changes is not edited: a new page replaces it. The
new page names the old one in `supersedes:`, and in the same change the old page gets
`status: superseded` and `superseded_by: <the new page>`. Otherwise both fields stay empty.
`node docs/.sw/sw.mjs lint` warns while the old page is unmarked; `search` shows the mark.
Delete this comment.
-->
