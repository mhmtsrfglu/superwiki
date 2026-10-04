#!/usr/bin/env node
// Converts a table-based task index into Superwiki task files, driven by a mapping file.
// Bulk, mechanical work only: what a table row and a detail section say goes into one task file,
// links to tasks become wikilinks, consumed files move to an archive folder. Nothing is deleted.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, posix } from 'node:path';

const HELP = `migrate.mjs --mapping <file.json> [--docs <dir>] [--dry-run]

Mapping (paths relative to the docs folder):
{
  "index": "index.md",                      file holding the task tables
  "columns": { "id": "ID", "title": "Task", "status": "Status", "deps": "Depends on",
               "milestone": "Target", "priority": "Order", "started": "Start", "finished": "End" },
  "sections": { "Sources": "Source", "Notes": "Note" },   table columns kept as body sections
  "status": { "Not started": "todo", "In progress": "in-progress", "Done": "done" },
  "softPrefix": "~",                        marks a soft dependency in the deps column
  "details": { "dir": "tasks", "heading": "## " },        per-task detail sections: "<heading><ID>"
  "log": { "file": "changelog.md", "columns": { "date": "Date", "id": "Task", "text": "Change" } },
  "archive": "legacy"                       consumed files are moved here
}
Only "index", "columns.id", "columns.title", "columns.status" and "status" are required.`;

const argv = process.argv.slice(2);
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
if (argv.includes('--help') || !opt('--mapping')) { console.log(HELP); process.exit(argv.includes('--help') ? 0 : 2); }
const dry = argv.includes('--dry-run');
const docs = resolve(opt('--docs') || 'docs');
const map = JSON.parse(readFileSync(resolve(opt('--mapping')), 'utf8'));
const archive = map.archive || 'legacy';
const soft = map.softPrefix ?? '~';
const ID = /[A-Z][A-Z0-9]*-\d+/;
const fail = msg => { console.error(msg); process.exit(2); };

const indexPath = join(docs, map.index);
if (!existsSync(indexPath)) fail(`no ${map.index} in ${docs}`);
// Empty folders left by an aborted run are not a vault and not an archive.
const hasFiles = d => existsSync(d) && readdirSync(d, { recursive: true, withFileTypes: true }).some(e => e.isFile());
if (existsSync(join(docs, '.sw', 'config.json'))) fail('docs/.sw/config.json exists: this folder is already a Superwiki vault');
if (hasFiles(join(docs, archive))) fail(`docs/${archive} has files in it: choose another "archive" name or remove it`);

// ---------- Markdown tables ----------
const splitRow = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
function tables(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!lines[i].trim().startsWith('|') || !/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) continue;
    const head = splitRow(lines[i]);
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && lines[j].trim().startsWith('|'); j++) {
      const cells = splitRow(lines[j]);
      rows.push(Object.fromEntries(head.map((h, k) => [h, cells[k] ?? ''])));
    }
    out.push({ head, rows });
    i = j - 1;
  }
  return out;
}

// ---------- Links ----------
const consumed = new Set([map.index]); // files whose task anchors turn into wikilinks
const detailDir = map.details?.dir;
if (detailDir && existsSync(join(docs, detailDir))) {
  for (const n of readdirSync(join(docs, detailDir))) if (n.endsWith('.md')) consumed.add(posix.join(detailDir, n));
}
if (map.log?.file) consumed.add(map.log.file);

const stats = { taskLinks: 0, relinked: 0, deadLinks: [] };
let ids = new Set();

