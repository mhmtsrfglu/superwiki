import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const bin = join(repo, 'bin/superwiki.mjs');
const script = join(repo, 'install.sh');
// The skills by their folder names, sw-<name>: every install carries the same names.
const names = readdirSync(join(repo, 'skills')).filter(name => existsSync(join(repo, 'skills', name, 'SKILL.md'))).sort();
const home = () => mkdtempSync(join(tmpdir(), 'sw-home-'));
const project = () => mkdtempSync(join(tmpdir(), 'sw-proj-'));
const read = path => readFileSync(path, 'utf8');
const nameLine = path => read(path).match(/^name: .*$/m)?.[0];
// The plugin and the marketplace that versions before T-30 installed in Claude Code.
const cleanup = scope => [`plugin uninstall sw@superwiki --scope ${scope}`, `plugin marketplace remove superwiki --scope ${scope}`];

// Stands in for Claude Code's CLI: each call appends its working directory and arguments to a log,
// then prints `output` and exits with `status`.
function claudeStub({ output = '', status = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sw-claude-'));
  const log = join(dir, 'calls.log');
  writeFileSync(join(dir, 'claude'), `#!/bin/sh\nprintf '%s\\n' "$(pwd -P) $*" >> '${log}'\nprintf '%s\\n' '${output}' >&2\nexit ${status}\n`, { mode: 0o755 });
  return {
    env: { PATH: `${dir}:${process.env.PATH}` },
    calls: () => (existsSync(log) ? read(log).trim().split('\n') : []),
    args: () => (existsSync(log) ? read(log).trim().split('\n').map(call => call.split(' ').slice(1).join(' ')) : []),
  };
}
// A PATH with node and the shell tools but no `claude`, so no test reaches the real Claude Code.
const nodeOnly = mkdtempSync(join(tmpdir(), 'sw-node-'));
symlinkSync(process.execPath, join(nodeOnly, 'node'));
const noClaude = { PATH: [nodeOnly, '/usr/bin', '/bin'].join(':') };

// Runs the installer as `npx superwiki` does: stdin is a pipe, not a terminal.
function cli({ home: HOME = home(), cwd = process.cwd(), env = {} } = {}, ...args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', cwd, env: { ...process.env, ...noClaude, HOME, ...env } });
}
// Runs install.sh as a clone's user does: it links unless --copy is given.
function sh({ home: HOME = home(), env = {} } = {}, ...args) {
  return spawnSync('bash', [script, ...args], { encoding: 'utf8', env: { ...process.env, ...noClaude, HOME, SUPERWIKI_HOME: '', ...env } });
}

// Each skill folder in `dir` is a real folder, byte-identical to the checkout's, and carries the marker.
function assertCopies(dir) {
  for (const name of names) {
    const folder = join(dir, name);
    assert.ok(!lstatSync(folder).isSymbolicLink(), folder);
    assert.equal(read(join(folder, 'SKILL.md')), read(join(repo, 'skills', name, 'SKILL.md')), `${folder} is the checkout's SKILL.md unchanged`);
    assert.ok(existsSync(join(folder, '.sw-installed')), `${folder} marker`);
  }
}

test('claude: a copy of each skill as sw-<name> in ~/.claude/skills, after the earlier plugin and its marketplace are removed', () => {
  const stub = claudeStub();
  const h = home();
  const r = cli({ home: h, env: stub.env }, 'install', 'claude');
  assert.equal(r.status, 0, r.stderr);
  assertCopies(join(h, '.claude/skills'));
  assert.deepEqual(readdirSync(join(h, '.claude/skills')).sort(), names);
  const cwd = realpathSync(process.cwd());
  assert.deepEqual(stub.calls(), cleanup('user').map(call => `${cwd} ${call}`));
  assert.match(r.stdout, /^claude: .*\.claude\/skills$/m);
  assert.match(r.stdout, /^ {2}removed {2}plugin sw@superwiki$/m);
  assert.match(r.stdout, /^ {2}removed {2}marketplace superwiki$/m);
  assert.match(r.stdout, /copied {3}sw-plan/);
});

test('claude: --project copies into <project>/.claude/skills and removes the plugin at project scope, from the project folder', () => {
  const stub = claudeStub();
  const h = home();
  const p = project();
  const r = cli({ home: h, env: stub.env }, 'install', '--project', p, 'claude');
  assert.equal(r.status, 0, r.stderr);
  assertCopies(join(p, '.claude/skills'));
  assert.deepEqual(stub.calls(), cleanup('project').map(call => `${realpathSync(p)} ${call}`));
  assert.deepEqual(readdirSync(h), [], 'nothing in the home folder');
});

test('claude: no earlier plugin, or no claude command on PATH, installs the copies without a word about the plugin', () => {
  const stub = claudeStub({ output: 'Plugin "sw@superwiki" not found', status: 1 });
  const h = home();
  const r = cli({ home: h, env: stub.env }, 'install', 'claude');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(stub.args(), cleanup('user'));
  assert.doesNotMatch(r.stdout + r.stderr, /removed|plugin|marketplace/);
  assertCopies(join(h, '.claude/skills'));

  const g = home();
  const none = cli({ home: g }, 'install', 'claude', 'codex');
  assert.equal(none.status, 0, none.stderr);
  assert.doesNotMatch(none.stdout + none.stderr, /removed|plugin|marketplace/);
  assertCopies(join(g, '.claude/skills'));
  assertCopies(join(g, '.agents/skills'));
});

test('claude: a cleanup that fails otherwise names the command to run by hand and fails the run; the copies are made', () => {
  const stub = claudeStub({ output: 'permission denied', status: 3 });
  const h = home();
  const r = cli({ home: h, env: stub.env }, 'install', 'claude');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /claude plugin uninstall sw@superwiki --scope user/);
  assert.match(r.stderr, /claude plugin marketplace remove superwiki --scope user/);
  assert.doesNotMatch(r.stdout, /removed/);
  assertCopies(join(h, '.claude/skills'));
});

