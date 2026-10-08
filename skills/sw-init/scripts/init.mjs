#!/usr/bin/env node
// Scaffolds docs/ as a Superwiki vault. Safe to re-run: user content is kept, tool files are
// replaced with this version, and the report says which was which. On request it also keeps a
// copy of the Superwiki skills in the project, for agents that start from a clone.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(SKILL_DIR, 'assets');
// The folder of a project each agent reads skills from. Codex and Copilot share one.
const SKILL_FOLDERS = { claude: '.claude/skills', codex: '.agents/skills', copilot: '.agents/skills' };
// Every Superwiki skill folder is named sw-<name>, in the checkout and in every copy or link.
const SKILL_PREFIX = 'sw-';
// An empty file in a skill folder that Superwiki copied; the installer writes the same one.
const INSTALLED_MARKER = '.sw-installed';
const AREA_ID = /^[A-Za-z][A-Za-z0-9]*$/;
const MANAGED_BLOCK = /<!-- sw:start[\s\S]*?<!-- sw:end -->/;
// What a vault consists of at the top of docs/. Anything else there belongs to someone else.
const VAULT_ENTRIES = ['index.md', 'log.md', 'raw', 'wiki', 'tasks', 'plans', 'viewer.html'];
const ROLES = ['plan', 'implement', 'review'];
const NEW_INDEX = '# Index\n\n## Wiki\n\nCatalog of the wiki: one line per page, `- [[file-name]]: summary`, grouped by type.\n';

const HELP = `init.mjs [--root <dir>] [--tasks | --no-tasks] [--areas "M=Mobile,B=Backend"]
         [--skills claude,codex,copilot | --no-skills]

  --root       project folder (default: current directory)
  --tasks      add the task module (docs/tasks, docs/plans)
  --no-tasks   wiki only
  --areas      task id prefixes and their names (default: T=Tasks)
  --skills     also keep the Superwiki skills in the project, as sw-<name> folders, for the
               agents named: claude (.claude/skills), codex and copilot (.agents/skills), or all.
               Commit those folders: agents that start from a clone have no home folder.
  --no-skills  stop keeping them in the project (the default; existing copies are not deleted)

Run without flags on an existing vault to upgrade it: the upgrade reuses the saved choices.`;

class UsageError extends Error {}

function parseArgs(argv) {
  const options = { root: '.', tasks: null, areas: {}, skills: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help') options.help = true;
    else if (arg === '--root') options.root = argv[++i] ?? '.';
    else if (arg === '--tasks') options.tasks = true;
    else if (arg === '--no-tasks') options.tasks = false;
    else if (arg === '--areas') options.areas = parseAreas(argv[++i] ?? '');
    else if (arg === '--skills') options.skills = parseSkillAgents(argv[++i] ?? '');
    else if (arg === '--no-skills') options.skills = [];
    else throw new UsageError(`unknown argument: ${arg}\n\n${HELP}`);
  }
  return options;
}

function parseSkillAgents(text) {
  const known = Object.keys(SKILL_FOLDERS);
  const agents = new Set();
  for (const name of text.split(',').map(part => part.trim()).filter(Boolean)) {
    if (name === 'all') known.forEach(agent => agents.add(agent));
    else if (known.includes(name)) agents.add(name);
    else throw new UsageError(`bad agent "${name}" in --skills: ${known.join(', ')} or all`);
  }
  if (!agents.size) throw new UsageError(`--skills needs at least one agent: ${known.join(', ')} or all`);
  return [...agents];
}

function parseAreas(text) {
  const areas = {};
  for (const pair of text.split(',').map(part => part.trim()).filter(Boolean)) {
    const [id, ...name] = pair.split('=');
    if (!AREA_ID.test(id)) throw new UsageError(`bad area id "${id}": letters and digits, starting with a letter`);
    areas[id] = name.join('=').trim() || id;
  }
  return areas;
}

// Collects one report line per file or folder touched. The state of a tool-owned file is
// judged by its content, so an upgrade that changes nothing says "unchanged".
function createReport(root) {
  const lines = [];
  const rel = path => path.slice(root.length + 1);
  const add = (state, text) => lines.push(`${state.padEnd(9)} ${text}`);
  return {
    lines,
    folder(path) {
      if (existsSync(path)) return;
      mkdirSync(path, { recursive: true });
      add('created', `${rel(path)}/`);
    },
    // User content: written once, never replaced.
    keep(path, content) {
      if (existsSync(path)) return add('kept', rel(path));
      writeFileSync(path, content);
      add('created', rel(path));
    },
    // Tool-owned content: always brought up to date.
    write(path, content, label = rel(path)) {
      const before = existsSync(path) ? readFileSync(path, 'utf8') : null;
      if (before !== content) writeFileSync(path, content);
      add(before === null ? 'created' : before === content ? 'unchanged' : 'updated', label);
    },
    copy(from, to) {
      if (existsSync(from)) this.write(to, readFileSync(from, 'utf8'));
      else add('missing', `${rel(to)} (not in this Superwiki build; report this to the user)`);
    },
    line: add,
  };
}

