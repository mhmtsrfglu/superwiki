import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const cli = new URL('../skills/sw-init/assets/sw.mjs', import.meta.url).pathname;

// A home folder for the tools' session records and a project that the sessions ran in.
function setup() {
  const home = mkdtempSync(join(tmpdir(), 'sw-doctor-home-'));
  const root = mkdtempSync(join(tmpdir(), 'sw-doctor-'));
  mkdirSync(join(root, 'docs'));
  return { home, root };
}

function doctor({ home, root }, args = []) {
  // The tests may themselves run inside an agent session; its variables must not leak in.
  const { CLAUDE_CODE_SESSION_ID, CLAUDE_CONFIG_DIR, CODEX_HOME, ...clean } = process.env;
  return spawnSync('node', [cli, 'doctor', '--docs', join(root, 'docs'), ...args], { encoding: 'utf8', env: { ...clean, HOME: home } });
}

function writeLines(path, records) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, records.map(record => JSON.stringify(record)).join('\n') + '\n');
}

const partsOf = result => Object.fromEntries(JSON.parse(result.stdout).parts.map(part => [part.name, part]));
const text = size => 'x'.repeat(size);

// ---------- Claude Code ----------

const attachment = body => ({ type: 'attachment', attachment: body });
const claudePath = ({ home, root }, id) => join(home, '.claude/projects', root.replace(/[^A-Za-z0-9]/g, '-'), `${id}.jsonl`);

test('claude: the context blocks before the first reply, each with its sources', () => {
  const dirs = setup();
  writeLines(claudePath(dirs, 's1'), [
    attachment({ type: 'instructions', files: [{ path: '/p/app/AGENTS.md', content: text(2048) }, { path: '/h/memory/MEMORY.md', content: text(4096) }] }),
    attachment({ type: 'skill_listing', content: text(3072), names: ['sw-plan', 'ads:audit', 'ads:copy', 'seo:audit'] }),
    attachment({ type: 'agent_listing_delta', addedTypes: ['sw-planner', 'ads:writer'], addedLines: [text(600), text(600)] }),
    attachment({ type: 'deferred_tools_delta', addedNames: ['mcp__drive__read', 'mcp__drive__write', 'WebFetch'], addedLines: [text(400), text(400), text(400)] }),
    attachment({ type: 'mcp_instructions_delta', addedNames: ['drive', 'chrome'], addedBlocks: [text(1024), text(512)] }),
    attachment({ type: 'hook_additional_context', hookName: 'SessionStart', content: [text(1024)] }),
    attachment({ type: 'date', date: '2026-10-05' }),
    { type: 'assistant', message: { id: 'm1', usage: { input_tokens: 2000, cache_creation_input_tokens: 30000, cache_read_input_tokens: 8000 } } },
    // Sent again later in the session: not part of what it started with.
    attachment({ type: 'skill_listing', content: text(9999), names: ['later'] }),
  ]);

  const result = doctor(dirs, ['--json']);
  const report = JSON.parse(result.stdout);
  assert.equal(report.firstRequest, 40000);
  assert.deepEqual(report.parts.map(part => part.name), [
    'rule and memory files', 'skill list', 'MCP server instructions', 'tool names (loaded on demand)', 'agent list', 'session-start hooks',
  ]);
  const parts = partsOf(result);
  assert.deepEqual(parts['rule and memory files'].sources, [{ label: 'memory/MEMORY.md', amount: 4096 }, { label: 'app/AGENTS.md', amount: 2048 }]);
  assert.deepEqual(parts['skill list'].sources, [{ label: 'ads', amount: 2 }, { label: '(none)', amount: 1 }, { label: 'seo', amount: 1 }]);
  assert.deepEqual(parts['tool names (loaded on demand)'].sources, [{ label: 'drive', amount: 2 }, { label: '(none)', amount: 1 }]);

  const out = doctor(dirs).stdout;
  assert.match(out, /^context at session start {2}claude {2}s1\nfirst request: 40k tokens\npart +size +holds\n/);
  assert.match(out, /\nrule and memory files +6\.0 KB {2}memory\/MEMORY\.md 4\.0 KB, app\/AGENTS\.md 2\.0 KB\n/);
  assert.match(out, /\nskill list +3\.0 KB {2}4: ads 2, \(none\) 1, seo 1\n/);
  assert.match(out, /\nsession-start hooks +1\.0 KB\n/, 'a part that is one text lists no sources');
  assert.match(out, /\nsizes are characters of text; \/context shows this session's context in tokens\n$/);
});

test('claude: a session that has not made a request says so', () => {
  const dirs = setup();
  writeLines(claudePath(dirs, 's1'), [attachment({ type: 'hook_additional_context', hookName: 'SessionStart', content: [text(1024)] })]);
  const out = doctor(dirs).stdout;
  assert.doesNotMatch(out, /first request/);
  assert.match(out, /\nThis session has not made a request yet; its context is recorded with the first one\.\n$/);
});

// ---------- Codex ----------

test('codex: base instructions and the tagged blocks before the first request', () => {
  const dirs = setup();
  const message = (role, ...texts) => ({ type: 'response_item', payload: { type: 'message', role, content: texts.map(body => ({ type: 'input_text', text: body })) } });
  writeLines(join(dirs.home, '.codex/sessions/2026/10/05/rollout-main.jsonl'), [
    { type: 'session_meta', payload: { id: 's1', session_id: 's1', cwd: dirs.root, thread_source: 'user', base_instructions: { text: text(8192) } } },
    message('developer', `<skills_instructions>${text(4096)}`, `<permissions instructions>${text(100)}`),
    message('user', `# AGENTS.md instructions${text(2048)}`, 'please plan task T-01'),
    { type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 16100 }, last_token_usage: { input_tokens: 16000 } } } },
    message('user', `<environment_context>${text(4096)}`),
  ]);

  const report = JSON.parse(doctor(dirs, ['--json']).stdout);
  assert.equal(report.firstRequest, 16000);
  assert.deepEqual(report.parts.map(part => part.name), ['base instructions', 'skills instructions', 'AGENTS.md', 'other']);
  assert.match(doctor(dirs).stdout, /\nbase instructions +8\.0 KB\nskills instructions +4\.0 KB\nAGENTS\.md +2\.0 KB\nother +0\.1 KB\nsizes are characters of text; \/status shows/);
});

