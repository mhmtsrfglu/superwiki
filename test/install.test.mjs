import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const bin = join(repo, 'bin/superwiki.mjs');
const script = join(repo, 'install.sh');
// The skills by their bare folder names, and the names their copies carry for Codex and Copilot.
const names = readdirSync(join(repo, 'skills')).filter(name => existsSync(join(repo, 'skills', name, 'SKILL.md'))).sort();
const copies = names.map(name => `sw-${name}`);
const home = () => mkdtempSync(join(tmpdir(), 'sw-home-'));
const project = () => mkdtempSync(join(tmpdir(), 'sw-proj-'));
const read = path => readFileSync(path, 'utf8');
const nameLine = path => read(path).match(/^name: .*$/m)?.[0];

// Stands in for Claude Code's CLI: each call appends its working directory and arguments to a log.
function claudeStub() {
  const dir = mkdtempSync(join(tmpdir(), 'sw-claude-'));
  const log = join(dir, 'calls.log');
  writeFileSync(join(dir, 'claude'), `#!/bin/sh\nprintf '%s\\n' "$(pwd -P) $*" >> '${log}'\n`, { mode: 0o755 });
  return {
    env: { PATH: `${dir}:${process.env.PATH}` },
    calls: () => (existsSync(log) ? read(log).trim().split('\n') : []),
  };
}

// Runs the installer as `npx superwiki` does: stdin is a pipe, not a terminal.
function cli({ home: HOME = home(), cwd = process.cwd(), env = {} } = {}, ...args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', cwd, env: { ...process.env, HOME, ...env } });
}
// Runs install.sh as a clone's user does: it links unless --copy is given.
function sh({ home: HOME = home(), env = {} } = {}, ...args) {
  return spawnSync('bash', [script, ...args], { encoding: 'utf8', env: { ...process.env, HOME, SUPERWIKI_HOME: '', ...env } });
}

test('claude: the plugin is installed with Claude Code\'s CLI, at user scope by default', () => {
  const stub = claudeStub();
  const h = home();
  const r = cli({ home: h, env: stub.env }, 'install', 'claude');
  assert.equal(r.status, 0, r.stderr);
  const cwd = realpathSync(process.cwd());
  assert.deepEqual(stub.calls(), [
    `${cwd} plugin marketplace add mhmtsrfglu/superwiki --scope user`,
    `${cwd} plugin install sw@superwiki --scope user`,
  ]);
  assert.match(r.stdout, /claude: the plugin sw@superwiki/);
  assert.ok(!existsSync(join(h, '.claude')), 'nothing is copied for Claude Code');
});

test('claude: --project installs at project scope from the project folder; --link adds this clone as the marketplace', () => {
  const stub = claudeStub();
  const p = project();
  const r = cli({ env: stub.env }, 'install', '--project', p, '--link', 'claude');
  assert.equal(r.status, 0, r.stderr);
  const real = realpathSync(p);
  assert.deepEqual(stub.calls(), [
    `${real} plugin marketplace add ${repo} --scope project`,
    `${real} plugin install sw@superwiki --scope project`,
  ]);
  assert.ok(!existsSync(join(p, '.claude/skills')));
});

test('claude: uninstall removes the plugin at the same scope', () => {
  const stub = claudeStub();
  assert.equal(cli({ env: stub.env }, 'uninstall', 'claude').status, 0);
  assert.equal(cli({ env: stub.env }, 'uninstall', '--project', project(), 'claude').status, 0);
  assert.deepEqual(stub.calls().map(call => call.split(' ').slice(1).join(' ')), [
    'plugin uninstall sw@superwiki --scope user',
    'plugin uninstall sw@superwiki --scope project',
  ]);
});

test('claude: without the claude command on PATH the install fails and says so; other targets still run', () => {
  const h = home();
  const r = cli({ home: h, env: { PATH: dirname(process.execPath) } }, 'install', 'claude', 'codex');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /claude/);
  assert.ok(existsSync(join(h, '.agents/skills/sw-plan/SKILL.md')));
});

