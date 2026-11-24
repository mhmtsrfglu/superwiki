---
type: decision
summary: The project takes no npm dependency; what it needs, the CSV export included, is written by hand on Node's standard library.
date: 2026-09-20
status: active
supersedes:
superseded_by:
sources: []
---

# Decision: no npm dependencies

## Context

The project is a small item list whose tests run with `npm test` on a fresh checkout. [[T-02]] adds a CSV export, the first feature for which a package from npm was on the table: a CSV writer would handle the quoting of a comma or a double quote. Every dependency is one more install before the tests can run and one more release to follow.

## Decision

The project takes no npm dependency. What it needs is written by hand on Node's standard library, the CSV export of [[T-02]] included: one column, a header line, and a value double-quoted when it holds a comma or a double quote. A fresh checkout runs its tests with nothing installed.

## Holds while

- `package.json` lists no `dependencies`.
- `npm test` runs with nothing installed: its script is `node --test`.

## Alternatives rejected

- A CSV package from npm for the export, such as `csv-stringify`: it quotes correctly out of the box, but for one column it saves a dozen lines and makes the project's first dependency, an install before every test run.

## Consequences

- The quoting rules of the export are the project's own code, and its own tests prove them.
- A feature that would need a package goes back to this page first: the two facts above say whether the choice still stands.
