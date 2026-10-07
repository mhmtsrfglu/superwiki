# Evals

Three measurements of how the skills behave, kept so they can be repeated after any change to a description, a skill text or a role file, with the same inputs and a recorded result. All three come from the prompt quality audit of 2026-10-05 ([source](../docs/raw/2026-10-05-prompt-quality-audit.md), appendices A and B and section 5). The tests in `test/` cover the scripts; these cover the texts.

| Eval | Question | Files |
| --- | --- | --- |
| Routing | Which skill does an agent pick first for a user's message? | `routing/messages.md`, `routing/routing.mjs` |
| Dry-run | Where does a fresh reader of the skill texts have to guess? | `dry-run/chain.md`, `dry-run/run.md` |
| End-to-end | What does an agent do on the exception paths, on a real project? | `e2e/scenarios/*.md`, `e2e/fixture/`, `e2e/overlays/`, `e2e/e2e.mjs` |

Results go in [results.md](results.md). This folder is not part of the npm package.

The inputs are English translations of the audit's originals, which were mostly Turkish: the 36 routing messages and the run brief's user message. The audit's numbers and the numbers recorded after T-03 were measured on the Turkish originals, so they are a reference, not a baseline for the English set. The first run on the English set is its baseline.

## Routing

What it measures: whether the skill descriptions and the Superwiki block of `AGENTS.md` settle which skill an agent invokes first, for 38 typical first messages, and whether that choice holds when a competing skill set is installed. Each message has an expectation in `routing/messages.md`. The skills are listed as a Claude Code plugin install shows them to the model, `sw:<name>`, with the plugin name taken from `.claude-plugin/plugin.json`.

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

## End-to-end

What it measures: what an agent in a role does on the exception paths the role files describe, on a small project with a vault, with the result judged by commands rather than by reading. Each scenario in `e2e/scenarios/` plants one situation in a clean copy of the fixture, hands one task to one role, and lists its pass conditions as a table: a search of the agent's report, the vault's own `sw.mjs check` and `lint`, and whether the copy's files changed. The four scenarios:

| Scenario | Role | Situation | Passes when the report |
| --- | --- | --- | --- |
| `planted-defect` | reviewer | `src/paginate.mjs` drops the last page when the total divides evenly by the page size; the test only tries a total that does not | says `changes needed`, names a blocking finding at `src/paginate.mjs` and its cause; no file changed |
| `second-review` | reviewer | the same defect, after a fix round that only added a test; the first review's finding comes as `Recheck:` | marks the finding `still open`, not `resolved`; no file changed |
| `differs-item` | implementer | T-02's first item asks for a CommonJS file in a project whose `AGENTS.md` allows ES modules only | marks `D1` `differs`, not `preferred` |
| `service-check` | implementer | T-03's first item can only be checked by starting a server; no plan, no `Checks:` block | marks `D1` `built, not verified`, neither `met` nor `not met` |

What it does not measure: the skills around the roles. The agent gets the role's input directly, as `sw:implement` would send it, so the dispatching skill's own steps (setting the status, choosing the checks, reading the report) are not exercised; `sw:plan-implement` over a whole task is a separate run, decided case by case because of its cost. One model, one tiny project: a pass says the role handled this path here, not that the text is unambiguous, and the dry-run is where ambiguity shows. The reviewer scenarios also report whether the reviewer edited the copy, which the audit left open.

### Layout

