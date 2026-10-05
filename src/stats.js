// Session statistics: what an agent session has cost so far, as one row per agent: the main
// session and each subagent it started. Reads the session record found by sessions.js.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { jsonFile, jsonLines } from './sessions.js';

const MAIN = 'main';

// ---------- The summary being built ----------

const newStats = session => ({ tool: session.tool, id: session.id, agents: [], tools: {}, note: '' });

// Token fields stay null when the record does not hold them, so "unknown" never prints as 0.
const newAgent = name => ({
  name, model: '', steps: 0, first: null, peak: null, sent: null, cached: null, output: null, toolCalls: 0, start: null, end: null,
});

const plus = (sum, n) => (sum ?? 0) + (n || 0);

// One model request. `context` is everything sent with it, `cached` the part read from the cache.
function addStep(agent, { context, cached, output }) {
  agent.steps++;
  agent.first ??= context;
  agent.peak = Math.max(agent.peak ?? 0, context);
  agent.sent = plus(agent.sent, context);
  agent.cached = plus(agent.cached, cached);
  agent.output = plus(agent.output, output);
}

function addToolCall(stats, agent, name) {
  agent.toolCalls++;
  stats.tools[name] = (stats.tools[name] || 0) + 1;
}

// Widens the agent's working period to include this record.
function touch(agent, timestamp) {
  const time = Date.parse(timestamp);
  if (Number.isNaN(time)) return;
  agent.start = Math.min(agent.start ?? time, time);
  agent.end = Math.max(agent.end ?? time, time);
}

// Subagents are listed in the order they were started.
const byStart = (a, b) => (a.start ?? 0) - (b.start ?? 0);

// ---------- Claude Code ----------

function claudeAgent(stats, name, path) {
  const agent = newAgent(name);
  // A reply is written as one line per content block. Each line repeats the reply's usage, and
  // only the last one has the final output count, so the last line of a reply is the one kept.
  const replies = new Map();
  for (const record of jsonLines(path)) {
    touch(agent, record.timestamp);
    const message = record.type === 'assistant' && record.message;
    if (!message) continue;
    for (const block of message.content || []) {
      if (block.type === 'tool_use') addToolCall(stats, agent, block.name);
    }
    if (message.usage) replies.set(message.id, message);
  }
  for (const { model, usage } of replies.values()) {
    agent.model = model || agent.model;
    const cached = usage.cache_read_input_tokens || 0;
    addStep(agent, {
      context: (usage.input_tokens || 0) + cached + (usage.cache_creation_input_tokens || 0),
      cached,
      output: usage.output_tokens,
    });
  }
  return agent;
}

function claudeStats(session) {
  const { path, subagentDir } = session.source;
  const stats = newStats(session);
  stats.agents.push(claudeAgent(stats, MAIN, path));
  if (!existsSync(subagentDir)) return stats;
  const subagents = readdirSync(subagentDir)
    .filter(name => name.endsWith('.jsonl'))
    .map(name => {
      const meta = jsonFile(join(subagentDir, name.replace(/\.jsonl$/, '.meta.json')));
      return claudeAgent(stats, meta.agentType || 'subagent', join(subagentDir, name));
    });
  stats.agents.push(...subagents.sort(byStart));
  return stats;
}

// ---------- Codex ----------

function codexAgent(stats, name, records) {
  const agent = newAgent(name);
  let lastTotal = null;
  for (const record of records) {
    touch(agent, record.timestamp);
    const payload = record.payload || {};
    if (record.type === 'turn_context') agent.model = payload.model || agent.model;
    if (record.type === 'response_item' && /_call$/.test(payload.type || '')) addToolCall(stats, agent, payload.name || payload.type);
    if (record.type !== 'event_msg' || payload.type !== 'token_count' || !payload.info) continue;
    // The count is also repeated when only the rate limits change; a new request moves the total.
    const total = payload.info.total_token_usage?.total_tokens;
    if (total === lastTotal) continue;
    lastTotal = total;
    const last = payload.info.last_token_usage || {};
    addStep(agent, { context: last.input_tokens || 0, cached: last.cached_input_tokens, output: last.output_tokens });
  }
  return agent;
}

function codexStats(session) {
  const stats = newStats(session);
  const subagents = [];
  for (const { meta, records } of session.source.files) {
    if (meta.thread_source === 'subagent') subagents.push(codexAgent(stats, meta.agent_role || meta.agent_nickname || 'subagent', records));
    else stats.agents.push(codexAgent(stats, MAIN, records));
  }
  stats.agents.push(...subagents.sort(byStart));
  return stats;
}

// ---------- Copilot CLI ----------
// Events of a subagent carry its agentId. Token counts are written only when the session closes.

