#!/usr/bin/env node
// Routing eval: the deterministic parts before and after the agents run.
//   probe  builds the file a fresh agent reads: the skills, the project rules, the messages
//   score  checks the agents' answer files against the expectations in messages.md
// It never calls a model. evals/README.md says how to run the agents in between.
import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../../src/core.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MESSAGES_PATH = 'evals/routing/messages.md';
const MISSING = '—';

const INSTRUCTION = `Put yourself in the place of the agent in that project, with only the skills and rules in the file to go on (ignore any other skills or instructions you happen to have yourself). For each message decide which single skill you would invoke first, or \`none\` if you would handle the message without any of them.

Reply with exactly 36 lines and nothing before or after them, one per message, in this format:

<number> | <skill name or none> | <runner-up skill, or -> | <sure or unsure> | <reason, 12 words at most>

Use the runner-up column whenever a second skill (or \`none\`) seemed a real candidate. Mark \`unsure\` whenever the descriptions and rules did not settle the choice for you.`;

const CONTEXT = 'Each message below is the first message of a new session in a project with a Superwiki vault and the task module on.';

// An error in the input (a file, an argument): the CLI exits 2 on it.
export class EvalError extends Error {}

const cells = line => line.split('|').slice(1, -1).map(cell => cell.trim());
const unquote = name => name.replace(/`/g, '').trim();

// messages.md → [{ n, message, expect }], expect null where the table has `-`.
export function parseMessages(text) {
  const messages = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    const row = cells(line.trim());
    if (row.length !== 3) throw new EvalError(`message row needs 3 cells (#, message, expect): ${line}`);
    const [number, message, expect] = row;
    const n = Number(number);
    if (n !== messages.length + 1) throw new EvalError(`messages must be numbered 1 to N in order; found ${n} after ${messages.length}`);
    if (!message) throw new EvalError(`message ${n} is empty`);
    if (!expect) throw new EvalError(`message ${n} has no expect value; write a skill name, none or -`);
    messages.push({ n, message, expect: expect === '-' ? null : unquote(expect) });
  }
  if (!messages.length) throw new EvalError('no message rows found');
  return messages;
}

// The lines strictly between the Superwiki markers of AGENTS.md.
export function rulesBlock(agentsText) {
  const lines = String(agentsText).split(/\r?\n/);
  const start = lines.findIndex(line => line.trim().startsWith('<!-- sw:start'));
  const end = lines.findIndex(line => line.trim() === '<!-- sw:end -->');
  if (start < 0) throw new EvalError('AGENTS.md has no <!-- sw:start marker');
  if (end < 0) throw new EvalError('AGENTS.md has no <!-- sw:end --> marker');
  if (end < start) throw new EvalError('AGENTS.md has <!-- sw:end --> before <!-- sw:start');
  return lines.slice(start + 1, end).join('\n').trim();
}

// [{ name, description }] from the frontmatter of every skills/*/SKILL.md, sorted by name.
export function readSkills(root) {
  const dir = join(root, 'skills');
  const skills = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name, 'SKILL.md');
    if (!entry.isDirectory() || !existsSync(file)) continue;
    const { data } = parseFrontmatter(readFileSync(file, 'utf8'));
    if (!data?.name || !data?.description) throw new EvalError(`${file} lacks a name or a description in its frontmatter`);
    skills.push({ name: data.name, description: data.description });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

// The probe text. Expectations never appear in it.
export function buildProbe({ skills, rules, messages, competing }) {
  const parts = [
    '# Routing probe',
    CONTEXT,
    INSTRUCTION.replace('exactly 36 lines', `exactly ${messages.length} lines`),
    '## Skills',
    skills.map(skill => `- ${skill.name}: ${skill.description}`).join('\n'),
    '## Project rules',
    rules,
  ];
  if (competing != null) parts.push('## Other installed skills and session-start text', String(competing).trimEnd());
  parts.push('## Messages', messages.map(m => `${m.n}. ${m.message}`).join('\n'));
  return parts.join('\n\n') + '\n';
}

// An answer file → Map(n → { pick, runnerUp, sure, reason }). Lines that are not answers are ignored.
export function parseAnswers(text) {
  const answers = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*(\d+)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)$/.exec(line);
    if (!m) continue;
    const n = Number(m[1]);
    if (answers.has(n)) throw new EvalError(`message ${n} is answered twice`);
    answers.set(n, {
      pick: unquote(m[2]),
      runnerUp: unquote(m[3]),
      sure: unquote(m[4]).toLowerCase() !== 'unsure',
      reason: m[5].trim(),
    });
  }
  return answers;
}

