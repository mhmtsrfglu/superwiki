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

## Dry-run

The result is each reader's total number of findings; the places are the findings of the brief's `## Places to check` where a reader still reported a `guess`, `conflict` or `uncovered` finding.

| date | commit | condition or brief | repetitions or readers | result | places | notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-05 | `23c12e3` | chain | 1 | 11 | F1 to F11 | audit baseline, Turkish originals, brief without scenario 3 |
| 2026-10-05 | `23c12e3` | run | 1 | 14 | F2 and F8 to F21, as far as the run reached them | audit baseline, Turkish originals |
| 2026-10-05 | T-03 in progress, on `23c12e3` | chain, as written in the audit | 4 | 14, 12, 11, 16 | F4 a `guess` in all four | the implementer's runs during T-03 |
| 2026-10-05 | `6fb4012` | chain, as written in the audit | 2 | 13, 11 | F2, F5, F8, F9, F10, F20 clean in both; F4 a `guess` in one of two | T-03's final text |
| 2026-10-05 | `6fb4012` | chain, scenario 1 with the reason stated | 1 | 11 | F2, F4, F5, F8, F9, F10, F20 clean | T-03's final text; the wording now in `dry-run/chain.md`, without scenario 3 |
