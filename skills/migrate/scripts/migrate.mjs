#!/usr/bin/env node
// Converts a table-based task index into Superwiki task files, driven by a mapping file.
// Bulk, mechanical work only: what a table row and a detail section say goes into one task file,
// links to tasks become wikilinks, and the files that were consumed move to an archive folder.
// Nothing is deleted.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';

const HELP = `migrate.mjs --inspect [--docs <dir>]
migrate.mjs --mapping <file.json> [--docs <dir>] [--dry-run]

--inspect prints the tables, columns, status values and task headings found under the docs
folder, so the mapping can be written without reading the files.

Mapping (paths relative to the docs folder):
{
  "index": "index.md",                      file holding the task tables
  "columns": { "id": "ID", "title": "Task", "status": "Status", "deps": "Depends on",
               "milestone": "Target", "priority": "Order", "started": "Start", "finished": "End" },
  "fields": { "review": "Review" },         other columns kept as frontmatter fields
  "sections": { "Sources": "Source", "Notes": "Note" },   other columns kept as body sections
  "status": { "Not started": "todo", "In progress": "in-progress", "Done": "done" },
  "softPrefix": "~",                        marks a soft dependency in the deps column
  "details": { "dir": "tasks", "heading": "## " },        per-task detail sections: "<heading><ID>"
  "log": { "file": "changelog.md", "columns": { "date": "Date", "id": "Task", "text": "Change" } },
  "archiveAlso": ["plans/old"],             other files or folders to move to the archive
  "archive": "legacy"                       where consumed files go
}
Required: "index", "columns.id", "columns.title", "columns.status", "status".
Status keys are written without decoration: a cell showing "✅ Done" is matched by "Done".`;

const ID = /[A-Z][A-Z0-9]*-\d+/;
const VAULT_FOLDERS = ['wiki', 'tasks', 'plans'];
const CORE_FIELDS = ['type', 'id', 'title', 'status', 'deps', 'soft_deps', 'milestone', 'priority', 'started', 'finished'];
const MARKDOWN_LINK = /\[([^\[\]]*)\]\(([^)\s]+)\)( ✅)?/g;
const LIST_LIMIT = 10;

class UsageError extends Error {}

// ---------- Markdown ----------

const splitRow = line =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));

// Every table in the text as { line, head, rows }, each row an object keyed by column name.
function tables(text) {
  const lines = text.split(/\r?\n/);
  const found = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    const isHeader = lines[i].trim().startsWith('|') && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1]);
    if (!isHeader) continue;
    const head = splitRow(lines[i]);
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && lines[j].trim().startsWith('|'); j++) {
      const cells = splitRow(lines[j]);
      rows.push(Object.fromEntries(head.map((name, k) => [name, cells[k] ?? ''])));
    }
    found.push({ line: i + 1, head, rows });
    i = j - 1;
  }
  return found;
}

// A cell as a reader sees it: no HTML, link labels instead of links, no emphasis marks.
const plain = cell =>
  cell.replace(/<[^>]+>/g, '').replace(/\[([^\[\]]*)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '').trim();

// A status cell without the check mark some indexes decorate finished rows with.
const statusText = cell => plain(cell).replace(/✅/g, '').trim();

// Single-quoted YAML: its only escape is a doubled quote, so values with " or \ survive as written.
const yaml = value => (/^[\w./-]*$/.test(value) ? value : `'${value.replace(/'/g, "''")}'`);

// ---------- Files ----------

// Every file under dir as a path relative to it, skipping dot entries and node_modules.
function walk(dir, rel = '') {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...walk(join(dir, entry.name), path));
    else files.push(path);
  }
  return files;
}

const isMarkdown = path => path.endsWith('.md');
const read = (docs, path) => readFileSync(join(docs, path), 'utf8');

// ---------- Inspect ----------

