// The test guard: the PreToolUse hook of `sw.mjs hook <host>`. While a task is in progress, a tool
// call that adds a test case beyond the task's allowance is denied with a message that names the
// rule: one test case per "(test)"-marked "Done when" item and one for the Goal, none else. With no
// task in progress, no vault, an unreadable call or a call that is not a file edit, everything is
// allowed. The hook only counts; which case is the Goal test is the implementer's report to say.
// The shell tool is read too: a redirect, a `tee` or an in-place edit into a test file counts the
// cases the command text carries. A write the shell hides (a `cp`, a script that builds the text)
// is sw-verify's `surplus:` line to catch.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, isAbsolute, join, relative } from 'node:path';
import { markedDoneWhen, parseFrontmatter } from './core.js';

// A path from the call, relative to the host's working directory unless absolute.
const at = (base, path) => (isAbsolute(path) ? path : join(base, path));

const HOSTS = ['claude', 'codex', 'copilot'];
const TEST_DIRS = ['test', 'tests', '__tests__', 'spec'];
const TEST_NAME = /(\.test\.|\.spec\.|_test\.|^test_)/;
// One test case: the openers of the common runners, at the start of a line.
const TEST_CASE = /^\s*(?:(?:test|it)(?:\.(?:only|skip|todo|serial|concurrent))?\s*\(|def test_|#\[test\]|func Test[A-Z_]|@Test\b)/;

export function isTestFile(path) {
  const normalized = String(path ?? '').replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.slice(0, -1).some(part => TEST_DIRS.includes(part))) return true;
  return TEST_NAME.test(basename(normalized));
}

export function countCases(text) {
  return String(text ?? '').split(/\r?\n/).filter(line => TEST_CASE.test(line)).length;
}

// ---------- The call → the test files it touches, each with the cases it adds (negative: removes) ----------

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function applyEdit(text, oldString, newString, all) {
  if (!oldString) return text;
  return all ? text.split(oldString).join(newString ?? '') : text.replace(oldString, () => newString ?? '');
}

// Claude Code's Write, Edit and MultiEdit, and Copilot under its VS Code-compatible payload.
function editDeltas(name, args, cwd) {
  const path = args.file_path ?? args.path ?? args.filePath;
  if (!path) return [];
  const full = at(cwd, String(path));
  const before = readIfExists(full);
  let after;
  if (name === 'Write') after = String(args.content ?? '');
  else if (name === 'Edit') after = applyEdit(before, args.old_string, args.new_string, !!args.replace_all);
  else if (name === 'MultiEdit') after = (args.edits ?? []).reduce((text, edit) => applyEdit(text, edit.old_string, edit.new_string, !!edit.replace_all), before);
  else return [];
  return [{ path: String(path), full, delta: countCases(after) - countCases(before) }];
}

// Copilot CLI's default payload: `toolName` with `toolArgs`, whose keys are not documented, so the
// usual names of the content and the replaced strings are all accepted.
function copilotDeltas(name, args, cwd) {
  const first = (...keys) => keys.map(key => args[key]).find(value => value !== undefined);
  const path = first('path', 'file_path', 'filePath', 'file');
  if (!path) return [];
  const lower = String(name).toLowerCase();
  if (['create', 'write', 'create_file', 'write_file'].includes(lower)) {
    return editDeltas('Write', { file_path: path, content: first('content', 'text', 'file_text', 'contents') ?? '' }, cwd);
  }
  if (['edit', 'str_replace', 'replace', 'edit_file', 'str_replace_editor'].includes(lower)) {
    return editDeltas('Edit', { file_path: path, old_string: first('oldString', 'old_string', 'old_str', 'oldStr', 'old_text', 'oldText'), new_string: first('newString', 'new_string', 'new_str', 'newStr', 'new_text', 'newText'), replace_all: first('replaceAll', 'replace_all') }, cwd);
  }
  return [];
}

// Codex edits files through apply_patch; the patch holds `*** Add File:`, `*** Update File:` and
// `*** Delete File:` sections whose `+` and `-` lines say what changes.
function patchDeltas(patch, cwd) {
  const text = Array.isArray(patch) ? patch.join('\n') : String(patch ?? '');
  const files = new Map();
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const header = /^\*\*\* (Add File|Update File|Delete File): (.+)$/.exec(line);
    if (header) {
      const path = header[2].trim();
      const full = at(cwd, path);
      current = { path, full, delta: 0 };
      files.set(path, current);
      if (header[1] === 'Delete File') current.delta = -countCases(readIfExists(full));
      continue;
    }
    if (line.startsWith('*** ') || !current) continue;
    if (line.startsWith('+') && TEST_CASE.test(line.slice(1))) current.delta++;
    else if (line.startsWith('-') && TEST_CASE.test(line.slice(1))) current.delta--;
  }
  return [...files.values()];
}

