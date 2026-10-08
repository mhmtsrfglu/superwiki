// Superwiki core: vault model, derived task state and lint. Pure: no fs, no DOM.
// Runs in Node (docs/.sw/sw.mjs) and inlined in the viewer, so both report the same findings.

export const STATUSES = ['todo', 'in-progress', 'done', 'cancelled'];
export const VAULT_FOLDERS = ['wiki', 'tasks', 'plans'];
const ROOT_PAGES = ['index', 'log'];

// ---------- Frontmatter (the YAML subset Superwiki writes: scalars, [inline, lists], "- block" lists) ----------
function scalar(s) {
  let v = String(s).trim();
  if (v.length > 1 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\\(["\\])/g, '$1');
  else if (v.length > 1 && v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1).replace(/''/g, "'");
  if (v.startsWith('[[') && v.endsWith(']]')) v = v.slice(2, -2).trim();
  return v;
}

function stripComment(line) {
  return /["']/.test(line) ? line : line.replace(/(^|\s)#.*$/, '');
}

export function parseFrontmatter(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
  if (!m) return { data: null, body: src, bodyLine: 1 };
  const data = {};
  let key = null;
  for (const raw of m[1].split(/\r?\n/)) {
    const line = stripComment(raw);
    if (!line.trim()) continue;
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && key) {
      if (!Array.isArray(data[key])) data[key] = [];
      data[key].push(scalar(item[1]));
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    key = kv[1];
    const v = kv[2].trim();
    if (v === '') data[key] = null;
    else if (v.startsWith('[') && v.endsWith(']') && !v.startsWith('[[')) {
      data[key] = v.slice(1, -1).split(',').map(scalar).filter(Boolean);
    } else data[key] = scalar(v);
  }
  return { data, body: src.slice(m[0].length), bodyLine: m[0].split('\n').length };
}

export function asList(v) {
  if (v == null || v === '') return [];
  return Array.isArray(v) ? v : [v];
}

// ---------- Wikilinks ----------
const WIKILINK = /(!?)\[\[([^\[\]|#]+)(#[^\[\]|]*)?(?:\|([^\[\]]*))?\]\]/g;
const isAttachment = target => /\.[A-Za-z0-9]{2,5}$/.test(target) && !/\.md$/i.test(target);

// Links in a markdown body. Fenced and inline code is skipped; `line` is 1-based within the body.
export function extractWikilinks(body) {
  const out = [];
  let fenced = false;
  String(body ?? '').split(/\r?\n/).forEach((raw, i) => {
    if (/^\s*(```|~~~)/.test(raw)) { fenced = !fenced; return; }
    if (fenced) return;
    const line = raw.replace(/`[^`]*`/g, '');
    for (const m of line.matchAll(WIKILINK)) {
      const target = m[2].trim().replace(/\.md$/i, '');
      if (m[1] === '!' || isAttachment(m[2].trim())) continue;
      out.push({ target, heading: m[3] ? m[3].slice(1) : null, alias: m[4] ?? null, line: i + 1 });
    }
  });
  return out;
}

// ---------- Closing summary ----------
// The `## Summary` section sw-verify writes into a task file when the task is closed. Its
// "Verification" list holds one numbered entry per "Done when" item: `1. **verified**: ...`.
const VERDICT_ENTRY = /^(\d+)\.\s+\*\*(verified|failed|unverified)\*\*/;

// Line ranges [start, end) of a body's `## ` sections, by heading text. Fenced code is skipped.
function levelTwoSections(lines) {
  const out = [];
  let fenced = false;
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return; }
    if (fenced) return;
    const m = /^## +(.*?)\s*$/.exec(line);
    if (!m) return;
    if (out.length) out[out.length - 1].end = i;
    out.push({ title: m[1].toLowerCase(), start: i, end: lines.length });
  });
  return out;
}

// The "Done when" items are the top-level `-`, `*` or `+` bullets of the `## Done when` section; a
// nested bullet belongs to the item above it. The skills judge a task's size by this count, `check`
// prints it, and the summary's verification entries are numbered by it.
function countDoneWhen(lines, sections) {
  const section = sections.find(s => s.title === 'done when');
  return section ? lines.slice(section.start + 1, section.end).filter(l => /^[-*+]\s+\S/.test(l)).length : 0;
}

export function doneWhenItems(body) {
  const lines = String(body ?? '').split(/\r?\n/);
  return countDoneWhen(lines, levelTwoSections(lines));
}

// null when the body has no `## Summary`. Otherwise the verdict counts over the "Done when" items
// (an item without an entry is unverified), `complete` when every item is verified, the section's
// markdown without its heading (`text`) and the body without the section (`rest`).
export function closingSummary(body) {
  const lines = String(body ?? '').split(/\r?\n/);
  const sections = levelTwoSections(lines);
  const section = sections.find(s => s.title === 'summary');
  if (!section) return null;
  const items = countDoneWhen(lines, sections);
  const inside = lines.slice(section.start + 1, section.end);
  const entries = new Map();
  for (const line of inside) {
    const m = VERDICT_ENTRY.exec(line);
    if (m && !entries.has(Number(m[1]))) entries.set(Number(m[1]), m[2]);
  }
  const counts = { verified: 0, unverified: 0, failed: 0 };
  if (items) for (let n = 1; n <= items; n++) counts[entries.get(n) ?? 'unverified']++;
  else for (const verdict of entries.values()) counts[verdict]++;
  return {
    items,
    ...counts,
    complete: entries.size > 0 && counts.unverified === 0 && counts.failed === 0,
    text: inside.join('\n').trim(),
    rest: [...lines.slice(0, section.start), ...lines.slice(section.end)].join('\n').trim(),
  };
}

// ---------- Vault ----------
const key = name => String(name).toLowerCase();
const areaOf = id => (String(id).includes('-') ? String(id).slice(0, String(id).lastIndexOf('-')) : '');

// files: [{ path, text }] with paths relative to docs/ ("wiki/foo.md"). Pages are the .md files in
// index.md, log.md, wiki/, tasks/ and plans/. Files under raw/ (any extension) are sources: they are
// kept apart in `vault.raw`, page-shaped so that `search` can scan them, and no check reads them.
// Anything else belongs to other tools and is ignored.
export function buildVault(files) {
  const pages = [];
  const raw = [];
  const names = new Map();
  for (const f of files) {
    const path = String(f.path).replace(/\\/g, '/').replace(/^\.?\//, '');
    const parts = path.split('/');
    if (parts[0] === 'raw' && parts.length > 1) {
      const name = parts[parts.length - 1].replace(/\.[^.]+$/, '');
      const fm = parseFrontmatter(f.text);
      raw.push({ path, folder: 'raw', name, nested: parts.length > 2, data: fm.data || {}, hasFrontmatter: !!fm.data, body: fm.body, bodyLine: fm.bodyLine, links: [], inbound: [] });
      continue;
    }
    if (!/\.md$/i.test(path)) continue;
    const name = parts[parts.length - 1].replace(/\.md$/i, '');
    let folder;
    if (parts.length === 1) { if (!ROOT_PAGES.includes(name)) continue; folder = 'root'; }
    else if (VAULT_FOLDERS.includes(parts[0])) folder = parts[0];
    else continue;
    const fm = parseFrontmatter(f.text);
    const page = { path, folder, name, nested: parts.length > 2, data: fm.data || {}, hasFrontmatter: !!fm.data, body: fm.body, bodyLine: fm.bodyLine, links: extractWikilinks(fm.body), inbound: [] };
    pages.push(page);
    if (!names.has(key(name))) names.set(key(name), []);
    names.get(key(name)).push(page);
  }
  pages.sort((a, b) => a.path.localeCompare(b.path));
  raw.sort((a, b) => a.path.localeCompare(b.path));
  const vault = { pages, raw, names, tasks: new Map(), plans: new Map(), index: null, log: null };
  vault.index = pages.find(p => p.folder === 'root' && p.name === 'index') || null;
  vault.log = pages.find(p => p.folder === 'root' && p.name === 'log') || null;
  for (const p of pages) for (const l of p.links) {
    const t = resolve(vault, l.target);
    if (t && t !== p && !t.inbound.includes(p)) t.inbound.push(p);
  }
  for (const p of pages) {
    if (p.folder === 'plans') vault.plans.set(key(p.name.replace(/-plan$/i, '')), p);
    if (p.folder !== 'tasks') continue;
    const d = p.data;
    const id = String(d.id || p.name);
    vault.tasks.set(key(id), {
      id, page: p, area: areaOf(id), title: d.title || '', status: d.status || '',
      deps: asList(d.deps).map(String), softDeps: asList(d.soft_deps).map(String),
      milestone: d.milestone || '', priority: d.priority == null || d.priority === '' ? null : Number(d.priority),
      started: d.started || '', finished: d.finished || '',
      // Any value asks for a separate review before the task may be done; the value names the kind.
      review: d.review ? String(d.review) : '',
      doneWhen: doneWhenItems(p.body),
      // The closing summary's verdicts, or null while the task file has no `## Summary`.
      summary: closingSummary(p.body),
      state: null, wave: 0, dependents: [], plan: null,
    });
  }
  derive(vault);
  return vault;
}

export function resolve(vault, target) {
  const hit = vault.names.get(key(String(target).split('/').pop().replace(/\.md$/i, '')));
  return hit ? hit[0] : null;
}

export const taskOf = (vault, id) => vault.tasks.get(key(id)) || null;

// state: done | cancelled | progress | ready | blocked. wave: longest hard-dependency chain below the task.
function derive(vault) {
  const depth = new Map();
  const waveOf = (t, trail) => {
    if (depth.has(t)) return depth.get(t);
    if (trail.has(t)) return 0;
    trail.add(t);
    let w = 0;
    for (const id of t.deps) { const d = taskOf(vault, id); if (d) w = Math.max(w, waveOf(d, trail) + 1); }
    trail.delete(t);
    depth.set(t, w);
    return w;
  };
  for (const t of vault.tasks.values()) {
    t.plan = vault.plans.get(key(t.id)) || null;
    t.wave = waveOf(t, new Set());
    const open = t.deps.filter(id => taskOf(vault, id)?.status !== 'done');
    t.openDeps = open;
    t.openSoftDeps = t.softDeps.filter(id => taskOf(vault, id)?.status !== 'done');
    t.state = t.status === 'done' ? 'done' : t.status === 'cancelled' ? 'cancelled' : t.status === 'in-progress' ? 'progress' : open.length ? 'blocked' : 'ready';
    for (const id of [...t.deps, ...t.softDeps]) {
      const d = taskOf(vault, id);
      if (d && !d.dependents.includes(t.id)) d.dependents.push(t.id);
    }
  }
}

function cycles(vault) {
  const found = [];
  const seen = new Set();
  const state = new Map();
  const visit = (t, trail) => {
    state.set(t, 1);
    trail.push(t.id);
    for (const id of [...t.deps, ...t.softDeps]) {
      const d = taskOf(vault, id);
      if (!d) continue;
      if (state.get(d) === 1) {
        const loop = trail.slice(trail.indexOf(d.id));
        const sig = [...loop].sort().join(',');
        if (!seen.has(sig)) { seen.add(sig); found.push([...loop, d.id]); }
      } else if (!state.get(d)) visit(d, trail);
    }
    trail.pop();
    state.set(t, 2);
  };
  for (const t of vault.tasks.values()) if (!state.get(t)) visit(t, []);
  return found;
}

// ---------- Lint ----------
// Finding: { level: 'error' | 'warn', code, path, message }.
export function lint(vault) {
  const out = [];
  const add = (level, code, path, message) => out.push({ level, code, path, message });

  for (const [, list] of vault.names) {
    if (list.length > 1) add('error', 'duplicate-name', list[0].path, `file name is not unique: ${list.map(p => p.path).join(', ')}`);
  }
  if (!vault.index) add('error', 'missing-index', 'index.md', 'docs/index.md is missing');

  for (const p of vault.pages) {
    if (p.nested) add('warn', 'nested-page', p.path, `${p.folder}/ is flat; move the file up`);
    // The log is history: entries keep the names pages had when they were written.
    if (p !== vault.log) for (const l of p.links) {
      if (!resolve(vault, l.target)) add('error', 'broken-link', p.path, `line ${p.bodyLine + l.line - 1}: [[${l.target}]] has no target`);
    }
    if (p.folder === 'wiki') {
      if (!p.data.type) add('error', 'missing-field', p.path, 'frontmatter `type` is missing');
      if (!p.data.summary) add('warn', 'missing-field', p.path, 'frontmatter `summary` is missing');
      if (vault.index && !vault.index.links.some(l => resolve(vault, l.target) === p)) add('warn', 'not-in-index', p.path, 'page is not listed in index.md');
      // A source summary is reachable from the index and need not be cited yet; an area guide is found by its area, not by links.
      if (p.data.type !== 'source' && p.data.type !== 'guide' && !p.inbound.some(q => q !== vault.index && q !== vault.log)) add('warn', 'orphan-page', p.path, 'no page links here');
    }
    if (p.folder === 'plans') {
      const id = /-plan$/i.test(p.name) ? p.name.replace(/-plan$/i, '') : null;
      if (!id) add('error', 'plan-name', p.path, 'plan files are named <ID>-plan.md');
      else if (!taskOf(vault, id)) add('error', 'orphan-plan', p.path, `no task ${id} for this plan`);
      else if (p.data.task && key(p.data.task) !== key(id)) add('error', 'plan-task-mismatch', p.path, `frontmatter task ${p.data.task} does not match file name`);
      if (p.data.type !== 'plan') add('warn', 'missing-field', p.path, 'frontmatter `type: plan` is missing');
    }
  }

  for (const t of vault.tasks.values()) {
    const path = t.page.path;
    if (t.page.data.type !== 'task') add('warn', 'missing-field', path, 'frontmatter `type: task` is missing');
    if (!t.page.data.id) add('error', 'missing-field', path, 'frontmatter `id` is missing');
    else if (key(t.id) !== key(t.page.name)) add('error', 'id-mismatch', path, `id ${t.id} does not match file name`);
    if (!/^[A-Za-z][A-Za-z0-9]*-\d+$/.test(t.id)) add('error', 'bad-id', path, `id ${t.id} is not <AREA>-<number>`);
    if (!t.title) add('error', 'missing-field', path, 'frontmatter `title` is missing');
    if (!STATUSES.includes(t.status)) add('error', 'bad-status', path, `status "${t.status}" is not one of ${STATUSES.join(', ')}`);
    for (const id of [...t.deps, ...t.softDeps]) {
      const d = taskOf(vault, id);
      if (!d) add('error', 'unknown-dep', path, `depends on ${id}, which does not exist`);
      else if (d.status === 'cancelled' && t.status !== 'cancelled' && t.status !== 'done') add('warn', 'cancelled-dep', path, `depends on cancelled task ${id}`);
    }
    const hardOpen = t.openDeps.filter(id => taskOf(vault, id));
    const softOpen = t.openSoftDeps.filter(id => taskOf(vault, id));
    if (t.status === 'in-progress' && hardOpen.length) add('error', 'started-before-deps', path, `in-progress but not done: ${hardOpen.join(', ')}`);
    if (t.status === 'done' && (hardOpen.length || softOpen.length)) add('error', 'done-before-deps', path, `done but not done: ${[...hardOpen, ...softOpen].join(', ')}`);
    // A done task without a summary predates the gate and is fine; a summary that is there must hold.
    if (t.status === 'done' && t.summary && !t.summary.complete) add('error', 'done-unverified', path, `done but summary has ${t.summary.unverified} unverified, ${t.summary.failed} failed`);
    if ((t.status === 'in-progress' || t.status === 'done') && !t.started) add('warn', 'missing-date', path, '`started` is empty');
    if (t.status === 'done' && !t.finished) add('warn', 'missing-date', path, '`finished` is empty');
  }
  for (const loop of cycles(vault)) add('error', 'dep-cycle', taskOf(vault, loop[0]).page.path, `dependency cycle: ${loop.join(' -> ')}`);

  const rank = { error: 0, warn: 1 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || a.path.localeCompare(b.path) || a.code.localeCompare(b.code));
}

// ---------- Queries ----------
const STATES = ['ready', 'progress', 'blocked', 'done', 'cancelled'];
const idOrder = (a, b) => a.area.localeCompare(b.area) || Number(a.id.split('-').pop()) - Number(b.id.split('-').pop());
// Runnable order: fewest unfinished layers first, then explicit priority, then id.
export const taskOrder = (a, b) => a.wave - b.wave || (a.priority ?? Infinity) - (b.priority ?? Infinity) || idOrder(a, b);

export function summary(vault) {
  const zero = () => Object.fromEntries([['total', 0], ...STATES.map(s => [s, 0])]);
  const areas = new Map();
  const total = zero();
  for (const t of [...vault.tasks.values()].sort(idOrder)) {
    if (!areas.has(t.area)) areas.set(t.area, zero());
    for (const c of [areas.get(t.area), total]) { c.total++; c[t.state]++; }
  }
  return { areas, total, wikiPages: vault.pages.filter(p => p.folder === 'wiki').length };
}

export function tasksIn(vault, state) {
  return [...vault.tasks.values()].filter(t => t.state === state).sort(taskOrder);
}

// Numbers are never reused: cancelled tasks stay on disk and keep theirs.
export function nextId(vault, area) {
  let max = 0;
  let width = 2;
  for (const t of vault.tasks.values()) {
    if (key(t.area) !== key(area)) continue;
    const n = t.id.split('-').pop();
    if (/^\d+$/.test(n)) { max = Math.max(max, Number(n)); width = Math.max(width, n.length); }
  }
  return `${area}-${String(max + 1).padStart(width, '0')}`;
}

// Hard dependents that become ready the moment this task is done.
export function unblockedBy(vault, id) {
  const t = taskOf(vault, id);
  if (!t) return [];
  return t.dependents.map(d => taskOf(vault, d))
    .filter(d => d && d.status === 'todo' && d.deps.includes(t.id) && d.openDeps.every(o => o === t.id))
    .map(d => d.id);
}

// The first line of `body` that one of the regexes matches, and the last markdown heading above it
// ('' when none precedes it). Lines inside a code fence are neither headings nor matches.
function firstMatch(body, res) {
  let heading = '';
  let fenced = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const h = line.match(/^#{1,6}\s+(.*?)\s*#*$/);
    if (h) heading = h[1];
    if (res.some(re => re.test(line.toLowerCase()))) return { line: line.slice(0, 140), heading };
  }
  return { line: '', heading: '' };
}

// Keyword search over the vault: pages and raw sources alike. Entries matching more distinct terms
// come first; then lessons; a hit in the name, title or summary outweighs hits in the body; on a
// full tie a page comes before a raw source. Returns [{ page, matched, score, line, heading }],
// `heading` being the heading the matching line sits under.
export function search(vault, query, limit = 8) {
  const terms = [...new Set(String(query).toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter(w => w.length > 1))];
  if (!terms.length) return [];
  // A term matches at the start of a word, so "sync" finds "syncing" but "hang" does not find "change".
  const res = terms.map(t => new RegExp(`(?<![\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u'));
  const out = [];
  for (const p of [...vault.pages, ...(vault.raw || [])]) {
    if (p === vault.index || p === vault.log) continue;
    const head = `${p.name} ${p.data.title || ''} ${p.data.summary || ''}`.toLowerCase();
    const body = p.body.toLowerCase();
    let matched = 0;
    let score = 0;
    for (const re of res) {
      const inHead = re.test(head);
      const hits = Math.min((body.match(new RegExp(re.source, 'gu')) || []).length, 5);
      if (inHead || hits) matched++;
      score += (inHead ? 5 : 0) + hits;
    }
    if (!matched) continue;
    const { line, heading } = firstMatch(p.body, res);
    out.push({ page: p, matched, score, line, heading });
  }
  // Among entries matching the same number of terms, a recorded lesson is the most useful thing to
  // read first; at equal score, a wiki page, task or plan is the vault's own word before a raw source.
  const lesson = h => (h.page.data.type === 'lesson' ? 1 : 0);
  const isPage = h => (h.page.folder === 'raw' ? 0 : 1);
  return out.sort((a, b) => b.matched - a.matched || lesson(b) - lesson(a) || b.score - a.score || isPage(b) - isPage(a) || a.page.path.localeCompare(b.page.path)).slice(0, limit);
}

// The wiki page that tells agents how to work in a task area: `type: guide`, `area: <AREA>`.
export function guideFor(vault, area) {
  return vault.pages.find(p => p.folder === 'wiki' && p.data.type === 'guide' && key(p.data.area ?? '') === key(area)) || null;
}
