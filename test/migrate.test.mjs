import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const migrate = new URL('../skills/sw-migrate/scripts/migrate.mjs', import.meta.url).pathname;
const init = new URL('../skills/sw-init/scripts/init.mjs', import.meta.url).pathname;

const INDEX = `# Work index

| ID | Task | Order | Target | Depends on | Review | State | Start | End | Source | Note |
|---|---|---:|---|---|---|---|---|---|---|---|
| <a id="b-01"></a>[B-01](tasks/B-backend.md#b-01) | API: "skeleton" | 1 | A1 | — | — | ✅ Done | 2026-01-01 | 2026-01-02 | [spec](specs/api.md) | First |
| <a id="b-02"></a>[B-02](tasks/B-backend.md#b-02) | Auth | 2 | A1 | [B-01](tasks/B-backend.md#b-01) ✅ | security | In progress | 2026-01-03 |  |  | See [rules](#rules) |
| <a id="m-01"></a>[M-01](tasks/M-mobile.md#m-01) | Shell | 1 | A2 | [B-01](tasks/B-backend.md#b-01) ✅, ~[B-02](tasks/B-backend.md#b-02) | — | Not started |  |  |  |  |
`;
const BACKEND = [
  '# Backend',
  '## B-01',
  'Goal: skeleton. Code in [backend](../../backend/). Next: [B-02](#b-02).',
  '## B-02',
  'Goal: auth for `[from, to)` ranges, after [B-01](B-backend.md#b-01) ✅.',
  '## B-09',
  'Moved.',
].join('\n\n') + '\n';
const CHANGELOG = [
  '# Changelog',
  '',
  '| Date | Task | Change |',
  '|---|---|---|',
  '| 2026-01-03 | [B-02](index.md#b-02) | B-02 started |',
  '| 2026-01-02 | [B-01](index.md#b-01) | B-01 done |',
  '',
].join('\n');
const MAPPING = {
  index: 'index.md',
  columns: { id: 'ID', title: 'Task', status: 'State', deps: 'Depends on', milestone: 'Target', priority: 'Order', started: 'Start', finished: 'End' },
  fields: { review: 'Review' },
  sections: { Sources: 'Source', Notes: 'Note' },
  status: { 'Not started': 'todo', 'In progress': 'in-progress', Done: 'done' },
  softPrefix: '~',
  details: { dir: 'tasks', heading: '## ' },
  log: { file: 'changelog.md', columns: { date: 'Date', id: 'Task', text: 'Change' } },
};

function project({ index = INDEX, mapping = MAPPING } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sw-migrate-'));
  mkdirSync(join(root, 'docs/tasks'), { recursive: true });
  mkdirSync(join(root, 'docs/specs'), { recursive: true });
  writeFileSync(join(root, 'docs/index.md'), index);
  writeFileSync(join(root, 'docs/tasks/B-backend.md'), BACKEND);
  writeFileSync(join(root, 'docs/tasks/M-mobile.md'), '# Mobile\n\n## M-01\n\nShell.\n');
  writeFileSync(join(root, 'docs/changelog.md'), CHANGELOG);
  writeFileSync(join(root, 'docs/specs/api.md'), 'Spec for [B-01](../tasks/B-backend.md#b-01) ✅ and [the index](../index.md).\n');
  writeFileSync(join(root, 'mapping.json'), JSON.stringify(mapping));
  return root;
}

const cli = (root, ...args) => spawnSync('node', [migrate, '--docs', join(root, 'docs'), ...args], { encoding: 'utf8' });
const convert = (root, ...args) => execFileSync('node', [migrate, '--mapping', join(root, 'mapping.json'), '--docs', join(root, 'docs'), ...args], { encoding: 'utf8' });
const read = (root, path) => readFileSync(join(root, path), 'utf8');

test('inspect names the task tables, their status values and the detail headings', () => {
  const out = cli(project(), '--inspect').stdout;
  assert.match(out, /index\.md \(\d+ KB\)\n {2}line 3: 3 rows, ids in "ID" \| ID \| Task/);
  assert.match(out, /tasks\/B-backend\.md \(\d+ KB\)\n {2}3 task headings like "## B-01" \(details heading: "## "\)/);
  assert.match(out, /note: docs\/tasks\/ exists \(2 files\)/);
});

test('dry run reports counts and writes nothing', () => {
  const root = project();
  const out = convert(root, '--dry-run');
  assert.match(out, /^DRY RUN, nothing written\ntasks: 3 {2}done 1 {2}in-progress 1 {2}todo 1\nareas: B, M\n/);
  assert.match(out, /\nno problems\n/);
  assert.ok(!existsSync(join(root, 'docs/tasks/B-01.md')));
  assert.equal(read(root, 'docs/index.md'), INDEX);
});

