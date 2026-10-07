import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildProbe,
  formatScore,
  parseAnswers,
  parseMessages,
  readSkills,
  rulesBlock,
  score,
} from '../evals/routing/routing.mjs';

const script = new URL('../evals/routing/routing.mjs', import.meta.url).pathname;
const routing = (...args) => spawnSync('node', [script, ...args], { encoding: 'utf8' });

const MESSAGES = [
  '# Messages',
  '',
  '| # | Message | expect |',
  '| --- | --- | --- |',
  '| 1 | do T-05 | sw:alpha |',
  '| 2 | fix the typo | none |',
  '| 3 | review T-05 | - |',
  '',
].join('\n');

const AGENTS = [
  '# Agent instructions',
  '',
  'Outside text before the block.',
  '<!-- sw:start (managed by sw:init) -->',
  '## Superwiki',
  'Inside the block.',
  '<!-- sw:end -->',
  'Outside text after the block.',
  '',
].join('\n');

function writeSkill(root, name, description) {
  mkdirSync(join(root, 'skills', name), { recursive: true });
  writeFileSync(join(root, 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n# sw:${name}\n`);
}

// A repository with the plugin manifest, two skills (written out of order), an AGENTS.md block and
// three messages. The skills are listed as the plugin names them: sw:<name>.
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'sw-evals-'));
  mkdirSync(join(root, '.claude-plugin'), { recursive: true });
  writeFileSync(join(root, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'sw' }));
  writeSkill(root, 'beta', 'Use when beta things happen.');
  writeSkill(root, 'alpha', 'Use when alpha things happen.');
  mkdirSync(join(root, 'evals/routing'), { recursive: true });
  writeFileSync(join(root, 'evals/routing/messages.md'), MESSAGES);
  writeFileSync(join(root, 'AGENTS.md'), AGENTS);
  return root;
}

function answerFile(dir, name, lines) {
  const path = join(dir, name);
  writeFileSync(path, lines.join('\n') + '\n');
  return path;
}

const MATCHING = ['1 | sw:alpha | - | sure | asked to do it', '2 | none | - | sure | small fix', '3 | none | sw:beta | unsure | no review skill'];

function probeFrom(root, competing) {
  return buildProbe({
    skills: readSkills(root),
    rules: rulesBlock(AGENTS),
    messages: parseMessages(MESSAGES),
    competing,
  });
}

