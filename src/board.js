// The task board: the open tasks as a section of index.md, so a person can follow the work in the
// vault itself, without the viewer. It is a view, written from the task files by `sw.mjs board`
// and never edited by hand; a task's status still lives only in its own frontmatter.
// Open tasks get a line each. Finished ones are listed by id only, so the section stays small as
// a project grows: index.md is the one file every session reads.
import { summary, taskOf, tasksIn } from './core.js';

const BOARD_START = '<!-- sw:board:start (written by `sw.mjs board`; do not edit) -->';
const BOARD_END = '<!-- sw:board:end -->';
const BOARD_BLOCK = /<!-- sw:board:start[^\n]*-->\n[\s\S]*?<!-- sw:board:end -->/;
const REFRESH = 'run `node docs/.sw/sw.mjs board`';

// Sections in reading order: what is being worked on, what can start, what waits.
const OPEN_STATES = [['progress', 'In progress'], ['ready', 'Ready'], ['blocked', 'Blocked']];

function openLine(vault, task) {
  // A dependency that does not exist is lint's finding, not something a task waits on.
  const waiting = task.openDeps.filter(id => taskOf(vault, id));
  return [
    `- [[${task.id}]] ${task.title}`,
    ...(task.milestone ? [task.milestone] : []),
    ...(task.state === 'blocked' && waiting.length ? [`waits on ${waiting.join(', ')}`] : []),
  ].join(' · ');
}

// The board for this vault, markers included.
export function taskBoard(vault) {
  const { total } = summary(vault);
  const counts = [
    `ready ${total.ready}`, `in progress ${total.progress}`, `blocked ${total.blocked}`, `done ${total.done}`,
    ...(total.cancelled ? [`cancelled ${total.cancelled}`] : []),
  ];
  const sections = OPEN_STATES
    .map(([state, heading]) => [heading, tasksIn(vault, state)])
    .filter(([, tasks]) => tasks.length)
    .map(([heading, tasks]) => `**${heading}**\n\n${tasks.map(task => openLine(vault, task)).join('\n')}`);
  // Finished tasks are looked up, not worked through: by id, not in running order.
  const done = tasksIn(vault, 'done').map(task => task.id).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map(id => `[[${id}]]`);
  const paragraphs = [
    '## Tasks',
    total.total ? counts.join(' · ') : 'No tasks yet.',
    ...sections,
    ...(done.length ? [`**Done (${done.length})** ${done.join(' ')}`] : []),
  ];
  return `${BOARD_START}\n${paragraphs.join('\n\n')}\n${BOARD_END}`;
}

export const boardIn = indexText => (String(indexText).match(BOARD_BLOCK) || [null])[0];

// index.md with this board in it: in place of the one it has, otherwise right under the title.
export function indexWithBoard(indexText, board) {
  const text = String(indexText);
  if (BOARD_BLOCK.test(text)) return text.replace(BOARD_BLOCK, () => board);
  const title = text.match(/^# .*\n?/);
  if (!title) return `${board}\n\n${text}`;
  const rest = text.slice(title[0].length).replace(/^\n+/, '');
  return `${title[0].trimEnd()}\n\n${board}\n${rest ? `\n${rest}` : ''}`;
}

// A lint finding when index.md does not show the tasks as they are now, else null.
export function boardFinding(vault) {
  if (!vault.index) return null; // a missing index is reported on its own
  const current = boardIn(vault.index.body);
  if (!current && !vault.tasks.size) return null; // a vault without tasks needs no board
  if (current === taskBoard(vault)) return null;
  return current
    ? { level: 'warn', code: 'stale-board', path: 'index.md', message: `the task list is out of date; ${REFRESH}` }
    : { level: 'warn', code: 'missing-board', path: 'index.md', message: `the tasks are not listed; ${REFRESH}` };
}
