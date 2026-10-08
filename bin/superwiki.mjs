#!/usr/bin/env node
// Installs Superwiki for each coding agent: a copy of each skill folder, named sw-<name> as it is
// in this checkout, in the folder the agent reads skills from, in the home folder for every project
// on this machine or in one project, committed with the repository. `--link` links the folders to
// this checkout instead, which is what install.sh does for a git clone. Every agent invokes the
// skills by the folder name: /sw-plan in Claude Code and Copilot, $sw-plan in Codex.
// Earlier versions installed Claude Code's skills as the plugin sw@superwiki; installing or
// uninstalling for claude removes that plugin and its marketplace, so no session lists both.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readlinkSync, realpathSync, mkdirSync, readdirSync, rmSync, cpSync, symlinkSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = join(root, 'skills');
const TARGETS = ['claude', 'codex', 'copilot', 'global'];
const MARKER = '.sw-installed';
// The Claude Code plugin of earlier versions, by its id, and the marketplace it came from.
const OLD_PLUGIN = 'sw@superwiki';
const OLD_MARKETPLACE = 'superwiki';

const HELP = `Usage: superwiki install [options] <target>...
       superwiki uninstall [options] <target>...

Targets:
  claude     ~/.claude/skills     Claude Code
  codex      ~/.agents/skills     Codex CLI
  copilot    ~/.copilot/skills    GitHub Copilot CLI
  global     ~/.agents/skills     the shared folder: Codex, Copilot CLI and other agents
                                  that read it (Claude Code does not)
  all        claude + codex + copilot

Each skill is a folder named sw-<name>, and every agent invokes it by that name:
/sw-plan in Claude Code and Copilot, $sw-plan in Codex.

Options:
  --global         use your home folder: the skills serve every project on this machine
  --project <dir>  use that project instead: .claude/skills for claude, .agents/skills for the
                   others; committed with the repository, the skills reach cloud agents too
  --link           link the skill folders to this copy of Superwiki instead of copying them
                   (for a git clone: updating the clone then updates every agent)
  --force          replace or remove a skill folder that Superwiki did not install
  -v, --version    print the version
  -h, --help       show this help

install asks "home folder or this project" when it runs in a terminal and neither --global nor
--project is given; outside a terminal it uses the home folder. uninstall never asks: it works
on the home folder unless --project is given.

For claude, install and uninstall also remove the plugin ${OLD_PLUGIN} and its marketplace
${OLD_MARKETPLACE}, which earlier versions installed, at the same scope (user, or project with
--project), through the claude command when it is on PATH.

Examples:
  npx superwiki install claude
  npx superwiki install claude codex
  npx superwiki install --global all
  npx superwiki install --project ~/code/my-app all
  npx superwiki uninstall copilot

Run the same command again after a new release to update. Then start a new agent session
and run sw-init in a project.`;

const argv = process.argv.slice(2);
const fail = (msg, code = 2) => { console.error(msg); process.exit(code); };
if (argv.includes('-h') || argv.includes('--help') || !argv.length) { console.log(HELP); process.exit(argv.length ? 0 : 2); }
if (argv.includes('-v') || argv.includes('--version')) { console.log(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version); process.exit(0); }

const command = argv[0];
if (command !== 'install' && command !== 'uninstall') fail(`unknown command: ${command}\n\n${HELP}`);
let project = '';
let global = false;
let link = false;
let force = false;
const targets = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--project') { project = argv[++i] || fail('--project needs a folder'); }
  else if (a === '--global') global = true;
  else if (a === '--link') link = true;
  else if (a === '--force') force = true;
  else if (a === 'all') targets.push('claude', 'codex', 'copilot');
  else if (TARGETS.includes(a)) targets.push(a);
  else fail(`unknown argument: ${a}\n\n${HELP}`);
}
if (global && project) fail('--global and --project exclude each other: name one place');
if (!targets.length) fail(`name at least one target: ${TARGETS.join(', ')}, all`);
if (!existsSync(skillsDir)) fail(`no skills/ folder in ${root}`, 1);
if (project) {
  if (!existsSync(project) || !statSync(project).isDirectory()) fail(`no such project folder: ${project}`, 1);
  project = realpathSync(project);
}

// The one question of an install. True means the current directory, as a project. Input that
// ends before a valid answer counts as the default, the home folder.
async function askForProject(cwd) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // A last line and the end of input can arrive together; the line has to win, so the end waits a turn.
  const ended = new Promise(done => rl.once('close', () => setImmediate(done, null)));
  console.log(`Where should the skills go?
  1) home folder: every project on this machine
  2) this project (${cwd}): committed with the repository, so cloud agents get them`);
  try {
    for (;;) {
      const answer = await Promise.race([rl.question('Choice [1]: ').catch(() => null), ended]);
      if (answer === null) return false;
      const choice = answer.trim();
      if (choice === '' || choice === '1') return false;
      if (choice === '2') return true;
      console.log('Answer 1 or 2.');
    }
  } finally {
    rl.close();
  }
}