test('the probe lists the skills sorted under the plugin name, the rules block and the messages, without expectations', () => {
  const probe = probeFrom(repo());
  const skillLines = probe.split('\n').filter(line => line.startsWith('- sw:'));
  assert.deepEqual(skillLines, ['- sw:alpha: Use when alpha things happen.', '- sw:beta: Use when beta things happen.']);
  assert.match(probe, /## Project rules\n\n## Superwiki\nInside the block\.\n/);
  assert.doesNotMatch(probe, /Outside text|sw:start|sw:end/);
  assert.match(probe, /Reply with exactly 3 lines/);
  assert.doesNotMatch(probe, /exactly 36/);
  assert.match(probe, /## Messages\n\n1\. do T-05\n2\. fix the typo\n3\. review T-05\n$/);
  assert.doesNotMatch(probe, /\bexpect/i);
  assert.doesNotMatch(probe, /\| sw:alpha \||\| none \||\| - \|/);
  assert.doesNotMatch(probe, /## Other installed skills/);
});

test('a competing file appears verbatim under its heading, before the messages', () => {
  const competing = '- other:tdd: Use when writing tests.\n\nSession start: you have other skills.\n';
  const probe = probeFrom(repo(), competing);
  const heading = probe.indexOf('## Other installed skills and session-start text');
  assert.ok(heading > 0);
  assert.ok(probe.indexOf(competing.trimEnd()) > heading);
  assert.ok(probe.indexOf('## Messages') > probe.indexOf(competing.trimEnd()));
});

test('rulesBlock throws when a marker is missing', () => {
  assert.throws(() => rulesBlock(AGENTS.replace('<!-- sw:end -->', '')), /sw:end/);
  assert.throws(() => rulesBlock(AGENTS.replace('<!-- sw:start (managed by sw:init) -->', '')), /sw:start/);
});

test('parseMessages reads the expectations and rejects gaps in the numbering', () => {
  assert.deepEqual(parseMessages(MESSAGES), [
    { n: 1, message: 'do T-05', expect: 'sw:alpha' },
    { n: 2, message: 'fix the typo', expect: 'none' },
    { n: 3, message: 'review T-05', expect: null },
  ]);
  assert.throws(() => parseMessages('| 1 | a | none |\n| 3 | b | none |\n'), /1 to N in order/);
});

test('parseAnswers ignores fences and prose and strips backticks', () => {
  const answers = parseAnswers(['Here are my answers:', '```', '1 | `sw:alpha` | `none` | unsure | asked to do it', '```'].join('\n'));
  assert.deepEqual([...answers.keys()], [1]);
  assert.deepEqual(answers.get(1), { pick: 'sw:alpha', runnerUp: 'none', sure: false, reason: 'asked to do it' });
});

test('three matching answer sets agree everywhere and exit 0', () => {
  const root = repo();
  const files = [1, 2, 3].map(i => answerFile(root, `a${i}.txt`, MATCHING));
  const result = score(parseMessages(MESSAGES), files.map(() => parseAnswers(MATCHING.join('\n'))));
  assert.ok(result.rows.every(row => row.agree));
  const report = formatScore(result);
  assert.match(report, /\| 1 \| sw:alpha \| sw:alpha, sw:alpha, sw:alpha \| yes \| 0 \|/);
  assert.match(report, /\| 3 \| - \| none, none, none \| yes \| 3 \|/);
  assert.match(report, /^repetitions: 3$/m);
  assert.match(report, /^agreement: 3 of 3 messages$/m);
  assert.match(report, /^expectations: 2 of 2 messages matched in every repetition$/m);
  assert.match(report, /^differs: none$/m);

  const cli = routing('score', '--root', root, ...files);
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout, report);
});

test('a repetition that differs on one message is listed and exits 1', () => {
  const root = repo();
  const differing = ['1 | sw:beta | sw:alpha | unsure | maybe beta', ...MATCHING.slice(1)];
  const files = [answerFile(root, 'a1.txt', MATCHING), answerFile(root, 'a2.txt', differing), answerFile(root, 'a3.txt', MATCHING)];
  const cli = routing('score', '--root', root, ...files);
  assert.equal(cli.status, 1, cli.stderr);
  assert.match(cli.stdout, /\| 1 \| sw:alpha \| sw:alpha, sw:beta, sw:alpha \| no \| 1 \|/);
  assert.match(cli.stdout, /^agreement: 2 of 3 messages$/m);
  assert.match(cli.stdout, /^expectations: 1 of 2 messages matched in every repetition$/m);
  assert.match(cli.stdout, /^differs:\n- 1: expected sw:alpha, got sw:beta in 1 of 3$/m);
});

test('differing picks on a message without an expectation are not a failure, but they do not agree', () => {
  const root = repo();
  const other = [...MATCHING.slice(0, 2), '3 | sw:beta | none | unsure | could be beta'];
  const files = [answerFile(root, 'a1.txt', MATCHING), answerFile(root, 'a2.txt', other), answerFile(root, 'a3.txt', MATCHING)];
  const cli = routing('score', '--root', root, ...files);
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /\| 3 \| - \| none, sw:beta, none \| no \| 3 \|/);
  assert.match(cli.stdout, /^agreement: 2 of 3 messages$/m);
  assert.match(cli.stdout, /^differs: none$/m);
});

test('an answer file that lacks a message shows a dash in its picks and exits 1', () => {
  const root = repo();
  const lacking = [MATCHING[0], MATCHING[2]];
  const files = [answerFile(root, 'a1.txt', MATCHING), answerFile(root, 'a2.txt', lacking)];
  const cli = routing('score', '--root', root, ...files);
  assert.equal(cli.status, 1, cli.stderr);
  assert.match(cli.stdout, /\| 2 \| none \| none, — \| no \| 0 \|/);
  assert.match(cli.stdout, /^missing:\n- 2: no answer in 1 of 2$/m);
});

test('a duplicate answer, no answer line or an unknown number exits 2', () => {
  const root = repo();
  const duplicate = answerFile(root, 'dup.txt', [...MATCHING, '2 | none | - | sure | again']);
  const empty = answerFile(root, 'empty.txt', ['I would rather not answer.']);
  const unknown = answerFile(root, 'unknown.txt', [...MATCHING, '9 | none | - | sure | extra']);
  for (const file of [duplicate, empty, unknown]) {
    const cli = routing('score', '--root', root, file);
    assert.equal(cli.status, 2, `${file}: ${cli.stdout}`);
    assert.match(cli.stderr, /^routing: /);
  }
  assert.equal(routing('score', '--root', root, join(root, 'absent.txt')).status, 2);
  assert.equal(routing('score').status, 2);
  assert.equal(routing('rank').status, 2);
});

test('probe on the real repository lists the 18 skills as sw:<name>', () => {
  const cli = routing('probe');
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout.split('\n').filter(line => line.startsWith('- sw:')).length, 18);
  assert.match(cli.stdout, /^- sw:review: /m);
  assert.doesNotMatch(cli.stdout, /^- sw:sw-/m);
  assert.match(cli.stdout, /Reply with exactly 38 lines/);
});
