---
type: plan
task: M-02
---

# Plan: recipe detail screen

Task: [[M-02]]. Data shape: [[recipe-data-model]].

## Steps
1. Fetch the current version of a recipe and cache it in memory.
2. Lay out the header: photo, title, yield, total time.
3. Ingredient list with a serving stepper (display only until [[B-05]] exists).
4. Step list; steps with `timer_seconds` show a timer chip that cook mode ([[M-03]]) will use later.
5. Swap placeholder photos for the resizing proxy once [[B-03]] is done.

## Checks
- [ ] Opens in under one second on the reference phone
- [ ] Text passes the arm's-length test from [[home-cook-persona]]
- [ ] Works with a recipe that has no photo

## Risks
Long ingredient names wrap badly at large text sizes. Test with the system font size at maximum.
