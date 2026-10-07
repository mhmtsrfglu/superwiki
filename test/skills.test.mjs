import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const skill = name => readFileSync(new URL(`../skills/${name}/SKILL.md`, import.meta.url), 'utf8');

// sw-plan and sw-implement must work without sw-do loaded, so each of the three carries the rule that
// decides whether a task is small. This keeps the three copies from drifting apart.
test('the small-task rule reads the same in sw-do, sw-plan and sw-implement', () => {
  const rules = ['sw-do', 'sw-plan', 'sw-implement'].map(name => {
    const lines = skill(name).split('\n').map(line => line.trim()).filter(line => line.startsWith('A task is small when'));
    assert.equal(lines.length, 1, `${name} states the small-task rule on exactly one line`);
    return lines[0];
  });
  assert.equal(rules[1], rules[0], 'sw-plan states the rule as sw-do does');
  assert.equal(rules[2], rules[0], 'sw-implement states the rule as sw-do does');
});

// Every role derives the requirement ids D<n> and N<n> from position; the three role files define
// them in one sentence, the same in each.
test('the planner, implementer and reviewer define requirement ids in the same words', () => {
  const definitions = ['planner', 'implementer', 'reviewer'].map(role => {
    const text = readFileSync(new URL(`../skills/sw-config/assets/${role}.md`, import.meta.url), 'utf8');
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