test('codex, copilot and global get copies named sw-<name>, with the name rewritten and the marker set', () => {
  const h = home();
  const r = cli({ home: h }, 'install', 'codex', 'copilot', 'global');
  assert.equal(r.status, 0, r.stderr);
  for (const dir of ['.agents/skills', '.copilot/skills']) {
    names.forEach((name, i) => {
      const folder = join(h, dir, copies[i]);
      assert.ok(!lstatSync(folder).isSymbolicLink(), folder);
      assert.equal(nameLine(join(folder, 'SKILL.md')), `name: ${copies[i]}`);
      assert.ok(existsSync(join(folder, '.sw-installed')));
      assert.equal(
        read(join(folder, 'SKILL.md')).replace(/^name: .*$/m, `name: ${name}`),
        read(join(repo, 'skills', name, 'SKILL.md')),
        'only the name line differs from the source',
      );
    });
  }
  assert.ok(existsSync(join(h, '.agents/skills/sw-init/scripts/init.mjs')));
  assert.ok(existsSync(join(h, '.agents/skills/sw-init/assets/sw.mjs')));
  assert.equal(r.stdout.match(/copied {3}sw-init/g).length, 2, 'codex and global share a folder, written once');
  assert.ok(!existsSync(join(h, '.claude')));

  assert.equal(cli({ home: h }, 'install', 'codex').status, 0, 're-run replaces its own copies');
  cli({ home: h }, 'uninstall', 'copilot');
  assert.ok(!existsSync(join(h, '.copilot/skills/sw-init')));
  assert.ok(existsSync(join(h, '.agents/skills/sw-init')));
  assert.match(cli({}, '--version').stdout, /^\d+\.\d+\.\d+/);
});

test('a copy from an earlier version is replaced without --force; a foreign folder is kept, and uninstall removes only ours', () => {
  const h = home();
  mkdirSync(join(h, '.agents/skills/sw-plan'), { recursive: true });
  writeFileSync(join(h, '.agents/skills/sw-plan/SKILL.md'), 'old');
  writeFileSync(join(h, '.agents/skills/sw-plan/.sw-installed'), '');
  mkdirSync(join(h, '.agents/skills/sw-init'), { recursive: true });
  writeFileSync(join(h, '.agents/skills/sw-init/SKILL.md'), 'mine');

  const r = cli({ home: h }, 'install', 'codex');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /copied {3}sw-plan/);
  assert.match(r.stdout, /skipped {2}sw-init/);
  assert.equal(nameLine(join(h, '.agents/skills/sw-plan/SKILL.md')), 'name: sw-plan');
  assert.equal(read(join(h, '.agents/skills/sw-init/SKILL.md')), 'mine');

  const un = cli({ home: h }, 'uninstall', 'codex');
  assert.match(un.stdout, /kept {5}sw-init/);
  assert.match(un.stdout, /removed {2}sw-plan/);
  assert.ok(!existsSync(join(h, '.agents/skills/sw-plan')));
  assert.ok(existsSync(join(h, '.agents/skills/sw-init/SKILL.md')));

  assert.equal(cli({ home: h }, 'install', '--force', 'codex').status, 0);
  assert.equal(nameLine(join(h, '.agents/skills/sw-init/SKILL.md')), 'name: sw-init');
});

test('install.sh links every copy to this clone, and the linked file keeps its bare name', () => {
  const stub = claudeStub();
  const h = home();
  const r = sh({ home: h, env: stub.env }, 'all');
  assert.equal(r.status, 0, r.stderr);
  for (const dir of ['.agents/skills', '.copilot/skills']) {
    names.forEach((name, i) => assert.equal(readlinkSync(join(h, dir, copies[i])), join(repo, 'skills', name)));
  }
  assert.equal(nameLine(join(h, '.agents/skills/sw-plan/SKILL.md')), 'name: plan');
  assert.equal(stub.calls()[0].split(' ').slice(1).join(' '), `plugin marketplace add ${repo} --scope user`);

  const g = home();
  sh({ home: g }, 'global');
  assert.ok(existsSync(join(g, '.agents/skills/sw-init/SKILL.md')));
  assert.ok(!existsSync(join(g, '.copilot')));
});

test('re-running is safe, and a link that reaches the clone through another folder counts as ours', () => {
  const h = home();
  sh({ home: h }, 'codex');
  assert.match(sh({ home: h }, 'codex').stdout, /linked {3}sw-plan/);
  mkdirSync(join(h, '.copilot/skills'), { recursive: true });
  symlinkSync('../../.agents/skills/sw-init', join(h, '.copilot/skills/sw-init'));
  const r = sh({ home: h }, 'copilot');
  assert.equal(r.status, 0, r.stdout);
  assert.equal(readlinkSync(join(h, '.copilot/skills/sw-init')), join(repo, 'skills/init'));
});

