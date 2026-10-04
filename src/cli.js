import { buildVault, lint, summary, tasksIn, nextId, taskOf, resolve, search, unblockedBy, VAULT_FOLDERS } from './core.js';
// Superwiki CLI. Lives in a project at docs/.sw/sw.mjs; prints short answers so agents do not read the vault to get them.
import { readFileSync, readdirSync, existsSync, realpathSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const HELP = `sw <command> [--docs <dir>] [--json]

  status          task counts per area and wiki page count
  ready           tasks that can start now, and tasks in progress
  check <ID>      can this task start / finish? lists what is open
  explain <ID>    a task's dependencies, what it blocks and unblocks, its plan and linked pages
  search <words>  pages and log entries that mention the words, best match first
  next-id <AREA>  next free task id for an area (numbers are never reused)
  lint            structural checks; exit code 1 on errors
  serve [--open]  start (or reuse) a local viewer at http://127.0.0.1:<port>/ that reads the files live
  snapshot        write docs/.sw/data.js so docs/viewer.html opens as a file, frozen at this moment`;

function docsDir(args) {
  const i = args.indexOf('--docs');
  if (i >= 0) return resolvePath(args[i + 1] || '.');
  const own = join(dirname(fileURLToPath(import.meta.url)), '..');
  if (existsSync(join(own, 'index.md'))) return own;
  return resolvePath('docs');
}

function walk(dir, rel, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, `${rel}${e.name}/`, out);
    else if (e.name.endsWith('.md')) out.push({ path: rel + e.name, text: readFileSync(p, 'utf8') });
  }
}

export function loadVault(docs) {
  const files = [];
  for (const name of ['index.md', 'log.md']) {
    // log.md only ever grows; its links are not worth the read, so only its presence is recorded.
    if (existsSync(join(docs, name))) files.push({ path: name, text: name === 'log.md' ? '' : readFileSync(join(docs, name), 'utf8') });
  }
  for (const f of VAULT_FOLDERS) if (existsSync(join(docs, f))) walk(join(docs, f), `${f}/`, files);
  return buildVault(files);
}

// Everything the viewer shows, as one object: the same pages the CLI reads, plus the log's text.
export function vaultData(docs) {
  const files = [];
  for (const name of ['index.md', 'log.md']) if (existsSync(join(docs, name))) files.push({ path: name, text: readFileSync(join(docs, name), 'utf8') });
  for (const f of VAULT_FOLDERS) if (existsSync(join(docs, f))) walk(join(docs, f), `${f}/`, files);
  let config = {};
  try { config = JSON.parse(readFileSync(join(docs, '.sw', 'config.json'), 'utf8')); } catch {}
  return { name: config.name || basename(dirname(docs)), generated: new Date().toISOString(), config, files };
}
// "<" is escaped so page text can never close the script element the viewer loads this with.
export const dataScript = data => `window.SW_DATA = ${JSON.stringify(data).replace(/</g, '\\u003c')};\n`;