// Scores answer sets (one per repetition) against the messages.
export function score(messages, answerSets, labels = answerSets.map((_, i) => `answer set ${i + 1}`)) {
  if (!answerSets.length) throw new EvalError('no answer sets to score');
  const known = new Set(messages.map(m => m.n));
  answerSets.forEach((answers, i) => {
    if (!answers.size) throw new EvalError(`${labels[i]} has no answer line`);
    const unknown = [...answers.keys()].filter(n => !known.has(n));
    if (unknown.length) throw new EvalError(`${labels[i]} answers unknown message ${unknown.join(', ')}`);
  });

  const k = answerSets.length;
  const rows = [];
  const differs = [];
  const missing = [];
  let agreement = 0;
  let matched = 0;
  for (const { n, expect } of messages) {
    const answers = answerSets.map(set => set.get(n));
    const picks = answers.map(a => a?.pick ?? null);
    const agree = picks.every(p => p !== null && p === picks[0]);
    if (agree) agreement++;
    const absent = picks.filter(p => p === null).length;
    if (absent) missing.push({ n, count: absent });
    if (expect !== null) {
      if (picks.every(p => p === expect)) matched++;
      const wrong = new Map();
      for (const p of picks) if (p !== null && p !== expect) wrong.set(p, (wrong.get(p) ?? 0) + 1);
      for (const [pick, count] of wrong) differs.push({ n, expect, pick, count });
    }
    rows.push({ n, expect, picks, agree, unsure: answers.filter(a => a && !a.sure).length });
  }
  const expected = messages.filter(m => m.expect !== null).length;
  return {
    rows,
    repetitions: k,
    agreement,
    messages: messages.length,
    matched,
    expected,
    differs,
    missing,
    ok: differs.length === 0 && missing.length === 0,
  };
}

export function formatScore(result) {
  const k = result.repetitions;
  const lines = ['| # | expect | picks | agree | unsure |', '| --- | --- | --- | --- | --- |'];
  for (const row of result.rows) {
    const picks = row.picks.map(p => p ?? MISSING).join(', ');
    lines.push(`| ${row.n} | ${row.expect ?? '-'} | ${picks} | ${row.agree ? 'yes' : 'no'} | ${row.unsure} |`);
  }
  lines.push(
    '',
    `repetitions: ${k}`,
    `agreement: ${result.agreement} of ${result.messages} messages`,
    `expectations: ${result.matched} of ${result.expected} messages matched in every repetition`,
  );
  if (result.differs.length) {
    lines.push('differs:');
    for (const d of result.differs) lines.push(`- ${d.n}: expected ${d.expect}, got ${d.pick} in ${d.count} of ${k}`);
  } else lines.push('differs: none');
  if (result.missing.length) {
    lines.push('missing:');
    for (const m of result.missing) lines.push(`- ${m.n}: no answer in ${m.count} of ${k}`);
  }
  return lines.join('\n') + '\n';
}

const USAGE = `usage: node evals/routing/routing.mjs probe [--with <file>] [--root <dir>]
       node evals/routing/routing.mjs score <answers>... [--root <dir>]

probe  prints the routing probe built from the repository: skills/*/SKILL.md, the Superwiki
       block of AGENTS.md and ${MESSAGES_PATH}; --with appends a competing skill set's file
score  scores answer files (one per repetition) against the expectations in ${MESSAGES_PATH}
       exit 0 every pick matches, 1 a pick differs or an answer is missing, 2 an input error
--root the repository to read (default: the one this script is in)`;

class UsageError extends EvalError {}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command, root: REPO_ROOT, competing: null, files: [] };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--root' || arg === '--with') {
      const value = rest[++i];
      if (!value) throw new UsageError(`${arg} needs a value`);
      if (arg === '--root') options.root = resolve(value);
      else if (command === 'probe') options.competing = value;
      else throw new UsageError('--with belongs to probe');
    } else if (arg.startsWith('--')) throw new UsageError(`unknown option ${arg}`);
    else if (command === 'score') options.files.push(arg);
    else throw new UsageError(`unexpected argument ${arg}`);
  }
  if (command !== 'probe' && command !== 'score') throw new UsageError(command ? `unknown command ${command}` : 'no command');
  if (command === 'score' && !options.files.length) throw new UsageError('score needs at least one answer file');
  return options;
}

function readInput(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    throw new EvalError(`cannot read ${path}: ${error.code ?? error.message}`);
  }
}

export function main(argv, out = process.stdout, err = process.stderr) {
  try {
    const options = parseArgs(argv);
    const messages = parseMessages(readInput(join(options.root, MESSAGES_PATH)));
    if (options.command === 'probe') {
      out.write(buildProbe({
        skills: readSkills(options.root),
        rules: rulesBlock(readInput(join(options.root, 'AGENTS.md'))),
        messages,
        competing: options.competing === null ? undefined : readInput(options.competing),
      }));
      return 0;
    }
    const answerSets = options.files.map(file => {
      try {
        return parseAnswers(readInput(file));
      } catch (error) {
        throw new EvalError(error.message.startsWith('cannot read') ? error.message : `${file}: ${error.message}`);
      }
    });
    const result = score(messages, answerSets, options.files);
    out.write(formatScore(result));
    return result.ok ? 0 : 1;
  } catch (error) {
    err.write(`routing: ${error.message}\n`);
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