test('--project and --copy', () => {
  const h = home();
  const p = project();
  assert.equal(sh({ home: h }, '--project', p, '--copy', 'codex', 'copilot').status, 0);
  assert.ok(existsSync(join(p, '.agents/skills/sw-init/scripts/init.mjs')));
  assert.ok(!lstatSync(join(p, '.agents/skills/sw-plan')).isSymbolicLink());
  assert.ok(!existsSync(join(h, '.agents')));
  sh({ home: h }, '--project', p, '--uninstall', 'codex');
  assert.ok(!existsSync(join(p, '.agents/skills/sw-init')));
});

test('bad input', () => {
  assert.equal(sh().status, 2);
  assert.equal(cli({}, 'frobnicate').status, 2);
  assert.equal(sh({}, 'cursor').status, 2);
});

test('without a terminal nothing is asked and the home folder is used; --global says the same in advance', () => {
  for (const flags of [[], ['--global']]) {
    const h = home();
    const p = project();
    const r = cli({ home: h, cwd: p }, 'install', ...flags, 'codex');
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /Where should/);
    for (const copy of copies) assert.ok(existsSync(join(h, '.agents/skills', copy, 'SKILL.md')), copy);
    assert.ok(!existsSync(join(p, '.agents')));
  }
});

test('--project installs marked copies into the project and nothing into the home folder', () => {
  const h = home();
  const p = project();
  const r = cli({ home: h }, 'install', '--project', p, 'codex', 'copilot');
  assert.equal(r.status, 0, r.stderr);
  for (const copy of copies) {
    assert.ok(!lstatSync(join(p, '.agents/skills', copy)).isSymbolicLink());
    assert.ok(existsSync(join(p, '.agents/skills', copy, '.sw-installed')), copy);
  }
  assert.deepEqual(readdirSync(h), []);
  assert.equal(cli({ home: h }, 'install', '--global', '--project', p, 'codex').status, 2, 'two places at once');
});

test('--link into a project warns that the links stay on this machine', () => {
  const h = home();
  const linked = cli({ home: h }, 'install', '--project', project(), '--link', 'codex');
  assert.equal(linked.status, 0, linked.stderr);
  assert.match(linked.stderr, /links point into this machine/);
  assert.doesNotMatch(cli({ home: h }, 'install', '--link', 'codex').stderr, /links point/);
  assert.doesNotMatch(cli({ home: h }, 'install', '--project', project(), 'codex').stderr, /links point/);
});

test('a foreign skill of the same name in a project is kept and reported', () => {
  const p = project();
  mkdirSync(join(p, '.agents/skills/sw-init'), { recursive: true });
  writeFileSync(join(p, '.agents/skills/sw-init/SKILL.md'), 'mine');
  const r = cli({}, 'install', '--project', p, 'codex');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /skipped {2}sw-init/);
  assert.equal(read(join(p, '.agents/skills/sw-init/SKILL.md')), 'mine');
  assert.ok(existsSync(join(p, '.agents/skills/sw-plan/.sw-installed')));
});

// sw:plan and sw:implement name the role files as `<skill-dir>/assets/<role>.md`. That form has to
// resolve in every layout a session can load the skills from: the plugin (the checkout's bare
// folders), a copy (`sw-<name>` folders) and a link (an `sw-<name>` entry that reaches the checkout).
test('the role files sw:plan and sw:implement name resolve in the plugin, a copy and a link', () => {
  const copied = home();
  assert.equal(cli({ home: copied }, 'install', 'copilot').status, 0);
  const linked = home();
  assert.equal(sh({ home: linked }, 'copilot').status, 0);
  const layouts = {
    plugin: name => join(repo, 'skills', name),
    copy: name => join(copied, '.copilot/skills', `sw-${name}`),
    link: name => join(linked, '.copilot/skills', `sw-${name}`),
  };
  const expected = { plan: ['planner.md'], implement: ['implementer.md', 'reviewer.md'] };

  for (const [layout, dir] of Object.entries(layouts)) {
    for (const [skill, files] of Object.entries(expected)) {
      const text = read(join(dir(skill), 'SKILL.md'));
      const named = [...new Set([...text.matchAll(/<skill-dir>\/assets\/([a-z]+\.md)/g)].map(m => m[1]))].sort();
      assert.deepEqual(named, files, `${layout}: sw:${skill} names exactly its role files`);
      for (const file of files) {
        const path = join(dir(skill), 'assets', file);
        assert.ok(existsSync(path), `${layout}: ${path} resolves`);
      }
    }
  }
  for (const name of names) {
    assert.doesNotMatch(read(join(repo, 'skills', name, 'SKILL.md')), /\.\.\/config\//, `sw:${name} names no ../config/ path`);
  }
});