// The viewer cannot read files from a file:// page without the user picking a folder. Served from
// localhost it can: every Refresh asks this process, which reads the files as they are now.
const IDLE_MS = 2 * 60 * 60 * 1000;
function serve(docs, argv) {
  const statePath = join(docs, '.sw', 'server.json');
  const state = () => { try { return JSON.parse(readFileSync(statePath, 'utf8')); } catch { return null; } };
  const alive = async url => { try { return (await (await fetch(`${url}.sw/ping`)).text()) === docs; } catch { return false; } };

  if (!argv.includes('--foreground')) {
    (async () => {
      let url = state()?.url;
      if (!url || !(await alive(url))) {
        url = null;
        spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve', '--foreground', '--docs', docs], { detached: true, stdio: 'ignore' }).unref();
        for (let i = 0; i < 50 && !url; i++) {
          await new Promise(r => setTimeout(r, 100));
          const u = state()?.url;
          if (u && (await alive(u))) url = u;
        }
      }
      if (!url) { console.error('could not start the viewer server; use `snapshot` and open docs/viewer.html instead'); process.exitCode = 1; return; }
      console.log(url);
      if (argv.includes('--open')) {
        const [bin, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
        spawn(bin, args, { detached: true, stdio: 'ignore' }).unref();
      }
    })();
    return;
  }

  let last = Date.now();
  const server = createServer((req, res) => {
    last = Date.now();
    const port = server.address().port;
    // Only this machine's browser, addressed by its loopback name, gets an answer.
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) { res.writeHead(403).end(); return; }
    const path = (req.url || '/').split('?')[0];
    const send = (type, body) => { res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' }); res.end(body); };
    if (path === '/' || path === '/viewer.html') return existsSync(join(docs, 'viewer.html')) ? send('text/html', readFileSync(join(docs, 'viewer.html'))) : res.writeHead(404).end('docs/viewer.html is missing; run sw-init');
    if (path === '/.sw/data.js') return send('text/javascript', dataScript({ ...vaultData(docs), live: true }));
    if (path === '/.sw/ping') return send('text/plain', docs);
    res.writeHead(404).end();
  });
  server.listen(0, '127.0.0.1', () => {
    mkdirSync(join(docs, '.sw'), { recursive: true });
    writeFileSync(statePath, JSON.stringify({ url: `http://127.0.0.1:${server.address().port}/`, pid: process.pid }) + '\n');
  });
  setInterval(() => { if (Date.now() - last > IDLE_MS) process.exit(0); }, 60 * 1000);
}

const line = t => `${t.id}  ${t.title}${t.milestone ? `  [${t.milestone}]` : ''}${t.priority != null ? `  p${t.priority}` : ''}`;

function main(argv) {
  const args = argv.filter(a => a !== '--json');
  const json = argv.includes('--json');
  const di = args.indexOf('--docs');
  if (di >= 0) args.splice(di, 2);
  const [cmd, arg] = args;
  if (!cmd || cmd === 'help' || cmd === '--help') { console.log(HELP); return 0; }
  const docs = docsDir(argv);
  if (!existsSync(docs)) { console.error(`no docs folder at ${docs}; run sw-init or pass --docs`); return 2; }
  const vault = loadVault(docs);
  const print = (data, text) => console.log(json ? JSON.stringify(data, null, 2) : text);

  if (cmd === 'status') {
    const s = summary(vault);
    const row = (name, c) => `${name.padEnd(8)} total ${c.total}  ready ${c.ready}  in-progress ${c.progress}  blocked ${c.blocked}  done ${c.done}  cancelled ${c.cancelled}`;
    const rows = [...s.areas].map(([a, c]) => row(a || '(none)', c));
    if (s.areas.size > 1) rows.push(row('all', s.total));
    print({ areas: Object.fromEntries(s.areas), total: s.total, wikiPages: s.wikiPages }, [...(rows.length ? rows : ['no tasks']), `wiki pages ${s.wikiPages}`].join('\n'));
    return 0;
  }
  if (cmd === 'ready') {
    const prog = tasksIn(vault, 'progress');
    const ready = tasksIn(vault, 'ready');
    const pick = t => ({ id: t.id, title: t.title, milestone: t.milestone, priority: t.priority });
    print({ inProgress: prog.map(pick), ready: ready.map(pick) }, [`in progress (${prog.length})`, ...prog.map(line), `ready (${ready.length})`, ...ready.map(line)].join('\n'));
    return 0;
  }
  if (cmd === 'check') {
    const t = arg && taskOf(vault, arg);
    if (!t) { console.error(`no task ${arg ?? ''}`); return 2; }
    const known = ids => ids.filter(id => taskOf(vault, id));
    const data = { id: t.id, status: t.status, canStart: t.status === 'todo' && !t.openDeps.length, canFinish: !t.openDeps.length && !t.openSoftDeps.length, openDeps: t.openDeps, openSoftDeps: known(t.openSoftDeps), plan: t.plan ? `docs/${t.plan.path}` : null };
    print(data, [`${t.id}  ${t.status}  ${t.title}`, t.status === 'todo' ? `can start: ${data.canStart ? 'yes' : `no  open deps: ${t.openDeps.join(', ')}`}` : `can start: n/a, status is ${t.status}${t.openDeps.length ? `  open deps: ${t.openDeps.join(', ')}` : ''}`, `can finish: ${data.canFinish ? 'yes' : 'no'}${data.openSoftDeps.length ? `  open soft deps: ${data.openSoftDeps.join(', ')}` : ''}`, `plan: ${data.plan ?? 'none'}`].join('\n'));
    return 0;
  }
  if (cmd === 'explain') {
    const t = arg && taskOf(vault, arg);
    if (!t) { console.error(`no task ${arg ?? ''}`); return 2; }
    const ref = id => { const d = taskOf(vault, id); return d ? `${d.id} (${d.state}) ${d.title}` : `${id} (unknown)`; };
    const list = (label, ids) => (ids.length ? [`${label}:`, ...ids.map(id => `  ${ref(id)}`)] : [`${label}: none`]);
    const linked = [...new Set(t.page.links.map(l => resolve(vault, l.target)).filter(p => p && p.folder === 'wiki'))];
    const unblocks = unblockedBy(vault, t.id);
    const data = { id: t.id, title: t.title, status: t.status, state: t.state, milestone: t.milestone, priority: t.priority, started: t.started, finished: t.finished, deps: t.deps, softDeps: t.softDeps, dependents: t.dependents, unblocks, plan: t.plan ? `docs/${t.plan.path}` : null, linked: linked.map(p => ({ path: `docs/${p.path}`, type: p.data.type || '', summary: p.data.summary || '' })) };
    print(data, [
      `${t.id}  ${t.title}`,
      `state: ${t.state} (status: ${t.status})${t.milestone ? `  milestone: ${t.milestone}` : ''}${t.priority != null ? `  priority: ${t.priority}` : ''}${t.started ? `  started: ${t.started}` : ''}${t.finished ? `  finished: ${t.finished}` : ''}`,
      ...list('depends on', t.deps), ...(t.softDeps.length ? list('soft depends on', t.softDeps) : []),
      ...list('blocks', t.dependents),
      `finishing it makes ready: ${unblocks.join(', ') || 'nothing yet'}`,
      `task: docs/${t.page.path}`, `plan: ${data.plan ?? 'none'}`,
      ...(linked.length ? ['linked pages:', ...linked.map(p => `  docs/${p.path}  [${p.data.type || '?'}]  ${p.data.summary || ''}`)] : ['linked pages: none']),
    ].join('\n'));
    return 0;
  }
  if (cmd === 'search') {
    const query = args.slice(1).join(' ');
    if (!query.trim()) { console.error('usage: sw search <words>'); return 2; }
    const hits = search(vault, query);
    // The log is not loaded into the vault; scan it here and report the entries, not the lines.
    const terms = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    const entries = [];
    if (existsSync(join(docs, 'log.md'))) {
      let head = null;
      for (const l of readFileSync(join(docs, 'log.md'), 'utf8').split(/\r?\n/)) {
        if (l.startsWith('## [')) { head = { title: l.slice(3), text: '', hit: false }; entries.push(head); }
        else if (head && l.trim() && !head.text) head.text = l.trim().slice(0, 160);
        if (head && terms.some(t => l.toLowerCase().includes(t))) head.hit = true;
      }
    }
    const logHits = entries.filter(e => e.hit).map(e => `${e.title}${e.text ? `\n    ${e.text}` : ''}`);
    // Plans have no summary; their first heading says what they are.
    const about = p => p.data.summary || p.data.title || (p.body.match(/^#+\s+(.*)$/m) || [])[1] || '';
    const label = p => (p.folder === 'tasks' ? `task ${taskOf(vault, p.data.id || p.name)?.state ?? ''}` : p.data.type || p.folder);
    print({ pages: hits.map(h => ({ path: `docs/${h.page.path}`, type: label(h.page), summary: about(h.page), termsMatched: h.matched, line: h.line })), log: logHits.slice(-6) },
      [`pages (${hits.length}), best match first; a page matching one common word is a weak match`, ...hits.map(h => `docs/${h.page.path}  [${label(h.page)}]  ${about(h.page)}${h.line ? `\n    ${h.line}` : ''}`), `log entries (${logHits.length}${logHits.length > 6 ? ', last 6 shown' : ''})`, ...logHits.slice(-6)].join('\n'));
    return 0;
  }
  if (cmd === 'next-id') {
    if (!arg || !/^[A-Za-z][A-Za-z0-9]*$/.test(arg)) { console.error('usage: sw next-id <AREA>'); return 2; }
    print({ id: nextId(vault, arg) }, nextId(vault, arg));
    return 0;
  }
  if (cmd === 'snapshot') {
    const data = vaultData(docs);
    mkdirSync(join(docs, '.sw'), { recursive: true });
    writeFileSync(join(docs, '.sw', 'data.js'), dataScript(data));
    console.log(`snapshot: ${data.files.length} files -> docs/.sw/data.js`);
    return 0;
  }
  if (cmd === 'serve') { serve(docs, argv); return null; }
  if (cmd === 'lint') {
    const found = lint(vault);
    const errors = found.filter(f => f.level === 'error').length;
    print(found, [...found.map(f => `${f.level === 'error' ? 'E' : 'W'} ${f.code}  docs/${f.path}  ${f.message}`), `${errors} errors, ${found.length - errors} warnings`].join('\n'));
    return errors ? 1 : 0;
  }
  console.error(`unknown command ${cmd}\n\n${HELP}`);
  return 2;
}

// realpath: the script may be reached through a symlinked path (macOS /tmp, linked skills folders).
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) { const code = main(process.argv.slice(2)); if (code != null) process.exitCode = code; }