test('claude: uninstall removes the plugin and its marketplace and our copies, and keeps a foreign sw-plan', () => {
  const h = home();
  assert.equal(cli({ home: h }, 'install', 'claude').status, 0);
  writeFileSync(join(h, '.claude/skills/sw-plan/SKILL.md'), 'mine');
  // A folder without the marker is someone else's.
  execFileSync('rm', [join(h, '.claude/skills/sw-plan/.sw-installed')]);
  const stub = claudeStub();
  const un = cli({ home: h, env: stub.env }, 'uninstall', 'claude');
  assert.equal(un.status, 0, un.stderr);
  assert.deepEqual(stub.args(), cleanup('user'));
  assert.match(un.stdout, /removed {2}plugin sw@superwiki/);
  assert.match(un.stdout, /removed {2}sw-init/);
  assert.match(un.stdout, /kept {5}sw-plan/);
  assert.deepEqual(readdirSync(join(h, '.claude/skills')), ['sw-plan']);
  assert.equal(read(join(h, '.claude/skills/sw-plan/SKILL.md')), 'mine');

  const p = project();
  const projectStub = claudeStub();
  assert.equal(cli({ env: projectStub.env }, 'uninstall', '--project', p, 'claude').status, 0);
  assert.deepEqual(projectStub.calls(), cleanup('project').map(call => `${realpathSync(p)} ${call}`));
});

