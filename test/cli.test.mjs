import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const init = new URL('../skills/init/scripts/init.mjs', import.meta.url).pathname;
const sw = (root, ...args) => spawnSync('node', [join(root, 'docs/.sw/sw.mjs'), ...args], { encoding: 'utf8', cwd: root });
const read = (root, path) => readFileSync(join(root, path), 'utf8');

function writeTask(root, id, { status = 'todo', deps = [], extra = '' } = {}) {
  const frontmatter = `type: task\nid: ${id}\ntitle: Task ${id}\nstatus: ${status}\ndeps: [${deps.join(', ')}]\n${extra}`;
  writeFileSync(join(root, `docs/tasks/${id}.md`), `---\n${frontmatter}---\n`);
}

// A vault with T-01 ready and T-02 waiting on it.
function vault() {
  const root = mkdtempSync(join(tmpdir(), 'sw-cli-'));
  execFileSync('node', [init, '--root', root, '--tasks']);
  writeTask(root, 'T-01');
  writeTask(root, 'T-02', { deps: ['T-01'] });
  return root;
}

test('status and ready', () => {
  const root = vault();
  assert.match(sw(root, 'status').stdout, /total 2 {2}ready 1 {2}in-progress 0 {2}blocked 1/);
  assert.match(sw(root, 'ready').stdout, /^in progress \(0\)\nready \(1\)\nT-01 {2}Task T-01\n$/);
  assert.deepEqual(JSON.parse(sw(root, 'ready', '--json').stdout).ready.map(task => task.id), ['T-01']);
});

test('next-id', () => {
  const root = vault();
  assert.equal(sw(root, 'next-id', 'T').stdout.trim(), 'T-03');
  assert.equal(sw(root, 'next-id', 'M').stdout.trim(), 'M-01');
  assert.equal(sw(root, 'next-id').status, 2);
});

test('check: start and finish gates, draft plan, required review', () => {
  const root = vault();
  assert.match(sw(root, 'check', 'T-01').stdout, /^T-01 {2}todo {2}Task T-01\ncan start: yes\ncan finish: no\ndone when: 0 items\nsummary: none\nplan: none\nreview: not required\n$/);
  assert.match(sw(root, 'check', 'T-02').stdout, /can start: no {2}open deps: T-01/);
  assert.equal(JSON.parse(sw(root, 'check', 'T-01', '--json').stdout).canStart, true);

  writeFileSync(join(root, 'docs/plans/T-01-plan.md'), '---\ntype: plan\ntask: T-01\nstatus: draft\n---\n');
  assert.match(sw(root, 'check', 'T-01').stdout, /plan: docs\/plans\/T-01-plan\.md {2}\(draft, not approved\)/);

  writeTask(root, 'T-03', { status: 'in-progress', deps: ['T-01'], extra: 'review: security\n' });
  const started = sw(root, 'check', 'T-03').stdout;
  assert.match(started, /can start: n\/a, status is in-progress {2}open deps: T-01/);
  assert.match(started, /review: required \(security\)/);
  assert.equal(sw(root, 'check', 'T-99').status, 2);
});

test('check: finishing needs a summary with every "Done when" item verified', () => {
  const root = vault();
  const frontmatter = '---\ntype: task\nid: T-01\ntitle: Task T-01\nstatus: in-progress\ndeps: []\n---\n';
  const write = body => writeFileSync(join(root, 'docs/tasks/T-01.md'), frontmatter + body);

  write('## Done when\n- It works.\n\n## Summary\n\n### Verification\n1. **verified**: It works.\n   - command: `npm test`\n');
  assert.match(sw(root, 'check', 'T-01').stdout, /\ncan finish: yes\ndone when: 1 item\nsummary: 1 verified\n/);
  assert.deepEqual(JSON.parse(sw(root, 'check', 'T-01', '--json').stdout).summary, { items: 1, verified: 1, unverified: 0, failed: 0, complete: true });

  write('## Done when\n- It works.\n- It is documented.\n\n## Summary\n\n### Verification\n1. **verified**: It works.\n2. **unverified**: It is documented.\n');
  assert.match(sw(root, 'check', 'T-01').stdout, /\ncan finish: no\ndone when: 2 items\nsummary: 1 verified, 1 unverified\n/);
  const json = JSON.parse(sw(root, 'check', 'T-01', '--json').stdout);
  assert.equal(json.canFinish, false);
  assert.equal(json.summary.complete, false);

  assert.equal(JSON.parse(sw(root, 'check', 'T-02', '--json').stdout).summary, null);
});

// The skills judge a task's size and number its verification entries by this count.
test('check: counts the top-level "Done when" items', () => {
  const root = vault();
  const frontmatter = '---\ntype: task\nid: T-01\ntitle: Task T-01\nstatus: todo\ndeps: []\n---\n';
  const write = body => writeFileSync(join(root, 'docs/tasks/T-01.md'), frontmatter + body);
  const line = () => sw(root, 'check', 'T-01').stdout.split('\n').find(l => l.startsWith('done when:'));

  write('## Goal\nShip it.\n');
  assert.equal(line(), 'done when: 0 items', 'no "Done when" section');

  write('## Done when\n- First.\n  - a detail of the first, not an item\n* Second.\n+ Third.\n\n## Notes\n- A note, not an item.\n');
  assert.equal(line(), 'done when: 3 items', 'top-level bullets of the section only');
  assert.equal(JSON.parse(sw(root, 'check', 'T-01', '--json').stdout).doneWhen, 3);

  write('## Done when\n- Only one.\n');
  assert.equal(line(), 'done when: 1 item');
});

