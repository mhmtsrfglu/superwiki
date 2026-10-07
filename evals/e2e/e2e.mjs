#!/usr/bin/env node
// End-to-end eval: the deterministic parts before and after an agent runs, and the headless run itself.
//   prepare  copies the fixture, gives it a vault, its agent files and one commit, lays the scenario's
//            overlays over it and prints the agent type to dispatch or the skill to run, and the prompt
//   run      starts a headless `claude -p` session in the copy for a Skill: scenario and saves what
//            the session said as the report
//   check    runs the scenario's pass table against the copy and the saved report
// prepare and check never call a model; run calls one through the claude CLI. evals/README.md says
// how a Role: scenario's agent is dispatched by hand between prepare and check.
import { spawnSync } from 'node:child_process';
import { closeSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(E2E_DIR, '..', '..');
const FIXTURE = join(E2E_DIR, 'fixture');
const OVERLAYS = join(E2E_DIR, 'overlays');
const SCENARIOS = join(E2E_DIR, 'scenarios');
const INIT = join(REPO_ROOT, 'skills/init/scripts/init.mjs');
const CONFIG = join(REPO_ROOT, 'skills/config/scripts/config.mjs');
const AGENTS = join(REPO_ROOT, '.claude/agents');
const SYNC = 'node skills/config/scripts/config.mjs sync --tools claude';

// A scenario's `Role:` names the agent file sw:config writes for it; a `Skill:` names the skill a
// headless session of the user's own kind runs, from the installed plugin.
const ROLES = { reviewer: 'sw-reviewer', implementer: 'sw-implementer' };
const SKILLS = ['triage', 'plan', 'plan-implement', 'implement', 'verify', 'review', 'autopilot'];
const GIT_IDENTITY = ['-c', 'user.name=e2e', '-c', 'user.email=e2e@example.com'];
// Where prepare keeps the hash of the copy's working tree; `.git/` is outside that tree.
const TREE_FILE = '.git/e2e-tree';
// A headless session may write the copy's local settings; the tree hash must not see them.
const EXCLUDED = '.claude/settings.local.json';
const HEADER = /^(Task|Role|Skill|Budget|Overlays|Files): (.*)$/;
const CHECK_KINDS = 'sw, output, file or tree';
// The session runs unattended in the scratch copy, says everything as stream-json events, and
// stops at the scenario's budget. User settings bring the plugin; project settings are the copy's.
const CLAUDE_ARGS = ['--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions', '--permission-prompts', 'none', '--setting-sources', 'user,project'];
const EVENTS_LIMIT = 256 * 1024 * 1024;

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

// "matches /re/flags" or "lacks /re/flags" → { mode, re }.
function parseMatch(kind, expect, fail) {
  const match = expect.match(/^(matches|lacks) \/(.*)\/([a-z]*)$/);
  if (!match) fail(`${kind} expects "matches /re/flags" or "lacks /re/flags", not "${expect}"`);
  try {
    return { mode: match[1], re: new RegExp(match[2], match[3]) };
  } catch (error) {
    return fail(`bad regular expression in "${expect}": ${error.message}`);
  }
}

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
    return { ...row, ...parseMatch(kind, expect, fail) };
  }
  if (kind === 'file') {
    if (args.length !== 1) fail(`file needs a path under the copy, "file <path>", not "${check}"`);
    return { ...row, path: args[0], ...parseMatch(kind, expect, fail) };
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

// The dollars a headless run may spend, from a `Budget:` line.
function parseBudget(headers, fail) {
  if (!('Budget' in headers)) {
    if ('Skill' in headers) fail('needs a "Budget:" line, the dollars a headless run may spend');
    return null;
  }
  if (!('Skill' in headers)) fail('"Budget:" belongs to a "Skill:" scenario');
  const budget = Number(headers.Budget);
  if (!/^\d+(\.\d+)?$/.test(headers.Budget) || !(budget > 0)) fail(`"Budget:" must be a positive number of dollars, not "${headers.Budget}"`);
  return budget;
}

// A scenario file → { task, role, agent, skill, budget, overlays, files, prompt, recheck, pass }.
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
  if ('Role' in headers && 'Skill' in headers) fail('takes a "Role:" line or a "Skill:" line, not both');
  if (!('Role' in headers) && !('Skill' in headers)) fail('needs a "Role:" or "Skill:" line before the first section');
  if ('Role' in headers && !ROLES[headers.Role]) fail(`"Role:" must be ${Object.keys(ROLES).join(' or ')}, not "${headers.Role}"`);
  if ('Skill' in headers && !SKILLS.includes(headers.Skill)) fail(`"Skill:" must be one of ${SKILLS.join(', ')}, not "${headers.Skill}"`);
  const budget = parseBudget(headers, fail);
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
    role: headers.Role ?? null,
    agent: ROLES[headers.Role] ?? null,
    skill: headers.Skill ?? null,
    budget,
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
  const name = basename(path, '.md');
  return { name, ...parseScenario(readInput(path), name) };
}

