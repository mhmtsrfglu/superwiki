#!/usr/bin/env node
// Scaffolds docs/ as a Superwiki vault. Safe to re-run: user content is kept, tool files are refreshed.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };

if (argv.includes('--help')) {
  console.log(`init.mjs [--root <dir>] [--tasks | --no-tasks] [--areas "M=Mobile,B=Backend"]

  --root      project folder (default: current directory)
  --tasks     add the task module (docs/tasks, docs/plans)
  --no-tasks  wiki only
  --areas     task id prefixes and their names (default: T=Tasks)`);
  process.exit(0);
}

const root = resolve(opt('--root') || '.');
const docs = join(root, 'docs');
const dotdir = join(docs, '.sw');
const configPath = join(dotdir, 'config.json');
const previous = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : null;
const tasks = argv.includes('--no-tasks') ? false : argv.includes('--tasks') ? true : previous?.tasks ?? null;
if (tasks === null) {
  console.error('say --tasks or --no-tasks');
  process.exit(2);
}

const areas = {};
for (const pair of (opt('--areas') || '').split(',').map(s => s.trim()).filter(Boolean)) {
  const [id, ...name] = pair.split('=');
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(id)) { console.error(`bad area id "${id}": letters and digits, starting with a letter`); process.exit(2); }
  areas[id] = name.join('=').trim() || id;
}

const today = new Date().toISOString().slice(0, 10);
const report = [];
const rel = p => p.slice(root.length + 1);
const dir = p => { if (!existsSync(p)) { mkdirSync(p, { recursive: true }); report.push(`created   ${rel(p)}/`); } };
const keep = (p, content) => {
  if (existsSync(p)) { report.push(`kept      ${rel(p)}`); return false; }
  writeFileSync(p, content);
  report.push(`created   ${rel(p)}`);
  return true;
};
// Writes a tool-owned file and reports created / updated / unchanged from the actual content.
const write = (p, content, label = rel(p)) => {
  const before = existsSync(p) ? readFileSync(p, 'utf8') : null;
  if (before !== content) writeFileSync(p, content);
  report.push(`${before === null ? 'created  ' : before === content ? 'unchanged' : 'updated  '} ${label}`);
};
const refresh = (from, to) => {
  if (!existsSync(from)) { report.push(`missing   ${rel(to)} (not in this Superwiki build; report this to the user)`); return; }
  write(to, readFileSync(from, 'utf8'));
};

const foreign = existsSync(docs) && !previous ? readdirSync(docs).filter(n => !n.startsWith('.')) : [];

dir(docs);
dir(join(docs, 'raw'));
dir(join(docs, 'raw', 'assets'));
dir(join(docs, 'wiki'));
if (tasks) { dir(join(docs, 'tasks')); dir(join(docs, 'plans')); }
dir(dotdir);
dir(join(dotdir, 'templates'));
// Git drops empty folders; the vault needs them to exist.
for (const d of ['raw/assets', 'wiki', ...(tasks ? ['tasks', 'plans'] : [])]) {
  const p = join(docs, d);
  if (!readdirSync(p).length) writeFileSync(join(p, '.gitkeep'), '');
}

keep(join(docs, 'index.md'), '# Index\n\nCatalog of the wiki: one line per page, `- [[file-name]]: summary`, grouped by type.\n');
keep(join(docs, 'log.md'), `# Log\n\nAppend-only. Entry format: \`## [YYYY-MM-DD] kind | title\`.\n\n## [${today}] init | Superwiki vault created\n`);

// The viewer snapshot and the local server's address are per-machine and regenerated on demand.
write(join(dotdir, '.gitignore'), 'data.js\nserver.json\n');
refresh(join(assets, 'sw.mjs'), join(dotdir, 'sw.mjs'));
refresh(join(assets, 'viewer.html'), join(docs, 'viewer.html'));
for (const t of ['page.md', ...(tasks ? ['task.md', 'plan.md'] : [])]) refresh(join(assets, 'templates', t), join(dotdir, 'templates', t));

const config = {
  version: 1,
  name: previous?.name ?? basename(root),
  tasks,
  areas: tasks ? (Object.keys(areas).length ? areas : previous?.areas ?? { T: 'Tasks' }) : {},
  models: previous?.models ?? { plan: {}, implement: {} },
  ...(previous?.tools ? { tools: previous.tools } : {}),
};
write(configPath, JSON.stringify(config, null, 2) + '\n');

// Schema block: {{#tasks}}..{{/tasks}} kept with the task module, {{^tasks}}..{{/tasks}} without it.
const block = readFileSync(join(assets, 'agents-block.md'), 'utf8')
  .replace(/\{\{#tasks\}\}\n([\s\S]*?)\{\{\/tasks\}\}\n/g, (_, body) => (tasks ? body : ''))
  .replace(/\{\{\^tasks\}\}\n([\s\S]*?)\{\{\/tasks\}\}\n/g, (_, body) => (tasks ? '' : body))
  .trimEnd();
const agentsPath = join(root, 'AGENTS.md');
const managed = /<!-- sw:start[\s\S]*?<!-- sw:end -->/;
if (!existsSync(agentsPath)) write(agentsPath, `# Agent instructions\n\n${block}\n`);
else {
  const text = readFileSync(agentsPath, 'utf8');
  write(agentsPath, managed.test(text) ? text.replace(managed, () => block) : `${text.trimEnd()}\n\n${block}\n`, 'AGENTS.md (Superwiki block)');
}

// Claude Code reads CLAUDE.md, not AGENTS.md; an import keeps one source of truth.
const claudePath = join(root, 'CLAUDE.md');
if (!existsSync(claudePath)) {
  writeFileSync(claudePath, '@AGENTS.md\n');
  report.push('created   CLAUDE.md (imports AGENTS.md)');
} else if (!/AGENTS\.md/.test(readFileSync(claudePath, 'utf8'))) {
  report.push('note      CLAUDE.md does not mention AGENTS.md; add a line "@AGENTS.md" so Claude Code reads the Superwiki rules');
} else report.push('kept      CLAUDE.md');

console.log(report.join('\n'));
console.log(`\nvault: docs/  tasks: ${tasks ? `on (areas: ${Object.keys(config.areas).join(', ')})` : 'off'}`);
if (foreign.length) console.log(`\ndocs/ already had content (${foreign.slice(0, 8).join(', ')}${foreign.length > 8 ? ', ...' : ''}). It was left untouched and is outside the vault; sw-migrate converts it.`);
