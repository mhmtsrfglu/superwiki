#!/usr/bin/env node
// End-to-end eval: the deterministic parts before and after an agent runs.
//   prepare  copies the fixture, gives it a vault and one commit, lays the scenario's overlays over it
//            and prints the agent type to dispatch and the prompt to give it
//   check    runs the scenario's pass table against the copy and the agent's saved report
// It never calls a model. evals/README.md says how to run the agent in between.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(E2E_DIR, '..', '..');
const FIXTURE = join(E2E_DIR, 'fixture');
const OVERLAYS = join(E2E_DIR, 'overlays');
const SCENARIOS = join(E2E_DIR, 'scenarios');
const INIT = join(REPO_ROOT, 'skills/init/scripts/init.mjs');
const AGENTS = join(REPO_ROOT, '.claude/agents');
const SYNC = 'node skills/config/scripts/config.mjs sync --tools claude';

// A scenario's `Role:` names the agent file sw:config writes for it.
const ROLES = { reviewer: 'sw-reviewer', implementer: 'sw-implementer' };
const GIT_IDENTITY = ['-c', 'user.name=e2e', '-c', 'user.email=e2e@example.com'];
// Where prepare keeps the hash of the copy's working tree; `.git/` is outside that tree.
const TREE_FILE = '.git/e2e-tree';
const HEADER = /^(Task|Role|Overlays|Files): (.*)$/;
const CHECK_KINDS = 'sw, output or tree';

// An error in the input (a scenario, a path, a missing file): the CLI exits 2 on it.
export class EvalError extends Error {}

// Table cells; `\|` inside a cell is a pipe, not a border.
function cells(line) {
  const found = [];
  let cell = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (line[i] === '|') {
      found.push(cell.trim());
      cell = '';
    } else cell += line[i];
  }
  found.push(cell.trim());
  return found.slice(1, -1);
}

const unquote = text => text.replace(/^`(.*)`$/, '$1').trim();
const list = value => (value ?? '').split(',').map(item => item.trim()).filter(item => item && item !== 'none');

// One row of the pass table → { kind, ...what it runs and expects, check, expect }.
function parseCheck(check, expect, fail) {
  const [kind, ...args] = check.split(/\s+/);
  const row = { kind, check, expect };
  if (kind === 'sw') {
    if (!args.length) fail(`"${check}" needs arguments for sw.mjs`);
    const exit = expect.match(/^exit (\d+)$/);
    return { ...row, args, exit: exit ? Number(exit[1]) : null, line: exit ? null : expect };
  }
  if (kind === 'output') {
    if (args.length) fail(`"${check}" takes no arguments`);
    const match = expect.match(/^(matches|lacks) \/(.*)\/([a-z]*)$/);
    if (!match) fail(`output expects "matches /re/flags" or "lacks /re/flags", not "${expect}"`);
    try {
      return { ...row, mode: match[1], re: new RegExp(match[2], match[3]) };
    } catch (error) {
      return fail(`bad regular expression in "${expect}": ${error.message}`);
    }
  }
  if (kind === 'tree') {
    if (args.length || expect !== 'unchanged') fail(`tree expects "unchanged", not "${check} | ${expect}"`);
    return row;
  }
  return fail(`unknown check kind "${kind}" (${CHECK_KINDS})`);
}

// The fenced block of a section, or null when the section is missing.
function fenced(sections, key, fail) {
  const lines = sections.get(key);
  if (!lines) return null;
  const start = lines.findIndex(line => line.startsWith('```'));
  const end = lines.findIndex((line, i) => i > start && line.startsWith('```'));
  if (start < 0 || end < 0) fail(`## ${key} needs a fenced block`);
  return lines.slice(start + 1, end).join('\n').trim();
}

