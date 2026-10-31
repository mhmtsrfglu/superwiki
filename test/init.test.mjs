import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const init = new URL('../skills/sw-init/scripts/init.mjs', import.meta.url).pathname;
const skillsDir = new URL('../skills', import.meta.url).pathname;
// The skills by their folder names, sw-<name>; a copy in a project carries the same name.
const skillNames = readdirSync(skillsDir).filter(name => existsSync(join(skillsDir, name, 'SKILL.md'))).sort();
const run = (root, ...args) => execFileSync('node', [init, '--root', root, ...args], { encoding: 'utf8' });
const sw = (root, ...args) => spawnSync('node', [join(root, 'docs/.sw/sw.mjs'), ...args], { encoding: 'utf8', cwd: root });
const fresh = () => mkdtempSync(join(tmpdir(), 'sw-init-'));
const read = (root, path) => readFileSync(join(root, path), 'utf8');
// What a copy of a skill holds: the checkout's SKILL.md, unchanged.
const copyOf = name => readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8');

const EMPTY_BOARD = '<!-- sw:board:start (written by `sw.mjs board`; do not edit) -->\n## Tasks\n\nNo tasks yet.\n<!-- sw:board:end -->';

test('new vault with tasks: files, config, an index with the task list, clean lint', () => {
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
  assert.equal(read(root, 'docs/index.md'), `# Index\n\n${EMPTY_BOARD}\n\n## Wiki\n\nCatalog of the wiki: one line per page, \`- [[file-name]]: summary\`, grouped by type.\n`);

  const lint = sw(root, 'lint');
  assert.equal(lint.status, 0, lint.stdout + lint.stderr);
  assert.match(lint.stdout, /0 errors, 0 warnings/);
});