// from: the file the text was in. to: the file it will be in. Both relative to docs.
function rewrite(text, from, to) {
  const fromDir = posix.dirname(from);
  const toDir = posix.dirname(to);
  const decode = s => { try { return decodeURI(s); } catch { return s; } };
  // Row anchors only existed as link targets for the old index; in a foreign file they are not ours to remove.
  return (from === to ? text : text.replace(/<a id="[^"]*"><\/a>/g, ''))
    .replace(/\[([^\[\]]*)\]\(([^)\s]+)\)( ✅)?/g, (all, label, href, tick) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return all;
      const [path, anchor = ''] = href.split('#');
      const target = path ? posix.normalize(posix.join(fromDir, decode(path))) : from;
      if (consumed.has(target)) {
        const id = (anchor.match(new RegExp(`^${ID.source}$`, 'i')) || [])[0]?.toUpperCase();
        if (id && ids.has(id)) { stats.taskLinks++; return label.trim() === id ? `[[${id}]]` : `[[${id}|${label}]]`; }
        stats.deadLinks.push(`${to}: ${all.slice(0, 80)}`);
        return `[${label}](${encodeURI(posix.relative(toDir, posix.join(archive, target)))}${anchor ? `#${anchor}` : ''})${tick ?? ''}`;
      }
      if (!path || fromDir === toDir) return all;
      stats.relinked++;
      return `[${label}](${encodeURI(posix.relative(toDir, target))}${anchor ? `#${anchor}` : ''})${tick ?? ''}`;
    });
}

// ---------- Read the index ----------
const col = map.columns;
const indexText = readFileSync(indexPath, 'utf8');
const rows = tables(indexText).filter(t => [col.id, col.title, col.status].every(h => t.head.includes(h))).flatMap(t => t.rows);
if (!rows.length) fail(`no table in ${map.index} has the columns "${col.id}", "${col.title}", "${col.status}"`);

const plain = s => s.replace(/<[^>]+>/g, '').replace(/\[([^\[\]]*)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '').trim();
const statusOf = cell => {
  const text = plain(cell).replace(/✅/g, '').trim();
  const hit = Object.keys(map.status).find(k => k.toLowerCase() === text.toLowerCase());
  return hit ? map.status[hit] : null;
};

const tasks = [];
const problems = [];
for (const r of rows) {
  const id = (plain(r[col.id]).match(ID) || [])[0];
  if (!id) { problems.push(`row without an id: ${r[col.id].slice(0, 60)}`); continue; }
  if (ids.has(id)) { problems.push(`duplicate id ${id}`); continue; }
  ids.add(id);
  const status = statusOf(r[col.status]);
  if (!status) problems.push(`${id}: status "${plain(r[col.status])}" is not in the mapping`);
  const deps = [];
  const softDeps = [];
  for (const m of (col.deps ? r[col.deps] : '').matchAll(new RegExp(`(${soft.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})?\\[?(${ID.source})`, 'g'))) {
    const list = m[1] ? softDeps : deps;
    if (!list.includes(m[2])) list.push(m[2]);
  }
  const get = k => (col[k] ? plain(r[col[k]] ?? '') : '');
  tasks.push({ id, row: r, title: get('title'), status: status || 'todo', deps, softDeps, milestone: get('milestone'), priority: get('priority'), started: get('started'), finished: get('finished') });
}

// ---------- Detail sections ----------
const details = new Map();
const strayDetails = [];
if (detailDir) {
  const mark = map.details.heading || '## ';
  for (const file of [...consumed].filter(f => f.startsWith(`${detailDir}/`))) {
    let cur = null;
    for (const line of readFileSync(join(docs, file), 'utf8').split(/\r?\n/)) {
      const id = line.startsWith(mark) ? (line.slice(mark.length).trim().match(new RegExp(`^${ID.source}$`)) || [])[0] : null;
      if (id) { cur = { file, lines: [] }; (ids.has(id) ? details.set(id, cur) : strayDetails.push(`${file}: ${id}`)); continue; }
      if (line.startsWith(mark)) cur = null; // a same-level heading that is not a task ends the section
      if (cur) cur.lines.push(line);
    }
  }
}

// ---------- Write ----------
// Single-quoted YAML: the only escape is a doubled quote, so titles with " or \\ survive as written.
const yaml = v => (/^[\w./-]*$/.test(v) ? v : `'${v.replace(/'/g, "''")}'`);
const out = new Map();
for (const t of tasks) {
  const to = `tasks/${t.id}.md`;
  const fm = ['---', 'type: task', `id: ${t.id}`, `title: ${yaml(t.title)}`, `status: ${t.status}`, `deps: [${t.deps.join(', ')}]`];
  if (t.softDeps.length) fm.push(`soft_deps: [${t.softDeps.join(', ')}]`);
  if (t.milestone) fm.push(`milestone: ${yaml(t.milestone)}`);
  if (/^\d+$/.test(t.priority)) fm.push(`priority: ${t.priority}`);
  fm.push(`started: ${t.started}`.trimEnd(), `finished: ${t.finished}`.trimEnd(), '---', '');
  const body = [];
  const d = details.get(t.id);
  if (d) body.push(rewrite(d.lines.join('\n').trim(), d.file, to), '');
  for (const [name, column] of Object.entries(map.sections || {})) {
    const cell = (t.row[column] || '').trim();
    if (cell) body.push(`## ${name}`, '', rewrite(cell, map.index, to), '');
  }
  out.set(to, fm.join('\n') + '\n' + body.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n');
}

let logEntries = 0;
if (map.log?.file && existsSync(join(docs, map.log.file))) {
  const lc = map.log.columns;
  const entries = tables(readFileSync(join(docs, map.log.file), 'utf8'))
    .filter(t => [lc.date, lc.text].every(h => t.head.includes(h))).flatMap(t => t.rows)
    .filter(r => /^\d{4}-\d{2}-\d{2}/.test(plain(r[lc.date])));
  // Stable sort keeps same-day rows in reverse source order: sources list newest first, the log is oldest first.
  entries.reverse().sort((a, b) => plain(a[lc.date]).localeCompare(plain(b[lc.date])));
  logEntries = entries.length;
  const text = entries.map(r => `## [${plain(r[lc.date]).slice(0, 10)}] task | ${lc.id ? plain(r[lc.id]) || 'general' : 'general'}\n\n${rewrite(r[lc.text], map.log.file, 'log.md')}\n`).join('\n');
  out.set('log.md', `# Log\n\nAppend-only. Entry format: \`## [YYYY-MM-DD] kind | title\`.\n\n${text}`);
}

// Other markdown files that pointed at tasks in the consumed files.
const others = [];
(function walk(dir, rel) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(join(dir, e.name), p);
    else if (e.name.endsWith('.md') && !consumed.has(p) && statSync(join(dir, e.name)).size < 2e6) others.push(p);
  }
})(docs, '');
let touchedOthers = 0;
for (const p of others) {
  const before = readFileSync(join(docs, p), 'utf8');
  const after = rewrite(before, p, p);
  if (after === before) continue;
  touchedOthers++;
  out.set(p, after);
}