test('converts rows and details into task files and yields a lint-clean vault', () => {
  const root = project();
  const out = convert(root);

  const b1 = read(root, 'docs/tasks/B-01.md');
  assert.match(b1, /^---\ntype: task\nid: B-01\ntitle: 'API: "skeleton"'\nstatus: done\ndeps: \[\]\nmilestone: A1\npriority: 1\nstarted: 2026-01-01\nfinished: 2026-01-02\n---\n\n/);
  assert.match(b1, /Code in \[backend\]\(\.\.\/\.\.\/backend\/\)\. Next: \[\[B-02\]\]\./);
  assert.match(b1, /## Sources\n\n\[spec\]\(\.\.\/specs\/api\.md\)/);
  assert.match(read(root, 'docs/tasks/M-01.md'), /deps: \[B-01\]\nsoft_deps: \[B-02\]/);

  const b2 = read(root, 'docs/tasks/B-02.md');
  assert.match(b2, /\npriority: 2\nreview: security\nstarted: 2026-01-03\n/, 'a mapped column becomes a frontmatter field');
  assert.doesNotMatch(b1, /review:/, 'a dash is an empty value');
  assert.match(b2, /auth for `\[from, to\)` ranges, after \[\[B-01\]\]\.\n/);

  assert.match(read(root, 'docs/log.md'), /## \[2026-01-02\] task \| B-01\n\nB-01 done\n\n## \[2026-01-03\] task \| B-02/);
  assert.equal(read(root, 'docs/specs/api.md'), 'Spec for [[B-01]] and [the index](../legacy/index.md).\n');
  assert.match(read(root, 'docs/legacy/tasks/B-backend.md'), /Code in \[backend\]\(\.\.\/\.\.\/\.\.\/backend\/\)/, 'an archived file keeps working links to files that stayed');
  assert.match(out, /detail sections without a table row[^\n]*\(1\)/);

  execFileSync('node', [init, '--root', root, '--tasks', '--areas', 'B=Backend,M=Mobile']);
  const lint = spawnSync('node', [join(root, 'docs/.sw/sw.mjs'), 'lint'], { encoding: 'utf8' });
  assert.equal(lint.status, 0, lint.stdout);
  const status = spawnSync('node', [join(root, 'docs/.sw/sw.mjs'), 'status', '--json'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(status.stdout).total, { total: 3, ready: 1, progress: 1, blocked: 0, done: 1, cancelled: 0 });
});

test('a file already in a folder Superwiki uses is a problem until it is archived', () => {
  const root = project();
  mkdirSync(join(root, 'docs/plans/old'), { recursive: true });
  writeFileSync(join(root, 'docs/plans/old/v1.md'), 'Old plan, see [the index](../../index.md) and [the spec](../../specs/api.md).\n');
  assert.match(convert(root, '--dry-run'), /PROBLEMS[^\n]*\(1\):\n {2}docs\/plans\/old\/v1\.md is in a folder Superwiki uses/);

  writeFileSync(join(root, 'mapping.json'), JSON.stringify({ ...MAPPING, archiveAlso: ['plans/old'] }));
  assert.match(convert(root), /\nno problems\n/);
  assert.ok(!existsSync(join(root, 'docs/plans')), 'the emptied folder is removed');
  assert.equal(read(root, 'docs/legacy/plans/old/v1.md'), 'Old plan, see [the index](../../index.md) and [the spec](../../../specs/api.md).\n');
});

test('problems: unknown status, unknown dependency, missing archiveAlso path', () => {
  const index = INDEX.replace('In progress', 'Paused').replace('— | — | ✅ Done', '[X-99](tasks/B-backend.md#x-99) | — | ✅ Done');
  const root = project({ index, mapping: { ...MAPPING, archiveAlso: ['nowhere'] } });
  const out = convert(root, '--dry-run');
  assert.match(out, /B-02: status "Paused" is not in the mapping/);
  assert.match(out, /B-01 depends on X-99, which is not in the index/);
  assert.match(out, /archiveAlso: docs\/nowhere does not exist/);
});

test('refuses an existing vault, a used archive folder and a broken mapping', () => {
  const root = project();
  mkdirSync(join(root, 'docs/.sw'));
  mkdirSync(join(root, 'docs/legacy/tasks'), { recursive: true });
  assert.match(convert(root, '--dry-run'), /tasks: 3/, 'empty leftover folders do not block');

  writeFileSync(join(root, 'docs/legacy/tasks/kept.md'), 'x');
  assert.match(cli(root, '--mapping', join(root, 'mapping.json')).stderr, /docs\/legacy has files in it/);

  writeFileSync(join(root, 'docs/.sw/config.json'), '{}');
  const vault = cli(root, '--mapping', join(root, 'mapping.json'));
  assert.equal(vault.status, 2);
  assert.match(vault.stderr, /already a Superwiki vault/);

  const bad = project({ mapping: { index: 'index.md', columns: { id: 'ID' }, fields: { status: 'State' } } });
  assert.match(cli(bad, '--mapping', join(bad, 'mapping.json')).stderr, /the mapping lacks: status, columns\.title, columns\.status/);
});