// A table is about tasks when one of its columns holds a task id in most rows.
function taskColumn(table) {
  return table.head.find(name => table.rows.filter(row => ID.test(plain(row[name]))).length >= table.rows.length * 0.7);
}

// The distinct values of each column that has only a few, with their counts: status-like columns.
function fewValuedColumns(table) {
  const lines = [];
  for (const name of table.head) {
    const counts = new Map();
    for (const row of table.rows) {
      const value = statusText(row[name]);
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    const values = [...counts.keys()].filter(Boolean);
    const words = values.some(value => !/^[\d.\-—–]+$/.test(value)); // not just dates, numbers or dashes
    const repeats = Math.max(...counts.values()) >= 2;
    const statusLike = counts.size >= 2 && counts.size <= 6 && words && repeats && values.every(value => value.length <= 24);
    if (statusLike) lines.push(`    values of "${name}": ${[...counts].map(([value, n]) => `${value || '(empty)'} ${n}`).join(', ')}`);
  }
  return lines;
}

// Prints what a mapping needs to know: the tables that list tasks, their columns, the values of
// status-like columns, and the files that hold per-task headings. Other tables are only counted.
function inspect(docs) {
  const out = [];
  let otherTables = 0;
  for (const path of walk(docs).filter(isMarkdown)) {
    if (statSync(join(docs, path)).size > 5e6) continue;
    const text = read(docs, path);
    const all = tables(text).filter(table => table.rows.length >= 3);
    const taskTables = all.filter(taskColumn);
    otherTables += all.length - taskTables.length;
    const headings = text.split(/\r?\n/).filter(line => new RegExp(`^#{1,4} ${ID.source}\\s*$`).test(line));
    if (!taskTables.length && headings.length < 2) continue;
    out.push(`${path} (${Math.round(text.length / 1024)} KB)`);
    for (const table of taskTables) {
      out.push(`  line ${table.line}: ${table.rows.length} rows, ids in "${taskColumn(table)}" | ${table.head.join(' | ')}`);
      if (table.rows.length >= 5) out.push(...fewValuedColumns(table));
    }
    if (headings.length >= 2) {
      const mark = headings[0].match(/^#+ /)[0];
      out.push(`  ${headings.length} task headings like "${headings[0]}" (details heading: "${mark}")`);
    }
  }
  if (otherTables) out.push(`${otherTables} other tables without task ids are not shown`);
  for (const folder of VAULT_FOLDERS) {
    if (!existsSync(join(docs, folder))) continue;
    out.push(`note: docs/${folder}/ exists (${walk(join(docs, folder)).length} files). Superwiki uses that folder: what the mapping does not consume must go into "archiveAlso".`);
  }
  console.log(out.length ? out.join('\n') : 'no task tables or task headings found');
}

// ---------- Conversion ----------

function readMapping(path) {
  const map = JSON.parse(readFileSync(path, 'utf8'));
  const missing = ['index', 'status'].filter(key => !map[key]).concat(['id', 'title', 'status'].filter(key => !map.columns?.[key]).map(key => `columns.${key}`));
  if (missing.length) throw new UsageError(`the mapping lacks: ${missing.join(', ')}`);
  const reserved = Object.keys(map.fields || {}).filter(name => CORE_FIELDS.includes(name));
  if (reserved.length) throw new UsageError(`"fields" may not redefine: ${reserved.join(', ')}`);
  return { archive: 'legacy', softPrefix: '~', fields: {}, sections: {}, archiveAlso: [], ...map };
}

// The files that leave their place: the index, the detail files, the log source and anything
// named in archiveAlso. Links into them are re-pointed, and the files themselves are archived.
function filesToArchive(docs, map, problems) {
  const moved = new Set([map.index]);
  if (map.log?.file) moved.add(map.log.file);
  const detailDir = map.details?.dir;
  if (detailDir && existsSync(join(docs, detailDir))) {
    for (const name of readdirSync(join(docs, detailDir))) if (isMarkdown(name)) moved.add(posix.join(detailDir, name));
  }
  for (const path of map.archiveAlso) {
    const full = join(docs, path);
    if (!existsSync(full)) problems.push(`archiveAlso: docs/${path} does not exist`);
    else if (statSync(full).isDirectory()) for (const file of walk(full)) moved.add(posix.join(path, file));
    else moved.add(path);
  }
  return moved;
}

function readTasks(docs, map, problems) {
  const col = map.columns;
  const rows = tables(read(docs, map.index))
    .filter(table => [col.id, col.title, col.status].every(name => table.head.includes(name)))
    .flatMap(table => table.rows);
  if (!rows.length) throw new UsageError(`no table in ${map.index} has the columns "${col.id}", "${col.title}", "${col.status}"`);

  const softMark = map.softPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const depPattern = new RegExp(`(${softMark})?\\[?(${ID.source})`, 'g');
  const tasks = [];
  const ids = new Set();
  for (const row of rows) {
    const id = (plain(row[col.id]).match(ID) || [])[0];
    if (!id) { problems.push(`row without an id: ${row[col.id].slice(0, 60)}`); continue; }
    if (ids.has(id)) { problems.push(`duplicate id ${id}`); continue; }
    ids.add(id);
    const shown = statusText(row[col.status]);
    const key = Object.keys(map.status).find(name => name.toLowerCase() === shown.toLowerCase());
    if (!key) problems.push(`${id}: status "${shown}" is not in the mapping`);
    const deps = [];
    const softDeps = [];
    for (const match of (col.deps ? row[col.deps] : '').matchAll(depPattern)) {
      const list = match[1] ? softDeps : deps;
      if (!list.includes(match[2])) list.push(match[2]);
    }
    const cell = name => (col[name] ? plain(row[col[name]] ?? '') : '');
    const extra = {};
    for (const [field, column] of Object.entries(map.fields)) {
      const value = plain(row[column] ?? '');
      if (value && !/^[—–-]$/.test(value)) extra[field] = value;
    }
    tasks.push({
      id, row, deps, softDeps, extra,
      title: cell('title'), status: key ? map.status[key] : 'todo',
      milestone: cell('milestone'), priority: cell('priority'), started: cell('started'), finished: cell('finished'),
    });
  }
  return { tasks, ids };
}

// Detail sections by task id, and the headings that have no row in the index.
function readDetails(docs, map, moved, ids) {
  const details = new Map();
  const stray = [];
  const dir = map.details?.dir;
  if (!dir) return { details, stray };
  const mark = map.details.heading || '## ';
  for (const file of [...moved].filter(path => path.startsWith(`${dir}/`) && isMarkdown(path))) {
    let current = null;
    for (const line of read(docs, file).split(/\r?\n/)) {
      const id = line.startsWith(mark) ? (line.slice(mark.length).trim().match(new RegExp(`^${ID.source}$`)) || [])[0] : null;
      if (id) {
        current = { file, lines: [] };
        if (ids.has(id)) details.set(id, current);
        else stray.push(`${file}: ${id}`);
      } else if (line.startsWith(mark)) {
        current = null; // a same-level heading that is not a task ends the section
      } else if (current) {
        current.lines.push(line);
      }
    }
  }
  return { details, stray };
}

// The link from a folder to a target, keeping the trailing slash a link to a folder was written with.
const relativeHref = (fromDir, target, written) =>
  encodeURI(posix.relative(fromDir, target)) + (written.endsWith('/') ? '/' : '');

// Rewrites the links of a text that lived in `from` and will live in `to` (paths relative to docs).
// A link to a task in an archived file becomes a wikilink; any other link into an archived file
// follows the file to the archive; a relative link is re-based when the text changes folder.
function makeRewriter({ moved, ids, archive, stats }) {
  const decode = text => { try { return decodeURI(text); } catch { return text; } };
  return function rewrite(text, from, to) {
    const fromDir = posix.dirname(from);
    const toDir = posix.dirname(to);
    // Row anchors existed only as link targets for the old index. A file that stays where it is keeps its own.
    const body = from === to ? text : text.replace(/<a id="[^"]*"><\/a>/g, '');
    return body.replace(MARKDOWN_LINK, (all, label, href, tick) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return all;
      const [path, anchor = ''] = href.split('#');
      const target = path ? posix.normalize(posix.join(fromDir, decode(path))) : from;
      const suffix = `${anchor ? `#${anchor}` : ''})${tick ?? ''}`;
      if (moved.has(target)) {
        const id = (anchor.match(new RegExp(`^${ID.source}$`, 'i')) || [])[0]?.toUpperCase();
        if (id && ids.has(id)) {
          stats.taskLinks++;
          return label.trim() === id ? `[[${id}]]` : `[[${id}|${label}]]`;
        }
        stats.archiveLinks.push(`${to}: ${all.slice(0, 80)}`);
        return `[${label}](${encodeURI(posix.relative(toDir, posix.join(archive, target)))}${suffix}`;
      }
      if (!path || fromDir === toDir) return all;
      stats.rebased++;
      return `[${label}](${relativeHref(toDir, target, path)}${suffix}`;
    });
  };
}

// An archived file keeps its text, but it sits one folder deeper: its relative links to files
// that stayed behind are re-based so the archive remains readable. Links between archived files
// need no change, because the archive keeps their layout.
function rebaseArchived(text, path, moved, archive) {
  const fromDir = posix.dirname(path);
  const toDir = posix.dirname(posix.join(archive, path));
  return text.replace(MARKDOWN_LINK, (all, label, href, tick) => {
    const [target, anchor = ''] = href.split('#');
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(href)) return all;
    let decoded = target;
    try { decoded = decodeURI(target); } catch { /* keep the raw path */ }
    const resolved = posix.normalize(posix.join(fromDir, decoded));
    if (moved.has(resolved)) return all;
    return `[${label}](${relativeHref(toDir, resolved, target)}${anchor ? `#${anchor}` : ''})${tick ?? ''}`;
  });
}

