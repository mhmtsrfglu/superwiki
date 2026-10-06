# Eval results

One row per run of an eval, newest last. [README.md](README.md) says how to run each eval and how to fill a row.

Every row up to and including the T-03 rows was measured on the Turkish originals of the inputs, in appendices A and B of [the audit source](../docs/raw/2026-10-05-prompt-quality-audit.md). The inputs in this folder are English translations, so the first run on the English set is a new baseline, not directly comparable with these rows.

## Routing

The result is the scorer's `agreement` and `expectations` lines; the places are the messages under `differs` and the messages marked unsure.

| date | commit | condition or brief | repetitions or readers | result | places | notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-05 | `23c12e3` | sw skills only | 3 | agreement 36 of 36; expectations 35 of 35 | differs: none; unsure in every repetition: 23, 33; in one: 22, 31 | audit baseline, Turkish originals; the audit gives the unsure marks for both conditions together |
| 2026-10-05 | `23c12e3` | with obra/superpowers v6.4.2 | 3 | agreement 36 of 36; expectations 34 of 35 | differs: 32 (`superpowers:test-driven-development` in 3 of 3); 33 went to `superpowers:requesting-code-review` (no expectation); unsure as above | audit baseline, Turkish originals; every message aimed at an sw skill reached it in every repetition |
| 2026-10-05 | `6fb4012` | after T-03 | not run | - | - | T-03 changed no description |
| 2026-10-06 | T-10 and T-11 in progress, on `a423db4` | sw skills only | 3 | agreement 35 of 36; expectations 35 of 35 | differs: none; unsure in every repetition: 23, 33; in two: 22; in one: 27 | Sonnet 5.5 readers; message 33 split between `sw-summarize` and `none` |
| 2026-10-06 | T-10 and T-11 in progress, on `a423db4` | with the competing skill set of the audit row, installed v6.4.1 | 3 | agreement 36 of 36; expectations 35 of 35 | differs: none; unsure in every repetition: 23, 33; in two: 32; in one: 13, 28 | message 32 now `none` in 3 of 3 (was the competing TDD skill in the audit row), with two unsure marks; 33 to `sw-summarize` in 3 of 3 |

## Dry-run

The result is each reader's total number of findings; the places are the findings of the brief's `## Places to check` where a reader still reported a `guess`, `conflict` or `uncovered` finding.

| date | commit | condition or brief | repetitions or readers | result | places | notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-05 | `23c12e3` | chain | 1 | 11 | F1 to F11 | audit baseline, Turkish originals, brief without scenario 3 |
| 2026-10-05 | `23c12e3` | run | 1 | 14 | F2 and F8 to F21, as far as the run reached them | audit baseline, Turkish originals |
| 2026-10-05 | T-03 in progress, on `23c12e3` | chain, as written in the audit | 4 | 14, 12, 11, 16 | F4 a `guess` in all four | the implementer's runs during T-03 |
| 2026-10-05 | `6fb4012` | chain, as written in the audit | 2 | 13, 11 | F2, F5, F8, F9, F10, F20 clean in both; F4 a `guess` in one of two | T-03's final text |
| 2026-10-05 | `6fb4012` | chain, scenario 1 with the reason stated | 1 | 11 | F2, F4, F5, F8, F9, F10, F20 clean | T-03's final text; the wording now in `dry-run/chain.md`, without scenario 3 |
| 2026-10-05 | T-05 in progress, on `417e8aa` | run | 2 | 2, 2 | F2, F8 to F21 clean in both | first runs on the English inputs; T-05's text after six rounds of fixes. Earlier rounds on T-05's drafts: 11, 11, 8, 9 (F11, F13, F14, F16, F17 open), then 5, 5; 4, 4; 4, 5; 4, 5; 6, 8 (F12, F13, F16, F17, F19, F21 in turn). Open in the final round, at new places: the "few files" condition of the small route (F1, T-06) and the AGENTS.md rule on area guides, read by the implementer |
| 2026-10-05 | T-05 in progress, on `417e8aa` | chain | 2 | 6, 6 | F6, F7 clean in both; F2 a `conflict` in one of two (sw-do's "one planned stop" against sw-implement step 6's question on a check) | first runs on the English inputs. Round 1 on T-05's drafts: 6, 7, 11, 10 with F7 open (area of a split task, answers not carried over, renumbering after a split); this row is round 3. Run before the last changes to the fix round in `implementer.md` and to sw-summarize's `unverified` row, which do not touch F6 or F7 |
| 2026-10-06 | T-10 in progress, on `a423db4` | chain | 6, in three rounds of two | 10, 6; 10, 9; 11, 9 | rounds 1 and 2: a `guess` (`wrong result`) at the new guard-run text of sw-summarize step 4 in both readers; round 3: none at the new text. F3 (requirements beyond "Done when") and F4 (an item built differently by preference) open in every reader, as before T-10 | T-10's text after each of two fix rounds; Sonnet 5.5 readers |
| 2026-10-06 | T-11 in progress, on `a423db4` | chain | 2 | 11, 13 | no finding at T-11's waiver text in sw-do step 3 and 4 or sw-implement step 4; F2 clean in both; F3, F4 open as before | T-10's and T-11's texts together; Sonnet 5.5 readers |
| 2026-10-06 | T-12 and T-13 in progress, on `a423db4` | chain | 8, in four rounds of two | 10, 12; 9, 12; 12, 9; 11, 12 | T-12's `Marks:` text: a `guess` (`wrong result`) in round 1 at the numbering bases and at a round without the line; clean in rounds 2 to 4. T-13's `preferred` mark (F4): a `guess` in round 1, a `guess` and a `conflict` in round 2, a `conflict` (the mark read as a second option beside "build as worded") in round 3, a `guess` at the "if you can still rebuild" clause in both readers of round 4. F2 clean in every reader. Open as before: F3, the dev-server item's command, the split task's Goal and file, "run the full verification list" without a plan | after each fix round of T-12 (one) and T-13 (three); scenario 1's cause changed to "contradicts a project rule" before round 3; Sonnet 5.5 readers |
