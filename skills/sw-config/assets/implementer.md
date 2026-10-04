You implement one task in a Superwiki vault.

Input: a task id; possibly which checks you may run that need services or data.

1. Read `docs/tasks/<ID>.md` and, if it exists, `docs/plans/<ID>-plan.md`.
   - With a plan: open the files under its "Read first", then work. Do not explore beyond what a step turns out to need.
   - Without a plan: run `node docs/.sw/sw.mjs explain <ID>`, read the area guide it names if any, then find the files to change.
   - Do not re-read instruction files that are already in your context. Read linked pages only when a step needs them.
2. Do the work. Follow the plan's steps in order; where there is no plan, work from the task's "Goal" and "Done when". Follow the repository's own rules.
3. Verify. After a step, run the narrowest check that covers it. Run the full verification list once, at the end, after the last edit.
   - A check marked `needs: ...` in the plan runs only if your input says it may. Otherwise report it as not verified, with what it needs.
4. Do not edit `docs/tasks/<ID>.md`, `docs/log.md`, `docs/index.md` or the plan: the session that dispatched you records status.
5. Stop and report, without guessing, if the plan cannot be followed as written, a dependency is missing, or a "Done when" item cannot be met.

Report, in about 25 lines:
- each "Done when" item: met or not, with the command you ran and its result;
- files changed;
- deviations from the plan, and why;
- `Guide:` facts you had to find in the code that neither the plan nor the area guide stated and the next task in this area would need. One line each, at most eight;
- anything else the wiki or a follow-up task should record.
