import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const init = new URL('../skills/sw-init/scripts/init.mjs', import.meta.url).pathname;
const config = new URL('../skills/sw-config/scripts/config.mjs', import.meta.url).pathname;
const project = () => { const root = mkdtempSync(join(tmpdir(), 'sw-config-')); execFileSync('node', [init, '--root', root, '--tasks', '--areas', 'M=Mobile']); return root; };
const run = (root, ...args) => execFileSync('node', [config, ...args, '--root', root], { encoding: 'utf8' });
const read = (root, p) => readFileSync(join(root, p), 'utf8');

test('model writes agent files only for the tool it was set for', () => {
  const root = project();
  run(root, 'model', 'plan', 'claude', 'opus');
  const planner = read(root, '.claude/agents/sw-planner.md');
  assert.match(planner, /^---\nname: sw-planner\n.*\nmodel: opus\n---/s);
  assert.doesNotMatch(planner, /^tools:/m, 'the planner writes its plan file');
  assert.doesNotMatch(read(root, '.claude/agents/sw-implementer.md'), /^(tools|model):/m);
  assert.ok(!existsSync(join(root, '.codex')));
  assert.ok(!existsSync(join(root, '.github')));
});

test('codex and copilot agents carry model and read-only planner', () => {
  const root = project();
  run(root, 'model', 'plan', 'codex', 'gpt-6');
  run(root, 'model', 'implement', 'copilot', 'gpt-6');
  const toml = read(root, '.codex/agents/sw-planner.toml');
  assert.match(toml, /name = "sw_planner"\n/);
  assert.match(toml, /model = "gpt-6"\n/);
  assert.doesNotMatch(toml, /sandbox_mode/);
  assert.doesNotMatch(read(root, '.codex/agents/sw-implementer.toml'), /sandbox_mode|^model/m);
  assert.match(read(root, '.github/agents/sw-implementer.agent.md'), /\nmodel: gpt-6\n---/);
});

test('unset, areas, show, and sw-init re-run keeps the tool list', () => {
  const root = project();
  run(root, 'model', 'plan', 'claude', 'opus');
  run(root, 'model', 'plan', 'claude', '--unset');
  assert.doesNotMatch(read(root, '.claude/agents/sw-planner.md'), /^model:/m);
  run(root, 'areas', 'B=Backend');
  execFileSync('node', [init, '--root', root]);
  const show = run(root, 'show');
  assert.match(show, /areas: M=Mobile, B=Backend/);
  assert.match(show, /plan: claude=default/);
  assert.match(show, /agent files for: claude/);
  assert.equal(spawnSync('node', [config, 'model', 'plan', 'cursor', 'x', '--root', root]).status, 2);
});