// The prompt as the agent or the session gets it: placeholders filled, the recheck appended.
function fillPrompt(scenario, copy) {
  const prompt = scenario.prompt.replaceAll('<copy>', copy).replaceAll('<files>', scenario.files.join(', '));
  return [prompt, scenario.recheck].filter(Boolean).join('\n\n');
}

function exec(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env });
  if (result.error) throw new EvalError(`${command} ${args[0]}: ${result.error.message}`);
  if (result.status !== 0) throw new EvalError(`${command} ${args.join(' ')} failed in ${cwd}:\n${result.stderr || result.stdout}`);
  return result.stdout;
}

const git = (dir, args, env) => exec('git', args, dir, env);

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

// A clean copy of the fixture at `dir`: vault, agent files, one commit, the scenario's overlays uncommitted.
export function prepare(ref, dir, { agents = AGENTS } = {}) {
  const scenario = loadScenario(ref);
  if (scenario.agent) {
    const agentFile = join(agents, `${scenario.agent}.md`);
    if (!existsSync(agentFile)) throw new EvalError(`${agentFile} is missing; run "${SYNC}" in the repository root first`);
  }
  for (const overlay of scenario.overlays) {
    if (!existsSync(join(OVERLAYS, overlay))) throw new EvalError(`overlay ${overlay} is missing from ${OVERLAYS}`);
  }
  const copy = resolve(dir);
  if (existsSync(copy) && readdirSync(copy).length) throw new EvalError(`${copy} is not empty`);
  mkdirSync(copy, { recursive: true });
  cpSync(FIXTURE, copy, { recursive: true, filter: keepOutOfCopy });
  exec(process.execPath, [INIT, '--root', copy, '--tasks'], copy);
  // The plugin ships no agents: the copy carries the ones a session dispatches, from the checkout's role texts.
  exec(process.execPath, [CONFIG, 'sync', '--root', copy, '--tools', 'claude'], copy);
  git(copy, ['-c', 'init.defaultBranch=main', 'init', '-q']);
  mkdirSync(join(copy, '.git/info'), { recursive: true });
  writeFileSync(join(copy, '.git/info/exclude'), `${EXCLUDED}\n`, { flag: 'a' });
  git(copy, ['add', '-A']);
  git(copy, [...GIT_IDENTITY, 'commit', '-q', '-m', 'Fixture project with its vault']);
  for (const overlay of scenario.overlays) cpSync(join(OVERLAYS, overlay), copy, { recursive: true });
  writeFileSync(join(copy, TREE_FILE), `${treeHash(copy)}\n`);
  return { dir: copy, agent: scenario.agent, skill: scenario.skill, prompt: fillPrompt(scenario, copy) };
}

// A copy prepare made: its path, the vault's CLI and the tree hash prepare recorded.
function preparedCopy(dir) {
  const copy = resolve(dir);
  const cli = join(copy, 'docs/.sw/sw.mjs');
  const treePath = join(copy, TREE_FILE);
  if (!existsSync(cli) || !existsSync(treePath)) throw new EvalError(`${copy} is not a prepared copy: prepare writes docs/.sw/sw.mjs and ${TREE_FILE}`);
  return { copy, cli, tree: readFileSync(treePath, 'utf8').trim() };
}