function readConfig(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

// `skills` lists the agents whose project folder holds a copy of the skills; [] means none.
function buildConfig(previous, { root, tasks, areas, skills }) {
  const models = Object.fromEntries(ROLES.map(role => [role, previous?.models?.[role] ?? {}]));
  const chosenAreas = Object.keys(areas).length ? areas : previous?.areas ?? { T: 'Tasks' };
  return {
    version: 1,
    name: previous?.name ?? basename(root),
    tasks,
    areas: tasks ? chosenAreas : {},
    models,
    skills: skills ?? previous?.skills ?? [],
    ...(previous?.tools ? { tools: previous.tools } : {}),
  };
}

// The schema block keeps {{#tasks}}..{{/tasks}} parts with the task module and
// {{^tasks}}..{{/tasks}} parts without it.
function schemaBlock(tasks) {
  return readFileSync(join(ASSETS, 'agents-block.md'), 'utf8')
    .replace(/\{\{#tasks\}\}\n([\s\S]*?)\{\{\/tasks\}\}\n/g, (_, body) => (tasks ? body : ''))
    .replace(/\{\{\^tasks\}\}\n([\s\S]*?)\{\{\/tasks\}\}\n/g, (_, body) => (tasks ? '' : body))
    .trimEnd();
}

function writeVault(docs, tasks, report) {
  const folders = ['raw/assets', 'wiki', ...(tasks ? ['tasks', 'plans'] : [])];
  report.folder(docs);
  for (const folder of ['raw', ...folders, '.sw', '.sw/templates']) report.folder(join(docs, folder));
  // Git drops empty folders; the vault needs them to exist.
  for (const folder of folders) {
    if (!readdirSync(join(docs, folder)).length) writeFileSync(join(docs, folder, '.gitkeep'), '');
  }

  const today = new Date().toISOString().slice(0, 10);
  report.keep(join(docs, 'index.md'), NEW_INDEX);
  report.keep(join(docs, 'log.md'), `# Log\n\nAppend-only. Entry format: \`## [YYYY-MM-DD] kind | title\`.\n\n## [${today}] init | Superwiki vault created\n`);

  // The viewer snapshot and the local server's address are per-machine and regenerated on demand.
  report.write(join(docs, '.sw', '.gitignore'), 'data.js\nserver.json\n');
  report.copy(join(ASSETS, 'sw.mjs'), join(docs, '.sw', 'sw.mjs'));
  report.copy(join(ASSETS, 'viewer.html'), join(docs, 'viewer.html'));
  for (const template of ['page.md', ...(tasks ? ['task.md', 'plan.md', 'guide.md'] : [])]) {
    report.copy(join(ASSETS, 'templates', template), join(docs, '.sw', 'templates', template));
  }
}

// The task list in index.md is the one part of that file the tool owns. The vault's own CLI
// writes it, so an upgraded vault gets the list in the format of the version just installed.
function writeTaskBoard(docs, report) {
  const index = join(docs, 'index.md');
  const cli = join(docs, '.sw', 'sw.mjs');
  if (!existsSync(cli)) return; // already reported as missing
  const before = readFileSync(index, 'utf8');
  const run = spawnSync(process.execPath, [cli, 'index', '--docs', docs], { encoding: 'utf8' });
  if (run.status !== 0) return report.line('note', `the task list in docs/index.md was not written: ${run.stderr.trim()}`);
  report.line(readFileSync(index, 'utf8') === before ? 'unchanged' : 'updated', 'docs/index.md (task list)');
}

function writeAgentRules(root, tasks, report) {
  const block = schemaBlock(tasks);
  const agentsPath = join(root, 'AGENTS.md');
  if (existsSync(agentsPath)) {
    const text = readFileSync(agentsPath, 'utf8');
    const updated = MANAGED_BLOCK.test(text) ? text.replace(MANAGED_BLOCK, () => block) : `${text.trimEnd()}\n\n${block}\n`;
    report.write(agentsPath, updated, 'AGENTS.md (Superwiki block)');
  } else {
    report.write(agentsPath, `# Agent instructions\n\n${block}\n`);
  }

  // Claude Code reads CLAUDE.md, not AGENTS.md; an import keeps one source of truth.
  const claudePath = join(root, 'CLAUDE.md');
  if (!existsSync(claudePath)) {
    writeFileSync(claudePath, '@AGENTS.md\n');
    report.line('created', 'CLAUDE.md (imports AGENTS.md)');
  } else if (/AGENTS\.md/.test(readFileSync(claudePath, 'utf8'))) {
    report.line('kept', 'CLAUDE.md');
  } else {
    report.line('note', 'CLAUDE.md does not mention AGENTS.md; add a line "@AGENTS.md" so Claude Code reads the Superwiki rules');
  }
}

// A name the config holds that this version does not know has no folder and is skipped.
const skillFolders = agents => [...new Set(agents.map(agent => SKILL_FOLDERS[agent]).filter(Boolean))];
const sameFolder = (a, b) => existsSync(a) && existsSync(b) && realpathSync(a) === realpathSync(b);

// The skills beside this one, by folder name. Under `skills/` of a checkout every folder is an
// sw-<name> skill; in an agent's skills folder other skills sit beside them, and only the sw-<name>
// folders are ours.
function sourceSkills(source) {
  return readdirSync(source)
    .filter(folder => folder.startsWith(SKILL_PREFIX) && existsSync(join(source, folder, 'SKILL.md')))
    .sort();
}

// Every file under a folder, by its path relative to that folder.
function filesIn(folder, prefix = '') {
  const files = new Map();
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) for (const [inner, content] of filesIn(path, `${name}/`)) files.set(inner, content);
    else files.set(name, readFileSync(path));
  }
  return files;
}

// A copy holds the source's files unchanged, apart from the marker.
function sameSkill(source, copy) {
  const expected = filesIn(source);
  expected.delete(INSTALLED_MARKER);
  const found = filesIn(copy);
  found.delete(INSTALLED_MARKER);
  return expected.size === found.size && [...expected].every(([name, content]) => found.get(name)?.equals(content));
}

function copySkill(from, to) {
  cpSync(from, to, { recursive: true });
  writeFileSync(join(to, INSTALLED_MARKER), '');
}

// A copy of every skill that sits next to this one goes into the project folders the chosen agents
// read. The source is the folder this script was installed into, so the copy needs neither the
// installer nor the network, and works the same from the checkout, a copy or a link.
function writeSkills(root, agents, report) {
  const source = join(SKILL_DIR, '..');
  if (Object.values(SKILL_FOLDERS).some(folder => sameFolder(source, join(root, folder)))) {
    return report.line('note', 'skills in the repository left alone: init.mjs runs from the project\'s own copy; update them with "npx superwiki install --project . <targets>"');
  }
  const skills = sourceSkills(source);
  for (const folder of skillFolders(agents)) {
    mkdirSync(join(root, folder), { recursive: true });
    for (const name of skills) {
      const from = join(source, name);
      const to = join(root, folder, name);
      const label = `${folder}/${name}/`;
      const present = lstatSync(to, { throwIfNoEntry: false });
      // Superwiki's own: a real folder carrying the marker. A link, or a folder without it, is someone else's.
      if (present && !(present.isDirectory() && existsSync(join(to, INSTALLED_MARKER)))) {
        report.line('kept', `${label} (not installed by Superwiki)`);
      } else if (present && sameSkill(from, to)) {
        report.line('unchanged', label);
      } else {
        if (present) rmSync(to, { recursive: true, force: true });
        copySkill(from, to);
        report.line(present ? 'updated' : 'created', label);
      }
    }
  }
}

// What was in docs/ before the first init and is not part of a vault.
function foreignEntries(docs) {
  if (!existsSync(docs)) return [];
  return readdirSync(docs).filter(name => !name.startsWith('.') && !VAULT_ENTRIES.includes(name));
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(HELP);
    return;
  }
  const root = resolve(options.root);
  const docs = join(root, 'docs');
  const configPath = join(docs, '.sw', 'config.json');
  const previous = readConfig(configPath);
  const tasks = options.tasks ?? previous?.tasks ?? null;
  if (tasks === null) throw new UsageError('say --tasks or --no-tasks');

  const foreign = previous ? [] : foreignEntries(docs);
  const hadTaskFiles = !previous && existsSync(join(docs, 'tasks'));
  const report = createReport(root);
  writeVault(docs, tasks, report);
  if (tasks) writeTaskBoard(docs, report);
  const config = buildConfig(previous, { root, tasks, areas: options.areas, skills: options.skills });
  report.write(configPath, JSON.stringify(config, null, 2) + '\n');
  writeAgentRules(root, tasks, report);
  if (config.skills.length) writeSkills(root, config.skills, report);

  console.log(report.lines.join('\n'));
  const taskState = tasks ? `on (areas: ${Object.keys(config.areas).join(', ')})` : 'off';
  console.log(`\nvault: docs/  tasks: ${taskState}  skills: ${skillFolders(config.skills).join(', ') || 'not in the repository'}`);
  if (foreign.length) {
    const shown = `${foreign.slice(0, 8).join(', ')}${foreign.length > 8 ? ', ...' : ''}`;
    // After sw-migrate the task files are already there; only a first init on old docs needs the hint.
    const hint = hadTaskFiles ? '' : ' If it holds a task index, sw-migrate converts it.';
    console.log(`\ndocs/ already had content (${shown}). It was left untouched and is outside the vault.${hint}`);
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof UsageError)) throw error;
  console.error(error.message);
  process.exitCode = 2;
}
