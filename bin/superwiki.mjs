#!/usr/bin/env node
// Installs the Superwiki skills into the folder each coding agent reads.
// Run from npm (`npx superwiki install claude`) it copies them; `--link` links them to this
// checkout instead, which is what install.sh does for a git clone.
import { existsSync, lstatSync, readlinkSync, realpathSync, mkdirSync, readdirSync, rmSync, cpSync, symlinkSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = join(root, 'skills');
const TARGETS = ['claude', 'codex', 'copilot', 'global'];
const MARKER = '.sw-installed';

const HELP = `Usage: superwiki install [options] <target>...
       superwiki uninstall [options] <target>...

Targets:
  claude     ~/.claude/skills    Claude Code
  codex      ~/.agents/skills    Codex CLI
  copilot    ~/.copilot/skills   GitHub Copilot CLI
  global     ~/.agents/skills    the shared folder: Codex, Copilot CLI and other agents that read it
                                 (Claude Code does not)
  all        claude + codex + copilot

Options:
  --project <dir>  install into that project instead of your home folder
                   (.claude/skills for claude, .agents/skills for the others)
  --link           link the skills to this copy of Superwiki instead of copying them
                   (for a git clone: updating the clone then updates every agent)
  --force          replace or remove a skill folder that Superwiki did not install
  -v, --version    print the version
  -h, --help       show this help

Examples:
  npx superwiki install claude
  npx superwiki install claude codex
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
let link = false;
let force = false;
const targets = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--project') { project = argv[++i] || fail('--project needs a folder'); }
  else if (a === '--link') link = true;
  else if (a === '--force') force = true;
  else if (a === 'all') targets.push('claude', 'codex', 'copilot');
  else if (TARGETS.includes(a)) targets.push(a);
  else fail(`unknown argument: ${a}\n\n${HELP}`);
}
if (!targets.length) fail(`name at least one target: ${TARGETS.join(', ')}, all`);
if (!existsSync(skillsDir)) fail(`no skills/ folder in ${root}`, 1);
if (project) {
  if (!existsSync(project) || !statSync(project).isDirectory()) fail(`no such project folder: ${project}`, 1);
  project = realpathSync(project);
}

const destFor = t => (project
  ? join(project, t === 'claude' ? '.claude/skills' : '.agents/skills')
  : join(homedir(), t === 'claude' ? '.claude/skills' : t === 'copilot' ? '.copilot/skills' : '.agents/skills'));

const exists = p => { try { lstatSync(p); return true; } catch { return false; } };
// Ours: a link that ends up in this copy's skills folder, or a copy carrying the marker file.
function isOurs(p, name) {
  if (lstatSync(p).isSymbolicLink()) {
    if (readlinkSync(p).startsWith(skillsDir + '/')) return true;
    try { return realpathSync(p) === realpathSync(join(skillsDir, name)); } catch { return false; }
  }
  return existsSync(join(p, MARKER));
}

const skills = readdirSync(skillsDir).filter(n => n.startsWith('sw-') && statSync(join(skillsDir, n)).isDirectory()).sort();
const seen = new Set();
let status = 0;
for (const target of targets) {
  const dest = destFor(target);
  if (seen.has(dest)) continue;   // codex and global share a folder
  seen.add(dest);
  console.log(`${target}: ${dest}`);
  if (command === 'install') mkdirSync(dest, { recursive: true });
  for (const name of skills) {
    const path = join(dest, name);
    if (exists(path)) {
      if (!isOurs(path, name) && !force) {
        if (command === 'install') { console.log(`  skipped  ${name} (a different ${name} is already there; --force replaces it)`); status = 1; }
        else console.log(`  kept     ${name} (not installed by Superwiki; --force removes it)`);
        continue;
      }
      rmSync(path, { recursive: true, force: true });
      if (command === 'uninstall') console.log(`  removed  ${name}`);
    }
    if (command === 'uninstall') continue;
    if (link) { symlinkSync(join(skillsDir, name), path); console.log(`  linked   ${name}`); }
    else { cpSync(join(skillsDir, name), path, { recursive: true }); writeFileSync(join(path, MARKER), ''); console.log(`  copied   ${name}`); }
  }
}

if (command === 'install') {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) console.error(`warning: Node ${major} found; the Superwiki scripts need Node 18 or newer`);
  console.log('\nStart a new agent session, then run sw-init in a project.');
}
process.exit(status);
