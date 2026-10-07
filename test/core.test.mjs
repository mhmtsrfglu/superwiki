import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, extractWikilinks, buildVault, lint, summary, tasksIn, nextId, taskOf, search, unblockedBy, guideFor, closingSummary } from '../src/core.js';

const task = (id, fields = {}, body = '') => ({
  path: `tasks/${id}.md`,
  text: `---\ntype: task\nid: ${id}\ntitle: Task ${id}\nstatus: ${fields.status ?? 'todo'}\ndeps: [${(fields.deps ?? []).join(', ')}]\nsoft_deps: [${(fields.soft ?? []).join(', ')}]\n${fields.extra ?? ''}---\n${body}`,
});
const page = (name, body = '', fm = 'type: concept\nsummary: About it.') => ({ path: `wiki/${name}.md`, text: `---\n${fm}\n---\n${body}` });
const index = (...names) => ({ path: 'index.md', text: `# Index\n${names.map(n => `- [[${n}]]: x`).join('\n')}\n` });
const codes = files => lint(buildVault(files)).map(f => f.code);

test('frontmatter: scalars, inline and block lists, comments, empty values', () => {
  const { data, body, bodyLine } = parseFrontmatter('---\ntitle: "A: b"\nstatus: todo   # todo | done\ndeps: [B-01, B-02]\nsoft_deps:\n  - M-03\n  - "[[M-04]]"\nfinished:\n---\nBody\n');
  assert.deepEqual(data, { title: 'A: b', status: 'todo', deps: ['B-01', 'B-02'], soft_deps: ['M-03', 'M-04'], finished: null });
  assert.equal(body, 'Body\n');
  assert.equal(bodyLine, 10);
  assert.equal(parseFrontmatter('no frontmatter').data, null);
  assert.deepEqual(parseFrontmatter('---\na: "say \\"hi\\""\nb: \'it\'\'s "x"\'\n---\n').data, { a: 'say "hi"', b: 'it\'s "x"' });
});

test('wikilinks: alias, heading, code and attachments are handled', () => {
  const links = extractWikilinks('See [[a-page|the page]] and [[b-page#Part]].\n`[[not-a-link]]`\n```\n[[fenced]]\n```\n![[shot.png]] [[c-page.md]]');
  assert.deepEqual(links.map(l => l.target), ['a-page', 'b-page', 'c-page']);
  assert.equal(links[0].alias, 'the page');
  assert.equal(links[1].heading, 'Part');
  assert.equal(links[2].line, 6);
});

test('derived state: ready, blocked, progress, done, cancelled and waves', () => {
  const v = buildVault([
    task('B-01', { status: 'done' }),
    task('B-02', { deps: ['B-01'] }),
    task('B-03', { deps: ['B-02'], soft: ['M-01'] }),
    task('M-01', { status: 'in-progress', extra: 'started: 2026-01-01\n' }),
    task('M-02', { status: 'cancelled' }),
  ]);
  const state = id => taskOf(v, id).state;
  assert.deepEqual(['B-01', 'B-02', 'B-03', 'M-01', 'M-02'].map(state), ['done', 'ready', 'blocked', 'progress', 'cancelled']);
  assert.equal(taskOf(v, 'B-03').wave, 2);
  assert.deepEqual(taskOf(v, 'B-01').dependents, ['B-02']);
  assert.deepEqual(tasksIn(v, 'ready').map(t => t.id), ['B-02']);
  const s = summary(v);
  assert.deepEqual([s.total.total, s.total.ready, s.total.blocked, s.total.progress, s.total.done, s.total.cancelled], [5, 1, 1, 1, 1, 1]);
  assert.equal(s.areas.get('B').total, 3);
});

test('ready order: wave, then priority, then id', () => {
  const v = buildVault([task('T-03'), task('T-02', { extra: 'priority: 1\n' }), task('T-01', { extra: 'priority: 5\n' })]);
  assert.deepEqual(tasksIn(v, 'ready').map(t => t.id), ['T-02', 'T-01', 'T-03']);
});

test('next-id: grows past cancelled tasks, keeps width, starts at 01', () => {
  const v = buildVault([task('M-01'), task('M-07', { status: 'cancelled' }), task('B-120')]);
  assert.equal(nextId(v, 'M'), 'M-08');
  assert.equal(nextId(v, 'B'), 'B-121');
  assert.equal(nextId(v, 'W'), 'W-01');
});

