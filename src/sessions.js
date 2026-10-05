// Finds the record an agent tool keeps of the session working in a project.
// Claude Code, Codex and Copilot CLI each write every session to disk in their own layout; this
// lists a project's sessions as { tool, id, modified, current, source } and picks one. What a
// record means is left to the readers in stats.js and doctor.js.
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, sep } from 'node:path';

export const SESSION_TOOLS = ['claude', 'codex', 'copilot'];

// Codex keeps every project's sessions in one tree; only the most recent files are opened.
const CODEX_FILES_SCANNED = 100;

// A record still being written can end in half a line; lines that do not parse are skipped.
export function jsonLines(path) {
  const records = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      records.push(JSON.parse(line));
    } catch {}
  }
  return records;
}

export function jsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

const modifiedAt = path => statSync(path).mtimeMs;

// The project root as typed and as resolved: tools record the working directory either way.
function rootForms(root) {
  const forms = new Set([root]);
  try {
    forms.add(realpathSync(root));
  } catch {}
  return [...forms];
}

const isWithin = (roots, dir) => Boolean(dir) && roots.some(root => dir === root || dir.startsWith(root + sep));

// ---------- Claude Code ----------
// ~/.claude/projects/<working directory, non-alphanumerics as dashes>/<session>.jsonl, and next to
// it <session>/subagents/agent-<id>.jsonl with a .meta.json naming the agent type.
// source: { path, subagentDir }

const claudeHome = () => process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');

function claudeSessions(root) {
  const sessions = [];
  for (const form of rootForms(root)) {
    const dir = join(claudeHome(), 'projects', form.replace(/[^A-Za-z0-9]/g, '-'));
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.jsonl')) continue;
      const id = name.slice(0, -'.jsonl'.length);
      const path = join(dir, name);
      sessions.push({
        tool: 'claude',
        id,
        modified: modifiedAt(path),
        current: id === process.env.CLAUDE_CODE_SESSION_ID,
        source: { path, subagentDir: join(dir, id, 'subagents') },
      });
    }
  }
  return sessions;
}

// ---------- Codex ----------
// ~/.codex/sessions/<year>/<month>/<day>/rollout-*.jsonl. The first line is the session's meta:
// its working directory and, for a subagent, the session that spawned it and its role.
// source: { files: [{ meta, records }] }, one file per agent

const codexHome = () => process.env.CODEX_HOME || join(homedir(), '.codex');

function rolloutFiles(dir, found = []) {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) rolloutFiles(path, found);
    else if (entry.name.endsWith('.jsonl')) found.push({ path, modified: modifiedAt(path) });
  }
  return found;
}

function codexSessions(root) {
  const roots = rootForms(root);
  const recent = rolloutFiles(join(codexHome(), 'sessions')).sort((a, b) => b.modified - a.modified).slice(0, CODEX_FILES_SCANNED);
  const byId = new Map();
  for (const { path, modified } of recent) {
    const records = jsonLines(path);
    const meta = records[0]?.type === 'session_meta' ? records[0].payload : null;
    if (!meta || !isWithin(roots, meta.cwd)) continue;
    const id = meta.session_id || meta.id;
    if (!byId.has(id)) byId.set(id, { modified: 0, files: [] });
    const group = byId.get(id);
    group.modified = Math.max(group.modified, modified);
    group.files.push({ meta, records });
  }
  return [...byId].map(([id, { modified, files }]) => ({ tool: 'codex', id, modified, current: false, source: { files } }));
}

// ---------- Copilot CLI ----------
// ~/.copilot/session-state/<session>/events.jsonl, with the working directory in workspace.yaml.
// source: { path }

const copilotHome = () => join(homedir(), '.copilot');

function copilotSessions(root) {
  const roots = rootForms(root);
  const base = join(copilotHome(), 'session-state');
  if (!existsSync(base)) return [];
  const sessions = [];
  for (const id of readdirSync(base)) {
    const path = join(base, id, 'events.jsonl');
    const workspace = join(base, id, 'workspace.yaml');
    if (!existsSync(path) || !existsSync(workspace)) continue;
    const cwd = (readFileSync(workspace, 'utf8').match(/^cwd: (.*)$/m) || [])[1];
    if (!isWithin(roots, cwd)) continue;
    sessions.push({ tool: 'copilot', id, modified: modifiedAt(path), current: false, source: { path } });
  }
  return sessions;
}

// ---------- Choosing ----------

const LISTERS = { claude: claudeSessions, codex: codexSessions, copilot: copilotSessions };

// The session to report: the one named by `id` (a prefix is enough), else the session this command
// runs in when the tool says which one that is, else the most recently written one.
export function findSession(root, { tool, id } = {}) {
  let sessions = (tool ? [tool] : SESSION_TOOLS).flatMap(name => LISTERS[name](root));
  if (id) sessions = sessions.filter(session => session.id.startsWith(id));
  sessions.sort((a, b) => b.modified - a.modified);
  return (!id && sessions.find(session => session.current)) || sessions[0] || null;
}
