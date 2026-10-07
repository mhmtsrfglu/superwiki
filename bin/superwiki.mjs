#!/usr/bin/env node
// Installs Superwiki for each coding agent. Claude Code gets the plugin `sw`, installed through
// Claude Code's own plugin CLI from the GitHub marketplace or, with --link, from this checkout; it
// names the skills sw:<name>. Codex, Copilot CLI and the other agents that read ~/.agents/skills
// have no namespace, so they get a copy of each skill as sw-<name>, in the home folder for every
// project on this machine or in one project, committed with the repository. `--link` links the
// copies to this checkout instead, which is what install.sh does for a git clone.
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
// Claude Code's plugin, by its id in the marketplace, and where the marketplace comes from.
const PLUGIN = 'sw@superwiki';
const MARKETPLACE = 'mhmtsrfglu/superwiki';
// The name a copied skill carries where there is no namespace.
const COPY_PREFIX = 'sw-';

const HELP = `Usage: superwiki install [options] <target>...
       superwiki uninstall [options] <target>...

Targets:
  claude     the plugin ${PLUGIN}, via claude plugin install   Claude Code
  codex      ~/.agents/skills                                Codex CLI
  copilot    ~/.copilot/skills                               GitHub Copilot CLI
  global     ~/.agents/skills                                the shared folder: Codex, Copilot CLI
                                                             and other agents that read it
                                                             (Claude Code does not)
  all        claude + codex + copilot

Claude Code invokes the skills as sw:<name> (sw:plan, sw:implement). Codex and Copilot CLI have
no namespace: there each skill is a copy named sw-<name>.

Options:
  --global         use your home folder: the skills serve every project on this machine
  --project <dir>  use that project instead: the plugin at project scope for claude
                   (.claude/settings.json), .agents/skills for the others; committed with the
                   repository, the skills reach cloud agents too
  --link           link the copies to this copy of Superwiki instead of copying them, and add this
                   copy as the plugin's marketplace (for a git clone: updating the clone then
                   updates every agent)
  --force          replace or remove a skill folder that Superwiki did not install
  -v, --version    print the version
  -h, --help       show this help

install asks "home folder or this project" when it runs in a terminal and neither --global nor
--project is given; outside a terminal it uses the home folder. uninstall never asks: it works
on the home folder unless --project is given.

Examples:
  npx superwiki install claude
  npx superwiki install claude codex
  npx superwiki install --global all
  npx superwiki install --project ~/code/my-app all
  npx superwiki uninstall copilot

Run the same command again after a new release to update. Then start a new agent session
and run sw:init in a project.`;

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

// ---------- Claude Code: the plugin ----------
// Claude Code loads the plugin from its marketplace; its own CLI registers the marketplace and
// installs or removes the plugin at user or project scope. Writing the settings by hand would
// enable a plugin that is never fetched. Returns the exit status.
function pluginCommands() {
  const scope = project ? 'project' : 'user';
  if (command === 'uninstall') return [['plugin', 'uninstall', PLUGIN, '--scope', scope]];
  const source = link ? root : MARKETPLACE;
  return [['plugin', 'marketplace', 'add', source, '--scope', scope], ['plugin', 'install', PLUGIN, '--scope', scope]];
}

function runPlugin() {
  console.log(`claude: the plugin ${PLUGIN}, ${project ? `project scope (${project})` : 'user scope'}`);
  for (const args of pluginCommands()) {
    const run = spawnSync('claude', args, { stdio: 'inherit', cwd: project || process.cwd() });
    if (run.error?.code === 'ENOENT') {
      console.error(`  claude was not found on PATH. Install Claude Code, or run there: claude ${args.join(' ')}`);
      return 1;
    }
    if (run.status !== 0) {
      console.error(`  claude ${args.join(' ')} failed (exit ${run.status})`);
      return 1;
    }
  }
  return 0;
}

// ---------- The other agents: copies ----------

const destFor = t => (project
  ? join(project, '.agents/skills')
  : join(homedir(), t === 'copilot' ? '.copilot/skills' : '.agents/skills'));

const exists = p => { try { lstatSync(p); return true; } catch { return false; } };
// Ours: a link that ends up in this copy's skills folder, or a copy carrying the marker file.
function isOurs(p, skill) {
  if (lstatSync(p).isSymbolicLink()) {
    if (readlinkSync(p).startsWith(skillsDir + '/')) return true;
    try { return realpathSync(p) === realpathSync(join(skillsDir, skill)); } catch { return false; }
  }
  return existsSync(join(p, MARKER));
}

// A copy of a skill folder whose SKILL.md carries the copy's name, so the agent lists it as such.
function copySkill(from, to, name) {
  cpSync(from, to, { recursive: true });
  const skillFile = join(to, 'SKILL.md');
  writeFileSync(skillFile, readFileSync(skillFile, 'utf8').replace(/^name: .*$/m, `name: ${name}`));
  writeFileSync(join(to, MARKER), '');
}

const skills = readdirSync(skillsDir).filter(n => existsSync(join(skillsDir, n, 'SKILL.md'))).sort();
let status = 0;
if (targets.includes('claude') && runPlugin() !== 0) status = 1;

const seen = new Set();
for (const target of targets.filter(t => t !== 'claude')) {
  const dest = destFor(target);
  if (seen.has(dest)) continue;   // codex and global share a folder
  seen.add(dest);
  console.log(`${target}: ${dest}`);
  if (command === 'install') mkdirSync(dest, { recursive: true });
  for (const skill of skills) {
    const name = COPY_PREFIX + skill;
    const path = join(dest, name);
    if (exists(path)) {
      if (!isOurs(path, skill) && !force) {
        if (command === 'install') { console.log(`  skipped  ${name} (a different ${name} is already there; --force replaces it)`); status = 1; }
        else console.log(`  kept     ${name} (not installed by Superwiki; --force removes it)`);
        continue;
      }
      rmSync(path, { recursive: true, force: true });
      if (command === 'uninstall') console.log(`  removed  ${name}`);
    }
    if (command === 'uninstall') continue;
    if (link) { symlinkSync(join(skillsDir, skill), path); console.log(`  linked   ${name}`); }
    else { copySkill(join(skillsDir, skill), path, name); console.log(`  copied   ${name}`); }
  }
}

if (command === 'install') {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) console.error(`warning: Node ${major} found; the Superwiki scripts need Node 18 or newer`);
  console.log('\nStart a new agent session, then run sw:init in a project.');
}
process.exit(status);
