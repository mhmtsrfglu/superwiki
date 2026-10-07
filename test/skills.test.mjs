import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

const skillsDir = new URL('../skills/', import.meta.url);
const skill = name => readFileSync(new URL(`${name}/SKILL.md`, skillsDir), 'utf8');

// The 19 skills, by folder name. The plugin `sw` gives each its name, sw:<name>; a folder named
// sw-<name> would show as sw:sw-<name> in a plugin install (DESIGN.md, "Names").
const SKILLS = [
  'autopilot', 'brainstorm', 'config', 'doctor', 'explain', 'implement', 'index', 'ingest', 'init',
  'lint', 'migrate', 'plan', 'plan-implement', 'review', 'search', 'triage', 'usage', 'verify', 'view',
];

// sw:plan and sw:implement must work without sw:plan-implement loaded, and sw:brainstorm names the
// next step by the same rule, so each of the four carries the rule that decides whether a task is
// small. This keeps the four copies from drifting apart.
test('the small-task rule reads the same in sw:plan-implement, sw:plan, sw:implement and sw:brainstorm', () => {
  const rules = ['plan-implement', 'plan', 'implement', 'brainstorm'].map(name => {
    const lines = skill(name).split('\n').map(line => line.trim()).filter(line => line.startsWith('A task is small when'));
    assert.equal(lines.length, 1, `${name} states the small-task rule on exactly one line`);
    return lines[0];
  });
  assert.equal(rules[1], rules[0], 'sw:plan states the rule as sw:plan-implement does');
  assert.equal(rules[2], rules[0], 'sw:implement states the rule as sw:plan-implement does');
  assert.equal(rules[3], rules[0], 'sw:brainstorm states the rule as sw:plan-implement does');
});

// Every role derives the requirement ids D<n> and N<n> from position; the three role files define
// them in one sentence, the same in each.
test('the planner, implementer and reviewer define requirement ids in the same words', () => {
  const definitions = ['planner', 'implementer', 'reviewer'].map(role => {
    const text = readFileSync(new URL(`config/assets/${role}.md`, skillsDir), 'utf8');
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

test('the skill folders carry the bare names, each SKILL.md is named after its folder, and commands/ is gone', () => {
  const folders = readdirSync(skillsDir).filter(name => statSync(new URL(name, skillsDir)).isDirectory()).sort();
  assert.deepEqual(folders, SKILLS);
  for (const name of folders) {
    const frontmatter = skill(name).match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
    assert.match(frontmatter, new RegExp(`^name: ${name}$`, 'm'), `skills/${name}/SKILL.md is named ${name}`);
    assert.match(frontmatter, /^description: \S/m, `skills/${name}/SKILL.md has a description`);
    assert.doesNotMatch(frontmatter, /sw-[a-z]/, `skills/${name}/SKILL.md names no skill as sw-<name>`);
    assert.match(skill(name), new RegExp(`^# sw:${name}$`, 'm'), `skills/${name}/SKILL.md is headed sw:${name}`);
  }
  assert.ok(!existsSync(new URL('../commands', import.meta.url)), 'the plugin gives the typed names; commands/ would list each skill twice');
});