// A scenario file → { task, role, agent, overlays, files, prompt, recheck, pass }.
export function parseScenario(text, name = 'scenario') {
  const fail = message => {
    throw new EvalError(`${name}: ${message}`);
  };
  const headers = {};
  const sections = new Map();
  let section = null;
  for (const line of String(text).split(/\r?\n/)) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      section = heading[1].trim();
      sections.set(section, []);
    } else if (section) sections.get(section).push(line);
    else if (HEADER.test(line)) headers[line.match(HEADER)[1]] = line.match(HEADER)[2].trim();
  }
  if (!headers.Task) fail('needs a "Task:" line before the first section');
  if (!ROLES[headers.Role]) fail(`"Role:" must be ${Object.keys(ROLES).join(' or ')}, not "${headers.Role ?? ''}"`);
  if (!sections.has('Run')) fail('needs a ## Run section');
  const prompt = fenced(sections, 'Prompt', fail);
  if (!prompt) fail('needs a ## Prompt section with a fenced block');
  const pass = (sections.get('Pass') ?? [])
    .filter(line => line.startsWith('|'))
    .map(cells)
    .filter(row => row.length && row[0] !== 'check' && !/^-+$/.test(row[0]))
    .map(row => {
      if (row.length !== 2) fail(`a pass row needs 2 cells (check, expect): ${row.join(' | ')}`);
      return parseCheck(unquote(row[0]), unquote(row[1]), fail);
    });
  if (!pass.length) fail('needs a ## Pass table with at least one row');
  return {
    task: headers.Task,
    role: headers.Role,
    agent: ROLES[headers.Role],
    overlays: list(headers.Overlays),
    files: list(headers.Files),
    prompt,
    recheck: fenced(sections, 'Recheck', fail),
    pass,
  };
}

function readInput(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    throw new EvalError(`cannot read ${path}: ${error.code ?? error.message}`);
  }
}

// A scenario is named by its file in scenarios/, or given as a path to a scenario file.
function loadScenario(ref) {
  const path = ref.endsWith('.md') || ref.includes('/') ? resolve(ref) : join(SCENARIOS, `${ref}.md`);
  return parseScenario(readInput(path), basename(path, '.md'));
}

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env });
  if (result.error) throw new EvalError(`${command} ${args[0]}: ${result.error.message}`);
  if (result.status !== 0) throw new EvalError(`${command} ${args.join(' ')} failed in ${cwd}:\n${result.stderr || result.stdout}`);
  return result.stdout;
}

const git = (dir, args, env) => run('git', args, dir, env);

// The hash of the copy's working tree, tracked and untracked files alike, ignored ones aside.
// A scratch index keeps the copy's own index out of it.
function treeHash(dir) {
  const index = join(dir, '.git', 'e2e-index');
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    git(dir, ['add', '-A'], env);
    return git(dir, ['write-tree'], env).trim();
  } finally {
    rmSync(index, { force: true });
  }
}

function keepOutOfCopy(path) {
  const parts = relative(FIXTURE, path).split(/[\\/]/);
  return !parts.includes('.git') && !parts.includes('node_modules');
}

// A clean copy of the fixture at `dir`: vault, one commit, the scenario's overlays uncommitted.
export function prepare(ref, dir, { agents = AGENTS } = {}) {
  const scenario = loadScenario(ref);
  const agentFile = join(agents, `${scenario.agent}.md`);
  if (!existsSync(agentFile)) throw new EvalError(`${agentFile} is missing; run "${SYNC}" in the repository root first`);
  for (const overlay of scenario.overlays) {
    if (!existsSync(join(OVERLAYS, overlay))) throw new EvalError(`overlay ${overlay} is missing from ${OVERLAYS}`);
  }
  const copy = resolve(dir);
  if (existsSync(copy) && readdirSync(copy).length) throw new EvalError(`${copy} is not empty`);
  mkdirSync(copy, { recursive: true });
  cpSync(FIXTURE, copy, { recursive: true, filter: keepOutOfCopy });
  run(process.execPath, [INIT, '--root', copy, '--tasks'], copy);
  git(copy, ['-c', 'init.defaultBranch=main', 'init', '-q']);
  git(copy, ['add', '-A']);
  git(copy, [...GIT_IDENTITY, 'commit', '-q', '-m', 'Fixture project with its vault']);
  for (const overlay of scenario.overlays) cpSync(join(OVERLAYS, overlay), copy, { recursive: true });
  writeFileSync(join(copy, TREE_FILE), `${treeHash(copy)}\n`);
  const prompt = scenario.prompt.replaceAll('<copy>', copy).replaceAll('<files>', scenario.files.join(', '));
  return { dir: copy, agent: scenario.agent, prompt: [prompt, scenario.recheck].filter(Boolean).join('\n\n') };
}

const tail = text => text.trim().split('\n').slice(-3).join(' / ');