- `e2e/fixture/`: the project, `items` in `src/items.mjs`, one test, an `AGENTS.md` with one rule (ES modules under `src/`, `.mjs`, named exports only), and a vault with three seeded tasks: T-01 "Paginate the item list" in progress, T-02 "Export the item list as CSV" and T-03 "Serve the items over HTTP" ready. Its `docs/.sw/` and `docs/viewer.html` are not committed; `prepare` creates them with the version of `sw.mjs` in the checkout.
- `e2e/overlays/<name>/`: files laid over the copy uncommitted, as the task's change: `planted-defect` holds the defective `src/paginate.mjs` and its green test, `second-review` the same with an empty-list case added.
- `e2e/scenarios/<name>.md`: one scenario each. Header lines `Task:`, `Role:` (`reviewer` or `implementer`), `Overlays:` and `Files:`; `## Run`, how it is run; `## Prompt`, a fenced block with the placeholders `<copy>` (the copy's path) and `<files>` (the `Files:` line); an optional `## Recheck` block, appended to the prompt; `## Pass`, the table `| check | expect |`. A check is `sw <args>`, run as `node docs/.sw/sw.mjs <args>` in the copy, expecting `exit <n>` or a line of its output; `output`, expecting `matches /re/flags` or `lacks /re/flags` against the report; or `tree`, expecting `unchanged`, the copy's files as `prepare` left them. A `|` inside a regular expression is written `\|`.
- `e2e/e2e.mjs`: `prepare` and `check`. It never calls a model.

### Run it

1. Write the agent files from the current role texts, in the repository root:

   ```sh
   node skills/config/scripts/config.mjs sync --tools claude
   ```

   It writes `.claude/agents/sw-reviewer.md` and `sw-implementer.md` from `skills/config/assets/`. They are git-ignored and go stale when a role file changes, so this step runs before every run; `prepare` refuses to run while the file for the scenario's role is missing.
2. Prepare a clean copy per repetition, in a scratch directory outside the repository:

   ```sh
   node evals/e2e/e2e.mjs prepare planted-defect --to <scratch>/planted-defect-1
   ```

   It copies the fixture, gives it a vault (`init.mjs --tasks`), commits everything once, lays the overlays over it uncommitted, and prints `Agent: sw-<role>` and the prompt.
3. Dispatch one fresh agent of the printed type, with the printed prompt and nothing else, and save its report as a file (`<scratch>/planted-defect-1.txt`). The agent type is the point: it carries the role text and the model set with `sw:config`. Do not use the general-purpose fallback of `sw:implement`'s dispatch table, which would measure a different prompt. A fresh agent means a subagent that has not seen this conversation or another repetition.
4. Check the copy and the report:

   ```sh
   node evals/e2e/e2e.mjs check planted-defect <scratch>/planted-defect-1 <scratch>/planted-defect-1.txt
   ```

   It prints one line per pass row, `pass` or `FAIL` with what it found, and `passed <n> of <m>`; it exits 0 when every row passes, 1 when a row fails, and 2 on an input error (an unknown scenario, a directory `prepare` did not make, an unreadable report).

A scenario's `## Run` section has the same steps with its own names.

### Repetitions

`planted-defect` three fresh reviewers at least; its result is the number of repetitions that detected the defect, `<detected> of 3`. The other scenarios one agent at least; their result is `check`'s verdict. A scenario that failed once is worth a second run before a text is changed for it: one agent is the weakest method.

### What a run costs

A run spends real tokens: one agent per repetition reads the task, the vault's output and a few files, and the implementer scenarios build code. Take the cost from the usage table after the run, in the repository root: `node docs/.sw/sw.mjs usage` lists each dispatched agent with its model and the tokens it sent, and the results row records them. Expect the four scenarios with three planted-defect repetitions to take six agents.

### When to run

After a change to `reviewer.md` or `implementer.md`, to the dispatch rules of `sw:implement`, or to a scenario, overlay or fixture file: run the scenarios that exercise the changed text. Not per commit, and not for a change to `e2e.mjs` alone: `test/e2e.test.mjs` covers the script with stub reports and needs no agent.

### Read the result

- For `planted-defect`, the count is the result. Two detections of three mean a reviewer that stops at the green test one time in three; read the failed report for where it stopped.
- For the others, a failed row names what the agent did instead: a `lacks` hit shows the wrong mark, a `tree` failure lists the files a reviewer changed, a `sw` failure shows a vault the agent broke.
- A pass on every row says nothing about cost: compare the agents' tokens with the last row too.

## Record a result

Add a row to the table of the eval in `results.md`: the date, the short commit (`git rev-parse --short HEAD`), the condition or brief, the number of repetitions or readers, the result, the places, and notes. For routing, the result is the scorer's `agreement` and `expectations` lines, and the places are the messages under `differs` and those marked unsure. For a dry-run, the result is each reader's total, and the places are the listed findings that were not clean. For the end-to-end eval, one row per scenario: the condition is the scenario and the agent type, the result is `<detected> of 3` for `planted-defect` and `check`'s `passed <n> of <m>` otherwise, the places are the pass rows that failed, and the notes hold the model and the tokens per agent from `sw.mjs usage`.

Answer files and reports stay out of the repository. The row is the record; if a run is worth keeping in full, file the reports as a source under `docs/raw/`.
