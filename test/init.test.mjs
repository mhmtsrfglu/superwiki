import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const init = new URL('../skills/sw-init/scripts/init.mjs', import.meta.url).pathname;
const run = (root, ...args) => execFileSync('node', [init, '--root', root, ...args], { encoding: 'utf8' });
const sw = (root, ...args) => spawnSync('node', [join(root, 'docs/.sw/sw.mjs'), ...args], { encoding: 'utf8', cwd: root });
const fresh = () => mkdtempSync(join(tmpdir(), 'sw-init-'));
const read = (root, path) => readFileSync(join(root, path), 'utf8');

test('new vault with tasks: files, config, clean lint', () => {
  const root = fresh();
  run(root, '--tasks', '--areas', 'M=Mobile,B=Backend');
  const expected = [
    'docs/index.md', 'docs/log.md', 'docs/raw/assets', 'docs/wiki', 'docs/tasks', 'docs/plans', 'docs/viewer.html',
    'docs/.sw/sw.mjs', 'docs/.sw/templates/task.md', 'docs/.sw/templates/plan.md', 'docs/.sw/templates/guide.md',
    'AGENTS.md', 'CLAUDE.md',
  ];
  for (const path of expected) assert.ok(existsSync(join(root, path)), path);

  const config = JSON.parse(read(root, 'docs/.sw/config.json'));
  assert.deepEqual(config.areas, { M: 'Mobile', B: 'Backend' });
  assert.deepEqual(config.models, { plan: {}, implement: {}, review: {} });
  assert.match(config.name, /^sw-init-/);
  assert.equal(read(root, 'docs/.sw/.gitignore'), 'data.js\nserver.json\n');
  assert.equal(read(root, 'CLAUDE.md'), '@AGENTS.md\n');

  const lint = sw(root, 'lint');
  assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  assert.match(lint.stdout, /0 errors, 0 warnings/);
});

test('schema block with tasks: wiki, task and skill rules, no template markers', () => {
  const root = fresh();
  run(root, '--tasks');
  const agents = read(root, 'AGENTS.md');
  assert.doesNotMatch(agents, /\{\{/);
  assert.match(agents, /docs\/tasks\/<ID>\.md/);
  assert.match(agents, /\n\nTasks:\n\n- A task's status/);
  assert.match(agents, /Work that belongs to no task .* one `change` entry/);
  assert.match(agents, /Implementing a task: `sw-implement`/);
  assert.match(agents, /`sw-triage` first/);
});

test('wiki-only vault leaves the task module out', () => {
  const root = fresh();
  run(root, '--no-tasks');
  assert.ok(!existsSync(join(root, 'docs/tasks')));
  assert.ok(!existsSync(join(root, 'docs/.sw/templates/task.md')));
  const agents = read(root, 'AGENTS.md');
  assert.doesNotMatch(agents, /tasks\/<ID>|Tasks:|sw-plan|sw-implement|sw-explain/);
  assert.match(agents, /sw\.mjs search/);
  assert.match(agents, /`sw-ingest`/);
  assert.match(agents, /When you change the project, append one `change` entry/);
});

test('re-run keeps user content and choices, and replaces only the managed block', () => {
  const root = fresh();
  writeFileSync(join(root, 'AGENTS.md'), '# Mine\n\nMy rule.\n');
  writeFileSync(join(root, 'CLAUDE.md'), '# Claude\n');
  run(root, '--tasks', '--areas', 'M=Mobile');
  writeFileSync(join(root, 'docs/index.md'), '# Index\n- [[alpha]]: a\n');
  writeFileSync(join(root, 'docs/wiki/alpha.md'), '---\ntype: concept\nsummary: a\n---\n');

  const out = run(root);
  assert.equal(read(root, 'docs/index.md'), '# Index\n- [[alpha]]: a\n');
  assert.deepEqual(JSON.parse(read(root, 'docs/.sw/config.json')).areas, { M: 'Mobile' });
  const agents = read(root, 'AGENTS.md');
  assert.match(agents, /^# Mine\n\nMy rule\./);
  assert.equal(agents.match(/<!-- sw:start/g).length, 1);
  assert.equal(read(root, 'CLAUDE.md'), '# Claude\n');
  assert.match(out, /note\s+CLAUDE\.md does not mention AGENTS\.md/);
  for (const unchanged of ['docs/.sw/sw.mjs', 'docs/.sw/config.json', 'AGENTS.md']) assert.match(out, new RegExp(`unchanged ${unchanged.replace(/[./]/g, '\\$&')}`));
});

test('content that was in docs/ before is left alone and reported', () => {
  const root = fresh();
  mkdirSync(join(root, 'docs/superpowers/plans'), { recursive: true });
  writeFileSync(join(root, 'docs/index.md'), 'old index\n');
  writeFileSync(join(root, 'docs/superpowers/plans/x.md'), '[[nowhere]]\n');
  const out = run(root, '--tasks');
  assert.equal(read(root, 'docs/index.md'), 'old index\n');
  assert.match(out, /docs\/ already had content \(superpowers\)\. It was left untouched and is outside the vault\. If it holds a task index, sw-migrate converts it\./);
  assert.equal(sw(root, 'lint').status, 0, 'foreign folders are not linted');
});

test('after a migration the hint to migrate is not repeated', () => {
  const root = fresh();
  mkdirSync(join(root, 'docs/tasks'), { recursive: true });
  mkdirSync(join(root, 'docs/legacy'), { recursive: true });
  const out = run(root, '--tasks');
  assert.match(out, /already had content \(legacy\)/);
  assert.doesNotMatch(out, /sw-migrate/);
});

test('usage errors exit with 2', () => {
  const noChoice = spawnSync('node', [init, '--root', fresh()], { encoding: 'utf8' });
  assert.equal(noChoice.status, 2);
  assert.match(noChoice.stderr, /say --tasks or --no-tasks/);
  const badArea = spawnSync('node', [init, '--root', fresh(), '--tasks', '--areas', '1x=Bad'], { encoding: 'utf8' });
  assert.equal(badArea.status, 2);
  assert.match(badArea.stderr, /bad area id "1x"/);
});
