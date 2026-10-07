// Superwiki CLI. Lives in a project at docs/.sw/sw.mjs and prints short answers,
// so agents do not have to read the vault to get them.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { basename, dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardFinding, indexWithBoard, taskBoard } from './board.js';
import { VAULT_FOLDERS, buildVault, guideFor, lint, nextId, resolve, search, summary, taskOf, tasksIn, unblockedBy } from './core.js';
import { formatStartContext, startContext } from './doctor.js';
import { SESSION_TOOLS, findSession } from './sessions.js';
import { formatStats, sessionStats } from './stats.js';

const SESSION_FLAGS = `[--session <id>] [--tool ${SESSION_TOOLS.join('|')}]`;

const HELP = `sw <command> [--docs <dir>] [--json]

  status          task counts per area and wiki page count
  ready           tasks that can start now, and tasks in progress
  check <ID>      can this task start / finish? counts its "Done when" items, lists what is open
  explain <ID>    a task's dependencies, what it blocks and unblocks, its plan and linked pages
  search <words>  pages and log entries that mention the words, best match first
  next-id <AREA>  next free task id for an area (numbers are never reused)
  board           rewrite the task list in docs/index.md from the task files
  lint            structural checks; exit code 1 on errors
  stats           what the agent session here has cost so far: steps, context and tokens per agent
  doctor          what that session carried before it read anything: rule files, skill and tool lists
                  both take ${SESSION_FLAGS} to look at another session of this project
  serve [--open]  start (or reuse) a local viewer at http://127.0.0.1:<port>/ that reads the files live
  snapshot        write docs/.sw/data.js so docs/viewer.html opens as a file, frozen at this moment`;

const SELF = fileURLToPath(import.meta.url);
const ROOT_FILES = ['index.md', 'log.md'];
const SERVER_IDLE_MS = 2 * 60 * 60 * 1000;
const LOG_HITS_SHOWN = 6;

// ---------- Reading the vault ----------

function walk(dir, rel, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, `${rel}${entry.name}/`, out);
    else if (entry.name.endsWith('.md')) out.push({ path: rel + entry.name, text: readFileSync(path, 'utf8') });
  }
}

// The vault's markdown files as [{ path, text }]. The log only ever grows, so commands that do not
// show it record its presence without reading it.
function readFiles(docs, { withLog }) {
  const files = [];
  for (const name of ROOT_FILES) {
    if (!existsSync(join(docs, name))) continue;
    const skip = name === 'log.md' && !withLog;
    files.push({ path: name, text: skip ? '' : readFileSync(join(docs, name), 'utf8') });
  }
  for (const folder of VAULT_FOLDERS) {
    if (existsSync(join(docs, folder))) walk(join(docs, folder), `${folder}/`, files);
  }
  return files;
}

export function loadVault(docs) {
  return buildVault(readFiles(docs, { withLog: false }));
}