function taskFile(task, detail, map, rewrite) {
  const path = `tasks/${task.id}.md`;
  const frontmatter = ['type: task', `id: ${task.id}`, `title: ${yaml(task.title)}`, `status: ${task.status}`, `deps: [${task.deps.join(', ')}]`];
  if (task.softDeps.length) frontmatter.push(`soft_deps: [${task.softDeps.join(', ')}]`);
  if (task.milestone) frontmatter.push(`milestone: ${yaml(task.milestone)}`);
  if (/^\d+$/.test(task.priority)) frontmatter.push(`priority: ${task.priority}`);
  for (const [field, value] of Object.entries(task.extra)) frontmatter.push(`${field}: ${yaml(value)}`);
  frontmatter.push(`started: ${task.started}`.trimEnd(), `finished: ${task.finished}`.trimEnd());

  const body = [];
  if (detail) body.push(rewrite(detail.lines.join('\n').trim(), detail.file, path), '');
  for (const [heading, column] of Object.entries(map.sections)) {
    const cell = (task.row[column] || '').trim();
    if (cell) body.push(`## ${heading}`, '', rewrite(cell, map.index, path), '');
  }
  const text = body.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
  return [path, `---\n${frontmatter.join('\n')}\n---\n\n${text}\n`];
}

function logFile(docs, map, rewrite) {
  if (!map.log?.file || !existsSync(join(docs, map.log.file))) return null;
  const col = map.log.columns;
  const rows = tables(read(docs, map.log.file))
    .filter(table => [col.date, col.text].every(name => table.head.includes(name)))
    .flatMap(table => table.rows)
    .filter(row => /^\d{4}-\d{2}-\d{2}/.test(plain(row[col.date])));
  // Sources list newest first and the log is oldest first; a stable sort after reversing keeps
  // same-day rows in the order they happened.
  rows.reverse().sort((a, b) => plain(a[col.date]).localeCompare(plain(b[col.date])));
  const entries = rows.map(row => {
    const title = (col.id && plain(row[col.id])) || 'general';
    return `## [${plain(row[col.date]).slice(0, 10)}] task | ${title}\n\n${rewrite(row[col.text], map.log.file, 'log.md')}\n`;
  });
  return { count: entries.length, text: `# Log\n\nAppend-only. Entry format: \`## [YYYY-MM-DD] kind | title\`.\n\n${entries.join('\n')}` };
}