const counts = {};
for (const t of tasks) counts[t.status] = (counts[t.status] || 0) + 1;
const areas = [...new Set(tasks.map(t => t.id.slice(0, t.id.lastIndexOf('-'))))];
const unknownDeps = tasks.flatMap(t => [...t.deps, ...t.softDeps].filter(d => !ids.has(d)).map(d => `${t.id} -> ${d}`));

if (!dry) {
  for (const f of consumed) {
    if (!existsSync(join(docs, f))) continue;
    mkdirSync(dirname(join(docs, archive, f)), { recursive: true });
    renameSync(join(docs, f), join(docs, archive, f));
  }
  for (const [p, text] of out) {
    mkdirSync(dirname(join(docs, p)), { recursive: true });
    writeFileSync(join(docs, p), text);
  }
}

const show = (title, list, max = 10) => list.length && console.log(`\n${title} (${list.length}):\n${list.slice(0, max).map(s => `  ${s}`).join('\n')}${list.length > max ? `\n  ... ${list.length - max} more` : ''}`);
console.log(`${dry ? 'DRY RUN, nothing written\n' : ''}tasks: ${tasks.length}  ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join('  ')}`);
console.log(`areas: ${areas.join(', ')}`);
console.log(`with detail section: ${[...details.keys()].length}  without: ${tasks.length - details.size}`);
console.log(`task links turned into wikilinks: ${stats.taskLinks}  relative links re-based: ${stats.relinked}  other files updated: ${touchedOthers}`);
if (map.log?.file) console.log(`log entries: ${logEntries}`);
console.log(`archived to docs/${archive}/: ${[...consumed].join(', ')}`);
show('problems', problems);
show('dependencies on unknown ids', unknownDeps);
show('detail sections without a table row (left in the archive)', strayDetails);
show(`links into archived files that are not task links (now point into ${archive}/)`, stats.deadLinks);
console.log(`\nnext: node <sw-init>/scripts/init.mjs --tasks --areas "${areas.map(a => `${a}=${a}`).join(',')}"  then  node docs/.sw/sw.mjs lint`);
