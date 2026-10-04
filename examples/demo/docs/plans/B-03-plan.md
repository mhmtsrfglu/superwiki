---
type: plan
task: B-03
---

# Plan: photo upload pipeline

Task: [[B-03]]. Decision: [[image-storage]].

## Steps
1. Endpoint that returns a signed upload URL for a recipe the caller owns.
2. Client uploads the original and reports the object key back.
3. Resizing proxy: `/img/<key>?w=<width>`, widths limited to a fixed list.
4. Edge cache with a one-year lifetime; the key changes when the photo changes.

## Checks
- [x] Signed URL upload works from the mobile app
- [ ] Proxy returns correct cache headers for every width
- [ ] Oversized files are rejected before upload

## Unblocks
[[W-02]] and [[B-05]] wait on this; [[M-02]] can start but cannot finish without it.
