import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const init = new URL('../skills/sw-init/scripts/init.mjs', import.meta.url).pathname;
const sw = (root, ...args) => spawnSync('node', [join(root, 'docs/.sw/sw.mjs'), ...args], { encoding: 'utf8', cwd: root });
const index = root => readFileSync(join(root, 'docs/index.md'), 'utf8');

function writeTask(root, id, { status = 'todo', deps = [], title = `Task ${id}`, extra = '' } = {}) {
  const frontmatter = `type: task\nid: ${id}\ntitle: ${title}\nstatus: ${status}\ndeps: [${deps.join(', ')}]\n${extra}`;
  writeFileSync(join(root, `docs/tasks/${id}.md`), `---\n${frontmatter}---\n`);
}

// A-01 done, A-02 in progress, A-03 ready, A-04 waiting on two tasks, A-10 and B-02 done, A-05 cancelled.
function vault() {
  const root = mkdtempSync(join(tmpdir(), 'sw-board-'));
  execFileSync('node', [init, '--root', root, '--tasks', '--areas', 'A=App,B=Back']);
  writeTask(root, 'A-01', { status: 'done', extra: 'started: 2026-10-01\nfinished: 2026-10-02\n' });
  writeTask(root, 'A-02', { status: 'in-progress', deps: ['A-01'], title: 'Sign in', extra: 'milestone: M1\nstarted: 2026-10-03\n' });
  writeTask(root, 'A-03', { title: 'Export' });
  writeTask(root, 'A-04', { deps: ['A-02', 'A-03'], title: 'Share a report', extra: 'milestone: M2\n' });
  writeTask(root, 'A-05', { status: 'cancelled' });
  writeTask(root, 'A-10', { status: 'done', extra: 'started: 2026-10-01\nfinished: 2026-10-02\n' });
  writeTask(root, 'B-02', { status: 'done', extra: 'started: 2026-10-01\nfinished: 2026-10-02\n' });
  return root;
}

test('board lists open tasks a line each and finished ones by id, under the title', () => {
  const root = vault();
  const out = sw(root, 'board');
  assert.equal(out.stdout, 'board: docs/index.md updated  ready 1  in-progress 1  blocked 1  done 3\n');
  assert.equal(index(root), [
    '# Index',
    '',
    '<!-- sw:board:start (written by `sw.mjs board`; do not edit) -->',
    '## Tasks',
    '',
    'ready 1 · in progress 1 · blocked 1 · done 3 · cancelled 1',
    '',
    '**In progress**',
    '',
    '- [[A-02]] Sign in · M1',
    '',
    '**Ready**',
    '',
    '- [[A-03]] Export',
    '',
    '**Blocked**',
    '',
    '- [[A-04]] Share a report · M2 · waits on A-02, A-03',
    '',
    '**Done (3)** [[A-01]] [[A-10]] [[B-02]]',
    '<!-- sw:board:end -->',
    '',
    '## Wiki',
    '',
    'Catalog of the wiki: one line per page, `- [[file-name]]: summary`, grouped by type.',
    '',
  ].join('\n'));
  assert.equal(sw(root, 'board').stdout, 'board: docs/index.md unchanged  ready 1  in-progress 1  blocked 1  done 3\n');
  assert.equal(JSON.parse(sw(root, 'board', '--json').stdout).changed, false);
});

test('board replaces only its own section; what the user wrote around it stays', () => {
  const root = vault();
  sw(root, 'board');
  writeFileSync(join(root, 'docs/index.md'), index(root).replace('# Index\n', '# Index\n\nMy note above.\n') + '\n- [[A-03]]: my own line\n');
  writeTask(root, 'A-03', { status: 'in-progress', title: 'Export', extra: 'started: 2026-10-05\n' });
  sw(root, 'board');
  const text = index(root);
  assert.match(text, /^# Index\n\nMy note above\.\n\n<!-- sw:board:start/);
  assert.match(text, /\*\*In progress\*\*\n\n- \[\[A-03\]\] Export\n- \[\[A-02\]\] Sign in · M1\n/, 'running order: fewest unfinished layers below first');
  assert.doesNotMatch(text, /\*\*Ready\*\*/, 'a section with no tasks is left out');
  assert.match(text, /\n- \[\[A-03\]\]: my own line\n$/);
  assert.equal(text.match(/sw:board:start/g).length, 1);
});

test('lint says when the list is missing or out of date, as a warning', () => {
  const root = vault();
  const missing = sw(root, 'lint');
  assert.equal(missing.status, 0);
  assert.match(missing.stdout, /W stale-board {2}docs\/index\.md {2}the task list is out of date; run `node docs\/\.sw\/sw\.mjs board`/);

  sw(root, 'board');
  assert.doesNotMatch(sw(root, 'lint').stdout, /board/);

  writeTask(root, 'A-03', { status: 'done', title: 'Export', extra: 'started: 2026-10-04\nfinished: 2026-10-05\n' });
  assert.match(sw(root, 'lint').stdout, /W stale-board/);

  writeFileSync(join(root, 'docs/index.md'), '# Index\n');
  assert.match(sw(root, 'lint').stdout, /W missing-board {2}docs\/index\.md {2}the tasks are not listed; run/);
});

test('a vault without the task module has no board', () => {
  const root = mkdtempSync(join(tmpdir(), 'sw-board-'));
  execFileSync('node', [init, '--root', root, '--no-tasks']);
  const out = sw(root, 'board');
  assert.equal(out.status, 1);
  assert.match(out.stderr, /this vault has no task module/);
  assert.match(sw(root, 'lint').stdout, /0 errors, 0 warnings/);
});
