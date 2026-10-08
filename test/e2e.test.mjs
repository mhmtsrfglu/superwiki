import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvalError, check, main, parseScenario, prepare } from '../evals/e2e/e2e.mjs';

const E2E = new URL('../evals/e2e/', import.meta.url).pathname;
const SCENARIOS = ['autopilot-run', 'differs-item', 'plan-draft', 'planted-defect', 'route-and-differs', 'second-review', 'service-check', 'triage-report'];
const SKILLS = { 'triage-report': 'triage', 'plan-draft': 'plan', 'route-and-differs': 'plan-implement', 'autopilot-run': 'autopilot' };

const sw = (root, ...args) => spawnSync('node', [join(root, 'docs/.sw/sw.mjs'), ...args], { encoding: 'utf8', cwd: root });
const git = (root, ...args) => spawnSync('git', args, { encoding: 'utf8', cwd: root }).stdout;
const shipped = name => readFileSync(join(E2E, 'scenarios', `${name}.md`), 'utf8');

// A tmp root with a scratch area and a stub agent file for each role sw-config would write.
function scratch(...roles) {
  const root = mkdtempSync(join(tmpdir(), 'sw-e2e-'));
  const agents = join(root, 'agents');
  mkdirSync(agents);
  for (const role of roles) writeFileSync(join(agents, `sw-${role}.md`), `---\nname: sw-${role}\n---\nstub\n`);
  return { root, agents, copy: join(root, 'copy') };
}

// main() with captured streams: { code, out, err }.
function cli(...argv) {
  let out = '';
  let err = '';
  const code = main(argv, { write: s => (out += s) }, { write: s => (err += s) });
  return { code, out, err };
}

// A stand-in for the claude binary: it records its working directory and arguments in
// `<root>/<name>.args`, one per line, and prints the given stream-json events.
function stubClaude(root, name, events) {
  const path = join(root, `${name}.sh`);
  writeFileSync(path, `#!/bin/sh\n{ pwd; printf '%s\\n' "$@"; } > '${join(root, `${name}.args`)}'\ncat <<'EVENTS'\n${events.map(event => JSON.stringify(event)).join('\n')}\nEVENTS\n`);
  chmodSync(path, 0o755);
  return path;
}

const said = (id, text, parent = null) => ({ type: 'assistant', message: { id, content: [{ type: 'text', text }] }, parent_tool_use_id: parent, session_id: 's-1' });
const RESULT = { type: 'result', subtype: 'success', is_error: false, num_turns: 4, total_cost_usd: 0.1234, session_id: 's-1', result: 'D1 differs: built src/export.mjs.' };
const EVENTS = [
  { type: 'system', subtype: 'init', session_id: 's-1', model: 'claude-stub-1' },
  said('m1', 'Route: small (one area, 2 items, 1 file).'),
  { type: 'assistant', message: { id: 'm2', content: [{ type: 'tool_use', id: 't1', name: 'Agent', input: {} }] }, parent_tool_use_id: null, session_id: 's-1' },
  said('m3', 'D1 differs, in the subagent.', 't1'),
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'done' }] }, parent_tool_use_id: null, session_id: 's-1' },
  said('m4', RESULT.result),
  RESULT,
];

const SCENARIO = `# Crafted

Prose before the headers.

Task: T-09
Role: reviewer
Overlays: one, two
Files: src/a.mjs, test/a.test.mjs

## Run

How it is run.

## Prompt

\`\`\`text
T-09
Project root: <copy>
Files: <files>
\`\`\`

## Recheck

\`\`\`text
Recheck:
- blocking, src/a.mjs line 3: the earlier finding.
\`\`\`

## Pass

| check | expect |
| --- | --- |
| \`output\` | \`matches /^Verdict: changes needed/m\` |
| \`output\` | \`lacks /resolved\\|fixed/i\` |
| \`tree\` | \`unchanged\` |
| \`sw check T-09\` | \`done when: 2 items\` |
| \`sw lint\` | \`exit 0\` |
`;

