import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, lstatSync, readlinkSync, mkdirSync, writeFileSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = new URL('../install.sh', import.meta.url).pathname;
const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const skills = readdirSync(join(repo, 'skills')).filter(n => n.startsWith('sw-'));
const home = () => mkdtempSync(join(tmpdir(), 'sw-home-'));
const run = (HOME, ...args) => spawnSync('bash', [script, ...args], { encoding: 'utf8', env: { ...process.env, HOME, SUPERWIKI_HOME: '' } });

test('each target links every skill into the folder that agent reads', () => {
  const h = home();
  const r = run(h, 'all');
  assert.equal(r.status, 0, r.stderr);
  for (const dir of ['.claude/skills', '.agents/skills', '.copilot/skills']) {
    for (const s of skills) assert.equal(readlinkSync(join(h, dir, s)), join(repo, 'skills', s));
  }
  const g = home();
  run(g, 'global');
  assert.ok(existsSync(join(g, '.agents/skills/sw-init/SKILL.md')));
  assert.ok(!existsSync(join(g, '.claude')));
});

test('re-running is safe, a foreign skill of the same name is kept, uninstall removes only ours', () => {
  const h = home();
  mkdirSync(join(h, '.claude/skills/sw-init'), { recursive: true });
  writeFileSync(join(h, '.claude/skills/sw-init/SKILL.md'), 'mine');
  const first = run(h, 'claude');
  assert.equal(first.status, 1);
  assert.match(first.stdout, /skipped {2}sw-init/);
  assert.ok(!lstatSync(join(h, '.claude/skills/sw-init')).isSymbolicLink());
  assert.ok(lstatSync(join(h, '.claude/skills/sw-plan')).isSymbolicLink());
  assert.match(run(h, 'claude').stdout, /linked {3}sw-plan/);
  const un = run(h, '--uninstall', 'claude');
  assert.match(un.stdout, /kept {5}sw-init/);
  assert.ok(existsSync(join(h, '.claude/skills/sw-init/SKILL.md')));
  assert.ok(!existsSync(join(h, '.claude/skills/sw-plan')));
  assert.equal(run(h, '--force', 'claude').status, 0);
  assert.ok(lstatSync(join(h, '.claude/skills/sw-init')).isSymbolicLink());
});

test('a link that reaches the repository through another folder counts as ours', () => {
  const h = home();
  run(h, 'codex');
  mkdirSync(join(h, '.claude/skills'), { recursive: true });
  symlinkSync('../../.agents/skills/sw-init', join(h, '.claude/skills/sw-init'));
  const r = run(h, 'claude');
  assert.equal(r.status, 0, r.stdout);
  assert.equal(readlinkSync(join(h, '.claude/skills/sw-init')), join(repo, 'skills/sw-init'));
});

test('--project and --copy', () => {
  const h = home();
  const project = mkdtempSync(join(tmpdir(), 'sw-proj-'));
  assert.equal(run(h, '--project', project, '--copy', 'claude', 'codex').status, 0);
  assert.ok(existsSync(join(project, '.claude/skills/sw-init/scripts/init.mjs')));
  assert.ok(!lstatSync(join(project, '.agents/skills/sw-plan')).isSymbolicLink());
  assert.ok(!existsSync(join(h, '.claude')));
  run(h, '--project', project, '--uninstall', 'claude');
  assert.ok(!existsSync(join(project, '.claude/skills/sw-init')));
});

test('bad input', () => {
  assert.equal(run(home()).status, 2);
  assert.equal(run(home(), 'cursor').status, 2);
});
