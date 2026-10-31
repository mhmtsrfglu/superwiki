import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decide, countCases, isTestFile } from '../src/guard.js';
import { markedDoneWhen } from '../src/core.js';

const cli = new URL('../skills/sw-init/assets/sw.mjs', import.meta.url).pathname;

const TASK = `---
type: task
id: T-01
title: Export the item list as CSV
status: in-progress
deps: []
soft_deps: []
started: 2026-10-18
---

## Goal

\`toCsv(items)\` renders the list as CSV.

## Done when

- \`toCsv\` writes the header and one line per item (test)
  - the header is \`item\`
- an empty list gives the header only (test)
- a value with a comma is double-quoted
- \`npm test\` passes
`;

const cases = n => Array.from({ length: n }, (_, i) => `test('case ${i + 1}', () => { assert.ok(true); });`).join('\n');
const file = n => `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n\n${cases(n)}\n`;

// A project with a vault in which T-01 is in progress with two marked items, committed, so git sees
// what a test adds afterwards.
function vault({ inProgress = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sw-guard-'));
  const docs = join(root, 'docs');
  for (const folder of ['docs/tasks', 'docs/wiki', 'docs/.sw', 'src', 'test']) mkdirSync(join(root, folder), { recursive: true });
  writeFileSync(join(docs, 'index.md'), '# Index\n');
  writeFileSync(join(docs, 'log.md'), '# Log\n');
  writeFileSync(join(docs, 'tasks', 'T-01.md'), inProgress ? TASK : TASK.replace('status: in-progress', 'status: todo'));
  writeFileSync(join(root, 'src', 'a.mjs'), 'export const a = 1;\n');
  writeFileSync(join(root, 'test', 'items.test.mjs'), file(1));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'start');
  return { root, docs, ctx: { docs, root } };
}

const claude = (tool_name, tool_input, cwd) => ({ session_id: 's', cwd, hook_event_name: 'PreToolUse', tool_name, tool_input });
const codex = (command, cwd) => ({ session_id: 's', cwd, hook_event_name: 'PreToolUse', tool_name: 'apply_patch', tool_input: { command } });
const addFile = (path, text) => `*** Begin Patch\n*** Add File: ${path}\n${text.trimEnd().split('\n').map(l => `+${l}`).join('\n')}\n*** End Patch\n`;
// A shell call that writes `text` into `path` with a heredoc, as the implementers do.
const heredoc = (path, text) => `cat > ${path} <<'EOF'\n${text.trimEnd()}\nEOF\n`;
const updateFile = (path, added) => `*** Begin Patch\n*** Update File: ${path}\n@@\n ${"test('case 3', () => { assert.ok(true); });"}\n${added.split('\n').map(l => `+${l}`).join('\n')}\n*** End Patch\n`;

test('a test file and a test case are told by path and by line', () => {
  for (const p of ['test/a.test.mjs', 'src/__tests__/a.mjs', 'tests/a.py', 'spec/a.rb', 'src/a.spec.ts', 'pkg/a_test.go', 'src/test_a.py']) assert.ok(isTestFile(p), p);
  for (const p of ['src/a.mjs', 'src/testing.mjs', 'docs/tests.md', 'src/contest.js']) assert.ok(!isTestFile(p), p);
  assert.equal(countCases(file(3)), 3);
  assert.equal(countCases("it('x', () => {});\ntest.only('y', () => {});\ndescribe('d', () => {});\n"), 2);
  assert.equal(countCases('def test_one():\n    pass\n\ndef helper():\n    pass\n#[test]\nfn t() {}\nfunc TestX(t *testing.T) {}\n@Test\nvoid y() {}\n'), 4);
  assert.equal(markedDoneWhen(TASK.replace(/^---[\s\S]*?---\n/, '')), 2);
});