test('explain: dependencies, what it unblocks, area guide', () => {
  const root = vault();
  const before = sw(root, 'explain', 'T-01').stdout;
  assert.match(before, /^T-01 {2}Task T-01\nstate: ready \(status: todo\)\ndepends on: none\nblocks:\n {2}T-02 \(blocked\) Task T-02\nfinishing it makes ready: T-02\n/);
  assert.match(before, /area guide: none/);

  writeFileSync(join(root, 'docs/wiki/guide-t.md'), '---\ntype: guide\narea: T\nsummary: How to work here.\n---\n');
  assert.match(sw(root, 'explain', 'T-01').stdout, /area guide: docs\/wiki\/guide-t\.md/);
});

test('search: pages by match, with the task state', () => {
  const root = vault();
  const out = sw(root, 'search', 'Task', 'T-02').stdout;
  assert.match(out, /^pages \(2\)[^\n]*\ndocs\/tasks\/T-02\.md {2}\[task blocked\]/);
  assert.equal(sw(root, 'search').status, 2);
});

test('lint: exit code follows errors', () => {
  const root = vault();
  assert.equal(sw(root, 'lint').status, 0);
  writeTask(root, 'T-03', { status: 'in-progress', deps: ['T-01'] });
  const lint = sw(root, 'lint');
  assert.equal(lint.status, 1);
  assert.match(lint.stdout, /E started-before-deps {2}docs\/tasks\/T-03\.md/);
});

// The skill is sw:index and the command is `index`; `board`, the name it had before, still works.
test('index rewrites the task list, and board does the same under its old name', () => {
  const root = vault();
  writeFileSync(join(root, 'docs/index.md'), '# Index\n');
  const index = sw(root, 'index');
  assert.equal(index.status, 0, index.stderr);
  assert.match(index.stdout, /^index: docs\/index\.md updated {2}ready 1 {2}in-progress 0 {2}blocked 1 {2}done 0\n$/);
  assert.match(read(root, 'docs/index.md'), /\[\[T-01\]\]/);
  const board = sw(root, 'board');
  assert.equal(board.status, 0, board.stderr);
  assert.match(board.stdout, /^index: docs\/index\.md unchanged {2}ready 1/);
  const help = sw(root, 'help').stdout;
  assert.match(help, /^ {2}index /m);
  assert.doesNotMatch(help, /^ {2}board /m, 'help lists the new name only');
});

// The skill is sw:usage and the command is `usage`; `stats` still works. A scratch vault has no
// session record, so both answer with the same refusal.
test('usage answers as stats does, under its own name', () => {
  const root = vault();
  const usage = sw(root, 'usage');
  const stats = sw(root, 'stats');
  assert.equal(usage.status, 1, usage.stderr);
  assert.match(usage.stderr, /^no agent session record found for /);
  assert.equal(stats.status, usage.status);
  assert.equal(stats.stderr, usage.stderr);
  assert.match(sw(root, 'usage', '--tool', 'cursor').stderr, /^usage: sw usage \[--session <id>\]/);
  const help = sw(root, 'help').stdout;
  assert.match(help, /^ {2}usage /m);
  assert.doesNotMatch(help, /^ {2}stats /m, 'help lists the new name only');
});

test('snapshot writes the vault as a script the viewer can load', () => {
  const root = vault();
  assert.match(sw(root, 'snapshot').stdout, /snapshot: 4 files -> docs\/\.sw\/data\.js/);
  assert.match(read(root, 'docs/.sw/data.js'), /^window\.SW_DATA = \{"name":"sw-cli-/);
});

test('serve: starts once, is reused, reads files live, refuses other hosts', async () => {
  const root = vault();
  const url = sw(root, 'serve').stdout.trim();
  try {
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.equal(sw(root, 'serve').stdout.trim(), url, 'the second call reuses the running server');
    assert.match(await (await fetch(url)).text(), /<title>/);

    const data = async () => {
      const script = await (await fetch(`${url}.sw/data.js`)).text();
      return JSON.parse(script.replace(/^window\.SW_DATA = /, '').replace(/;\n$/, ''));
    };
    const first = await data();
    assert.equal(first.live, true);
    assert.ok(first.files.some(file => file.path === 'tasks/T-01.md' && file.text.includes('status: todo')));
    writeTask(root, 'T-01', { status: 'done' });
    assert.ok((await data()).files.some(file => file.text.includes('status: done')), 'a later request sees the change');

    const status = await new Promise(resolve => {
      request({ host: '127.0.0.1', port: new URL(url).port, path: '/', headers: { host: 'evil.example' } }, res => resolve(res.statusCode)).end();
    });
    assert.equal(status, 403);
  } finally {
    process.kill(JSON.parse(read(root, 'docs/.sw/server.json')).pid);
  }
});

test('unknown command and help', () => {
  const root = vault();
  assert.equal(sw(root, 'bogus').status, 2);
  assert.match(sw(root, 'help').stdout, /^sw <command>/);
});
