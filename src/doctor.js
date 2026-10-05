// Start context: what an agent session carries before it has read anything. Rule and memory
// files, the lists of skills, agents and tools, and what plugins and hooks add are sent again with
// every step of every agent, so this is the cheapest place to make a session lighter.
// Reads the session record found by sessions.js and reduces it to parts with a size and a source.
import { basename, dirname } from 'node:path';
import { jsonLines } from './sessions.js';
import { tokenCount } from './stats.js';

// The command that shows the same context in tokens, in each tool.
const CONTEXT_COMMANDS = { claude: '/context', codex: '/status', copilot: '/context' };
const SMALL_PART_CHARS = 512; // smaller parts are summed into "other"
const SOURCES_SHOWN = 6;
const UNGROUPED = '(none)';
const NOT_STARTED = 'This session has not made a request yet; its context is recorded with the first one.';

// ---------- The report being built ----------

const newReport = session => ({ tool: session.tool, id: session.id, firstRequest: null, parts: [], note: '' });

// A part's sources are either texts with a size or groups with a count: { label, amount }.
// `chars` is null for a part the record counts in tokens instead.
const newPart = (name, measure) => ({ name, chars: 0, tokens: null, count: null, measure, sources: [] });

// A part made of texts, each from a named source.
function sized(name, texts) {
  const part = newPart(name, 'size');
  for (const [label, text] of texts) {
    part.chars += text.length;
    part.sources.push({ label, amount: text.length });
  }
  return part;
}

// A part that is one list of names, grouped by where each name comes from.
function listed(name, names, text, groupOf) {
  const part = newPart(name, 'count');
  part.chars = text.length;
  part.count = names.length;
  const groups = new Map();
  for (const item of names) groups.set(groupOf(item), (groups.get(groupOf(item)) || 0) + 1);
  part.sources = [...groups].map(([label, amount]) => ({ label, amount }));
  return part;
}

// "plugin:skill" and "plugin:agent" belong to the plugin; "mcp__server__tool" to the server.
const pluginOf = name => (name.includes(':') ? name.slice(0, name.indexOf(':')) : UNGROUPED);
const serverOf = name => (name.match(/^mcp__(.+?)__/) || [])[1] || UNGROUPED;

// "memory/MEMORY.md": the last folder says which of several same-named files this is.
const shortPath = path => `${basename(dirname(path))}/${basename(path)}`;

// ---------- Claude Code ----------
// Before the first reply the record holds one "attachment" per block of context the session was
// given: the instruction files, the skill, agent and tool lists, server instructions, hook output.

function claudePart(attachment) {
  switch (attachment.type) {
    case 'instructions':
      return sized('rule and memory files', (attachment.files || []).map(file => [shortPath(file.path), file.content || '']));
    case 'skill_listing':
      return listed('skill list', attachment.names || [], attachment.content || '', pluginOf);
    case 'agent_listing_delta':
      return listed('agent list', attachment.addedTypes || [], (attachment.addedLines || []).join('\n'), pluginOf);
    case 'deferred_tools_delta':
      return listed('tool names (loaded on demand)', attachment.addedNames || [], (attachment.addedLines || []).join('\n'), serverOf);
    case 'mcp_instructions_delta':
      return sized('MCP server instructions', (attachment.addedNames || []).map((name, i) => [name, attachment.addedBlocks?.[i] || '']));
    case 'hook_additional_context':
      return sized('session-start hooks', [[attachment.hookName || 'hook', [attachment.content].flat().join('\n')]]);
    default:
      return null;
  }
}

function claudeStart(session) {
  const report = newReport(session);
  for (const record of jsonLines(session.source.path)) {
    if (record.type === 'attachment') {
      const part = claudePart(record.attachment || {});
      if (part) report.parts.push(part);
    }
    const usage = record.type === 'assistant' && record.message?.usage;
    if (!usage) continue;
    report.firstRequest = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
    break;
  }
  if (report.firstRequest == null) report.note = NOT_STARTED;
  return report;
}

// ---------- Codex ----------
// The session meta holds the base instructions. The messages before the first request hold the
// rest, one tagged block each: <skills_instructions>, <plugins_instructions>, the AGENTS.md text.

function codexBlockName(text) {
  if (text.startsWith('# AGENTS.md')) return 'AGENTS.md';
  const tag = (text.match(/^<([a-z_ ]+)>/) || [])[1];
  return tag ? tag.replace(/_/g, ' ') : null; // untagged text is the user's own request
}