// The stream-json events of a session → what it said and what it cost. The report is every text
// block of the main session, in order; subagents' blocks carry a parent_tool_use_id and are left out.
function readSession(text) {
  const session = { model: null, turns: null, cost: null, subtype: null, id: null, ok: false, report: '' };
  const seen = new Set();
  const texts = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'system' && event.subtype === 'init') {
      session.model ??= event.model ?? null;
      session.id ??= event.session_id ?? null;
    } else if (event.type === 'assistant' && !event.parent_tool_use_id) {
      for (const block of event.message?.content ?? []) {
        if (block.type !== 'text' || !block.text?.trim()) continue;
        const key = `${event.message.id}\n${block.text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        texts.push(block.text.trim());
      }
    } else if (event.type === 'result') {
      session.subtype = event.subtype ?? null;
      session.turns = event.num_turns ?? null;
      session.cost = event.total_cost_usd ?? null;
      session.id = event.session_id ?? session.id;
      session.ok = event.subtype === 'success' && !event.is_error;
      if (!session.model && event.modelUsage) session.model = Object.keys(event.modelUsage).join(', ');
    }
  }
  session.report = texts.length ? `${texts.join('\n\n')}\n` : '';
  return session;
}

// A headless session of the scenario's skill in the prepared copy. The events go to `<report>.jsonl`
// as they come, the main session's texts to `<report>` afterwards; the result says what it cost.
export function run(ref, dir, { report, budget = null, claude = 'claude' }) {
  const scenario = loadScenario(ref);
  if (!scenario.skill) throw new EvalError(`${scenario.name} is a Role: scenario; run starts a Skill: scenario's session, a Role: scenario's agent is dispatched by hand (evals/README.md)`);
  const { copy } = preparedCopy(dir);
  const reportPath = resolve(report);
  const eventsPath = `${reportPath}.jsonl`;
  const args = ['-p', fillPrompt(scenario, copy), ...CLAUDE_ARGS, '--max-budget-usd', String(budget ?? scenario.budget)];
  const events = openSync(eventsPath, 'w');
  let result;
  try {
    result = spawnSync(claude, args, { cwd: copy, encoding: 'utf8', stdio: ['ignore', events, 'pipe'], maxBuffer: EVENTS_LIMIT });
  } finally {
    closeSync(events);
  }
  if (result.error) throw new EvalError(`${claude}: ${result.error.message}`);
  const session = readSession(readFileSync(eventsPath, 'utf8'));
  writeFileSync(reportPath, session.report);
  return { ...session, report: reportPath, events: eventsPath, status: result.status, stderr: result.stderr };
}

export function formatRun(session) {
  const value = item => (item === null || item === undefined ? 'none' : String(item));
  return `model: ${value(session.model)}\nturns: ${value(session.turns)}\ncost: ${session.cost === null ? 'none' : `$${session.cost}`}\nresult: ${value(session.subtype)}\nsession: ${value(session.id)}\n`;
}

const tail = text => text.trim().split('\n').slice(-3).join(' / ');

// A matches/lacks row against a text; `where` names the text in the detail.
function search(text, row, where) {
  const found = text.match(row.re);
  const ok = row.mode === 'matches' ? found !== null : found === null;
  return { ok, detail: ok ? '' : found ? `found "${found[0]}"` : `no match ${where}` };
}

function runCheck(row, { copy, cli, output, tree }) {
  if (row.kind === 'sw') {
    const result = spawnSync(process.execPath, [cli, ...row.args], { cwd: copy, encoding: 'utf8' });
    if (row.exit !== null) return { ok: result.status === row.exit, detail: `exit ${result.status}` };
    const ok = result.stdout.split('\n').some(line => line.includes(row.line));
    return { ok, detail: ok ? '' : `exit ${result.status}; output: ${tail(result.stdout || result.stderr) || 'none'}` };
  }
  if (row.kind === 'output') return search(output, row, 'in the output');
  if (row.kind === 'file') {
    const path = join(copy, row.path);
    if (!existsSync(path)) return row.mode === 'lacks' ? { ok: true, detail: '' } : { ok: false, detail: `missing: ${row.path}` };
    return search(readFileSync(path, 'utf8'), row, `in ${row.path}`);
  }
  const changed = git(copy, ['diff-tree', '-r', '--name-status', tree, treeHash(copy)]).trim();
  return { ok: !changed, detail: changed ? `changed: ${changed.split('\n').join(', ')}` : '' };
}

// Every pass row of the scenario, run against the prepared copy and the saved report.
export function check(ref, dir, outputPath) {
  const scenario = loadScenario(ref);
  const context = { ...preparedCopy(dir), output: readInput(outputPath) };
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
       node evals/e2e/e2e.mjs run <scenario> <dir> --report <file> [--max-budget-usd <n>] [--claude <bin>]
       node evals/e2e/e2e.mjs check <scenario> <dir> <report>

prepare  copies the fixture to <dir> (new or empty), gives it a vault, the agent files of the checkout's
         role texts and one commit, lays the scenario's overlays over it uncommitted, and prints the
         agent type to dispatch (Agent: sw-<role>) or the skill to run (Skill: sw:<name>) and the prompt;
         a Role: scenario refuses to run while the agent file is missing (--agents: where the files are;
         default .claude/agents, written by "${SYNC}")
run      starts "claude -p" in the prepared copy of a Skill: scenario, unattended, with the scenario's
         Budget: as --max-budget-usd unless given here, and saves the session's events as <file>.jsonl
         and what the main session said as <file>; prints the model, turns, cost, result and session id
         exit 0 the session ended in success, 1 otherwise (the report is still written), 2 an input error
check    runs the scenario's pass table against the copy and the report saved in <report>
         exit 0 every row passes, 1 a row fails, 2 an input error
<scenario> is a name in evals/e2e/scenarios/ or a path to a scenario file`;

class UsageError extends EvalError {}

const COMMANDS = {
  prepare: { positional: 1, options: ['to', 'agents'] },
  run: { positional: 2, options: ['report', 'max-budget-usd', 'claude'] },
  check: { positional: 3, options: [] },
};

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const spec = COMMANDS[command];
  if (!spec) throw new UsageError(command ? `unknown command ${command}` : 'no command');
  const options = { command, positional: [] };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      const owner = Object.keys(COMMANDS).find(key => COMMANDS[key].options.includes(name));
      if (!owner) throw new UsageError(`unknown option ${arg}`);
      if (owner !== command) throw new UsageError(`${arg} belongs to ${owner}`);
      const value = rest[++i];
      if (!value) throw new UsageError(`${arg} needs a value`);
      options[name] = value;
    } else options.positional.push(arg);
  }
  const needed = spec.positional;
  if (options.positional.length !== needed) throw new UsageError(`${command} takes ${needed} argument${needed > 1 ? 's' : ''}`);
  if (command === 'prepare' && !options.to) throw new UsageError('prepare needs --to <dir>');
  if (command === 'run') {
    if (!options.report) throw new UsageError('run needs --report <file>');
    if ('max-budget-usd' in options && !(Number(options['max-budget-usd']) > 0)) throw new UsageError(`--max-budget-usd needs a positive number, not ${options['max-budget-usd']}`);
  }
  return options;
}

export function main(argv, out = process.stdout, err = process.stderr) {
  try {
    const options = parseArgs(argv);
    if (options.command === 'prepare') {
      const { agent, skill, prompt } = prepare(options.positional[0], options.to, { agents: options.agents });
      out.write(`${agent ? `Agent: ${agent}` : `Skill: sw:${skill}`}\n\n${prompt}\n`);
      return 0;
    }
    if (options.command === 'run') {
      const session = run(options.positional[0], options.positional[1], {
        report: options.report,
        budget: 'max-budget-usd' in options ? Number(options['max-budget-usd']) : null,
        claude: options.claude,
      });
      out.write(formatRun(session));
      if (!session.ok && session.stderr?.trim()) err.write(`${session.stderr.trim()}\n`);
      return session.ok ? 0 : 1;
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
