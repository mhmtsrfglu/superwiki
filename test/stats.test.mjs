import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const cli = new URL('../skills/sw-init/assets/sw.mjs', import.meta.url).pathname;

// A home folder for the tools' session records and a project that the sessions ran in.
function setup() {
  const home = mkdtempSync(join(tmpdir(), 'sw-stats-home-'));
  const root = mkdtempSync(join(tmpdir(), 'sw-stats-'));
  mkdirSync(join(root, 'docs'));
  return { home, root };
}

function stats({ home, root }, args = [], env = {}) {
  // The tests may themselves run inside an agent session; its variables must not leak in.
  const { CLAUDE_CODE_SESSION_ID, CLAUDE_CONFIG_DIR, CODEX_HOME, ...clean } = process.env;
  return spawnSync('node', [cli, 'stats', '--docs', join(root, 'docs'), ...args], { encoding: 'utf8', env: { ...clean, HOME: home, TZ: 'UTC', ...env } });
}

function writeLines(path, records, modified) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, records.map(record => JSON.stringify(record)).join('\n') + '\n');
  if (modified) utimesSync(path, modified, modified);
}

// A table line with these cells, whatever the column widths are.
const row = (...cells) => new RegExp(`\\n${cells.map(cell => cell.replace(/[.%-]/g, '\\$&')).join(' +')}\\n`);

const agentsOf = result => Object.fromEntries(JSON.parse(result.stdout).agents.map(agent => [agent.name, agent]));

// ---------- Claude Code ----------

const claudeDir = ({ home, root }) => join(home, '.claude/projects', root.replace(/[^A-Za-z0-9]/g, '-'));

function claudeReply(id, minute, usage, content) {
  return {
    type: 'assistant',
    timestamp: `2026-10-05T10:${minute}:00.000Z`,
    message: { id, model: 'claude-opus-5-5', usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0, ...usage }, content },
  };
}

function claudeSession(dirs, id, modified) {
  writeLines(join(claudeDir(dirs), `${id}.jsonl`), [
    { type: 'user', timestamp: '2026-10-05T10:00:00.000Z', message: { content: 'go' } },
    // One reply, two content blocks: the usage repeats and only the last line has the final output.
    claudeReply('m1', '01', { input_tokens: 1000, cache_read_input_tokens: 9000, output_tokens: 1 }, [{ type: 'text' }]),
    claudeReply('m1', '01', { input_tokens: 1000, cache_read_input_tokens: 9000, output_tokens: 50 }, [{ type: 'tool_use', name: 'Bash' }]),
    claudeReply('m2', '30', { input_tokens: 500, cache_creation_input_tokens: 4500, cache_read_input_tokens: 15000, output_tokens: 200 }, [{ type: 'tool_use', name: 'Agent' }]),
  ], modified);
}

test('claude: one row per agent, a reply counted once, subagents in the order they started', () => {
  const dirs = setup();
  claudeSession(dirs, 'aaaa-1');
  const subagents = join(claudeDir(dirs), 'aaaa-1/subagents');
  writeLines(join(subagents, 'agent-1.jsonl'), [claudeReply('r1', '20', { input_tokens: 3000 }, [{ type: 'tool_use', name: 'Read' }])]);
  writeFileSync(join(subagents, 'agent-1.meta.json'), JSON.stringify({ agentType: 'sw-reviewer' }));
  writeLines(join(subagents, 'agent-2.jsonl'), [claudeReply('i1', '05', { input_tokens: 2000, output_tokens: 10 }, [{ type: 'tool_use', name: 'Bash' }])]);
  writeFileSync(join(subagents, 'agent-2.meta.json'), JSON.stringify({ agentType: 'sw-implementer' }));

  const session = JSON.parse(stats(dirs, ['--json']).stdout);
  assert.equal(session.tool, 'claude');
  assert.deepEqual(session.agents.map(agent => agent.name), ['main', 'sw-implementer', 'sw-reviewer']);
  const { main } = agentsOf(stats(dirs, ['--json']));
  assert.deepEqual(
    { steps: main.steps, first: main.first, peak: main.peak, sent: main.sent, cached: main.cached, output: main.output, toolCalls: main.toolCalls },
    { steps: 2, first: 10000, peak: 20000, sent: 30000, cached: 24000, output: 250, toolCalls: 2 },
  );
  assert.deepEqual(session.tools, { Bash: 2, Agent: 1, Read: 1 });

  const text = stats(dirs).stdout;
  assert.match(text, /^session {2}claude {2}aaaa-1 {2}2026-10-05 10:00 to 10:30, 30 min\n/);
  assert.match(text, row('main', 'claude-opus-5-5', '2', '10k', '20k', '30k', '80%', '250', '2', '30'));
  assert.match(text, row('total', '4', '-', '-', '35k', '69%', '260', '4'));
  assert.match(text, /\ntool calls {2}Bash 2 {2}Agent 1 {2}Read 1\n/);
});

test('claude: the running session wins over a newer one; --session picks another', () => {
  const dirs = setup();
  claudeSession(dirs, 'aaaa-old', new Date('2026-10-01'));
  claudeSession(dirs, 'bbbb-new', new Date('2026-10-02'));
  assert.equal(JSON.parse(stats(dirs, ['--json']).stdout).id, 'bbbb-new');
  assert.equal(JSON.parse(stats(dirs, ['--json'], { CLAUDE_CODE_SESSION_ID: 'aaaa-old' }).stdout).id, 'aaaa-old');
  assert.equal(JSON.parse(stats(dirs, ['--json', '--session', 'bbbb'], { CLAUDE_CODE_SESSION_ID: 'aaaa-old' }).stdout).id, 'bbbb-new');
});

// ---------- Codex ----------

