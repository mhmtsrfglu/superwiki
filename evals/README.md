# Evals

Two measurements of how the skills behave, kept so they can be repeated after any change to a description or a skill text, with the same inputs and a recorded result. Both come from the prompt quality audit of 2026-10-05 ([source](../docs/raw/2026-10-05-prompt-quality-audit.md), appendices A and B). The tests in `test/` cover the scripts; these cover the texts.

| Eval | Question | Files |
| --- | --- | --- |
| Routing | Which skill does an agent pick first for a user's message? | `routing/messages.md`, `routing/routing.mjs` |
| Dry-run | Where does a fresh reader of the skill texts have to guess? | `dry-run/chain.md`, `dry-run/run.md` |

Results go in [results.md](results.md). This folder is not part of the npm package.

The inputs are English translations of the audit's originals, which were mostly Turkish: the 36 routing messages and the run brief's user message. The audit's numbers and the numbers recorded after T-03 were measured on the Turkish originals, so they are a reference, not a baseline for the English set. The first run on the English set is its baseline.

## Routing

What it measures: whether the skill descriptions and the Superwiki block of `AGENTS.md` settle which skill an agent invokes first, for 36 typical first messages, and whether that choice holds when a competing skill set is installed. Each message has an expectation in `routing/messages.md`. The skills are listed as a Claude Code plugin install shows them to the model, `sw:<name>`, with the plugin name taken from `.claude-plugin/plugin.json`.

What it does not measure: whether the skill fires in a live session. The answer is an agent's own statement about what it would do, on one model, with the descriptions laid out in a file; a harness that loads skills differently, or another model, can pick differently. It says nothing about what happens after the skill is chosen.

### Run it

`routing.mjs` never calls a model. It builds the probe before the agents run and scores their answers after.

1. Build the probe from the current state of the repository, into a scratch directory outside the repository:

   ```sh
   node evals/routing/routing.mjs probe > <scratch>/probe.md
   ```

2. Dispatch one fresh agent per repetition, each with this prompt and nothing else, and save each reply as its own file (`<scratch>/a1.txt`, `a2.txt`, `a3.txt`):

   ```text
   Read <scratch>/probe.md and follow its instruction.
   ```

   A fresh agent means a new session or a subagent that has not seen this conversation, the probe or another agent's answers.
3. Score the answer files:

   ```sh
   node evals/routing/routing.mjs score <scratch>/a1.txt <scratch>/a2.txt <scratch>/a3.txt
   ```

   It exits 0 when every pick of a message with an expectation equals it, 1 when a pick differs or an answer file lacks a message, and 2 on an input error (an unreadable file, a duplicate answer, an unknown message number, no answer line).
4. Run the whole again with the competing skill set: `probe --with <scratch>/other.txt`, three fresh agents, `score`.

Run both conditions: without `--with`, and with it.

### A competing skill set

`--with <file>` appends the file verbatim under its own heading. The repository ships none; assemble one from a skill set the users of Superwiki are likely to have installed next to it, at a recorded version:

- one line per skill, `- <plugin>:<name>: <description>`, the name as the harness shows it to the model and the description copied from the skill's frontmatter;
- after the list, the text that skill set injects at session start (a hook's output, a bootstrap skill), copied whole.

Note the skill set and its version in the results row. The audit used obra/superpowers v6.4.2: 15 descriptions and its session-start text.

### Repetitions

Three fresh agents per condition, at least. Three is the floor: a single run is the weakest method, and agreement between repetitions is part of the result.

### Read the result

- `differs` lists every pick that missed its expectation, with how many repetitions made it. A message missed in one repetition of three is a description that does not settle the choice, not noise.
- `agreement` counts the messages where every repetition gave the same pick. A disagreement is a signal even when the expectation matched, because the next run may fall the other way.
- The `unsure` column counts repetitions that marked the message `unsure`. An unsure mark is a signal even when the pick matches: the descriptions did not settle it.
- Compare messages, not only the summary lines: which messages moved since the last row in `results.md`, and to which skill.

## Dry-run

What it measures: the places where a fresh reader, following the skill texts alone through a concrete scenario, has to guess, finds two texts that disagree, or reaches a case no text covers. `dry-run/chain.md` follows one task through `sw:plan-implement` and the planner, implementer and reviewer roles; `dry-run/run.md` follows an unattended `sw:autopilot` over three tasks.

What it does not measure: what an agent actually does. It is a simulation; nothing is built, and the consequence a reader gives a finding (`wrong result`, `wasted work`, `cosmetic`) is what could happen, not what was observed. A clean dry-run does not show that the workflow works end to end.

### Run it

Dispatch one fresh agent per brief in the root of the repository, with the fenced block under `## Prompt` copied whole as its prompt. Do not send the `## Places to check` table: the reader must not know where to look. Save each report outside the repository.

### Repetitions

At least two readers per brief. The total number of findings varies by reader: on nearly the same text it ran from 11 to 16, while the findings at the places a change was about were stable.

### Read the result

Compare places, not totals. For each finding id in the brief's `## Places to check`, note whether a reader reported a `guess`, `conflict` or `uncovered` finding there. A place is clean when no reader did. A finding at a new place is worth reading, and becomes a place to check when a task takes it on; it does not count against the places already listed. A count that rose or fell says little on its own.

## Record a result

Add a row to the table of the eval in `results.md`: the date, the short commit (`git rev-parse --short HEAD`), the condition or brief, the number of repetitions or readers, the result, the places, and notes. For routing, the result is the scorer's `agreement` and `expectations` lines, and the places are the messages under `differs` and those marked unsure. For a dry-run, the result is each reader's total, and the places are the listed findings that were not clean.

Answer files and reports stay out of the repository. The row is the record; if a run is worth keeping in full, file the reports as a source under `docs/raw/`.