// ---------- The shell tool: what a command writes into a test file ----------

// The shell tool of each host: Claude Code's and Codex's `Bash`, Copilot's `bash`, and the other
// names a host may use for it.
const SHELL_TOOLS = ['bash', 'shell', 'shell_command', 'local_shell', 'exec_command', 'run_in_terminal', 'sh', 'zsh', 'powershell'];
const HEREDOC = /<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/;
// `> file`, `>> file`, `1> file`; not `2>&1`, `<`, `>&`.
const REDIRECT = /(?:^|[^<>&])(>>?)\s*(["']?)([^\s"'|;&<>()]+)\2/g;
const TEE = /\|\s*tee\s+((?:-[a-z]+\s+)*)(["']?)([^\s"'|;&<>()]+)\2/g;
// A command that rewrites a file in place from text in the command line.
const IN_PLACE = /(?:^|[\s;|&(])(?:sed\s+(?:-\S+\s+)*-[a-zA-Z]*i|perl\s+(?:-\S+\s+)*-[a-zA-Z]*i|ruby\s+(?:-\S+\s+)*-[a-zA-Z]*i|python[23]?\b|node\s+(?:-e|--eval|-p|--print)\b)/;
// A test case opener anywhere in a line of command text (echo, printf, sed, a script).
const OPENER = /(?<![\w.$])(?:(?:test|it)(?:\.(?:only|skip|todo|serial|concurrent))?\s*\(|def test_\w|#\[test\]|func Test[A-Z_]|@Test\b)/g;

// Openers in command text, with its `\n` escapes read as line breaks.
const countOpeners = text => (String(text ?? '').replace(/\\n/g, '\n').match(OPENER) ?? []).length;
const tokens = text => String(text ?? '').split(/[\s;|&()'"`<>]+/).filter(Boolean);

// One command line with the heredoc body attached to it, if it has one; `next` is the line after.
function commandLine(lines, i) {
  const line = lines[i];
  const here = HEREDOC.exec(line);
  if (!here) return { line, body: null, next: i + 1 };
  const strip = line.slice(here.index).startsWith('<<-');
  const body = [];
  let j = i + 1;
  for (; j < lines.length; j++) {
    const candidate = strip ? lines[j].replace(/^\t+/, '') : lines[j];
    if (candidate === here[2]) break;
    body.push(candidate);
  }
  return { line, body: body.join('\n'), next: j + 1 };
}

// The test files a shell command writes, with the cases its text adds to each: a redirect or a
// `tee` into a test file carries the heredoc body, or the echoed or printed text of the line; an
// in-place edit that names a test file carries the openers in the command text. A redirect that
// replaces the file (`>`, `tee` without -a) counts against what the file holds; one that appends
// counts whole. A command that only reads, runs or deletes a test file writes nothing.
function shellDeltas(command, cwd) {
  const text = Array.isArray(command) ? command.map(String).join(' ') : String(command ?? '');
  const lines = text.split(/\r?\n/);
  const files = new Map();
  const add = (path, delta) => {
    const full = at(cwd, path);
    const entry = files.get(full) ?? { path, full, delta: 0 };
    entry.delta += delta;
    files.set(full, entry);
  };
  for (let i = 0; i < lines.length;) {
    const { line, body, next } = commandLine(lines, i);
    i = next;
    // The written text: the heredoc body as it will stand in the file, or the line's own text with
    // its `\n` escapes as line breaks.
    const written = body !== null ? countCases(body) : countOpeners(line);
    const targets = [];
    for (const m of line.matchAll(REDIRECT)) targets.push({ path: m[3], append: m[1] === '>>' });
    for (const m of line.matchAll(TEE)) targets.push({ path: m[3], append: /a/.test(m[1]) });
    let wrote = false;
    for (const target of targets) {
      if (!isTestFile(target.path)) continue;
      wrote = true;
      add(target.path, target.append ? written : written - countCases(readIfExists(at(cwd, target.path))));
    }
    if (wrote || !IN_PLACE.test(line)) continue;
    const named = tokens(`${line}\n${body ?? ''}`).filter(isTestFile);
    if (named.length) add(named[0], countOpeners(`${line}\n${body ?? ''}`));
  }
  return [...files.values()];
}

const isShell = name => SHELL_TOOLS.includes(String(name).toLowerCase());
const shellCommand = args => args.command ?? args.cmd ?? args.script ?? args.commandLine ?? '';

// The file changes of one tool call, whatever the host's payload shape: `tool_name` with
// `tool_input` (Claude Code, Codex, Copilot's PreToolUse) or `toolName` with `toolArgs` (Copilot's
// default). Calls that edit no file give [].
export function parseCall(input, cwd) {
  if (!input || typeof input !== 'object') return [];
  if (typeof input.tool_name === 'string') {
    const args = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
    if (input.tool_name === 'apply_patch') return patchDeltas(args.command ?? args.patch ?? args.input, cwd);
    if (isShell(input.tool_name)) return shellDeltas(shellCommand(args), cwd);
    return editDeltas(input.tool_name, args, cwd);
  }
  if (typeof input.toolName === 'string') {
    const args = input.toolArgs && typeof input.toolArgs === 'object' ? input.toolArgs : {};
    if (input.toolName === 'apply_patch') return patchDeltas(args.command ?? args.patch ?? args.input, cwd);
    if (isShell(input.toolName)) return shellDeltas(shellCommand(args), cwd);
    return copilotDeltas(input.toolName, args, cwd);
  }
  return [];
}

// ---------- The allowance and what git already shows ----------

// The tasks in progress, each with its allowance: one test case per marked item and one for the Goal.
function tasksInProgress(docs) {
  const dir = at(docs, 'tasks');
  if (!existsSync(dir)) return [];
  const tasks = [];
  for (const name of readdirSync(dir).sort()) {
    if (!/\.md$/i.test(name)) continue;
    const fm = parseFrontmatter(readFileSync(at(dir, name), 'utf8'));
    if (!fm.data || fm.data.status !== 'in-progress') continue;
    tasks.push({ id: String(fm.data.id || name.replace(/\.md$/i, '')), allowed: markedDoneWhen(fm.body) + 1 });
  }
  return tasks;
}

function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

// The test cases the working tree has added since HEAD, in test files: the diff's `+` lines minus its
// `-` lines, plus every case in an untracked test file. Paths are relative to the project root.
function casesAdded(root) {
  let added = 0;
  let file = null;
  for (const line of git(root, ['diff', 'HEAD', '--relative', '--unified=0', '--no-color', '--no-ext-diff']).split('\n')) {
    if (line.startsWith('+++ ')) { file = line.replace(/^\+\+\+ (b\/)?/, ''); continue; }
    if (line.startsWith('--- ') || !file || !isTestFile(file)) continue;
    if (line.startsWith('+') && TEST_CASE.test(line.slice(1))) added++;
    else if (line.startsWith('-') && TEST_CASE.test(line.slice(1))) added--;
  }
  for (const path of git(root, ['ls-files', '--others', '--exclude-standard']).split('\n')) {
    if (path && isTestFile(path)) added += countCases(readIfExists(at(root, path)));
  }
  return added;
}

function message(tasks, added, adds) {
  const ids = tasks.map(t => t.id).join(', ');
  const allowed = tasks.reduce((sum, t) => sum + t.allowed, 0);
  return `Superwiki: ${ids} ${tasks.length === 1 ? 'allows' : 'allow'} ${allowed} ${allowed === 1 ? 'test' : 'tests'}: one per "(test)"-marked "Done when" item and one for the Goal; ${added} added, this write adds ${adds}. One test per behaviour: none for a helper, a small fix or an unmarked change. Add the case to an existing test or leave it out.`;
}

function output(host, reason) {
  if (host === 'copilot') return { permissionDecision: 'deny', permissionDecisionReason: reason };
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } };
}

const allow = () => ({ deny: false, message: null, output: null });

// The verdict on one call: `deny` with the `message` and the host's `output` JSON, or allow.
export function decide(host, input, { docs, root }) {
  try {
    if (!HOSTS.includes(host) || !input || typeof input !== 'object') return allow();
    if (!existsSync(at(docs, 'tasks'))) return allow();
    const tasks = tasksInProgress(docs);
    if (!tasks.length) return allow();
    const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : root;
    const changes = parseCall(input, cwd).filter(change => isTestFile(relative(root, change.full) || change.path));
    const adds = changes.reduce((sum, change) => sum + change.delta, 0);
    if (adds <= 0) return allow();
    const added = casesAdded(root);
    const allowed = tasks.reduce((sum, t) => sum + t.allowed, 0);
    if (added + adds <= allowed) return allow();
    const reason = message(tasks, added, adds);
    return { deny: true, message: reason, output: output(host, reason) };
  } catch {
    return allow();
  }
}
