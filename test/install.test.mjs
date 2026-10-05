import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, lstatSync, readFileSync, readlinkSync, mkdirSync, writeFileSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = new URL('../install.sh', import.meta.url).pathname;
const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const skills = readdirSync(join(repo, 'skills')).filter(n => n.startsWith('sw-'));
const home = () => mkdtempSync(join(tmpdir(), 'sw-home-'));
const bin = new URL('../bin/superwiki.mjs', import.meta.url).pathname;
// Run from `cwd`: the folder an install would offer as "this project". Stdin is a pipe, not a terminal.
const cliIn = (cwd, HOME, ...args) => spawnSync('node', [bin, ...args], { encoding: 'utf8', cwd, env: { ...process.env, HOME } });
const cli = (HOME, ...args) => cliIn(process.cwd(), HOME, ...args);
const project = () => mkdtempSync(join(tmpdir(), 'sw-proj-'));
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
  assert.equal(cli(home(), 'frobnicate').status, 2);
  assert.equal(run(home(), 'cursor').status, 2);
});

test('npx entry point: copies by default, updates its own copies, uninstalls them', () => {
  const h = home();
  const first = cli(h, 'install', 'claude', 'global');
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /copied {3}sw-init/);
  for (const dir of ['.claude/skills', '.agents/skills']) {
    assert.ok(!lstatSync(join(h, dir, 'sw-plan')).isSymbolicLink());
    assert.ok(existsSync(join(h, dir, 'sw-init/scripts/init.mjs')));
    assert.ok(existsSync(join(h, dir, 'sw-init/assets/sw.mjs')));
  }
  assert.equal(cli(h, 'install', 'claude').status, 0, 're-run replaces its own copies');
  cli(h, 'uninstall', 'claude');
  assert.ok(!existsSync(join(h, '.claude/skills/sw-init')));
  assert.ok(existsSync(join(h, '.agents/skills/sw-init')));
  assert.match(cli(h, '--version').stdout, /^\d+\.\d+\.\d+/);
});

test('without a terminal nothing is asked and the home folder is used; --global says the same in advance', () => {
  for (const flags of [[], ['--global']]) {
    const h = home();
    const p = project();
    const r = cliIn(p, h, 'install', ...flags, 'claude');
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /Where should/);
    for (const s of skills) assert.ok(existsSync(join(h, '.claude/skills', s, 'SKILL.md')), s);
    assert.ok(!existsSync(join(p, '.claude')));
  }
});

test('--project installs marked copies into the project and nothing into the home folder', () => {
  const h = home();
  const p = project();
  const r = cli(h, 'install', '--project', p, 'claude', 'codex');
  assert.equal(r.status, 0, r.stderr);
  for (const dir of ['.claude/skills', '.agents/skills']) {
    for (const s of skills) {
      assert.ok(!lstatSync(join(p, dir, s)).isSymbolicLink());
      assert.ok(existsSync(join(p, dir, s, '.sw-installed')), `${dir}/${s}`);
    }
  }
  assert.deepEqual(readdirSync(h), []);
  assert.equal(cli(h, 'install', '--global', '--project', p, 'claude').status, 2, 'two places at once');
});

test('--link into a project warns that the links stay on this machine', () => {
  const h = home();
  const linked = cli(h, 'install', '--project', project(), '--link', 'claude');
  assert.equal(linked.status, 0, linked.stderr);
  assert.match(linked.stderr, /links point into this machine/);
  assert.doesNotMatch(cli(h, 'install', '--link', 'claude').stderr, /links point/);
  assert.doesNotMatch(cli(h, 'install', '--project', project(), 'claude').stderr, /links point/);
});

test('a foreign skill of the same name in a project is kept and reported', () => {
  const p = project();
  mkdirSync(join(p, '.claude/skills/sw-init'), { recursive: true });
  writeFileSync(join(p, '.claude/skills/sw-init/SKILL.md'), 'mine');
  const r = cli(home(), 'install', '--project', p, 'claude');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /skipped {2}sw-init/);
  assert.equal(readFileSync(join(p, '.claude/skills/sw-init/SKILL.md'), 'utf8'), 'mine');
  assert.ok(existsSync(join(p, '.claude/skills/sw-plan/.sw-installed')));
});