test('claude: a write within the allowance and a non-test write pass; the write that goes over is denied', () => {
  const { root, ctx } = vault();
  const ok = decide('claude', claude('Write', { file_path: join(root, 'test/a.test.mjs'), content: file(3) }, root), ctx);
  assert.equal(ok.deny, false);
  assert.equal(ok.output, null);
  assert.equal(decide('claude', claude('Write', { file_path: 'src/a.mjs', content: 'export const a = 2;\n' }, root), ctx).deny, false);
  assert.equal(decide('claude', claude('Edit', { file_path: 'test/items.test.mjs', old_string: 'assert.ok(true)', new_string: 'assert.equal(1, 1)' }, root), ctx).deny, false, 'an edit that adds no case');
  assert.equal(decide('claude', claude('Bash', { command: heredoc('test/h.test.mjs', file(3)) }, root), ctx).deny, false, 'a heredoc within the allowance');
  assert.equal(decide('claude', claude('Bash', { command: `${heredoc('src/h.mjs', file(9))}npm test` }, root), ctx).deny, false, 'a heredoc into a source file');

  writeFileSync(join(root, 'test/a.test.mjs'), file(3));
  const over = decide('claude', claude('Edit', { file_path: 'test/a.test.mjs', old_string: "test('case 3'", new_string: "test('case 4', () => {});\ntest('case 3'" }, root), ctx);
  assert.equal(over.deny, true);
  assert.match(over.message, /one test per behaviour/i);
  assert.match(over.message, /T-01 allows 3 tests/);
  assert.match(over.message, /3 added, this write adds 1/);
  assert.deepEqual(over.output, { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: over.message } });
  const bulk = decide('claude', claude('Write', { file_path: 'test/b.test.mjs', content: file(2) }, root), ctx);
  assert.equal(bulk.deny, true, 'two new cases on top of three');
  assert.equal(decide('claude', claude('MultiEdit', { file_path: 'test/a.test.mjs', edits: [{ old_string: "test('case 3'", new_string: "test('case 4', () => {});\ntest('case 3'" }] }, root), ctx).deny, true);
  assert.equal(decide('claude', claude('Write', { file_path: 'test/a.test.mjs', content: file(2) }, root), ctx).deny, false, 'a write that removes a case');
  assert.equal(decide('claude', claude('NotebookEdit', { notebook_path: 'test/a.ipynb', new_source: 'test("x")' }, root), ctx).deny, false);

  // The shell tool: a heredoc, an append and an in-place edit over the allowance are denied; a
  // replacement with fewer cases, a read, a run and a delete are allowed.
  const shell = command => decide('claude', claude('Bash', { command }, root), ctx);
  const overShell = shell(`${heredoc('src/export.mjs', 'export const x = 1;')}${heredoc('test/h.test.mjs', file(1))}`);
  assert.equal(overShell.deny, true, 'a heredoc that adds a case over the allowance');
  assert.match(overShell.message, /one test per behaviour/i);
  assert.match(overShell.message, /3 added, this write adds 1/);
  assert.equal(shell(`echo "test('y', () => {});" >> test/a.test.mjs`).deny, true, 'an echo appended');
  assert.equal(shell(`printf '%s\\n' "it('y', () => {});" | tee -a test/a.test.mjs`).deny, true, 'tee -a');
  assert.equal(shell(`sed -i '' "s/^import assert.*$/&\\ntest('z', () => {});/" test/a.test.mjs`).deny, true, 'sed -i adding a case');
  assert.equal(shell(`node -e "require('fs').appendFileSync('test/a.test.mjs', \\"test('w', () => {});\\n\\")"`).deny, true, 'node -e naming the file');
  assert.equal(shell(heredoc('test/a.test.mjs', file(2))).deny, false, 'a replacement with fewer cases');
  assert.equal(shell('sed -i "" "s/assert.ok(true)/assert.equal(1, 1)/" test/a.test.mjs').deny, false, 'an in-place edit that adds no case');
  assert.equal(shell('rm test/a.test.mjs && node --test test/items.test.mjs && cat test/items.test.mjs > /dev/null').deny, false, 'delete, run, read');
  assert.equal(shell(': > test/a.test.mjs').deny, false, 'a truncation');
});