function copilotStats(session) {
  const stats = newStats(session);
  const agents = new Map();
  const agentOf = key => {
    if (!agents.has(key)) agents.set(key, newAgent(key));
    return agents.get(key);
  };
  agentOf(MAIN);
  let closed = false;
  for (const event of jsonLines(session.source.path)) {
    const data = event.data || {};
    const agent = agentOf(event.agentId || MAIN);
    touch(agent, event.timestamp);
    if (event.type === 'subagent.started') {
      agent.name = data.agentName || agent.name;
    } else if (event.type === 'assistant.message') {
      agent.steps++;
      agent.model = data.model || agent.model;
    } else if (event.type === 'tool.execution_start') {
      addToolCall(stats, agent, data.toolName);
    } else if (event.type === 'session.shutdown' && data.agentMetrics) {
      // A resumed session closes more than once; each close reports the run that ended with it.
      closed = true;
      for (const [key, metrics] of Object.entries(data.agentMetrics)) {
        const reported = agentOf(key);
        for (const { usage = {} } of Object.values(metrics.modelMetrics || {})) {
          reported.sent = plus(reported.sent, usage.inputTokens);
          reported.cached = plus(reported.cached, usage.cacheReadTokens);
          reported.output = plus(reported.output, usage.outputTokens);
        }
      }
    }
  }
  stats.agents = [...agents.values()];
  if (!closed) stats.note = 'Copilot writes token counts when the session closes; until then /usage shows them.';
  return stats;
}

const STATS_READERS = { claude: claudeStats, codex: codexStats, copilot: copilotStats };

export const sessionStats = session => STATS_READERS[session.tool](session);

// ---------- Printing ----------

const COLUMNS = ['agent', 'model', 'steps', 'first', 'peak', 'sent', 'cached', 'output', 'tools', 'min'];
const TEXT_COLUMNS = 2; // agent and model align left; the numbers after them align right
const LEGEND = 'first, peak: tokens sent with one request. sent: that, summed over every step. cached: the share of sent read from the cache.';

export function tokenCount(n) {
  if (n == null) return '-';
  if (n < 1000) return String(n);
  if (n < 1e6) return `${Math.round(n / 1000)}k`;
  return `${(n / 1e6).toFixed(1)}M`;
}

const cachedShare = agent => (agent.sent ? `${Math.round((100 * (agent.cached || 0)) / agent.sent)}%` : '-');
const minutes = (start, end) => Math.round((end - start) / 60000);

function clock(time) {
  const d = new Date(time);
  const two = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

// "2026-10-05 10:27 to 11:04, 37 min"; the end repeats the date only when it is another day.
function period(start, end) {
  const [from, to] = [clock(start), clock(end)];
  const sameDay = from.slice(0, 10) === to.slice(0, 10);
  return `${from} to ${sameDay ? to.slice(11) : to}, ${minutes(start, end)} min`;
}

function sessionPeriod(agents) {
  const timed = agents.filter(agent => agent.start != null);
  if (!timed.length) return '';
  return period(Math.min(...timed.map(agent => agent.start)), Math.max(...timed.map(agent => agent.end)));
}

// The sum of the agents. It has no context of its own and no period, so those cells stay empty.
function totalOf(agents) {
  const total = newAgent('total');
  for (const agent of agents) {
    total.steps += agent.steps;
    total.toolCalls += agent.toolCalls;
    for (const field of ['sent', 'cached', 'output']) {
      if (agent[field] != null) total[field] = plus(total[field], agent[field]);
    }
  }
  return total;
}

const cells = agent => [
  agent.name, agent.model, String(agent.steps), tokenCount(agent.first), tokenCount(agent.peak), tokenCount(agent.sent), cachedShare(agent),
  tokenCount(agent.output), String(agent.toolCalls), agent.start == null ? '' : String(minutes(agent.start, agent.end)),
];

// Rows of text cells as aligned lines: the first `textColumns` align left, the rest right.
export function alignedRows(rows, textColumns) {
  const widths = rows[0].map((_, column) => Math.max(...rows.map(row => row[column].length)));
  const pad = (cell, column) => (column < textColumns ? cell.padEnd(widths[column]) : cell.padStart(widths[column]));
  return rows.map(row => row.map(pad).join('  ').trimEnd());
}

export function formatStats(stats) {
  const { agents } = stats;
  const rows = [COLUMNS, ...agents.map(cells)];
  if (agents.length > 1) rows.push(cells(totalOf(agents)));
  const calls = Object.entries(stats.tools).sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name} ${count}`);
  return [
    ['session', stats.tool, stats.id, sessionPeriod(agents)].filter(Boolean).join('  '),
    ...alignedRows(rows, TEXT_COLUMNS),
    `tool calls  ${calls.join('  ') || 'none'}`,
    LEGEND,
    ...(stats.note ? [stats.note] : []),
  ].join('\n');
}
