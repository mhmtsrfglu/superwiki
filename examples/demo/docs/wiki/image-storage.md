---
type: decision
summary: Recipe photos live in object storage behind a resizing proxy.
date: 2026-09-01
status: accepted
---

# Decision: image storage

## Context
Every recipe has at least one photo, and the same photo is shown at four sizes (list, detail, share
card, full screen). Storing each size up front multiplies storage and makes new sizes a migration.

## Decision
Originals go to object storage, uploaded directly from the client with a signed URL. A resizing proxy
serves any size on demand and caches the result at the edge.

## Consequences
- Uploads do not pass through the API servers ([[B-03]]).
- Share cards can ask for exactly the size a platform wants ([[W-02]]).
- The offline cache stores the proxied size, not the original ([[offline-sync]]).

Background reading: [object storage on Wikipedia](https://en.wikipedia.org/wiki/Object_storage).