// The same scenario as a headless skill run: a budget, a file row, no recheck.
const SKILL_SCENARIO = SCENARIO
  .replace('Role: reviewer', 'Skill: plan-implement\nBudget: 8')
  .replace(/## Recheck[\s\S]*?## Pass/, '## Pass')
  .replace('| `tree` | `unchanged` |', '| `file docs/tasks/T-09.md` | `lacks /accepted by the user/` |\n| `file docs/plans/T-09-plan.md` | `matches /^status: draft$/m` |');

test('parseScenario reads the headers, the blocks and the pass table', () => {
  const scenario = parseScenario(SCENARIO, 'crafted');
  assert.equal(scenario.task, 'T-09');
  assert.equal(scenario.role, 'reviewer');
  assert.equal(scenario.agent, 'sw-reviewer');
  assert.equal(scenario.skill, null);
  assert.equal(scenario.budget, null);
  assert.deepEqual(scenario.overlays, ['one', 'two']);
  assert.deepEqual(scenario.files, ['src/a.mjs', 'test/a.test.mjs']);
  assert.equal(scenario.prompt, 'T-09\nProject root: <copy>\nFiles: <files>');
  assert.match(scenario.recheck, /^Recheck:\n- blocking, src\/a\.mjs line 3/);
  assert.deepEqual(scenario.pass.map(row => row.kind), ['output', 'output', 'tree', 'sw', 'sw']);
  const [verdict, lacks, , checkRow, lint] = scenario.pass;
  assert.equal(verdict.mode, 'matches');
  assert.equal(verdict.re.source, '^Verdict: changes needed');
  assert.equal(verdict.re.flags, 'm');
  // `\|` inside a cell is a pipe of the regular expression, not a cell border.
  assert.equal(lacks.mode, 'lacks');
  assert.equal(lacks.re.source, 'resolved|fixed');
  assert.deepEqual(checkRow.args, ['check', 'T-09']);
  assert.equal(checkRow.line, 'done when: 2 items');
  assert.equal(checkRow.exit, null);
  assert.deepEqual(lint.args, ['lint']);
  assert.equal(lint.exit, 0);
});

test('parseScenario reads a Skill: scenario with its budget and file rows', () => {
  const scenario = parseScenario(SKILL_SCENARIO, 'crafted');
  assert.equal(scenario.skill, 'plan-implement');
  assert.equal(scenario.budget, 8);
  assert.equal(scenario.role, null);
  assert.equal(scenario.agent, null);
  assert.equal(scenario.recheck, null);
  assert.deepEqual(scenario.pass.map(row => row.kind), ['output', 'output', 'file', 'file', 'sw', 'sw']);
  const [, , lacks, matches] = scenario.pass;
  assert.equal(lacks.path, 'docs/tasks/T-09.md');
  assert.equal(lacks.mode, 'lacks');
  assert.equal(lacks.re.source, 'accepted by the user');
  assert.equal(matches.path, 'docs/plans/T-09-plan.md');
  assert.equal(matches.mode, 'matches');
  assert.equal(matches.re.flags, 'm');
});

test('parseScenario rejects a bad check kind, a bad expectation and a missing header', () => {
  const withRow = row => SCENARIO.replace('| `tree` | `unchanged` |', row);
  assert.throws(() => parseScenario(withRow('| `grep foo` | `exit 0` |'), 'crafted'), { name: 'Error', message: /crafted: unknown check kind "grep"/ });
  assert.throws(() => parseScenario(withRow('| `output` | `contains Verdict` |'), 'crafted'), /output expects "matches/);
  assert.throws(() => parseScenario(withRow('| `tree` | `same` |'), 'crafted'), /tree expects "unchanged"/);
  assert.throws(() => parseScenario(withRow('| `file` | `matches /x/` |'), 'crafted'), /file needs a path/);
  assert.throws(() => parseScenario(withRow('| `file docs/a.md` | `contains x` |'), 'crafted'), /file expects "matches/);
  assert.throws(() => parseScenario(SCENARIO.replace('Role: reviewer', 'Role: planner'), 'crafted'), EvalError);
  assert.throws(() => parseScenario(SCENARIO.replace('Task: T-09\n', ''), 'crafted'), /needs a "Task:" line/);
  assert.throws(() => parseScenario(SCENARIO.replace(/## Pass[\s\S]*$/, ''), 'crafted'), /Pass table/);
});

test('parseScenario wants exactly one of Role: and Skill:, and a budget with a skill', () => {
  assert.throws(() => parseScenario(SCENARIO.replace('Role: reviewer\n', ''), 'crafted'), /"Role:" or "Skill:"/);
  assert.throws(() => parseScenario(SCENARIO.replace('Role: reviewer', 'Role: reviewer\nSkill: triage\nBudget: 3'), 'crafted'), /not both/);
  assert.throws(() => parseScenario(SKILL_SCENARIO.replace('Skill: plan-implement', 'Skill: deploy'), 'crafted'), /"Skill:" must be one of/);
  assert.throws(() => parseScenario(SKILL_SCENARIO.replace('Budget: 8\n', ''), 'crafted'), /"Budget:"/);
  assert.throws(() => parseScenario(SKILL_SCENARIO.replace('Budget: 8', 'Budget: $8'), 'crafted'), /"Budget:" must be a positive number of dollars/);
  assert.throws(() => parseScenario(SKILL_SCENARIO.replace('Budget: 8', 'Budget: 0'), 'crafted'), /"Budget:" must be a positive number of dollars/);
  assert.throws(() => parseScenario(SCENARIO.replace('Role: reviewer', 'Role: reviewer\nBudget: 3'), 'crafted'), /"Budget:" belongs to a "Skill:" scenario/);
  assert.equal(parseScenario(SKILL_SCENARIO.replace('Budget: 8', 'Budget: 2.50'), 'crafted').budget, 2.5);
});

test('the shipped scenarios parse and say what they need', () => {
  assert.deepEqual(readdirSync(join(E2E, 'scenarios')).sort(), SCENARIOS.map(name => `${name}.md`));
  const scenarios = Object.fromEntries(SCENARIOS.map(name => [name, parseScenario(shipped(name), name)]));
  for (const [name, scenario] of Object.entries(scenarios)) {
    assert.ok(scenario.pass.some(row => row.kind === 'sw' && row.args[0] === 'lint'), `${name} lints the vault`);
    for (const overlay of scenario.overlays) assert.ok(existsSync(join(E2E, 'overlays', overlay)), `${name}: overlay ${overlay}`);
    if (SKILLS[name]) {
      assert.equal(scenario.skill, SKILLS[name], name);
      assert.match(scenario.prompt, new RegExp(`^/sw-${SKILLS[name]}\\b`), `${name} invokes its skill`);
      assert.ok(scenario.budget > 0, `${name} has a budget`);
      assert.ok(scenario.pass.some(row => row.kind === 'output' || row.kind === 'file'), `${name} searches the output or the vault`);
    } else {
      assert.equal(scenario.skill, null, name);
      assert.match(scenario.prompt, /^T-0\d\nProject root: <copy>/, name);
      assert.ok(scenario.pass.some(row => row.kind === 'output'), `${name} searches the output`);
    }
  }
  assert.equal(scenarios['planted-defect'].role, 'reviewer');
  assert.deepEqual(scenarios['planted-defect'].overlays, ['planted-defect']);
  assert.deepEqual(scenarios['planted-defect'].files, ['src/paginate.mjs', 'test/paginate.test.mjs']);
  assert.ok(scenarios['planted-defect'].pass.some(row => row.kind === 'tree'));
  assert.equal(scenarios['planted-defect'].recheck, null);
  assert.match(scenarios['second-review'].recheck, /^Recheck:\n- blocking, src\/paginate\.mjs/);
  assert.equal(scenarios['differs-item'].role, 'implementer');
  assert.deepEqual(scenarios['differs-item'].overlays, []);
  assert.equal(scenarios['service-check'].task, 'T-03');

  // The headless scenarios: triage on the planted defect without touching a file, a draft plan
  // for T-03, the route and the differs item on T-02, autopilot over T-02 with the largest budget.
  assert.equal(scenarios['triage-report'].task, 'T-01');
  assert.deepEqual(scenarios['triage-report'].overlays, ['planted-defect']);
  assert.ok(scenarios['triage-report'].pass.some(row => row.kind === 'tree'));
  assert.equal(scenarios['plan-draft'].task, 'T-03');
  assert.ok(scenarios['plan-draft'].pass.some(row => row.kind === 'file' && row.path === 'docs/plans/T-03-plan.md'));
  assert.equal(scenarios['route-and-differs'].task, 'T-02');
  assert.ok(scenarios['route-and-differs'].pass.some(row => row.kind === 'output' && /Route/.test(row.re.source)));
  assert.equal(scenarios['autopilot-run'].task, 'T-02');
  assert.ok(scenarios['autopilot-run'].budget >= scenarios['route-and-differs'].budget);
  assert.ok(scenarios['autopilot-run'].pass.some(row => row.kind === 'file' && row.path === 'docs/tasks/T-02.md'));
});

test('prepare makes a clean copy with a vault, one commit and the overlay uncommitted', () => {
  const { agents, copy } = scratch('reviewer');
  const { code, out, err } = cli('prepare', 'planted-defect', '--to', copy, '--agents', agents);
  assert.equal(code, 0, err);
  assert.equal(out, `Agent: sw-reviewer\n\nT-01\nProject root: ${copy}\nFiles: src/paginate.mjs, test/paginate.test.mjs\n`);

  assert.ok(existsSync(join(copy, 'docs/.sw/sw.mjs')), 'the vault has its CLI');
  assert.ok(existsSync(join(copy, 'docs/tasks/T-01.md')));
  assert.ok(existsSync(join(copy, 'src/items.mjs')));
  assert.match(readFileSync(join(copy, '.git/e2e-tree'), 'utf8'), /^[0-9a-f]{40}\n$/);
  assert.equal(git(copy, 'rev-list', '--count', 'HEAD').trim(), '1');
  assert.equal(git(copy, 'log', '--format=%an <%ae>').trim(), 'e2e <e2e@example.com>');
  assert.deepEqual(git(copy, 'status', '--porcelain').trim().split('\n').sort(), ['?? src/paginate.mjs', '?? test/paginate.test.mjs']);

  // The copy carries the agents a headless session dispatches, committed, and keeps the
  // settings file a session may write out of the tree.
  for (const agent of ['sw-planner', 'sw-implementer', 'sw-reviewer']) {
    assert.match(readFileSync(join(copy, `.claude/agents/${agent}.md`), 'utf8'), new RegExp(`^name: ${agent}$`, 'm'));
  }
  assert.match(git(copy, 'ls-files', '.claude/agents'), /^\.claude\/agents\/sw-planner\.md$/m);
  assert.match(readFileSync(join(copy, '.git/info/exclude'), 'utf8'), /^\.claude\/settings\.local\.json$/m);

  // The vault is sound and T-01 has the two items the scenario counts.
  assert.equal(sw(copy, 'lint').status, 0);
  assert.match(sw(copy, 'check', 'T-01').stdout, /^done when: 2 items$/m);
  assert.match(sw(copy, 'explain', 'T-01').stdout, /^T-01 {2}Paginate the item list/);

  // The planted defect: a whole number of pages loses its last page, while the shipped test stays green.
  const pages = spawnSync('node', ['--input-type=module', '-e',
    'import { items } from "./src/items.mjs"; import { paginate } from "./src/paginate.mjs"; console.log(JSON.stringify([paginate(items(10), 5), paginate(items(7), 5)]))'],
  { cwd: copy, encoding: 'utf8' });
  assert.equal(JSON.parse(pages.stdout.trim())[0].length, 1);
  assert.deepEqual(JSON.parse(pages.stdout.trim())[1], [[1, 2, 3, 4, 5], [6, 7]]);
  assert.equal(spawnSync('node', ['--test'], { cwd: copy, encoding: 'utf8' }).status, 0, 'the overlay test passes on the defect');
});

test('prepare refuses to run without the agent file, on a used directory and on an unknown scenario', () => {
  const { root, agents, copy } = scratch('implementer');
  const missing = cli('prepare', 'planted-defect', '--to', copy, '--agents', agents);
  assert.equal(missing.code, 2);
  assert.match(missing.err, /sw-reviewer\.md is missing; run "node skills\/sw-config\/scripts\/config\.mjs sync --tools claude"/);
  assert.ok(!existsSync(copy), 'nothing is copied before the check');

  const differs = prepare('differs-item', copy, { agents });
  assert.equal(differs.agent, 'sw-implementer');
  assert.equal(differs.skill, null);
  assert.equal(differs.prompt, `T-02\nProject root: ${copy}`);
  assert.equal(git(copy, 'status', '--porcelain').trim(), '', 'no overlay, nothing uncommitted');
  assert.throws(() => prepare('differs-item', copy, { agents }), /is not empty/);

  assert.throws(() => prepare('no-such-scenario', join(root, 'other'), { agents }), /cannot read .*no-such-scenario\.md/);
  assert.equal(cli('prepare', 'planted-defect').code, 2);
  assert.equal(cli('nothing').code, 2);
});

test('prepare of a Skill: scenario needs no agent file and prints the skill', () => {
  const { copy } = scratch();
  const { code, out, err } = cli('prepare', 'triage-report', '--to', copy);
  assert.equal(code, 0, err);
  assert.match(out, /^Skill: sw-triage\n\n\/sw-triage /);
  assert.ok(!out.includes('<copy>'), 'placeholders are filled');
  assert.deepEqual(git(copy, 'status', '--porcelain').trim().split('\n').sort(), ['?? src/paginate.mjs', '?? test/paginate.test.mjs']);
  assert.ok(existsSync(join(copy, '.claude/agents/sw-planner.md')));
});

test('check runs the pass table against the copy and the report', () => {
  const { root, agents, copy } = scratch('reviewer');
  prepare('planted-defect', copy, { agents });
  const report = join(root, 'report.txt');
  writeFileSync(report, [
    'Verdict: changes needed',
    'Claims:',
    '- D1 every item lands on a page: tried paginate(items(10), 5), got one page.',
    'Findings:',
    '- blocking: src/paginate.mjs line 5, the loop stops a page early when the total divides evenly by the page size.',
    '',
  ].join('\n'));

  const good = cli('check', 'planted-defect', copy, report);
  assert.equal(good.code, 0, good.out);
  assert.equal(good.out.split('\n').filter(line => line.startsWith('pass  ')).length, 6);
  assert.match(good.out, /^passed 6 of 6\n$/m);

  const passing = join(root, 'passing.txt');
  writeFileSync(passing, 'Verdict: pass\nClaims:\n- D1 holds: the test is green.\n');
  const missed = cli('check', 'planted-defect', copy, passing);
  assert.equal(missed.code, 1);
  assert.match(missed.out, /^FAIL {2}output \| matches \/\^Verdict: changes needed\/m {2}\(no match in the output\)$/m);
  assert.match(missed.out, /^passed 3 of 6: the scenario failed$/m);

  // A `lacks` row fails on a hit, and names it.
  const scenario = join(root, 'lacks.md');
  writeFileSync(scenario, SCENARIO.replaceAll('T-09', 'T-01').replace('| `tree` | `unchanged` |\n', '').replace('lacks /resolved\\|fixed/i', 'lacks /divides evenly/'));
  const lacks = check(scenario, copy, report);
  assert.equal(lacks.ok, false);
  assert.deepEqual(lacks.rows.map(row => row.ok), [true, false, true, true]);
  assert.equal(lacks.rows[1].detail, 'found "divides evenly"');

  // An edit in the copy fails `tree`, whether in a tracked file or in the overlay.
  appendFileSync(join(copy, 'src/paginate.mjs'), '// touched\n');
  const edited = cli('check', 'planted-defect', copy, report);
  assert.equal(edited.code, 1);
  assert.match(edited.out, /^FAIL {2}tree \| unchanged {2}\(changed: M\tsrc\/paginate\.mjs\)$/m);

  assert.equal(cli('check', 'planted-defect', copy, join(root, 'missing.txt')).code, 2);
  assert.equal(cli('check', 'planted-defect', root, report).code, 2, 'not a prepared copy');
});

test('a file row searches a file of the copy; a missing file fails matches and passes lacks', () => {
  const { root, copy } = scratch();
  prepare('plan-draft', copy);
  const report = join(root, 'report.txt');
  writeFileSync(report, 'Approach: one server file.\n');
  const scenario = join(root, 'files.md');
  writeFileSync(scenario, [
    'Task: T-03', 'Skill: plan', 'Budget: 1', '', '## Run', '', 'x', '', '## Prompt', '', '```text', '/sw-plan T-03', '```', '', '## Pass', '',
    '| check | expect |', '| --- | --- |',
    '| `file docs/tasks/T-03.md` | `matches /^status: todo$/m` |',
    '| `file docs/tasks/T-03.md` | `lacks /\\(test\\)/` |',
    '| `file docs/plans/T-03-plan.md` | `matches /^status: draft$/m` |',
    '| `file docs/plans/T-03-plan.md` | `lacks /approved/` |',
    '| `file docs/tasks/T-03.md` | `matches /status: done/` |',
    '',
  ].join('\n'));
  const before = check(scenario, copy, report);
  assert.deepEqual(before.rows.map(row => row.ok), [true, true, false, true, false]);
  assert.equal(before.rows[2].detail, 'missing: docs/plans/T-03-plan.md');
  assert.equal(before.rows[4].detail, 'no match in docs/tasks/T-03.md');

  writeFileSync(join(copy, 'docs/plans/T-03-plan.md'), '---\ntype: plan\ntask: T-03\nstatus: draft\n---\n\n## Approach\n');
  const after = check(scenario, copy, report);
  assert.deepEqual(after.rows.map(row => row.ok), [true, true, true, true, false]);
  assert.match(cli('check', scenario, copy, report).out, /^FAIL {2}file docs\/tasks\/T-03\.md \| matches \/status: done\/ {2}\(no match in docs\/tasks\/T-03\.md\)$/m);
});

test('run starts a headless session in the copy and saves what it said as the report', () => {
  const { root, copy } = scratch();
  prepare('route-and-differs', copy);
  const report = join(root, 'route.txt');
  const stub = stubClaude(root, 'claude', EVENTS);

  const { code, out, err } = cli('run', 'route-and-differs', copy, '--report', report, '--claude', stub);
  assert.equal(code, 0, err);
  assert.equal(readFileSync(report, 'utf8'), 'Route: small (one area, 2 items, 1 file).\n\nD1 differs: built src/export.mjs.\n');
  assert.equal(readFileSync(`${report}.jsonl`, 'utf8'), `${EVENTS.map(event => JSON.stringify(event)).join('\n')}\n`);
  assert.match(out, /^model: claude-stub-1$/m);
  assert.match(out, /^turns: 4$/m);
  assert.match(out, /^cost: \$0\.1234$/m);
  assert.match(out, /^result: success$/m);
  assert.match(out, /^session: s-1$/m);

  // The session runs in the copy, unattended, with the scenario's budget as its guard.
  const [cwd, ...args] = readFileSync(join(root, 'claude.args'), 'utf8').trimEnd().split('\n');
  assert.equal(realpathSync(cwd), realpathSync(copy));
  assert.equal(args[0], '-p');
  assert.match(args[1], /^\/sw-plan-implement T-02/);
  const flags = args.slice(2).join(' ');
  assert.ok(flags.includes('--output-format stream-json'), flags);
  assert.ok(flags.includes('--verbose'), flags);
  assert.ok(flags.includes('--dangerously-skip-permissions'), flags);
  assert.ok(flags.includes('--permission-prompts none'), flags);
  assert.ok(flags.includes('--setting-sources user,project'), flags);
  assert.ok(flags.includes('--max-budget-usd 8'), flags);

  // The report is what the scenario's check reads.
  const checked = cli('check', 'route-and-differs', copy, report);
  assert.match(checked.out, /^pass {2}output \| matches \/\^Route: \(small\|medium\)\\b\/m$/m);
  assert.match(checked.out, /^pass {2}output \| matches \/\\bdiffers\\b\/$/m);

  // --max-budget-usd overrides the scenario's budget; an empty session still writes the files.
  const other = join(root, 'other.txt');
  assert.equal(cli('run', 'route-and-differs', copy, '--report', other, '--claude', stubClaude(root, 'budget', [RESULT]), '--max-budget-usd', '1.5').code, 0);
  assert.ok(readFileSync(join(root, 'budget.args'), 'utf8').includes('--max-budget-usd\n1.5\n'));
  assert.equal(readFileSync(other, 'utf8'), '');
});

test('run exits 1 on a failed session with the report written, and 2 on bad input', () => {
  const { root, copy } = scratch('reviewer');
  prepare('route-and-differs', copy);
  const report = join(root, 'stopped.txt');
  const stopped = stubClaude(root, 'stopped', [
    EVENTS[0], said('m1', 'Route: medium (the files are not named).'),
    { type: 'result', subtype: 'error_max_budget_usd', is_error: true, num_turns: 9, total_cost_usd: 8.01, session_id: 's-2' },
  ]);
  const failed = cli('run', 'route-and-differs', copy, '--report', report, '--claude', stopped);
  assert.equal(failed.code, 1);
  assert.equal(readFileSync(report, 'utf8'), 'Route: medium (the files are not named).\n');
  assert.match(failed.out, /^cost: \$8\.01$/m);
  assert.match(failed.out, /^result: error_max_budget_usd$/m);

  // A session that dies without a result event.
  const died = cli('run', 'route-and-differs', copy, '--report', join(root, 'died.txt'), '--claude', stubClaude(root, 'died', [EVENTS[0], said('m1', 'Starting.')]));
  assert.equal(died.code, 1);
  assert.equal(readFileSync(join(root, 'died.txt'), 'utf8'), 'Starting.\n');
  assert.match(died.out, /^result: none$/m);

  const stub = stubClaude(root, 'unused', EVENTS);
  assert.equal(cli('run', 'route-and-differs', copy, '--claude', stub).code, 2, 'needs --report');
  assert.equal(cli('run', 'route-and-differs', copy, '--report', report, '--claude', join(root, 'no-such-claude')).code, 2, 'no binary');
  assert.equal(cli('run', 'route-and-differs', root, '--report', report, '--claude', stub).code, 2, 'not a prepared copy');
  const roleCopy = join(root, 'role');
  prepare('planted-defect', roleCopy, { agents: join(root, 'agents') });
  const role = cli('run', 'planted-defect', roleCopy, '--report', report, '--claude', stub);
  assert.equal(role.code, 2);
  assert.match(role.err, /planted-defect is a Role: scenario/);
  assert.equal(cli('run', 'route-and-differs', copy, '--report', report, '--claude', stub, '--max-budget-usd', 'lots').code, 2);
  assert.equal(cli('prepare', 'route-and-differs', '--to', join(root, 'x'), '--report', report).code, 2, '--report belongs to run');
});