function codexCount(total, last) {
  return { type: 'event_msg', timestamp: '2026-10-05T10:02:00.000Z', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: total }, last_token_usage: last } } };
}

function codexFile({ home }, name, meta, records) {
  writeLines(join(home, '.codex/sessions/2026/10/05', `rollout-${name}.jsonl`), [
    { type: 'session_meta', timestamp: '2026-10-05T10:00:00.000Z', payload: meta },
    { type: 'turn_context', timestamp: '2026-10-05T10:00:01.000Z', payload: { model: 'gpt-6' } },
    ...records,
  ]);
}

test('codex: subagent files join their session; a repeated count is one step; other projects are ignored', () => {
  const dirs = setup();
  codexFile(dirs, 'main', { id: 's1', session_id: 's1', cwd: dirs.root, thread_source: 'user' }, [
    { type: 'response_item', timestamp: '2026-10-05T10:01:00.000Z', payload: { type: 'function_call', name: 'exec_command' } },
    codexCount(8100, { input_tokens: 8000, cached_input_tokens: 6000, output_tokens: 100 }),
    codexCount(8100, { input_tokens: 8000, cached_input_tokens: 6000, output_tokens: 100 }),
    codexCount(20300, { input_tokens: 12000, cached_input_tokens: 8000, output_tokens: 200 }),
  ]);
  codexFile(dirs, 'sub', { id: 's2', session_id: 's1', cwd: dirs.root, thread_source: 'subagent', agent_role: 'sw_planner' }, [
    codexCount(5050, { input_tokens: 5000, cached_input_tokens: 0, output_tokens: 50 }),
  ]);
  codexFile(dirs, 'elsewhere', { id: 's3', session_id: 's3', cwd: '/somewhere/else', thread_source: 'user' }, [
    codexCount(999, { input_tokens: 999, cached_input_tokens: 0, output_tokens: 0 }),
  ]);

  const result = stats(dirs, ['--json']);
  const session = JSON.parse(result.stdout);
  assert.equal(session.id, 's1');
  const { main, sw_planner: planner } = agentsOf(result);
  assert.deepEqual([main.model, main.steps, main.first, main.peak, main.sent, main.cached, main.output], ['gpt-6', 2, 8000, 12000, 20000, 14000, 300]);
  assert.deepEqual([planner.steps, planner.sent], [1, 5000]);
  assert.deepEqual(session.tools, { exec_command: 1 });
});

// ---------- Copilot CLI ----------

function copilotSession({ home, root }, id, events) {
  const dir = join(home, '.copilot/session-state', id);
  writeLines(join(dir, 'events.jsonl'), [
    { type: 'assistant.message', timestamp: '2026-10-05T10:00:00.000Z', data: { model: 'gpt-6' } },
    { type: 'tool.execution_start', timestamp: '2026-10-05T10:00:05.000Z', data: { toolName: 'task' } },
    { type: 'subagent.started', timestamp: '2026-10-05T10:00:06.000Z', agentId: 'a1', data: { agentName: 'sw-planner' } },
    { type: 'assistant.message', timestamp: '2026-10-05T10:00:07.000Z', agentId: 'a1', data: { model: 'gpt-6' } },
    { type: 'tool.execution_start', timestamp: '2026-10-05T10:00:08.000Z', agentId: 'a1', data: { toolName: 'view' } },
    ...events,
  ]);
  writeFileSync(join(dir, 'workspace.yaml'), `id: ${id}\ncwd: ${root}\nbranch: main\n`);
}

const copilotUsage = (inputTokens, cacheReadTokens, outputTokens) => ({ modelMetrics: { 'gpt-6': { usage: { inputTokens, cacheReadTokens, outputTokens } } } });

test('copilot: tokens come from the closing record; an open session says they are not there yet', () => {
  const open = setup();
  copilotSession(open, 'open-1', []);
  const before = stats(open);
  assert.match(before.stdout, row('main', 'gpt-6', '1', '-', '-', '-', '-', '-', '1', '0'));
  assert.match(before.stdout, /\nCopilot writes token counts when the session closes; until then \/usage shows them\.\n$/);

  const closed = setup();
  copilotSession(closed, 'closed-1', [
    { type: 'session.shutdown', timestamp: '2026-10-05T10:01:00.000Z', data: { agentMetrics: { main: copilotUsage(1000, 800, 30), a1: copilotUsage(400, 100, 20) } } },
  ]);
  const after = stats(closed, ['--json']);
  const { main, 'sw-planner': planner } = agentsOf(after);
  assert.deepEqual([main.steps, main.sent, main.cached, main.output, main.toolCalls], [1, 1000, 800, 30, 1]);
  assert.deepEqual([planner.steps, planner.sent, planner.toolCalls], [1, 400, 1]);
  assert.equal(JSON.parse(after.stdout).note, '');
});

// ---------- Choosing ----------

test('the most recently written session is reported; --tool narrows; errors say what is missing', () => {
  const dirs = setup();
  const none = stats(dirs);
  assert.equal(none.status, 1);
  assert.match(none.stderr, /^no agent session record found for /);
  assert.equal(stats(dirs, ['--tool', 'cursor']).status, 2);

  claudeSession(dirs, 'aaaa-1', new Date('2026-10-01'));
  copilotSession(dirs, 'newer-1', []);
  assert.equal(JSON.parse(stats(dirs, ['--json']).stdout).tool, 'copilot');
  assert.equal(JSON.parse(stats(dirs, ['--json', '--tool', 'claude']).stdout).tool, 'claude');
  const noCodex = stats(dirs, ['--tool', 'codex']);
  assert.equal(noCodex.status, 1);
  assert.match(noCodex.stderr, /^no codex session record found for /);
});