function readConfig(docs) {
  try {
    return JSON.parse(readFileSync(join(docs, '.sw', 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}

// Everything the viewer shows, as one object.
export function vaultData(docs) {
  const config = readConfig(docs);
  return {
    name: config.name || basename(dirname(docs)),
    generated: new Date().toISOString(),
    config,
    files: readFiles(docs, { withLog: true }),
  };
}

// "<" is escaped so page text can never close the script element the viewer loads this with.
export const dataScript = data => `window.SW_DATA = ${JSON.stringify(data).replace(/</g, '\\u003c')};\n`;

// ---------- Vault commands ----------
// Each command gets { docs, vault, args, flags } and returns { data, text, code? } or
// { error, code? }. `data` is what --json prints; `text` is the default output.

function status({ vault }) {
  const s = summary(vault);
  const row = (name, c) =>
    `${name.padEnd(8)} total ${c.total}  ready ${c.ready}  in-progress ${c.progress}  blocked ${c.blocked}  done ${c.done}  cancelled ${c.cancelled}`;
  const rows = [...s.areas].map(([area, counts]) => row(area || '(none)', counts));
  if (s.areas.size > 1) rows.push(row('all', s.total));
  return {
    data: { areas: Object.fromEntries(s.areas), total: s.total, wikiPages: s.wikiPages },
    text: [...(rows.length ? rows : ['no tasks']), `wiki pages ${s.wikiPages}`].join('\n'),
  };
}

function ready({ vault }) {
  const inProgress = tasksIn(vault, 'progress');
  const startable = tasksIn(vault, 'ready');
  const brief = t => ({ id: t.id, title: t.title, milestone: t.milestone, priority: t.priority });
  const line = t => `${t.id}  ${t.title}${t.milestone ? `  [${t.milestone}]` : ''}${t.priority != null ? `  p${t.priority}` : ''}`;
  return {
    data: { inProgress: inProgress.map(brief), ready: startable.map(brief) },
    text: [`in progress (${inProgress.length})`, ...inProgress.map(line), `ready (${startable.length})`, ...startable.map(line)].join('\n'),
  };
}

function taskArg({ vault, args }) {
  const task = args[0] && taskOf(vault, args[0]);
  return task || { error: `no task ${args[0] ?? ''}` };
}

function check(ctx) {
  const t = taskArg(ctx);
  if (t.error) return { error: t.error };
  const openSoftDeps = t.openSoftDeps.filter(id => taskOf(ctx.vault, id));
  const canStart = t.status === 'todo' && !t.openDeps.length;
  // Finishing needs a closing summary in which every "Done when" item is verified (sw-summarize).
  const canFinish = !t.openDeps.length && !t.openSoftDeps.length && !!t.summary?.complete;
  const closing = t.summary && { items: t.summary.items, verified: t.summary.verified, unverified: t.summary.unverified, failed: t.summary.failed, complete: t.summary.complete };
  const verdicts = closing && ['verified', 'unverified', 'failed'].filter(verdict => closing[verdict]).map(verdict => `${closing[verdict]} ${verdict}`).join(', ');
  const plan = t.plan ? `docs/${t.plan.path}` : null;
  const openDeps = t.openDeps.length ? `  open deps: ${t.openDeps.join(', ')}` : '';
  const startLine = t.status === 'todo'
    ? `can start: ${canStart ? 'yes' : `no${openDeps}`}`
    : `can start: n/a, status is ${t.status}${openDeps}`;
  // The skills read the number of "Done when" items from this line: the size rule, and the numbering
  // of the summary's verification entries.
  const doneWhenLine = `done when: ${t.doneWhen} ${t.doneWhen === 1 ? 'item' : 'items'}`;
  const draft = t.plan?.data.status === 'draft' ? '  (draft, not approved)' : '';
  return {
    data: { id: t.id, status: t.status, canStart, canFinish, doneWhen: t.doneWhen, openDeps: t.openDeps, openSoftDeps, plan, review: t.review || null, summary: closing },
    text: [
      `${t.id}  ${t.status}  ${t.title}`,
      startLine,
      `can finish: ${canFinish ? 'yes' : 'no'}${openSoftDeps.length ? `  open soft deps: ${openSoftDeps.join(', ')}` : ''}`,
      doneWhenLine,
      `summary: ${closing ? verdicts || 'no entries' : 'none'}`,
      `plan: ${plan ? plan + draft : 'none'}`,
      `review: ${t.review ? `required (${t.review})` : 'not required'}`,
    ].join('\n'),
  };
}

function explain(ctx) {
  const { vault } = ctx;
  const t = taskArg(ctx);
  if (t.error) return { error: t.error };
  const describe = id => {
    const dep = taskOf(vault, id);
    return dep ? `${dep.id} (${dep.state}) ${dep.title}` : `${id} (unknown)`;
  };
  const section = (label, ids) => (ids.length ? [`${label}:`, ...ids.map(id => `  ${describe(id)}`)] : [`${label}: none`]);
  const linked = [...new Set(t.page.links.map(l => resolve(vault, l.target)).filter(p => p && p.folder === 'wiki'))];
  const unblocks = unblockedBy(vault, t.id);
  const guide = guideFor(vault, t.area);
  const plan = t.plan ? `docs/${t.plan.path}` : null;
  const guidePath = guide ? `docs/${guide.path}` : null;
  const facts = [
    `state: ${t.state} (status: ${t.status})`,
    t.milestone && `milestone: ${t.milestone}`,
    t.priority != null && `priority: ${t.priority}`,
    t.started && `started: ${t.started}`,
    t.finished && `finished: ${t.finished}`,
    t.review && `review: ${t.review}`,
  ].filter(Boolean);
  return {
    data: {
      id: t.id, title: t.title, status: t.status, state: t.state, milestone: t.milestone, priority: t.priority,
      started: t.started, finished: t.finished, deps: t.deps, softDeps: t.softDeps, dependents: t.dependents, unblocks,
      plan, guide: guidePath,
      linked: linked.map(p => ({ path: `docs/${p.path}`, type: p.data.type || '', summary: p.data.summary || '' })),
    },
    text: [
      `${t.id}  ${t.title}`,
      facts.join('  '),
      ...section('depends on', t.deps),
      ...(t.softDeps.length ? section('soft depends on', t.softDeps) : []),
      ...section('blocks', t.dependents),
      `finishing it makes ready: ${unblocks.join(', ') || 'nothing yet'}`,
      `task: docs/${t.page.path}`,
      `plan: ${plan ?? 'none'}`,
      `area guide: ${guidePath ?? 'none'}`,
      ...(linked.length
        ? ['linked pages:', ...linked.map(p => `  docs/${p.path}  [${p.data.type || '?'}]  ${p.data.summary || ''}`)]
        : ['linked pages: none']),
    ].join('\n'),
  };
}

// Log entries (heading plus first body line) that mention any of the terms. The log is not part of
// the loaded vault, so it is scanned here.
function searchLog(docs, terms) {
  const path = join(docs, 'log.md');
  if (!existsSync(path)) return [];
  const entries = [];
  let entry = null;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (line.startsWith('## [')) {
      entry = { title: line.slice(3), text: '', hit: false };
      entries.push(entry);
    } else if (entry && line.trim() && !entry.text) {
      entry.text = line.trim().slice(0, 160);
    }
    if (entry && terms.some(term => line.toLowerCase().includes(term))) entry.hit = true;
  }
  return entries.filter(e => e.hit).map(e => `${e.title}${e.text ? `\n    ${e.text}` : ''}`);
}

function searchCommand({ docs, vault, args }) {
  const query = args.join(' ');
  if (!query.trim()) return { error: 'usage: sw search <words>' };
  const hits = search(vault, query);
  const logHits = searchLog(docs, query.toLowerCase().split(/\s+/).filter(w => w.length > 1));
  const shownLog = logHits.slice(-LOG_HITS_SHOWN);
  // Plans have no summary; their first heading says what they are.
  const about = p => p.data.summary || p.data.title || (p.body.match(/^#+\s+(.*)$/m) || [])[1] || '';
  const kind = p => (p.folder === 'tasks' ? `task ${taskOf(vault, p.data.id || p.name)?.state ?? ''}` : p.data.type || p.folder);
  return {
    data: {
      pages: hits.map(h => ({ path: `docs/${h.page.path}`, type: kind(h.page), summary: about(h.page), termsMatched: h.matched, line: h.line })),
      log: shownLog,
    },
    text: [
      `pages (${hits.length}), best match first; a page matching one common word is a weak match`,
      ...hits.map(h => `docs/${h.page.path}  [${kind(h.page)}]  ${about(h.page)}${h.line ? `\n    ${h.line}` : ''}`),
      `log entries (${logHits.length}${logHits.length > LOG_HITS_SHOWN ? `, last ${LOG_HITS_SHOWN} shown` : ''})`,
      ...shownLog,
    ].join('\n'),
  };
}

function nextIdCommand({ vault, args }) {
  const area = args[0];
  if (!area || !/^[A-Za-z][A-Za-z0-9]*$/.test(area)) return { error: 'usage: sw next-id <AREA>' };
  const id = nextId(vault, area);
  return { data: { id }, text: id };
}

// The task list in index.md is a view of the task files; this writes it again from them.
function boardCommand({ docs, vault }) {
  if (!existsSync(join(docs, 'tasks'))) return { error: 'this vault has no task module (docs/tasks); sw-init --tasks adds it', code: 1 };
  const path = join(docs, 'index.md');
  if (!existsSync(path)) return { error: 'docs/index.md is missing; run sw-init', code: 1 };
  const before = readFileSync(path, 'utf8');
  const after = indexWithBoard(before, taskBoard(vault));
  const changed = after !== before;
  if (changed) writeFileSync(path, after);
  const { total } = summary(vault);
  return {
    data: { changed, ready: total.ready, inProgress: total.progress, blocked: total.blocked, done: total.done },
    text: `board: docs/index.md ${changed ? 'updated' : 'unchanged'}  ready ${total.ready}  in-progress ${total.progress}  blocked ${total.blocked}  done ${total.done}`,
  };
}

function lintCommand({ vault }) {
  const board = boardFinding(vault);
  const findings = [...lint(vault), ...(board ? [board] : [])];
  const errors = findings.filter(f => f.level === 'error').length;
  return {
    data: findings,
    text: [
      ...findings.map(f => `${f.level === 'error' ? 'E' : 'W'} ${f.code}  docs/${f.path}  ${f.message}`),
      `${errors} errors, ${findings.length - errors} warnings`,
    ].join('\n'),
    code: errors ? 1 : 0,
  };
}

function snapshot({ docs }) {
  const data = vaultData(docs);
  mkdirSync(join(docs, '.sw'), { recursive: true });
  writeFileSync(join(docs, '.sw', 'data.js'), dataScript(data));
  const text = `snapshot: ${data.files.length} files -> docs/.sw/data.js`;
  return { data: { files: data.files.length }, text };
}

// ---------- Session commands ----------
// These read the record an agent tool keeps of a session, not the vault. Tools file a session
// under the folder it ran in: the project root, which holds docs/.

function sessionArg(command, { docs, flags }) {
  if (flags.tool && !SESSION_TOOLS.includes(flags.tool)) return { error: `usage: sw ${command} ${SESSION_FLAGS}` };
  const root = dirname(docs);
  const session = findSession(root, { tool: flags.tool, id: flags.session });
  return session || { error: `no ${flags.tool || 'agent'} session record found for ${root}`, code: 1 };
}

function statsCommand(ctx) {
  const session = sessionArg('stats', ctx);
  if (session.error) return session;
  const stats = sessionStats(session);
  return { data: stats, text: formatStats(stats) };
}

function doctorCommand(ctx) {
  const session = sessionArg('doctor', ctx);
  if (session.error) return session;
  const report = startContext(session);
  return { data: report, text: formatStartContext(report) };
}

// ---------- Viewer server ----------
// A file:// page cannot read local files unless the user picks a folder. Served from localhost it
// can: every Refresh asks this process, which reads the files as they are now.

const serverStatePath = docs => join(docs, '.sw', 'server.json');

function readServerState(docs) {
  try {
    return JSON.parse(readFileSync(serverStatePath(docs), 'utf8'));
  } catch {
    return null;
  }
}

async function servesDocs(url, docs) {
  try {
    return (await (await fetch(`${url}.sw/ping`)).text()) === docs;
  } catch {
    return false;
  }
}

function runServer(docs) {
  let lastRequest = Date.now();
  const server = createServer((req, res) => {
    lastRequest = Date.now();
    const { port } = server.address();
    // Only this machine's browser, addressed by its loopback name, gets an answer.
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) {
      res.writeHead(403).end();
      return;
    }
    const send = (type, body) => {
      res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
      res.end(body);
    };
    const path = (req.url || '/').split('?')[0];
    const viewer = join(docs, 'viewer.html');
    if (path === '/' || path === '/viewer.html') {
      if (existsSync(viewer)) send('text/html', readFileSync(viewer));
      else res.writeHead(404).end('docs/viewer.html is missing; run sw-init');
    } else if (path === '/.sw/data.js') {
      send('text/javascript', dataScript({ ...vaultData(docs), live: true }));
    } else if (path === '/.sw/ping') {
      send('text/plain', docs);
    } else {
      res.writeHead(404).end();
    }
  });
  server.listen(0, '127.0.0.1', () => {
    mkdirSync(join(docs, '.sw'), { recursive: true });
    writeFileSync(serverStatePath(docs), JSON.stringify({ url: `http://127.0.0.1:${server.address().port}/`, pid: process.pid }) + '\n');
  });
  setInterval(() => {
    if (Date.now() - lastRequest > SERVER_IDLE_MS) process.exit(0);
  }, 60 * 1000);
}

// The URL of this project's viewer server, starting a detached one if none is running.
async function ensureServer(docs) {
  const running = readServerState(docs)?.url;
  if (running && (await servesDocs(running, docs))) return running;
  spawn(process.execPath, [SELF, 'serve', '--foreground', '--docs', docs], { detached: true, stdio: 'ignore' }).unref();
  for (let attempt = 0; attempt < 50; attempt++) {
    await new Promise(done => setTimeout(done, 100));
    const url = readServerState(docs)?.url;
    if (url && (await servesDocs(url, docs))) return url;
  }
  return null;
}

function openInBrowser(url) {
  const [bin, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]];
  spawn(bin, args, { detached: true, stdio: 'ignore' }).unref();
}

async function serve({ docs, flags }) {
  if (flags.foreground) {
    runServer(docs);
    return null; // keeps running; no result to print
  }
  const url = await ensureServer(docs);
  if (!url) return { error: 'could not start the viewer server; use `snapshot` and open docs/viewer.html instead', code: 1 };
  if (flags.open) openInBrowser(url);
  return { data: { url }, text: url };
}

// ---------- Entry point ----------

const COMMANDS = {
  status: { run: status, needsVault: true },
  ready: { run: ready, needsVault: true },
  check: { run: check, needsVault: true },
  explain: { run: explain, needsVault: true },
  search: { run: searchCommand, needsVault: true },
  'next-id': { run: nextIdCommand, needsVault: true },
  board: { run: boardCommand, needsVault: true },
  lint: { run: lintCommand, needsVault: true },
  stats: { run: statsCommand, needsVault: false },
  doctor: { run: doctorCommand, needsVault: false },
  snapshot: { run: snapshot, needsVault: false },
  serve: { run: serve, needsVault: false },
};

// Flags that are on or off, and flags that take the next argument as their value.
const SWITCHES = ['json', 'open', 'foreground'];
const OPTIONS = ['docs', 'tool', 'session'];

// Anything that is not a known flag is positional, so search words may start with dashes.
function parseArgs(argv) {
  const flags = Object.fromEntries([...SWITCHES.map(name => [name, false]), ...OPTIONS.map(name => [name, null])]);
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].startsWith('--') ? argv[i].slice(2) : null;
    if (SWITCHES.includes(name)) flags[name] = true;
    else if (OPTIONS.includes(name)) flags[name] = argv[++i] ?? null;
    else positional.push(argv[i]);
  }
  return { command: positional[0], args: positional.slice(1), flags };
}

// --docs wins; otherwise the docs folder this script was installed into; otherwise ./docs.
function docsDir(flags) {
  if (flags.docs) return resolvePath(flags.docs);
  const installedIn = join(dirname(SELF), '..');
  return existsSync(join(installedIn, 'index.md')) ? installedIn : resolvePath('docs');
}

async function main(argv) {
  const { command, args, flags } = parseArgs(argv);
  if (!command || command === 'help' || command === '--help') {
    console.log(HELP);
    return 0;
  }
  const entry = COMMANDS[command];
  if (!entry) {
    console.error(`unknown command ${command}\n\n${HELP}`);
    return 2;
  }
  const docs = docsDir(flags);
  if (!existsSync(docs)) {
    console.error(`no docs folder at ${docs}; run sw-init or pass --docs`);
    return 2;
  }
  const result = await entry.run({ docs, args, flags, vault: entry.needsVault ? loadVault(docs) : null });
  if (result === null) return null;
  if (result.error) {
    console.error(result.error);
    return result.code ?? 2;
  }
  console.log(flags.json ? JSON.stringify(result.data, null, 2) : result.text);
  return result.code ?? 0;
}

// realpath: the script may be reached through a symlinked path (macOS /tmp, linked skills folders).
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(SELF)) {
  const code = await main(process.argv.slice(2));
  if (code !== null) process.exitCode = code;
}