// Works out everything the conversion will write and move, without touching the disk.
function plan(docs, map) {
  if (!existsSync(join(docs, map.index))) throw new UsageError(`no ${map.index} in ${docs}`);
  if (existsSync(join(docs, '.sw', 'config.json'))) throw new UsageError('docs/.sw/config.json exists: this folder is already a Superwiki vault');
  const archiveDir = join(docs, map.archive);
  // Empty folders left by an undone attempt are not an archive.
  if (existsSync(archiveDir) && walk(archiveDir).length) throw new UsageError(`docs/${map.archive} has files in it: choose another "archive" name or remove it`);

  const problems = [];
  const moved = filesToArchive(docs, map, problems);
  const { tasks, ids } = readTasks(docs, map, problems);
  const { details, stray } = readDetails(docs, map, moved, ids);
  const stats = { taskLinks: 0, rebased: 0, archiveLinks: [] };
  const rewrite = makeRewriter({ moved, ids, archive: map.archive, stats });

  const writes = new Map();
  for (const task of tasks) writes.set(...taskFile(task, details.get(task.id), map, rewrite));
  const log = logFile(docs, map, rewrite);
  if (log) writes.set('log.md', log.text);

  // Files that stay where they are but pointed at something that moves.
  const updated = [];
  for (const path of walk(docs).filter(file => isMarkdown(file) && !moved.has(file))) {
    if (statSync(join(docs, path)).size > 2e6) continue;
    const before = read(docs, path);
    const after = rewrite(before, path, path);
    if (after !== before) { writes.set(path, after); updated.push(path); }
  }

  for (const path of [...moved].filter(file => isMarkdown(file) && existsSync(join(docs, file)))) {
    const before = read(docs, path);
    const after = rebaseArchived(before, path, moved, map.archive);
    if (after !== before) writes.set(posix.join(map.archive, path), after);
  }

  // Superwiki owns wiki/, tasks/ and plans/. A file already in one of them would be read as a
  // wiki page, task or plan after the conversion, and lint would reject it.
  const foreign = VAULT_FOLDERS.flatMap(folder => (existsSync(join(docs, folder)) ? walk(join(docs, folder)).map(file => `${folder}/${file}`) : []))
    .filter(path => isMarkdown(path) && !moved.has(path));
  for (const path of foreign) problems.push(`docs/${path} is in a folder Superwiki uses: add it (or its folder) to "archiveAlso", or move it elsewhere first`);

  for (const task of tasks) {
    for (const dep of [...task.deps, ...task.softDeps]) if (!ids.has(dep)) problems.push(`${task.id} depends on ${dep}, which is not in the index`);
  }

  const counts = {};
  for (const task of tasks) counts[task.status] = (counts[task.status] || 0) + 1;
  const areas = [...new Set(tasks.map(task => task.id.slice(0, task.id.lastIndexOf('-'))))];
  return { map, moved, writes, problems, stray, stats, updated, counts, areas, taskCount: tasks.length, detailCount: details.size, logCount: log?.count ?? null };
}

