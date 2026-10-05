---
name: sw-summarize
description: Use when a Superwiki task's work is finished and it has to be closed with evidence, when the user asks what a task did, what it changed or how it was verified, or invokes sw-summarize or sw:summarize with a task id. sw-implement runs it as the gate before `done`.
---

# sw-summarize

Closes a task with a `## Summary` section in its task file: what was planned, what was built, what changed, and the evidence for each "Done when" item. `status: done` then means verified, and the task file says how.

One rule carries the skill: **no verdict without a command run in this session.** Name the command that proves the item, run it now, read its exit code and its output, then write the verdict. An earlier run, the implementer's report, a passing test you remember, or "should pass" is not evidence.

It runs in the session that invokes it: by hand as `sw-summarize <ID>`, or as a step of sw-implement. It is not handed to the implementer; the one who did the work does not also sign it off.

Run commands from the project root.

## Steps

1. **Read the task**: `docs/tasks/<ID>.md`. Number its "Done when" items in the order they are written; the verification list uses the same numbers. If the task has a plan, read only its `## Approach` and `## Verification`.
2. **Take the changes from git**, never from memory:
   - uncommitted work: `git status --porcelain`;
   - work already committed: `git log --name-status --format='%h %s' --grep='^<ID>:'`, the commits whose message starts with `<ID>:`;
   - the short HEAD for the source line: `git rev-parse --short HEAD`.

   List only the files that belong to this task. No git repository, or the vault is ignored by git: say so in the section instead of listing files from recollection.
3. **Pick one command per "Done when" item.**

   | Where the command comes from | When |
   | --- | --- |
   | the plan's `## Verification` | the task has a plan |
   | the commands the implementer reported | no plan, and a report is in this session |
   | you choose it | otherwise, or the listed command does not prove the item |

   A requirement about text (a document mentions something, a file exists, a format is described) is proven by `grep`, `test -f` or `lint`, not by having written the text. A requirement about behaviour (what a program, an endpoint or an agent following a prompt does) is proven by running the thing and observing it: run the program, call the endpoint, or dispatch a fresh agent on the scenario and read what it does. Finding the code or text that should cause the behaviour proves only that the text is there; without a run the item is `unverified`. A check needs the environment when it starts a service, needs a running stack or changes data. It runs only if the user allowed it: under sw-implement the answer is on that skill's list of such checks; when you summarize outside it, ask the user before you run one.
4. **Run every command now and read the result.** Exit code first, then the line that shows the item holds: the test count, the matching line, the `0 errors`.

   | What you have | Verdict |
   | --- | --- |
   | the command ran in this session, exited as expected, and its output shows the item | `verified` |
   | the command ran and shows the item does not hold | `failed` |
   | no command was run: a check that needs the environment and was not allowed, nothing that can prove it, or only someone's word | `unverified`, with the reason |
   | the command proves part of the item | `unverified`, saying which part is open |

5. **Write the section** in the format below. It is the last section of the file. If the file already has a `## Summary`, replace it whole; every verdict in the new one comes from this session. Leave the frontmatter and the other sections as they are.
6. **Log it**: append `## [date] summary | <ID> <verified> of <items> verified` to `docs/log.md`, in the layout its last entries use.
7. **Ask the gate**: `node docs/.sw/sw.mjs check <ID>`. It prints `summary:` with the counts, and `can finish: yes` only when every item is verified and no dependency is open.
8. **Close or hand back.**

   | Invoked | Do |
   | --- | --- |
   | from sw-implement | return to its next step; it records the outcome |
   | by hand, and every item is verified, `check` says `can finish: yes`, and the task's `review:` is empty | set `status: done` and `finished:` today, append `## [date] task \| <ID> done` to the log, run `node docs/.sw/sw.mjs board` |
   | by hand, and the task requires a review | write the summary only; the status stays. Say that sw-implement runs the review |
   | by hand, and an item is unverified or failed | the status stays. Say what each open item needs |

9. **Report**: show the user the summary itself, not only its counts. In this order: what was planned, what was built and each deviation, the files changed, the verdict for each item with its command, and whether the task can be closed. Say it in the language of the conversation; the section in the file stays as written.

## The section

```text
## Summary

Summarized <date>: <verified> of <items> verified.

### Plan
<the approach as planned, two to four lines>

### Implementation
<what was built; each deviation from the plan, or "No deviations.">

### Changes
- `path` (added | modified | deleted | renamed)

Source: `git status --porcelain` at <short HEAD>.

### Verification
1. **verified**: <"Done when" item 1>
   - command: `<command>`
   - result: <exit code and the line that shows it>
2. **unverified**: <item 2>
   - reason: <what it needs>
3. **failed**: <item 3>
   - command: `<command>`
   - result: <exit code and the line that shows the failure>
```

- The four parts are always there, in this order.
- A task that had no plan: the Plan part reads `No plan: implemented directly from the task.`
- "Verification" is a numbered list with one entry per "Done when" item, numbered as the items are. Each entry starts with the verdict in bold: `verified`, `unverified` or `failed`. `check`, `lint` and the viewer read exactly that; an item without an entry counts as unverified.
- Changes taken from commits: name the commits in the source line instead of `git status --porcelain`.
- Keep the plan and implementation parts short. The section is a record, not a retelling of the log.

## Common mistakes

- Writing `verified` from the implementer's report. The report says where to look; the command you run says whether it is true.
- One `npm test` as the evidence for every item. Each item gets the command that shows that item; a suite proves only what its tests cover.
- "The file was written, so the item is met." Run the `grep` or `test -f`.
- Closing a behavioural item with `grep`. The line exists; whether anything follows it is what the item asks.
- Listing changed files from what you remember of the session. Git knows; ask it.
- Softening a `failed` or `unverified` into `verified` with a note. A note does not open the gate; the verdict does.
- Running a check that needs the environment and was not allowed, because the summary would otherwise stay incomplete. It stays incomplete, and the task stays open.
- Setting `done` by hand on a task that requires a review.
- Keeping parts of an old summary. Evidence from another session is not fresh.
