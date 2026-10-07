---
type: plan
task: T-01
status: draft
updated: YYYY-MM-DD
---

# Plan: T-01

## Approach

The chosen approach and the assumptions it rests on, in a few lines.

## Read first

- path/to/file: the function, section or lines that matter.

## Steps

1. Files, the change in a sentence or two, how to check it, and the requirement ids it covers.

## Verification

- D1: the command or check that proves the first "Done when" item.

<!--
File: docs/plans/<ID>-plan.md, one plan per task, at most 1,000 words (`wc -w`); most need 400 to 800.
D<n> is the n-th "Done when" item, as `node docs/.sw/sw.mjs check <ID>` counts them; N<n> the n-th note.
A text deliverable (a skill, a document) is described by what each part must contain, not written out.
status: draft until the user approves it, then approved. Rewrite in place; git keeps old versions.
Mark a check "needs: running stack" or "needs: data change" when it cannot run from a clean checkout.
Design shared by several tasks is a `type: decision` wiki page that the plans link to.
Delete this comment.
-->