if (command === 'install' && !project && !global && process.stdin.isTTY) {
  const cwd = realpathSync(process.cwd());
  if (await askForProject(cwd)) project = cwd;
}
if (command === 'install' && link && project) {
  console.error('warning: --link into a project: the links point into this machine and will not work in a clone or a cloud session; leave --link out to copy');
}

// ---------- Claude Code: the plugin of earlier versions ----------
// Its skills would be listed beside the copies, under the old names, so it goes before the copies
// come in, through Claude Code's own CLI and at the scope the copies go to. Nothing installed, or no
// claude command, is the usual case and says nothing. Returns the exit status.
function removeOldPlugin() {
  const scope = project ? 'project' : 'user';
  const steps = [
    { what: `plugin ${OLD_PLUGIN}`, args: ['plugin', 'uninstall', OLD_PLUGIN, '--scope', scope] },
    { what: `marketplace ${OLD_MARKETPLACE}`, args: ['plugin', 'marketplace', 'remove', OLD_MARKETPLACE, '--scope', scope] },
  ];
  let result = 0;
  for (const { what, args } of steps) {
    const run = spawnSync('claude', args, { encoding: 'utf8', cwd: project || process.cwd() });
    if (run.error?.code === 'ENOENT') return 0;
    if (run.status === 0) { console.log(`  removed  ${what}`); continue; }
    const said = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim();
    if (/not found/i.test(said)) continue;
    console.error(`  could not remove the earlier ${what} (exit ${run.status ?? run.signal}${said ? `: ${said.split('\n').pop()}` : ''}); run by hand: claude ${args.join(' ')}`);
    result = 1;
  }
  return result;
}

// ---------- Every agent: a copy or a link of each skill folder ----------

function destFor(target) {
  if (target === 'claude') return join(project || homedir(), '.claude/skills');
  if (project) return join(project, '.agents/skills');
  return join(homedir(), target === 'copilot' ? '.copilot/skills' : '.agents/skills');
}

const exists = p => { try { lstatSync(p); return true; } catch { return false; } };
// Ours: a link that ends up in this copy's skills folder, or a copy carrying the marker file.
function isOurs(p, skill) {
  if (lstatSync(p).isSymbolicLink()) {
    if (readlinkSync(p).startsWith(skillsDir + '/')) return true;
    try { return realpathSync(p) === realpathSync(join(skillsDir, skill)); } catch { return false; }
  }
  return existsSync(join(p, MARKER));
}

// A copy of a skill folder, unchanged, plus the marker that makes it Superwiki's.
function copySkill(from, to) {
  cpSync(from, to, { recursive: true });
  writeFileSync(join(to, MARKER), '');
}

const skills = readdirSync(skillsDir).filter(n => existsSync(join(skillsDir, n, 'SKILL.md'))).sort();
let status = 0;
const seen = new Set();
for (const target of targets) {
  const dest = destFor(target);
  if (seen.has(dest)) continue;   // codex and global share a folder, and so do codex and copilot in a project
  seen.add(dest);
  console.log(`${target}: ${dest}`);
  if (target === 'claude' && removeOldPlugin() !== 0) status = 1;
  if (command === 'install') mkdirSync(dest, { recursive: true });
  for (const skill of skills) {
    const path = join(dest, skill);
    if (exists(path)) {
      if (!isOurs(path, skill) && !force) {
        if (command === 'install') { console.log(`  skipped  ${skill} (a different ${skill} is already there; --force replaces it)`); status = 1; }
        else console.log(`  kept     ${skill} (not installed by Superwiki; --force removes it)`);
        continue;
      }
      rmSync(path, { recursive: true, force: true });
      if (command === 'uninstall') console.log(`  removed  ${skill}`);
    }
    if (command === 'uninstall') continue;
    if (link) { symlinkSync(join(skillsDir, skill), path); console.log(`  linked   ${skill}`); }
    else { copySkill(join(skillsDir, skill), path); console.log(`  copied   ${skill}`); }
  }
}

if (command === 'install') {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) console.error(`warning: Node ${major} found; the Superwiki scripts need Node 18 or newer`);
  console.log('\nStart a new agent session, then run sw-init in a project: /sw-init in Claude Code and Copilot, $sw-init in Codex.');
}
process.exit(status);