test('schema block with tasks: wiki, task and skill rules, no template markers', () => {
  const root = fresh();
  run(root, '--tasks');
  const agents = read(root, 'AGENTS.md');
  assert.doesNotMatch(agents, /\{\{/);
  assert.match(agents, /`docs\/index\.md`: the open tasks, then the catalog/);
  assert.match(agents, /docs\/tasks\/<ID>\.md/);
  assert.match(agents, /\n\nTasks:\n\n- A task's status/);
  assert.match(agents, /run `node docs\/\.sw\/sw\.mjs index`\. Never edit that list by hand/);
  assert.match(agents, /Work that belongs to no task .* one `change` entry/);
  assert.match(agents, /Implementing a task: `sw-implement`/);
  assert.match(agents, /One task from start to done in one command \(it decides whether a plan is needed\): `sw-plan-implement`\./);
  assert.match(agents, /without implementing it: `sw-review`/);
  assert.match(agents, /`sw-triage` first/);
  assert.doesNotMatch(agents, /sw-<name>|Codex and Copilot CLI see/, 'every agent shows the names the block uses, so it says nothing about other names');
  assert.doesNotMatch(agents, /sw:(?!start|end|board)[a-z]/, 'no skill is named in the colon form');
});

test('wiki-only vault leaves the task module out', () => {
  const root = fresh();
  run(root, '--no-tasks');
  assert.ok(!existsSync(join(root, 'docs/tasks')));
  assert.ok(!existsSync(join(root, 'docs/.sw/templates/task.md')));
  assert.doesNotMatch(read(root, 'docs/index.md'), /sw:board|## Tasks/);
  const agents = read(root, 'AGENTS.md');
  assert.doesNotMatch(agents, /tasks\/<ID>|Tasks:|sw-plan|sw-implement|sw-plan-implement|sw-explain|sw-review|sw\.mjs index/);
  assert.match(agents, /`docs\/index\.md`: catalog, one line per wiki page/);
  assert.match(agents, /sw\.mjs search/);
  assert.match(agents, /`sw-ingest`/);
  assert.match(agents, /When you change the project, append one `change` entry/);
});

test('re-run keeps user content and choices, and replaces only what the tool owns', () => {
  const root = fresh();
  writeFileSync(join(root, 'AGENTS.md'), '# Mine\n\nMy rule.\n');
  writeFileSync(join(root, 'CLAUDE.md'), '# Claude\n');
  run(root, '--tasks', '--areas', 'M=Mobile');
  // An index from before the task list existed: the user's catalog, no list.
  writeFileSync(join(root, 'docs/index.md'), '# Index\n- [[alpha]]: a\n');
  writeFileSync(join(root, 'docs/wiki/alpha.md'), '---\ntype: concept\nsummary: a\n---\n');

  const out = run(root);
  assert.equal(read(root, 'docs/index.md'), `# Index\n\n${EMPTY_BOARD}\n\n- [[alpha]]: a\n`);
  assert.match(out, /updated {3}docs\/index\.md \(task list\)/);
  assert.deepEqual(JSON.parse(read(root, 'docs/.sw/config.json')).areas, { M: 'Mobile' });
  const agents = read(root, 'AGENTS.md');
  assert.match(agents, /^# Mine\n\nMy rule\./);
  assert.equal(agents.match(/<!-- sw:start/g).length, 1);
  assert.equal(read(root, 'CLAUDE.md'), '# Claude\n');
  assert.match(out, /note\s+CLAUDE\.md does not mention AGENTS\.md/);
  for (const unchanged of ['docs/.sw/sw.mjs', 'docs/.sw/config.json', 'AGENTS.md']) assert.match(out, new RegExp(`unchanged ${unchanged.replace(/[./]/g, '\\$&')}`));

  assert.match(run(root), /unchanged docs\/index\.md \(task list\)/, 'a third run changes nothing');
});

test('content that was in docs/ before is left alone and reported', () => {
  const root = fresh();
  mkdirSync(join(root, 'docs/superpowers/plans'), { recursive: true });
  writeFileSync(join(root, 'docs/index.md'), 'old index\n');
  writeFileSync(join(root, 'docs/superpowers/plans/x.md'), '[[nowhere]]\n');
  const out = run(root, '--tasks');
  assert.equal(read(root, 'docs/index.md'), `${EMPTY_BOARD}\n\nold index\n`, 'an index that was there keeps its text; the task list goes above it');
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
  const badAgent = spawnSync('node', [init, '--root', fresh(), '--tasks', '--skills', 'cursor'], { encoding: 'utf8' });
  assert.equal(badAgent.status, 2);
  assert.match(badAgent.stderr, /bad agent "cursor"/);
});

test('--skills copies every skill as sw-<name> into the folder Codex and Copilot read, unchanged and marked as installed', () => {
  const root = fresh();
  const out = run(root, '--tasks', '--skills', 'codex,copilot');
  for (const name of skillNames) {
    const folder = join(root, '.agents/skills', name);
    assert.equal(readFileSync(join(folder, 'SKILL.md'), 'utf8'), copyOf(name), name);
    assert.ok(existsSync(join(folder, '.sw-installed')), `${name} marker`);
  }
  assert.ok(existsSync(join(root, '.agents/skills/sw-init/scripts/init.mjs')));
  assert.ok(!existsSync(join(root, '.claude/skills')), 'only the hook settings go under .claude');
  assert.deepEqual(JSON.parse(read(root, 'docs/.sw/config.json')).skills, ['codex', 'copilot']);
  assert.match(out, /created {3}\.agents\/skills\/sw-plan\//);
  assert.equal(out.match(/\.agents\/skills\/sw-plan\//g).length, 1, 'the shared folder is reported once');
  assert.match(out, /skills: \.agents\/skills$/m);
});

test('--skills claude copies every skill as sw-<name> into .claude/skills', () => {
  const root = fresh();
  const out = run(root, '--tasks', '--skills', 'claude');
  assert.deepEqual(readdirSync(join(root, '.claude/skills')).sort(), skillNames);
  for (const name of skillNames) {
    assert.equal(read(root, `.claude/skills/${name}/SKILL.md`), copyOf(name), name);
    assert.ok(existsSync(join(root, '.claude/skills', name, '.sw-installed')), `${name} marker`);
  }
  assert.ok(!existsSync(join(root, '.agents')));
  assert.match(out, /created {3}\.claude\/skills\/sw-plan\//);
  assert.match(out, /skills: \.claude\/skills$/m);
});

test('all means claude, codex and copilot', () => {
  const root = fresh();
  const out = run(root, '--tasks', '--skills', 'all');
  assert.ok(existsSync(join(root, '.claude/skills/sw-plan/SKILL.md')));
  assert.ok(existsSync(join(root, '.agents/skills/sw-plan/SKILL.md')));
  assert.deepEqual(JSON.parse(read(root, 'docs/.sw/config.json')).skills, ['claude', 'codex', 'copilot']);
  assert.match(out, /skills: \.claude\/skills, \.agents\/skills$/m);
});

test('without --skills, and with --no-skills, no skill folder is written', () => {
  for (const flags of [[], ['--no-skills']]) {
    const root = fresh();
    const out = run(root, '--tasks', ...flags);
    assert.ok(!existsSync(join(root, '.claude/skills')));
    assert.ok(!existsSync(join(root, '.agents')));
    assert.deepEqual(JSON.parse(read(root, 'docs/.sw/config.json')).skills, []);
    assert.match(out, /skills: not in the repository$/m);
  }
});

test('a saved choice of claude, also one from before the plugin install, copies the skills into .claude/skills', () => {
  const root = fresh();
  run(root, '--tasks');
  const configPath = join(root, 'docs/.sw/config.json');
  const config = JSON.parse(read(root, 'docs/.sw/config.json'));
  config.skills = ['claude'];
  writeFileSync(configPath, JSON.stringify(config));
  const out = run(root);
  assert.equal(read(root, '.claude/skills/sw-plan/SKILL.md'), copyOf('sw-plan'));
  assert.match(out, /created {3}\.claude\/skills\/sw-plan\//);
  assert.match(out, /skills: \.claude\/skills$/m);
  assert.deepEqual(JSON.parse(read(root, 'docs/.sw/config.json')).skills, ['claude']);
});

test('an upgrade with no flags brings the repository copies up to this version', () => {
  const root = fresh();
  run(root, '--tasks', '--skills', 'codex');
  writeFileSync(join(root, '.agents/skills/sw-plan/SKILL.md'), 'old');
  const out = run(root);
  assert.equal(read(root, '.agents/skills/sw-plan/SKILL.md'), copyOf('sw-plan'));
  assert.ok(existsSync(join(root, '.agents/skills/sw-plan/.sw-installed')));
  assert.match(out, /updated {3}\.agents\/skills\/sw-plan\//);
  assert.match(out, /unchanged \.agents\/skills\/sw-init\//);
  assert.deepEqual(JSON.parse(read(root, 'docs/.sw/config.json')).skills, ['codex']);

  run(root, '--no-skills');
  assert.ok(existsSync(join(root, '.agents/skills/sw-plan/SKILL.md')), '--no-skills deletes nothing');
  writeFileSync(join(root, '.agents/skills/sw-plan/SKILL.md'), 'old');
  assert.doesNotMatch(run(root), /skills\/sw-plan/);
  assert.equal(read(root, '.agents/skills/sw-plan/SKILL.md'), 'old', 'and stops the updates');
});

test('a skill folder that Superwiki did not install is kept and reported', () => {
  const root = fresh();
  mkdirSync(join(root, '.agents/skills/sw-plan'), { recursive: true });
  writeFileSync(join(root, '.agents/skills/sw-plan/SKILL.md'), 'mine');
  const out = run(root, '--tasks', '--skills', 'codex');
  assert.equal(read(root, '.agents/skills/sw-plan/SKILL.md'), 'mine');
  assert.ok(!existsSync(join(root, '.agents/skills/sw-plan/.sw-installed')));
  assert.match(out, /kept {6}\.agents\/skills\/sw-plan\/ \(not installed by Superwiki\)/);
  assert.match(out, /created {3}\.agents\/skills\/sw-init\//);
});

test('run from the project\'s own copy, init.mjs leaves the skills alone and still saves the choice', () => {
  const root = fresh();
  run(root, '--tasks', '--skills', 'codex');
  writeFileSync(join(root, '.agents/skills/sw-plan/SKILL.md'), 'changed');
  const own = join(root, '.agents/skills/sw-init/scripts/init.mjs');
  const out = execFileSync('node', [own, '--root', root, '--skills', 'codex,copilot'], { encoding: 'utf8' });
  assert.match(out, /note {6}skills in the repository left alone: init\.mjs runs from the project's own copy/);
  assert.doesNotMatch(out, /(created|updated|unchanged|kept)\s+\.agents\/skills\//);
  assert.equal(read(root, '.agents/skills/sw-plan/SKILL.md'), 'changed');
  assert.deepEqual(JSON.parse(read(root, 'docs/.sw/config.json')).skills, ['codex', 'copilot']);
});

test('run from a copy in another project, init.mjs copies only the sw- folders beside it', () => {
  const source = fresh();
  run(source, '--tasks', '--skills', 'codex');
  mkdirSync(join(source, '.agents/skills/other-skill'), { recursive: true });
  writeFileSync(join(source, '.agents/skills/other-skill/SKILL.md'), '---\nname: other-skill\n---\n');
  const root = fresh();
  execFileSync('node', [join(source, '.agents/skills/sw-init/scripts/init.mjs'), '--root', root, '--tasks', '--skills', 'codex'], { encoding: 'utf8' });
  assert.equal(read(root, '.agents/skills/sw-plan/SKILL.md'), copyOf('sw-plan'));
  assert.ok(!existsSync(join(root, '.agents/skills/other-skill')));
});

test('init registers the test guard hook for claude, codex and copilot in the project, one entry each, and keeps it on a re-run', () => {
  const root = fresh();
  run(root, '--tasks');
  const ours = (entries = []) => entries.filter(entry => (entry.hooks ?? [entry]).some(hook => /sw\.mjs hook/.test(hook.command ?? hook.bash ?? '')));
  const claude = JSON.parse(read(root, '.claude/settings.json'));
  assert.equal(ours(claude.hooks.PreToolUse).length, 1);
  assert.equal(claude.hooks.PreToolUse[0].matcher, 'Bash|Write|Edit|MultiEdit|NotebookEdit');
  const codex = JSON.parse(read(root, '.codex/hooks.json'));
  assert.equal(ours(codex.hooks.PreToolUse).length, 1);
  assert.equal(codex.hooks.PreToolUse[0].matcher, 'Bash|apply_patch');
  const copilot = JSON.parse(read(root, '.github/hooks/superwiki.json'));
  assert.equal(copilot.version, 1);
  assert.equal(ours(copilot.hooks.PreToolUse).length, 1);
  const out = run(root);
  assert.match(out, /unchanged \.claude\/settings\.json/);
  assert.equal(ours(JSON.parse(read(root, '.claude/settings.json')).hooks.PreToolUse).length, 1);
  assert.equal(ours(JSON.parse(read(root, '.codex/hooks.json')).hooks.PreToolUse).length, 1);

  // The vault's hook denies a surplus test write while a task is in progress, from the project root.
  writeFileSync(join(root, 'docs/tasks/T-01.md'), '---\ntype: task\nid: T-01\ntitle: A\nstatus: in-progress\ndeps: []\nsoft_deps: []\n---\n\n## Goal\n\nA.\n\n## Done when\n\n- a (test)\n');
  const call = JSON.stringify({ cwd: root, hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: 'test/a.test.mjs', content: "test('a');\ntest('b');\ntest('c');\n" } });
  const hook = spawnSync('sh', ['-c', claude.hooks.PreToolUse[0].hooks[0].command], { cwd: root, encoding: 'utf8', input: call });
  assert.equal(hook.status, 0);
  assert.match(hook.stdout, /"permissionDecision":"deny"/);
  assert.match(hook.stdout, /one test per behaviour/i);
});
