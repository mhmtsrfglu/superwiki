import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const init = new URL('../skills/sw-init/scripts/init.mjs', import.meta.url).pathname;
const run = (root, ...args) => execFileSync('node', [init, '--root', root, ...args], { encoding: 'utf8' });
const sw = (root, ...args) => spawnSync('node', [join(root, 'docs/.sw/sw.mjs'), ...args], { encoding: 'utf8', cwd: root });
const fresh = () => mkdtempSync(join(tmpdir(), 'sw-init-'));
const read = (root, p) => readFileSync(join(root, p), 'utf8');

test('new vault with tasks: files, schema block, clean lint', () => {
  const root = fresh();
  run(root, '--tasks', '--areas', 'M=Mobile,B=Backend');
  for (const p of ['docs/index.md', 'docs/log.md', 'docs/raw/assets', 'docs/wiki', 'docs/tasks', 'docs/plans', 'docs/.sw/sw.mjs', 'docs/.sw/templates/task.md', 'AGENTS.md', 'CLAUDE.md']) assert.ok(existsSync(join(root, p)), p);
  assert.deepEqual(JSON.parse(read(root, 'docs/.sw/config.json')).areas, { M: 'Mobile', B: 'Backend' });
  assert.match(JSON.parse(read(root, 'docs/.sw/config.json')).name, /^sw-init-/);
  const agents = read(root, 'AGENTS.md');
  assert.match(agents, /docs\/tasks\/<ID>\.md/);
  assert.doesNotMatch(agents, /\{\{/);
  assert.equal(read(root, 'CLAUDE.md'), '@AGENTS.md\n');
  const lint = sw(root, 'lint');
  assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  assert.match(lint.stdout, /0 errors, 0 warnings/);
  assert.equal(sw(root, 'next-id', 'M').stdout.trim(), 'M-01');
});

test('wiki-only vault leaves the task module out', () => {
  const root = fresh();
  run(root, '--no-tasks');
  assert.ok(!existsSync(join(root, 'docs/tasks')));
  assert.ok(!existsSync(join(root, 'docs/.sw/templates/task.md')));
  const agents = read(root, 'AGENTS.md');
  assert.doesNotMatch(agents, /tasks\/<ID>/);
  assert.match(agents, /sw\.mjs search/);
});

test('re-run keeps user content and config, replaces only the managed block', () => {
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
  assert.match(out, /note\s+CLAUDE\.md/);
  assert.match(out, /unchanged docs\/\.sw\/sw\.mjs/);
  assert.match(out, /unchanged docs\/\.sw\/config\.json/);
  assert.match(out, /unchanged AGENTS\.md/);
});

test('existing docs content is left alone and reported', () => {
  const root = fresh();
  mkdirSync(join(root, 'docs/superpowers/plans'), { recursive: true });
  writeFileSync(join(root, 'docs/index.md'), 'old index\n');
  writeFileSync(join(root, 'docs/superpowers/plans/x.md'), '[[nowhere]]\n');
  const out = run(root, '--tasks');
  assert.equal(read(root, 'docs/index.md'), 'old index\n');
  assert.match(out, /already had content/);
  assert.equal(sw(root, 'lint').status, 0);
});

test('refuses to guess the task module on a new vault', () => {
  const r = spawnSync('node', [init, '--root', fresh()], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});

test('cli: status, ready, check and lint exit code', () => {
  const root = fresh();
  run(root, '--tasks');
  const t = (id, status, deps) => writeFileSync(join(root, `docs/tasks/${id}.md`), `---\ntype: task\nid: ${id}\ntitle: Task ${id}\nstatus: ${status}\ndeps: [${deps}]\n---\n`);
  t('T-01', 'todo', '');
  t('T-02', 'todo', 'T-01');
  assert.match(sw(root, 'status').stdout, /total 2 {2}ready 1 {2}in-progress 0 {2}blocked 1/);
  assert.match(sw(root, 'ready').stdout, /ready \(1\)\nT-01 {2}Task T-01/);
  assert.match(sw(root, 'check', 'T-02').stdout, /can start: no {2}open deps: T-01/);
  assert.match(sw(root, 'check', 'T-01').stdout, /can start: yes/);
  assert.equal(JSON.parse(sw(root, 'check', 'T-01', '--json').stdout).canStart, true);
  const explain = sw(root, 'explain', 'T-01').stdout;
  assert.match(explain, /depends on: none\nblocks:\n {2}T-02 \(blocked\) Task T-02\nfinishing it makes ready: T-02/);
  assert.match(sw(root, 'search', 'Task', 'T-02').stdout, /pages \(2\)[^\n]*\ndocs\/tasks\/T-02\.md {2}\[task blocked\]/);
  assert.match(sw(root, 'snapshot').stdout, /snapshot: 4 files/);
  const snap = read(root, 'docs/.sw/data.js');
  assert.match(snap, /^window\.SW_DATA = \{"name":"sw-init-/);
  assert.equal(read(root, 'docs/.sw/.gitignore'), 'data.js\nserver.json\n');
  t('T-03', 'in-progress', 'T-01');
  assert.match(sw(root, 'check', 'T-03').stdout, /can start: n\/a, status is in-progress {2}open deps: T-01/);
  const lint = sw(root, 'lint');
  assert.equal(lint.status, 1);
  assert.match(lint.stdout, /E started-before-deps {2}docs\/tasks\/T-03\.md/);
});

test('serve: starts once, is reused, serves the viewer and live data, refuses other hosts', async () => {
  const root = fresh();
  run(root, '--tasks');
  writeFileSync(join(root, 'docs/tasks/T-01.md'), '---\ntype: task\nid: T-01\ntitle: First\nstatus: todo\ndeps: []\n---\n');
  const url = sw(root, 'serve').stdout.trim();
  try {
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.equal(sw(root, 'serve').stdout.trim(), url, 'second call reuses the running server');
    assert.match(await (await fetch(url)).text(), /<title>/);
    const data = async () => JSON.parse((await (await fetch(`${url}.sw/data.js`)).text()).replace(/^window\.SW_DATA = /, '').replace(/;\n$/, ''));
    const first = await data();
    assert.equal(first.live, true);
    assert.ok(first.files.some(f => f.path === 'tasks/T-01.md' && f.text.includes('status: todo')));
    writeFileSync(join(root, 'docs/tasks/T-01.md'), '---\ntype: task\nid: T-01\ntitle: First\nstatus: done\ndeps: []\n---\n');
    assert.ok((await data()).files.some(f => f.text.includes('status: done')), 'reads files live');
    const port = new URL(url).port;
    const { request } = await import('node:http');
    const status = await new Promise(res => request({ host: '127.0.0.1', port, path: '/', headers: { host: 'evil.example' } }, r => res(r.statusCode)).end());
    assert.equal(status, 403);
  } finally {
    process.kill(JSON.parse(read(root, 'docs/.sw/server.json')).pid);
  }
});