test('lint: clean vault has no findings', () => {
  const v = buildVault([
    index('alpha', 'beta'),
    { path: 'log.md', text: '' },
    page('alpha', 'See [[beta]] and [[T-01]].'),
    page('beta', 'See [[alpha]].'),
    task('T-01', { status: 'done', extra: 'started: 2026-01-01\nfinished: 2026-01-02\n' }, 'Why: [[alpha]], plan [[T-01-plan]]'),
    { path: 'plans/T-01-plan.md', text: '---\ntype: plan\ntask: T-01\n---\nSteps' },
    { path: 'superpowers/plans/alpha.md', text: 'foreign folder, same name, ignored' },
  ]);
  assert.deepEqual(lint(v), []);
  assert.equal(taskOf(v, 'T-01').plan.name, 'T-01-plan');
});

test('lint: links, names, fields', () => {
  assert.ok(codes([index(), page('a', '[[missing]]')]).includes('broken-link'));
  assert.ok(codes([index('a'), page('a'), { path: 'tasks/a.md', text: '' }]).includes('duplicate-name'));
  assert.ok(codes([page('a')]).includes('missing-index'));
  assert.ok(codes([index('a'), page('a', '', 'summary: x')]).includes('missing-field'));
  assert.ok(codes([index(), page('a')]).includes('not-in-index'));
  assert.ok(codes([index('a'), page('a')]).includes('orphan-page'));
  assert.ok(!codes([index('a'), page('a', '', 'type: source\nsummary: x')]).includes('orphan-page'));
  assert.deepEqual(codes([index(), { path: 'log.md', text: 'Renamed [[old-name]].' }]), []);
  assert.ok(codes([index(), { path: 'wiki/sub/a.md', text: '---\ntype: x\nsummary: y\n---\n' }]).includes('nested-page'));
});

test('lint: task rules', () => {
  const has = (files, code) => assert.ok(codes([index(), ...files]).includes(code), code);
  has([task('T-01', { status: 'doing' })], 'bad-status');
  has([task('T-01', { deps: ['T-09'] })], 'unknown-dep');
  has([task('T-01'), task('T-02', { status: 'in-progress', deps: ['T-01'] })], 'started-before-deps');
  has([task('T-01'), task('T-02', { status: 'done', soft: ['T-01'] })], 'done-before-deps');
  has([task('T-01', { deps: ['T-02'] }), task('T-02', { deps: ['T-01'] })], 'dep-cycle');
  has([task('T-01', { status: 'cancelled' }), task('T-02', { deps: ['T-01'] })], 'cancelled-dep');
  has([task('T-01', { status: 'done' })], 'missing-date');
  has([{ path: 'tasks/T-02.md', text: '---\ntype: task\nid: T-01\ntitle: x\nstatus: todo\n---\n' }], 'id-mismatch');
  has([{ path: 'tasks/notes.md', text: '---\ntype: task\nid: notes\ntitle: x\nstatus: todo\n---\n' }], 'bad-id');
  has([{ path: 'plans/T-05-plan.md', text: '---\ntype: plan\n---\n' }], 'orphan-plan');
  has([task('T-01'), { path: 'plans/T-01.md', text: '---\ntype: plan\n---\n' }], 'plan-name');
});

test('closing summary: verdicts per "Done when" item, and the done-unverified rule', () => {
  const body = entries => `## Goal\nShip it.\n\n## Done when\n- First item.\n- Second item.\n\n## Summary\n\n### Verification\n${entries}\n`;
  const dates = 'started: 2026-01-01\nfinished: 2026-01-02\n';
  const summaryOf = (status, text) => {
    const v = buildVault([index(), task('T-01', { status, extra: dates }, text)]);
    return { summary: taskOf(v, 'T-01').summary, found: lint(v) };
  };
  const flagged = r => r.found.some(f => f.code === 'done-unverified');

  const none = summaryOf('done', '## Done when\n- First item.\n');
  assert.equal(none.summary, null);
  assert.deepEqual(none.found, [], 'a done task without a summary is not a finding');

  const complete = summaryOf('done', body('1. **verified**: First item.\n   - command: `npm test`\n2. **verified**: Second item.'));
  assert.deepEqual({ ...complete.summary, text: undefined, rest: undefined }, { items: 2, verified: 2, unverified: 0, failed: 0, complete: true, text: undefined, rest: undefined });
  assert.deepEqual(complete.found, [], 'complete summary, lint clean');

  const partial = summaryOf('done', body('1. **verified**: First item.'));
  assert.equal(partial.summary.verified, 1);
  assert.equal(partial.summary.unverified, 1);
  assert.equal(partial.summary.complete, false);
  assert.ok(flagged(partial));
  assert.match(partial.found.find(f => f.code === 'done-unverified').message, /^done but summary has 1 unverified, 0 failed$/);

  const failed = summaryOf('done', body('1. **verified**: First item.\n2. **failed**: Second item.'));
  assert.equal(failed.summary.failed, 1);
  assert.equal(failed.summary.complete, false);
  assert.ok(flagged(failed));

  assert.equal(flagged(summaryOf('in-progress', body('1. **verified**: First item.'))), false, 'only a done task is held to its summary');
  assert.equal(summaryOf('in-progress', body('')).summary.complete, false, 'a summary without entries is not complete');
});

