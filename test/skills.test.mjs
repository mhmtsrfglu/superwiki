import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

const skillsDir = new URL('../skills/', import.meta.url);
const skill = name => readFileSync(new URL(`${name}/SKILL.md`, skillsDir), 'utf8');

// The 19 skills, by folder name. The folder name is the skill's name in every agent: VS Code
// Copilot Chat takes a skill's name from its folder, so the folder, the `name:` field and the name
// an agent shows are one and the same, sw-<name> (DESIGN.md, "Names").
const SKILLS = [
  'autopilot', 'brainstorm', 'config', 'doctor', 'explain', 'implement', 'index', 'ingest', 'init',
  'lint', 'migrate', 'plan', 'plan-implement', 'review', 'search', 'triage', 'usage', 'verify', 'view',
].map(name => `sw-${name}`);

// sw-plan and sw-implement must work without sw-plan-implement loaded, and sw-brainstorm names the
// next step by the same rule, so each of the four carries the rule that decides whether a task is
// small. This keeps the four copies from drifting apart.
test('the small-task rule reads the same in sw-plan-implement, sw-plan, sw-implement and sw-brainstorm', () => {
  const rules = ['sw-plan-implement', 'sw-plan', 'sw-implement', 'sw-brainstorm'].map(name => {
    const lines = skill(name).split('\n').map(line => line.trim()).filter(line => line.startsWith('A task is small when'));
    assert.equal(lines.length, 1, `${name} states the small-task rule on exactly one line`);
    return lines[0];
  });
  assert.equal(rules[1], rules[0], 'sw-plan states the rule as sw-plan-implement does');
  assert.equal(rules[2], rules[0], 'sw-implement states the rule as sw-plan-implement does');
  assert.equal(rules[3], rules[0], 'sw-brainstorm states the rule as sw-plan-implement does');
});

// Every role derives the requirement ids D<n> and N<n> from position; the three role files define
// them in one sentence, the same in each.
test('the planner, implementer and reviewer define requirement ids in the same words', () => {
  // Each role file lives in the skill that dispatches it.
  const roleFiles = { planner: 'sw-plan/assets/planner.md', implementer: 'sw-implement/assets/implementer.md', reviewer: 'sw-implement/assets/reviewer.md' };
  const definitions = ['planner', 'implementer', 'reviewer'].map(role => {
    const text = readFileSync(new URL(roleFiles[role], skillsDir), 'utf8');
    const found = text.match(/Requirements have ids, [^\n]*?bears on none of them asks for nothing\./g) || [];
    assert.equal(found.length, 1, `${role}.md defines the ids once`);
    return found[0];
  });
  assert.match(definitions[0], /`D<n>` is the n-th "Done when" item, counted as the `done when:` line/);
  assert.match(definitions[0], /`N<n>` is the n-th top-level bullet of "Notes"/);
  assert.match(definitions[0], /A note asks for nothing when/);
  assert.equal(definitions[1], definitions[0], 'implementer.md defines the ids as planner.md does');
  assert.equal(definitions[2], definitions[0], 'reviewer.md defines the ids as planner.md does');
});

test('every skill folder is sw-<name>, its SKILL.md is named and headed after it, and no plugin is left', () => {
  const folders = readdirSync(skillsDir).filter(name => statSync(new URL(name, skillsDir)).isDirectory()).sort();
  assert.deepEqual(folders, SKILLS);
  for (const name of folders) {
    const frontmatter = skill(name).match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
    assert.match(frontmatter, new RegExp(`^name: ${name}$`, 'm'), `skills/${name}/SKILL.md is named ${name}`);
    assert.match(frontmatter, /^description: \S/m, `skills/${name}/SKILL.md has a description`);
    assert.match(skill(name), new RegExp(`^# ${name}$`, 'm'), `skills/${name}/SKILL.md is headed ${name}`);
  }
  for (const gone of ['.claude-plugin', '.codex-plugin', 'commands']) {
    assert.ok(!existsSync(new URL(`../${gone}`, import.meta.url)), `${gone}/ is gone: every agent gets a copy or a link of the folders`);
  }
});
