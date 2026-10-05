#!/usr/bin/env node
// Scaffolds docs/ as a Superwiki vault. Safe to re-run: user content is kept, tool files are
// replaced with this version, and the report says which was which.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const AREA_ID = /^[A-Za-z][A-Za-z0-9]*$/;
const MANAGED_BLOCK = /<!-- sw:start[\s\S]*?<!-- sw:end -->/;
// What a vault consists of at the top of docs/. Anything else there belongs to someone else.
const VAULT_ENTRIES = ['index.md', 'log.md', 'raw', 'wiki', 'tasks', 'plans', 'viewer.html'];
const ROLES = ['plan', 'implement', 'review'];

const HELP = `init.mjs [--root <dir>] [--tasks | --no-tasks] [--areas "M=Mobile,B=Backend"]

  --root      project folder (default: current directory)
  --tasks     add the task module (docs/tasks, docs/plans)
  --no-tasks  wiki only
  --areas     task id prefixes and their names (default: T=Tasks)

Run without --tasks or --no-tasks on an existing vault to upgrade it with its saved choices.`;

class UsageError extends Error {}

function parseArgs(argv) {
  const options = { root: '.', tasks: null, areas: {}, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help') options.help = true;
    else if (arg === '--root') options.root = argv[++i] ?? '.';
    else if (arg === '--tasks') options.tasks = true;
    else if (arg === '--no-tasks') options.tasks = false;
    else if (arg === '--areas') options.areas = parseAreas(argv[++i] ?? '');
    else throw new UsageError(`unknown argument: ${arg}\n\n${HELP}`);
  }
  return options;
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

function buildConfig(previous, { root, tasks, areas }) {
  const models = Object.fromEntries(ROLES.map(role => [role, previous?.models?.[role] ?? {}]));
  const chosenAreas = Object.keys(areas).length ? areas : previous?.areas ?? { T: 'Tasks' };
  return {
    version: 1,
    name: previous?.name ?? basename(root),
    tasks,
    areas: tasks ? chosenAreas : {},
    models,
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
  report.keep(join(docs, 'index.md'), '# Index\n\nCatalog of the wiki: one line per page, `- [[file-name]]: summary`, grouped by type.\n');
  report.keep(join(docs, 'log.md'), `# Log\n\nAppend-only. Entry format: \`## [YYYY-MM-DD] kind | title\`.\n\n## [${today}] init | Superwiki vault created\n`);

  // The viewer snapshot and the local server's address are per-machine and regenerated on demand.
  report.write(join(docs, '.sw', '.gitignore'), 'data.js\nserver.json\n');
  report.copy(join(ASSETS, 'sw.mjs'), join(docs, '.sw', 'sw.mjs'));
  report.copy(join(ASSETS, 'viewer.html'), join(docs, 'viewer.html'));
  for (const template of ['page.md', ...(tasks ? ['task.md', 'plan.md', 'guide.md'] : [])]) {
    report.copy(join(ASSETS, 'templates', template), join(docs, '.sw', 'templates', template));
  }
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
  const config = buildConfig(previous, { root, tasks, areas: options.areas });
  report.write(configPath, JSON.stringify(config, null, 2) + '\n');
  writeAgentRules(root, tasks, report);

  console.log(report.lines.join('\n'));
  console.log(`\nvault: docs/  tasks: ${tasks ? `on (areas: ${Object.keys(config.areas).join(', ')})` : 'off'}`);
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