test('codex, copilot and global get copies named sw-<name>, unchanged from the checkout, with the marker set', () => {
  const h = home();
  const r = cli({ home: h }, 'install', 'codex', 'copilot', 'global');
  assert.equal(r.status, 0, r.stderr);
  assertCopies(join(h, '.agents/skills'));
  assertCopies(join(h, '.copilot/skills'));
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

test('install.sh links every skill to this clone, Claude Code\'s included, after removing the earlier plugin', () => {
  const stub = claudeStub();
  const h = home();
  const r = sh({ home: h, env: stub.env }, 'all');
  assert.equal(r.status, 0, r.stderr);
  for (const dir of ['.claude/skills', '.agents/skills', '.copilot/skills']) {
    for (const name of names) assert.equal(readlinkSync(join(h, dir, name)), join(repo, 'skills', name));
  }
  assert.equal(nameLine(join(h, '.claude/skills/sw-plan/SKILL.md')), 'name: sw-plan');
  assert.deepEqual(stub.args(), cleanup('user'));

  const g = home();
  sh({ home: g }, 'global');
  assert.ok(existsSync(join(g, '.agents/skills/sw-init/SKILL.md')));
  assert.ok(!existsSync(join(g, '.copilot')));
  assert.ok(!existsSync(join(g, '.claude')));
});

test('re-running is safe, and a link that reaches the clone through another folder counts as ours', () => {
  const h = home();
  sh({ home: h }, 'codex');
  assert.match(sh({ home: h }, 'codex').stdout, /linked {3}sw-plan/);
  mkdirSync(join(h, '.copilot/skills'), { recursive: true });
  symlinkSync('../../.agents/skills/sw-init', join(h, '.copilot/skills/sw-init'));
  const r = sh({ home: h }, 'copilot');
  assert.equal(r.status, 0, r.stdout);
  assert.equal(readlinkSync(join(h, '.copilot/skills/sw-init')), join(repo, 'skills/sw-init'));
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

test('the help names the skills sw-<name> for every agent and the plugin only as what install claude removes', () => {
  const help = cli({}, '--help').stdout;
  assert.match(help, /claude +~\/\.claude\/skills +Claude Code/);
  assert.match(help, /\/sw-plan in Claude Code and Copilot/);
  assert.match(help, /\$sw-plan in Codex/);
  assert.match(help, /--link/);
  assert.doesNotMatch(help, /sw:[a-z]/);
  assert.doesNotMatch(read(script), /sw:[a-z]/);
});

test('without a terminal nothing is asked and the home folder is used; --global says the same in advance', () => {
  for (const flags of [[], ['--global']]) {
    const h = home();
    const p = project();
    const r = cli({ home: h, cwd: p }, 'install', ...flags, 'codex');
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /Where should/);
    for (const name of names) assert.ok(existsSync(join(h, '.agents/skills', name, 'SKILL.md')), name);
    assert.ok(!existsSync(join(p, '.agents')));
  }
});

test('--project installs marked copies into the project and nothing into the home folder', () => {
  const h = home();
  const p = project();
  const r = cli({ home: h }, 'install', '--project', p, 'codex', 'copilot');
  assert.equal(r.status, 0, r.stderr);
  for (const name of names) {
    assert.ok(!lstatSync(join(p, '.agents/skills', name)).isSymbolicLink());
    assert.ok(existsSync(join(p, '.agents/skills', name, '.sw-installed')), name);
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

// sw-plan and sw-implement name the role files as `<skill-dir>/assets/<role>.md`, init.mjs copies the
// skills beside its own, and config.mjs reads the role files beside its own. All three have to work
// in every layout a session can load the skills from: the checkout, a copy and a link. A foreign
// skill next to a copy or a link is not ours and must not be copied.
test('the role files, init.mjs --skills and config.mjs work from the checkout, a copy and a link', () => {
  const copied = home();
  assert.equal(cli({ home: copied }, 'install', 'copilot').status, 0);
  const linked = home();
  assert.equal(sh({ home: linked }, 'copilot').status, 0);
  for (const h of [copied, linked]) {
    mkdirSync(join(h, '.copilot/skills/other-skill'), { recursive: true });
    writeFileSync(join(h, '.copilot/skills/other-skill/SKILL.md'), '---\nname: other-skill\ndescription: not ours\n---\n');
  }
  const layouts = {
    checkout: join(repo, 'skills'),
    copy: join(copied, '.copilot/skills'),
    link: join(linked, '.copilot/skills'),
  };
  const expected = { 'sw-plan': ['planner.md'], 'sw-implement': ['implementer.md', 'reviewer.md'] };

  for (const [layout, skills] of Object.entries(layouts)) {
    for (const [skill, files] of Object.entries(expected)) {
      const text = read(join(skills, skill, 'SKILL.md'));
      const named = [...new Set([...text.matchAll(/<skill-dir>\/assets\/([a-z]+\.md)/g)].map(m => m[1]))].sort();
      assert.deepEqual(named, files, `${layout}: ${skill} names exactly its role files`);
      for (const file of files) assert.ok(existsSync(join(skills, skill, 'assets', file)), `${layout}: ${skill}/assets/${file} resolves`);
    }

    const p = project();
    execFileSync('node', [join(skills, 'sw-init/scripts/init.mjs'), '--root', p, '--tasks', '--skills', 'all'], { encoding: 'utf8' });
    for (const dir of ['.claude/skills', '.agents/skills']) {
      assert.deepEqual(readdirSync(join(p, dir)).sort(), names, `${layout}: ${dir} holds the 19 sw-* skills and nothing else`);
      for (const name of names) {
        assert.equal(read(join(p, dir, name, 'SKILL.md')), read(join(repo, 'skills', name, 'SKILL.md')), `${layout}: ${dir}/${name}`);
      }
    }

    execFileSync('node', [join(skills, 'sw-config/scripts/config.mjs'), 'sync', '--tools', 'claude', '--root', p], { encoding: 'utf8' });
    assert.ok(
      read(join(p, '.claude/agents/sw-planner.md')).includes(read(join(skills, 'sw-plan/assets/planner.md')).trim()),
      `${layout}: sw-planner.md is written from sw-plan/assets/planner.md`,
    );
  }
  for (const name of names) {
    assert.doesNotMatch(read(join(repo, 'skills', name, 'SKILL.md')), /\.\.\/(sw-)?config\//, `${name} names no ../config/ path`);
  }
});