// ---------- Copilot CLI ----------

function copilotSession({ home, root }, events) {
  const dir = join(home, '.copilot/session-state/c1');
  writeLines(join(dir, 'events.jsonl'), [
    { type: 'system.message', data: { content: `<tools>${text(4096)}</tools>\n<custom_instruction>${text(1024)}</custom_instruction>\n<custom_instruction>${text(2048)}</custom_instruction>` } },
    ...events,
  ]);
  writeFileSync(join(dir, 'workspace.yaml'), `id: c1\ncwd: ${root}\n`);
}

test('copilot: tagged blocks of the system message, and tool definitions once a checkpoint has counted them', () => {
  const early = setup();
  copilotSession(early, []);
  assert.match(doctor(early).stdout, /\nCopilot counts its tool definitions at the first usage checkpoint; this session has not reached one\.\n$/);

  const later = setup();
  copilotSession(later, [
    { type: 'session.usage_checkpoint', data: { promptCacheBreakState: [{ models: { 'gpt-6': { tool_count: 25, tool_tokens: 8716 } } }] } },
  ]);
  const out = doctor(later).stdout;
  assert.match(out, /\ntools +4\.0 KB\ncustom instruction +3\.0 KB {2}system 2\.0 KB, system 1\.0 KB\ntool definitions +9k tokens {2}25\nsizes are characters/);
});

// ---------- Errors ----------

test('errors say what is missing', () => {
  const dirs = setup();
  const none = doctor(dirs);
  assert.equal(none.status, 1);
  assert.match(none.stderr, /^no agent session record found for /);
  const badTool = doctor(dirs, ['--tool', 'cursor']);
  assert.equal(badTool.status, 2);
  assert.match(badTool.stderr, /^usage: sw doctor \[--session <id>\] \[--tool claude\|codex\|copilot\]/);
});