// A folder that held only archived files would be left behind empty. Remove those, deepest first;
// rmdir refuses a folder that still has something in it, which is the check.
function removeEmptiedFolders(docs, moved) {
  const folders = new Set();
  for (const path of moved) {
    for (let dir = posix.dirname(path); dir !== '.'; dir = posix.dirname(dir)) folders.add(dir);
  }
  for (const dir of [...folders].sort((a, b) => b.length - a.length)) {
    try { rmdirSync(join(docs, dir)); } catch { /* not empty, or already gone */ }
  }
}

function apply(docs, result) {
  const { map, moved, writes } = result;
  for (const path of moved) {
    if (!existsSync(join(docs, path))) continue;
    const target = join(docs, map.archive, path);
    mkdirSync(dirname(target), { recursive: true });
    renameSync(join(docs, path), target);
  }
  removeEmptiedFolders(docs, moved);
  for (const [path, text] of writes) {
    mkdirSync(dirname(join(docs, path)), { recursive: true });
    writeFileSync(join(docs, path), text);
  }
}

function report(result, dryRun) {
  const { map, counts, areas, stats } = result;
  const list = (title, items) => {
    if (!items.length) return;
    const more = items.length > LIST_LIMIT ? `\n  ... ${items.length - LIST_LIMIT} more` : '';
    console.log(`\n${title} (${items.length}):\n${items.slice(0, LIST_LIMIT).map(item => `  ${item}`).join('\n')}${more}`);
  };
  if (dryRun) console.log('DRY RUN, nothing written');
  console.log(`tasks: ${result.taskCount}  ${Object.entries(counts).map(([status, n]) => `${status} ${n}`).join('  ')}`);
  console.log(`areas: ${areas.join(', ')}`);
  console.log(`with detail section: ${result.detailCount}  without: ${result.taskCount - result.detailCount}`);
  console.log(`task links turned into wikilinks: ${stats.taskLinks}  relative links re-based: ${stats.rebased}  other files updated: ${result.updated.length}`);
  if (result.logCount !== null) console.log(`log entries: ${result.logCount} -> docs/log.md`);
  console.log(`archived to docs/${map.archive}/: ${result.moved.size} files`);

  list('PROBLEMS, fix these in the mapping or the files and run again', result.problems);
  if (!result.problems.length) console.log('\nno problems');
  console.log('\nFor information; none of these blocks the conversion:');
  list('other files whose task links were rewritten', result.updated);
  list('detail sections without a table row (they stay in the archive)', result.stray);
  list(`links into archived files that are not task links (now point into ${map.archive}/)`, stats.archiveLinks);
  console.log(`\nnext: node <init-dir>/scripts/init.mjs --tasks --areas "${areas.map(area => `${area}=${area}`).join(',')}"  then  node docs/.sw/sw.mjs status  and  lint`);
  console.log('`status` splits "todo" into ready and blocked; their sum is the todo count above.');
}

// ---------- Entry point ----------

function parseArgs(argv) {
  const options = { docs: 'docs', mapping: null, inspect: false, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--docs') options.docs = argv[++i];
    else if (argv[i] === '--mapping') options.mapping = argv[++i];
    else if (argv[i] === '--inspect') options.inspect = true;
    else if (argv[i] === '--dry-run') options.dryRun = true;
    else if (argv[i] === '--help') options.help = true;
    else throw new UsageError(`unknown argument: ${argv[i]}`);
  }
  return options;
}

function main(argv) {
  try {
    const options = parseArgs(argv);
    if (options.help) { console.log(HELP); return 0; }
    const docs = resolve(options.docs || 'docs');
    if (!existsSync(docs)) throw new UsageError(`no docs folder at ${docs}`);
    if (options.inspect) { inspect(docs); return 0; }
    if (!options.mapping) throw new UsageError(HELP);
    const result = plan(docs, readMapping(resolve(options.mapping)));
    if (!options.dryRun) apply(docs, result);
    report(result, options.dryRun);
    return 0;
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(error.message);
    return 2;
  }
}

process.exitCode = main(process.argv.slice(2));
