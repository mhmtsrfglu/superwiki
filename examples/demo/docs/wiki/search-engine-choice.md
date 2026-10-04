---
type: decision
summary: Recipe search runs on the primary database's full-text index for now.
date: 2026-09-15
status: accepted
---

# Decision: search engine

## Context
[[competitor-comparison]] shows that search by ingredient ("what can I make with leeks") is the
feature people praise most and that none of the three apps does it well.

## Decision
Use the primary database's built-in full-text index, with one index over titles and one over
ingredient names. Do not run a separate search service until the corpus passes 200,000 recipes.

## Consequences
- One fewer system to operate for the first release.
- Ranking is basic; typo tolerance is limited.
- Ingredient search quality depends on the normalised units and names from [[B-05]].

Implemented in [[B-04]].