test('closing summary: section text and the body without it', () => {
  const s = closingSummary('## Goal\nShip it.\n\n## Summary\n\nSummarized today.\n\n### Verification\n1. **verified**: It works.\n\n## Notes\nKept.\n');
  assert.equal(s.text, 'Summarized today.\n\n### Verification\n1. **verified**: It works.');
  assert.equal(s.rest, '## Goal\nShip it.\n\n## Notes\nKept.');
  assert.doesNotMatch(s.rest, /## Summary|Summarized/);
  assert.deepEqual([s.items, s.verified, s.complete], [0, 1, true], 'without "Done when" bullets the entries count as written');
  assert.equal(closingSummary('## Goal\n```\n## Summary\n```\n'), null, 'a heading inside a code fence is not the section');
});

test('lint: a cycle is reported once and does not hang wave calculation', () => {
  const found = lint(buildVault([index(), task('T-01', { deps: ['T-02'] }), task('T-02', { deps: ['T-03'] }), task('T-03', { deps: ['T-01'] })]));
  assert.equal(found.filter(f => f.code === 'dep-cycle').length, 1);
});

test('unblockedBy: only dependents whose last open hard dependency is this task', () => {
  const v = buildVault([task('T-01'), task('T-02', { deps: ['T-01'] }), task('T-03', { deps: ['T-01', 'T-04'] }), task('T-04'), task('T-05', { soft: ['T-01'] })]);
  assert.deepEqual(unblockedBy(v, 'T-01'), ['T-02']);
});

test('search: more distinct terms first, head hits outweigh body, lessons boosted, index and log skipped', () => {
  const v = buildVault([
    index('sync-timeout', 'offline-sync'),
    { path: 'log.md', text: 'timeout everywhere' },
    page('offline-sync', 'Sync runs in the background. A timeout aborts it.'),
    page('sync-timeout', 'Symptom: uploads hang.', 'type: lesson\nsummary: Sync timeout on large photos.'),
    page('unrelated', 'Nothing here.'),
    task('T-01', {}, 'Raise the upload timeout.'),
  ]);
  const hits = search(v, 'sync timeout');
  assert.deepEqual(hits.map(h => h.page.name), ['sync-timeout', 'offline-sync', 'T-01']);
  assert.match(hits[2].line, /upload timeout/);
  assert.deepEqual(search(v, 'zzz'), []);
});

test('search: raw sources are searched too, each hit names the heading above its line', () => {
  const v = buildVault([
    index('offline-sync'),
    page('offline-sync', 'Intro.\n\n## Background\n\nSync runs in the background. A timeout aborts it.'),
    page('no-heading', 'The sync timeout bug, named before any heading. Sync timeout, again.'),
    { path: 'raw/2026-01-01-audit.md', text: '# Audit\n\nIntro.\n\n```\n# not a heading: sync timeout\n```\n\n## Findings\n\nThe sync timeout bug.' },
    { path: 'raw/notes.txt', text: 'Plain notes.\nTimeout seen on Monday.' },
  ]);
  const hits = search(v, 'sync timeout');
  assert.deepEqual(hits.map(h => [h.page.folder, h.page.name, h.heading]), [
    ['wiki', 'offline-sync', 'Background'],
    ['wiki', 'no-heading', ''],
    ['raw', '2026-01-01-audit', 'Findings'],
    ['raw', 'notes', ''],
  ]);
  assert.equal(hits[2].page.path, 'raw/2026-01-01-audit.md');
  assert.match(hits[2].line, /^The sync timeout bug/);
  assert.ok(!v.pages.some(p => p.folder === 'raw'), 'raw sources are not pages');
  assert.equal(v.raw.length, 2);
  assert.ok(!lint(v).some(f => f.path.startsWith('raw/')), 'lint says nothing about raw sources');
});

test('area guide: found by area, exempt from the orphan warning', () => {
  const files = [index('guide-p'), page('guide-p', 'Layout', 'type: guide\narea: P\nsummary: How to work in the panel.'), task('P-01'), task('M-01')];
  const v = buildVault(files);
  assert.equal(guideFor(v, 'p').name, 'guide-p');
  assert.equal(guideFor(v, 'M'), null);
  assert.deepEqual(lint(v), []);
});