function runCheck(row, { copy, cli, output, tree }) {
  if (row.kind === 'sw') {
    const result = spawnSync(process.execPath, [cli, ...row.args], { cwd: copy, encoding: 'utf8' });
    if (row.exit !== null) return { ok: result.status === row.exit, detail: `exit ${result.status}` };
    const ok = result.stdout.split('\n').some(line => line.includes(row.line));
    return { ok, detail: ok ? '' : `exit ${result.status}; output: ${tail(result.stdout || result.stderr) || 'none'}` };
  }
  if (row.kind === 'output') {
    const found = output.match(row.re);
    const ok = row.mode === 'matches' ? found !== null : found === null;
    return { ok, detail: ok ? '' : found ? `found "${found[0]}"` : 'no match in the output' };
  }
  const changed = git(copy, ['diff-tree', '-r', '--name-status', tree, treeHash(copy)]).trim();
  return { ok: !changed, detail: changed ? `changed: ${changed.split('\n').join(', ')}` : '' };
}

// Every pass row of the scenario, run against the prepared copy and the agent's saved report.
export function check(ref, dir, outputPath) {
  const scenario = loadScenario(ref);
  const copy = resolve(dir);
  const cli = join(copy, 'docs/.sw/sw.mjs');
  const treePath = join(copy, TREE_FILE);
  if (!existsSync(cli) || !existsSync(treePath)) throw new EvalError(`${copy} is not a prepared copy: prepare writes docs/.sw/sw.mjs and ${TREE_FILE}`);
  const context = { copy, cli, output: readInput(outputPath), tree: readFileSync(treePath, 'utf8').trim() };
  const rows = scenario.pass.map(row => ({ check: row.check, expect: row.expect, ...runCheck(row, context) }));
  return { ok: rows.every(row => row.ok), rows };
}

export function formatCheck({ ok, rows }) {
  const lines = rows.map(row => `${row.ok ? 'pass' : 'FAIL'}  ${row.check} | ${row.expect}${row.ok || !row.detail ? '' : `  (${row.detail})`}`);
  const passed = rows.filter(row => row.ok).length;
  lines.push(`passed ${passed} of ${rows.length}${ok ? '' : ': the scenario failed'}`);
  return `${lines.join('\n')}\n`;
}

const USAGE = `usage: node evals/e2e/e2e.mjs prepare <scenario> --to <dir> [--agents <dir>]
       node evals/e2e/e2e.mjs check <scenario> <dir> <report>

prepare  copies the fixture to <dir> (new or empty), gives it a vault and one commit, lays the
         scenario's overlays over it uncommitted, and prints the agent type to dispatch and its prompt;
         it refuses to run while the agent file is missing (--agents: where the files are; default
         .claude/agents, written by "${SYNC}")
check    runs the scenario's pass table against the copy and the agent's report saved in <report>
         exit 0 every row passes, 1 a row fails, 2 an input error
<scenario> is a name in evals/e2e/scenarios/ or a path to a scenario file`;

class UsageError extends EvalError {}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command !== 'prepare' && command !== 'check') throw new UsageError(command ? `unknown command ${command}` : 'no command');
  const options = { command, positional: [], to: null, agents: undefined };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--to' || arg === '--agents') {
      if (command !== 'prepare') throw new UsageError(`${arg} belongs to prepare`);
      const value = rest[++i];
      if (!value) throw new UsageError(`${arg} needs a value`);
      options[arg.slice(2)] = value;
    } else if (arg.startsWith('--')) throw new UsageError(`unknown option ${arg}`);
    else options.positional.push(arg);
  }
  const needed = command === 'prepare' ? 1 : 3;
  if (options.positional.length !== needed) throw new UsageError(`${command} takes ${needed} argument${needed > 1 ? 's' : ''}`);
  if (command === 'prepare' && !options.to) throw new UsageError('prepare needs --to <dir>');
  return options;
}

export function main(argv, out = process.stdout, err = process.stderr) {
  try {
    const options = parseArgs(argv);
    if (options.command === 'prepare') {
      const { agent, prompt } = prepare(options.positional[0], options.to, { agents: options.agents });
      out.write(`Agent: ${agent}\n\n${prompt}\n`);
      return 0;
    }
    const result = check(...options.positional);
    out.write(formatCheck(result));
    return result.ok ? 0 : 1;
  } catch (error) {
    if (!(error instanceof EvalError)) throw error;
    err.write(`e2e: ${error.message}\n`);
    if (error instanceof UsageError) err.write(`${USAGE}\n`);
    return 2;
  }
}

function runDirectly() {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (runDirectly()) process.exitCode = main(process.argv.slice(2));
