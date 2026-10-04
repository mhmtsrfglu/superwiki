import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const migrate = new URL('../skills/sw-migrate/scripts/migrate.mjs', import.meta.url).pathname;
const init = new URL('../skills/sw-init/scripts/init.mjs', import.meta.url).pathname;

const INDEX = `# Work index

| ID | Task | Order | Target | Depends on | State | Start | End | Source | Note |
|---|---|---:|---|---|---|---|---|---|---|
| <a id="b-01"></a>[B-01](tasks/B-backend.md#b-01) | API: "skeleton" | 1 | A1 | — | ✅ Done | 2026-01-01 | 2026-01-02 | [spec](specs/api.md) | First |
| <a id="b-02"></a>[B-02](tasks/B-backend.md#b-02) | Auth | 2 | A1 | [B-01](tasks/B-backend.md#b-01) ✅ | In progress | 2026-01-03 |  |  | See [rules](#rules) |
| <a id="m-01"></a>[M-01](tasks/M-mobile.md#m-01) | Shell | 1 | A2 | [B-01](tasks/B-backend.md#b-01) ✅, ~[B-02](tasks/B-backend.md#b-02) | Not started |  |  |  |  |
`;
const B = `# Backend\n\n## B-01\n\nGoal: skeleton. Code in [backend](../../backend/). Next: [B-02](#b-02).\n\n## B-02\n\nGoal: auth for \`[from, to)\` ranges, after [B-01](B-backend.md#b-01) ✅.\n\n## B-09\n\nMoved.\n`;
const LOG = `# Changelog\n\n| Date | Task | Change |\n|---|---|---|\n| 2026-01-03 | [B-02](index.md#b-02) | B-02 started |\n| 2026-01-02 | [B-01](index.md#b-01) | B-01 done |\n`;
const MAPPING = {
  index: 'index.md',
  columns: { id: 'ID', title: 'Task', status: 'State', deps: 'Depends on', milestone: 'Target', priority: 'Order', started: 'Start', finished: 'End' },
  sections: { Sources: 'Source', Notes: 'Note' },
  status: { 'Not started': 'todo', 'In progress': 'in-progress', Done: 'done' },
  softPrefix: '~',
  details: { dir: 'tasks', heading: '## ' },
  log: { file: 'changelog.md', columns: { date: 'Date', id: 'Task', text: 'Change' } },
};

function project() {
  const root = mkdtempSync(join(tmpdir(), 'sw-migrate-'));
  mkdirSync(join(root, 'docs/tasks'), { recursive: true });
  mkdirSync(join(root, 'docs/specs'), { recursive: true });
  writeFileSync(join(root, 'docs/index.md'), INDEX);
  writeFileSync(join(root, 'docs/tasks/B-backend.md'), B);
  writeFileSync(join(root, 'docs/tasks/M-mobile.md'), '# Mobile\n\n## M-01\n\nShell.\n');
  writeFileSync(join(root, 'docs/changelog.md'), LOG);
  writeFileSync(join(root, 'docs/specs/api.md'), 'Spec for [B-01](../tasks/B-backend.md#b-01) ✅ and [the index](../index.md).\n');
  writeFileSync(join(root, 'mapping.json'), JSON.stringify(MAPPING));
  return root;
}
const run = (root, ...args) => execFileSync('node', [migrate, '--mapping', join(root, 'mapping.json'), '--docs', join(root, 'docs'), ...args], { encoding: 'utf8' });
const read = (root, p) => readFileSync(join(root, p), 'utf8');

test('dry run reports counts and writes nothing', () => {
  const root = project();
  const out = run(root, '--dry-run');
  assert.match(out, /tasks: 3 {2}done 1 {2}in-progress 1 {2}todo 1/);
  assert.match(out, /areas: B, M/);
  assert.ok(!existsSync(join(root, 'docs/tasks/B-01.md')));
  assert.equal(read(root, 'docs/index.md'), INDEX);
});

test('converts rows and details into task files and yields a lint-clean vault', () => {
  const root = project();
  const out = run(root);
  const b1 = read(root, 'docs/tasks/B-01.md');
  assert.match(b1, /^---\ntype: task\nid: B-01\ntitle: 'API: "skeleton"'\nstatus: done\ndeps: \[\]\nmilestone: A1\npriority: 1\nstarted: 2026-01-01\nfinished: 2026-01-02\n---\n\n/);
  assert.match(b1, /Code in \[backend\]\(\.\.\/\.\.\/backend\/\)\. Next: \[\[B-02\]\]\./);
  assert.match(b1, /## Sources\n\n\[spec\]\(\.\.\/specs\/api\.md\)/);
  const m1 = read(root, 'docs/tasks/M-01.md');
  assert.match(m1, /deps: \[B-01\]\nsoft_deps: \[B-02\]/);
  assert.match(read(root, 'docs/tasks/B-02.md'), /auth for `\[from, to\)` ranges, after \[\[B-01\]\]\.\n/);
  assert.match(read(root, 'docs/log.md'), /## \[2026-01-02\] task \| B-01\n\nB-01 done\n\n## \[2026-01-03\] task \| B-02/);
  assert.equal(read(root, 'docs/specs/api.md'), 'Spec for [[B-01]] and [the index](../legacy/index.md).\n');
  assert.ok(existsSync(join(root, 'docs/legacy/tasks/B-backend.md')));
  assert.match(out, /detail sections without a table row[^\n]*\(1\)/);

  execFileSync('node', [init, '--root', root, '--tasks', '--areas', 'B=Backend,M=Mobile']);
  const lint = spawnSync('node', [join(root, 'docs/.sw/sw.mjs'), 'lint'], { encoding: 'utf8' });
  assert.equal(lint.status, 0, lint.stdout);
  const status = spawnSync('node', [join(root, 'docs/.sw/sw.mjs'), 'status', '--json'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(status.stdout).total, { total: 3, ready: 1, progress: 1, blocked: 0, done: 1, cancelled: 0 });
});

test('refuses an existing vault and reports unknown statuses', () => {
  const root = project();
  writeFileSync(join(root, 'docs/index.md'), INDEX.replace('In progress', 'Paused'));
  assert.match(run(root, '--dry-run'), /B-02: status "Paused" is not in the mapping/);
  mkdirSync(join(root, 'docs/.sw'));
  mkdirSync(join(root, 'docs/legacy/tasks'), { recursive: true });
  assert.match(run(root, '--dry-run'), /tasks: 3/, 'empty leftover folders do not block');
  writeFileSync(join(root, 'docs/.sw/config.json'), '{}');
  assert.equal(spawnSync('node', [migrate, '--mapping', join(root, 'mapping.json'), '--docs', join(root, 'docs')]).status, 2);
});
