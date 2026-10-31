// Registers the test guard, `node docs/.sw/sw.mjs hook <host>`, as a PreToolUse hook in each host's
// own place, and removes it again:
//   claude   .claude/settings.json      hooks.PreToolUse, matcher Bash|Write|Edit|MultiEdit|NotebookEdit
//   codex    .codex/hooks.json          hooks.PreToolUse, matcher Bash|apply_patch
//   copilot  .github/hooks/superwiki.json  version 1, hooks.PreToolUse, bash and powershell
// In a project the files are the project's and travel with it; in the home folder (`home: true`)
// the claude and codex files are the user's, and copilot, which reads hooks from the repository
// only, is left with a note. The command tests for the vault first, so a project without one is
// not touched, and ends in `|| true`, since a non-zero exit blocks the call on some hosts.
// A merge replaces only the entry whose command holds `sw.mjs hook`; everything else in a settings
// file stays as it was, and a file that is not JSON is kept and reported.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const OURS = /sw\.mjs hook/;
const command = host => `test -f docs/.sw/sw.mjs && node docs/.sw/sw.mjs hook ${host} || true`;
const powershell = host => `if (Test-Path docs/.sw/sw.mjs) { node docs/.sw/sw.mjs hook ${host} }`;

const FILES = {
  claude: '.claude/settings.json',
  codex: '.codex/hooks.json',
  copilot: '.github/hooks/superwiki.json',
};

function entryFor(host) {
  if (host === 'claude') return { matcher: 'Bash|Write|Edit|MultiEdit|NotebookEdit', hooks: [{ type: 'command', command: command(host) }] };
  if (host === 'codex') return { matcher: 'Bash|apply_patch', hooks: [{ type: 'command', command: command(host), timeout: 30 }] };
  return { type: 'command', bash: command(host), powershell: powershell(host), timeoutSec: 30 };
}

const isOurs = entry => (entry?.hooks ?? [entry]).some(hook => OURS.test(hook?.command ?? hook?.bash ?? ''));

function readJson(path) {
  if (!existsSync(path)) return { data: null, text: null };
  const text = readFileSync(path, 'utf8');
  try {
    const data = JSON.parse(text);
    return { data: data && typeof data === 'object' && !Array.isArray(data) ? data : undefined, text };
  } catch {
    return { data: undefined, text };
  }
}

function writeJson(path, data, text) {
  const next = `${JSON.stringify(data, null, 2)}\n`;
  if (next === text) return 'unchanged';
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, next);
  return text === null ? 'created' : 'updated';
}

// The claude and codex files hold other hooks and settings; ours is one entry under PreToolUse.
function merge(path, host, { remove }) {
  const { data, text } = readJson(path);
  if (data === undefined) return ['kept', `${FILES[host]} (not valid JSON; add the hook by hand: ${command(host)})`];
  if (remove && data === null) return null;
  const next = data ?? {};
  const hooks = next.hooks && typeof next.hooks === 'object' ? next.hooks : {};
  const entries = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse.filter(entry => !isOurs(entry)) : [];
  if (!remove) entries.push(entryFor(host));
  if (entries.length) hooks.PreToolUse = entries;
  else delete hooks.PreToolUse;
  if (Object.keys(hooks).length) next.hooks = hooks;
  else delete next.hooks;
  if (remove && host === 'codex' && !Object.keys(next).length) {
    rmSync(path, { force: true });
    return ['removed', FILES[host]];
  }
  return [writeJson(path, next, text), FILES[host]];
}

// Copilot's file is ours alone.
function copilot(path, { remove }) {
  if (remove) {
    if (!existsSync(path)) return null;
    rmSync(path, { force: true });
    const dir = dirname(path);
    if (existsSync(dir) && !readdirSync(dir).length) rmSync(dir, { recursive: true, force: true });
    return ['removed', FILES.copilot];
  }
  const { text } = readJson(path);
  return [writeJson(path, { version: 1, hooks: { PreToolUse: [entryFor('copilot')] } }, text), FILES.copilot];
}

function apply(root, hosts, { home = false, remove = false } = {}) {
  const lines = [];
  for (const host of [...new Set(hosts)].filter(host => host in FILES)) {
    const path = join(root, FILES[host]);
    let line;
    if (host === 'copilot') {
      if (home) line = remove ? null : ['note', "copilot reads hooks from the repository only: sw-init registers the test guard in the project's .github/hooks/"];
      else line = copilot(path, { remove });
    } else line = merge(path, host, { remove });
    if (line) lines.push(line);
  }
  return lines;
}

// Each returns [[state, label], ...] for the caller's report. `root` is the project, or the home
// folder with `home: true`.
export const registerHooks = (root, hosts, options = {}) => apply(root, hosts, { ...options, remove: false });
export const removeHooks = (root, hosts, options = {}) => apply(root, hosts, { ...options, remove: true });
