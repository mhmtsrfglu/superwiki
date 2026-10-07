import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvalError, check, main, parseScenario, prepare } from '../evals/e2e/e2e.mjs';

const E2E = new URL('../evals/e2e/', import.meta.url).pathname;
const SCENARIOS = ['differs-item', 'planted-defect', 'second-review', 'service-check'];

const sw = (root, ...args) => spawnSync('node', [join(root, 'docs/.sw/sw.mjs'), ...args], { encoding: 'utf8', cwd: root });
const git = (root, ...args) => spawnSync('git', args, { encoding: 'utf8', cwd: root }).stdout;
const shipped = name => readFileSync(join(E2E, 'scenarios', `${name}.md`), 'utf8');

// A tmp root with a scratch area and a stub agent file for each role sw:config would write.
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

test('parseScenario reads the headers, the blocks and the pass table', () => {
  const scenario = parseScenario(SCENARIO, 'crafted');
  assert.equal(scenario.task, 'T-09');
  assert.equal(scenario.role, 'reviewer');
  assert.equal(scenario.agent, 'sw-reviewer');
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

test('parseScenario rejects a bad check kind, a bad expectation and a missing header', () => {
  const withRow = row => SCENARIO.replace('| `tree` | `unchanged` |', row);
  assert.throws(() => parseScenario(withRow('| `grep foo` | `exit 0` |'), 'crafted'), { name: 'Error', message: /crafted: unknown check kind "grep"/ });
  assert.throws(() => parseScenario(withRow('| `output` | `contains Verdict` |'), 'crafted'), /output expects "matches/);
  assert.throws(() => parseScenario(withRow('| `tree` | `same` |'), 'crafted'), /tree expects "unchanged"/);
  assert.throws(() => parseScenario(SCENARIO.replace('Role: reviewer', 'Role: planner'), 'crafted'), EvalError);
  assert.throws(() => parseScenario(SCENARIO.replace('Task: T-09\n', ''), 'crafted'), /needs a "Task:" line/);
  assert.throws(() => parseScenario(SCENARIO.replace(/## Pass[\s\S]*$/, ''), 'crafted'), /Pass table/);
});

test('the shipped scenarios parse and say what they need', () => {
  assert.deepEqual(readdirSync(join(E2E, 'scenarios')).sort(), SCENARIOS.map(name => `${name}.md`));
  const scenarios = Object.fromEntries(SCENARIOS.map(name => [name, parseScenario(shipped(name), name)]));
  for (const [name, scenario] of Object.entries(scenarios)) {
    assert.match(scenario.prompt, /^T-0\d\nProject root: <copy>/, name);
    assert.ok(scenario.pass.some(row => row.kind === 'output'), `${name} searches the output`);
    assert.ok(scenario.pass.some(row => row.kind === 'sw' && row.args[0] === 'lint'), `${name} lints the vault`);
    for (const overlay of scenario.overlays) assert.ok(existsSync(join(E2E, 'overlays', overlay)), `${name}: overlay ${overlay}`);
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
  assert.match(missing.err, /sw-reviewer\.md is missing; run "node skills\/config\/scripts\/config\.mjs sync --tools claude"/);
  assert.ok(!existsSync(copy), 'nothing is copied before the check');

  const differs = prepare('differs-item', copy, { agents });
  assert.equal(differs.agent, 'sw-implementer');
  assert.equal(differs.prompt, `T-02\nProject root: ${copy}`);
  assert.equal(git(copy, 'status', '--porcelain').trim(), '', 'no overlay, nothing uncommitted');
  assert.throws(() => prepare('differs-item', copy, { agents }), /is not empty/);

  assert.throws(() => prepare('no-such-scenario', join(root, 'other'), { agents }), /cannot read .*no-such-scenario\.md/);
  assert.equal(cli('prepare', 'planted-defect').code, 2);
  assert.equal(cli('nothing').code, 2);
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