function codexStart(session) {
  const report = newReport(session);
  const main = session.source.files.find(file => file.meta.thread_source !== 'subagent') || session.source.files[0];
  report.parts.push(sized('base instructions', [['codex', main.meta.base_instructions?.text || '']]));
  for (const record of main.records) {
    const payload = record.payload || {};
    if (record.type === 'response_item' && payload.type === 'message') {
      for (const block of payload.content || []) {
        const name = codexBlockName(block.text || '');
        if (name) report.parts.push(sized(name, [[payload.role, block.text]]));
      }
    }
    if (record.type !== 'event_msg' || payload.type !== 'token_count' || !payload.info) continue;
    report.firstRequest = payload.info.last_token_usage?.input_tokens ?? null;
    break;
  }
  if (report.firstRequest == null) report.note = NOT_STARTED;
  return report;
}

// ---------- Copilot CLI ----------
// The first system message holds the context as tagged blocks (<tools>, <custom_instruction>).
// A usage checkpoint, written later in the session, counts the tool definitions in tokens.

function copilotStart(session) {
  const report = newReport(session);
  const events = jsonLines(session.source.path);
  const system = events.find(event => event.type === 'system.message')?.data?.content || '';
  for (const [, tag, body] of system.matchAll(/<([a-z_]+)>(.*?)<\/\1>/gs)) report.parts.push(sized(tag.replace(/_/g, ' '), [['system', body]]));
  const checkpoint = events.find(event => event.type === 'session.usage_checkpoint')?.data?.promptCacheBreakState?.[0]?.models;
  const usage = checkpoint && Object.values(checkpoint)[0];
  if (usage?.tool_tokens == null) {
    report.note = 'Copilot counts its tool definitions at the first usage checkpoint; this session has not reached one.';
    return report;
  }
  report.parts.push({ ...newPart('tool definitions', 'count'), chars: null, tokens: usage.tool_tokens, count: usage.tool_count ?? null });
  return report;
}

const START_READERS = { claude: claudeStart, codex: codexStart, copilot: copilotStart };

// ---------- Tidying ----------

// Blocks with the same name become one part.
function mergedByName(parts) {
  const byName = new Map();
  for (const part of parts) {
    const known = byName.get(part.name);
    if (!known) {
      byName.set(part.name, part);
      continue;
    }
    known.chars += part.chars;
    known.sources.push(...part.sources);
  }
  return [...byName.values()];
}

// Largest first; parts too small to matter are summed into "other", which comes last.
function ranked(parts) {
  const other = newPart('other', 'size');
  const kept = [];
  for (const part of parts) {
    if (part.chars == null || part.chars >= SMALL_PART_CHARS) kept.push(part);
    else other.chars += part.chars;
  }
  kept.sort((a, b) => (b.chars ?? 0) - (a.chars ?? 0));
  return other.chars ? [...kept, other] : kept;
}

export function startContext(session) {
  const report = START_READERS[session.tool](session);
  report.parts = ranked(mergedByName(report.parts));
  for (const part of report.parts) part.sources.sort((a, b) => b.amount - a.amount);
  return report;
}

// ---------- Printing ----------

const kilobytes = chars => `${(chars / 1024).toFixed(chars < 10 * 1024 ? 1 : 0)} KB`;
const sizeOf = part => (part.chars == null ? `${tokenCount(part.tokens)} tokens` : kilobytes(part.chars));

// "213: marketing-skills 41, claude-seo 25, +9 more" for a list, "MEMORY.md 18 KB, AGENTS.md 11 KB"
// for texts. A part that is a single text says nothing its name and size have not said.
function sourcesOf(part) {
  if (part.measure === 'size' && part.sources.length < 2) return '';
  const amount = source => (part.measure === 'size' ? kilobytes(source.amount) : String(source.amount));
  const shown = part.sources.slice(0, SOURCES_SHOWN).map(source => `${source.label} ${amount(source)}`);
  const hidden = part.sources.length - shown.length;
  const list = shown.join(', ') + (hidden > 0 ? `, +${hidden} more` : '');
  return part.count == null ? list : [String(part.count), list].filter(Boolean).join(': ');
}

export function formatStartContext(report) {
  const rows = [['part', 'size', 'holds'], ...report.parts.map(part => [part.name, sizeOf(part), sourcesOf(part)])];
  const [nameWidth, sizeWidth] = [0, 1].map(column => Math.max(...rows.map(row => row[column].length)));
  return [
    `context at session start  ${report.tool}  ${report.id}`,
    ...(report.firstRequest == null ? [] : [`first request: ${tokenCount(report.firstRequest)} tokens`]),
    ...rows.map(([name, size, holds]) => `${name.padEnd(nameWidth)}  ${size.padStart(sizeWidth)}  ${holds}`.trimEnd()),
    `sizes are characters of text; ${CONTEXT_COMMANDS[report.tool]} shows this session's context in tokens`,
    ...(report.note ? [report.note] : []),
  ].join('\n');
}
