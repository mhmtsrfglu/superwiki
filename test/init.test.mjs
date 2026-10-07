import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const init = new URL('../skills/init/scripts/init.mjs', import.meta.url).pathname;
const skillsDir = new URL('../skills', import.meta.url).pathname;
// The skills by their bare folder names; a copy in a project is named sw-<name>.
const skillNames = readdirSync(skillsDir).filter(name => existsSync(join(skillsDir, name, 'SKILL.md')));
const run = (root, ...args) => execFileSync('node', [init, '--root', root, ...args], { encoding: 'utf8' });
const sw = (root, ...args) => spawnSync('node', [join(root, 'docs/.sw/sw.mjs'), ...args], { encoding: 'utf8', cwd: root });
const fresh = () => mkdtempSync(join(tmpdir(), 'sw-init-'));
const read = (root, path) => readFileSync(join(root, path), 'utf8');
// What a copy of a skill holds: the source, with the name line rewritten to the copy's folder name.
const copyOf = name => readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8').replace(/^name: .*$/m, `name: sw-${name}`);

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
  assert.match(agents, /Implementing a task: `sw:implement`/);
  assert.match(agents, /One task from start to done in one command \(it decides whether a plan is needed\): `sw:plan-implement`\./);
  assert.match(agents, /without implementing it: `sw:review`/);
  assert.match(agents, /`sw:triage` first/);
  assert.equal(agents.match(/sw-<name>/g).length, 1, 'the Codex and Copilot name is said once');
  assert.doesNotMatch(agents, /sw-[a-z]/, 'no skill is named in the sw- form');
});

test('wiki-only vault leaves the task module out', () => {
  const root = fresh();
  run(root, '--no-tasks');
  assert.ok(!existsSync(join(root, 'docs/tasks')));
  assert.ok(!existsSync(join(root, 'docs/.sw/templates/task.md')));
  assert.doesNotMatch(read(root, 'docs/index.md'), /sw:board|## Tasks/);
  const agents = read(root, 'AGENTS.md');
  assert.doesNotMatch(agents, /tasks\/<ID>|Tasks:|sw:plan|sw:implement|sw:plan-implement|sw:explain|sw:review|sw\.mjs index/);
  assert.match(agents, /`docs\/index\.md`: catalog, one line per wiki page/);
  assert.match(agents, /sw\.mjs search/);
  assert.match(agents, /`sw:ingest`/);
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
  assert.match(out, /docs\/ already had content \(superpowers\)\. It was left untouched and is outside the vault\. If it holds a task index, sw:migrate converts it\./);
  assert.equal(sw(root, 'lint').status, 0, 'foreign folders are not linted');
});

test('after a migration the hint to migrate is not repeated', () => {
  const root = fresh();
  mkdirSync(join(root, 'docs/tasks'), { recursive: true });
  mkdirSync(join(root, 'docs/legacy'), { recursive: true });
  const out = run(root, '--tasks');
  assert.match(out, /already had content \(legacy\)/);
  assert.doesNotMatch(out, /sw:migrate/);
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
  // Claude Code's project install is the plugin, not a copy under .claude/skills.
  const claude = spawnSync('node', [init, '--root', fresh(), '--tasks', '--skills', 'claude'], { encoding: 'utf8' });
  assert.equal(claude.status, 2);
  assert.match(claude.stderr, /npx superwiki install --project \. claude/);
});

test('--skills copies every skill as sw-<name> into the folder Codex and Copilot read, marked as installed', () => {
  const root = fresh();
  const out = run(root, '--tasks', '--skills', 'codex,copilot');
  for (const name of skillNames) {
    const folder = join(root, '.agents/skills', `sw-${name}`);
    assert.equal(readFileSync(join(folder, 'SKILL.md'), 'utf8'), copyOf(name), `sw-${name}`);
    assert.ok(existsSync(join(folder, '.sw-installed')), `sw-${name} marker`);
  }
  assert.ok(existsSync(join(root, '.agents/skills/sw-init/scripts/init.mjs')));
  assert.ok(!existsSync(join(root, '.claude')));
  assert.deepEqual(JSON.parse(read(root, 'docs/.sw/config.json')).skills, ['codex', 'copilot']);
  assert.match(out, /created {3}\.agents\/skills\/sw-plan\//);
  assert.equal(out.match(/\.agents\/skills\/sw-plan\//g).length, 1, 'the shared folder is reported once');
  assert.match(out, /skills: \.agents\/skills$/m);
});

test('all means codex and copilot', () => {
  const root = fresh();
  run(root, '--tasks', '--skills', 'all');
  assert.ok(existsSync(join(root, '.agents/skills/sw-plan/SKILL.md')));
  assert.ok(!existsSync(join(root, '.claude')));
  assert.deepEqual(JSON.parse(read(root, 'docs/.sw/config.json')).skills, ['codex', 'copilot']);
});

test('without --skills, and with --no-skills, no skill folder is written', () => {
  for (const flags of [[], ['--no-skills']]) {
    const root = fresh();
    const out = run(root, '--tasks', ...flags);
    assert.ok(!existsSync(join(root, '.claude')));
    assert.ok(!existsSync(join(root, '.agents')));
    assert.deepEqual(JSON.parse(read(root, 'docs/.sw/config.json')).skills, []);
    assert.match(out, /skills: not in the repository$/m);
  }
});

test('a saved choice of claude, from before the plugin install, is skipped without a word', () => {
  const root = fresh();
  run(root, '--tasks');
  const configPath = join(root, 'docs/.sw/config.json');
  const config = JSON.parse(read(root, 'docs/.sw/config.json'));
  config.skills = ['claude'];
  writeFileSync(configPath, JSON.stringify(config));
  const out = run(root);
  assert.ok(!existsSync(join(root, '.claude')));
  assert.doesNotMatch(out, /claude/);
  assert.match(out, /skills: not in the repository$/m);
  assert.deepEqual(JSON.parse(read(root, 'docs/.sw/config.json')).skills, ['claude']);
});

test('an upgrade with no flags brings the repository copies up to this version', () => {
  const root = fresh();
  run(root, '--tasks', '--skills', 'codex');
  writeFileSync(join(root, '.agents/skills/sw-plan/SKILL.md'), 'old');
  const out = run(root);
  assert.equal(read(root, '.agents/skills/sw-plan/SKILL.md'), copyOf('plan'));
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
  assert.equal(read(root, '.agents/skills/sw-plan/SKILL.md'), copyOf('plan'));
  assert.ok(!existsSync(join(root, '.agents/skills/other-skill')));
});