test('codex: an apply_patch within the allowance passes, one over it is denied with the same output shape', () => {
  const { root, ctx } = vault();
  assert.equal(decide('codex', codex(addFile('test/b.test.mjs', file(2)), root), ctx).deny, false);
  assert.equal(decide('codex', codex(addFile('src/b.mjs', file(9)), root), ctx).deny, false, 'not a test file');
  writeFileSync(join(root, 'test/a.test.mjs'), file(3));
  const over = decide('codex', codex(updateFile('test/a.test.mjs', cases(2)), root), ctx);
  assert.equal(over.deny, true);
  assert.match(over.message, /one test per behaviour/i);
  assert.match(over.message, /3 added, this write adds 2/);
  assert.equal(over.output.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(decide('codex', codex(addFile('test/c.test.mjs', file(1)), root), ctx).deny, true, 'one more on top of three');
  const sh = command => decide('codex', { session_id: 's', cwd: root, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }, root === null ? null : ctx);
  assert.equal(sh(['bash', '-lc', heredoc('test/c.test.mjs', file(1))]).deny, true, 'an argv shell call with a heredoc over the allowance');
  assert.equal(sh(['bash', '-lc', heredoc('src/c.mjs', file(4))]).deny, false, 'a non-test heredoc');
  assert.equal(sh(`sed -i 's/x/test("q", () => {});/' test/a.test.mjs`).deny, true, 'sed -i over the allowance');
  assert.equal(sh('rm test/a.test.mjs; node --test').deny, false, 'delete and run');
});

test('copilot: both payload shapes are read, and the deny fields sit at the top level', () => {
  const { root, ctx } = vault();
  const ok = decide('copilot', claude('Write', { file_path: 'test/a.test.mjs', content: file(3) }, root), ctx);
  assert.equal(ok.deny, false);
  writeFileSync(join(root, 'test/a.test.mjs'), file(3));
  const over = decide('copilot', { toolName: 'edit', toolArgs: { path: 'test/a.test.mjs', oldString: "test('case 3'", newString: "test('case 4', () => {});\ntest('case 3'" }, cwd: root }, ctx);
  assert.equal(over.deny, true);
  assert.match(over.message, /one test per behaviour/i);
  assert.deepEqual(over.output, { permissionDecision: 'deny', permissionDecisionReason: over.message });
  assert.equal(decide('copilot', { toolName: 'create', toolArgs: { path: 'test/d.test.mjs', content: file(1) }, cwd: root }, ctx).deny, true);
  assert.equal(decide('copilot', { toolName: 'create', toolArgs: { path: 'src/d.mjs', content: file(1) }, cwd: root }, ctx).deny, false);
  const bash = decide('copilot', { toolName: 'bash', toolArgs: { command: heredoc('test/d.test.mjs', file(1)) }, cwd: root }, ctx);
  assert.equal(bash.deny, true, 'a heredoc over the allowance');
  assert.deepEqual(bash.output, { permissionDecision: 'deny', permissionDecisionReason: bash.message });
  assert.equal(decide('copilot', claude('Bash', { command: heredoc('src/d.mjs', file(2)) }, root), ctx).deny, false, 'a non-test heredoc');
  assert.equal(decide('copilot', { toolName: 'bash', toolArgs: { command: `sed -i '' 's/^/test("r", () => {});\\n/' test/a.test.mjs` }, cwd: root }, ctx).deny, true, 'sed -i over the allowance');
  assert.equal(decide('copilot', { toolName: 'bash', toolArgs: { command: 'rm test/a.test.mjs && node --test' }, cwd: root }, ctx).deny, false, 'delete and run');
});

test('without a task in progress, without a vault, and on bad input every call is allowed with exit 0', () => {
  const { root, ctx } = vault({ inProgress: false });
  writeFileSync(join(root, 'test/a.test.mjs'), file(3));
  assert.equal(decide('claude', claude('Write', { file_path: 'test/b.test.mjs', content: file(5) }, root), ctx).deny, false);
  assert.equal(decide('claude', claude('Write', { file_path: 'test/b.test.mjs', content: file(5) }, root), { docs: join(root, 'nowhere'), root }).deny, false);
  assert.equal(decide('claude', null, ctx).deny, false);
  assert.equal(decide('claude', { tool_name: 'Bash', tool_input: { command: 'echo' } }, ctx).deny, false);

  const live = vault();
  writeFileSync(join(live.root, 'test/a.test.mjs'), file(3));
  const run = (host, stdin) => spawnSync(process.execPath, [cli, 'hook', host, '--docs', live.docs], { cwd: live.root, encoding: 'utf8', input: stdin });
  const bad = run('claude', '{not json');
  assert.equal(bad.status, 0);
  assert.equal(bad.stdout, '');
  const denied = run('claude', JSON.stringify(claude('Write', { file_path: 'test/b.test.mjs', content: file(1) }, live.root)));
  assert.equal(denied.status, 0, denied.stderr);
  assert.equal(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision, 'deny');
  const allowed = run('copilot', JSON.stringify(claude('Write', { file_path: 'src/b.mjs', content: 'x' }, live.root)));
  assert.equal(allowed.status, 0);
  assert.equal(allowed.stdout, '');
  const unknown = run('vim', '{}');
  assert.equal(unknown.status, 0);
  assert.equal(unknown.stdout, '');
});
