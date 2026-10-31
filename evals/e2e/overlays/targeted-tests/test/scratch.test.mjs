// Leftover from a spike before T-02 started: not committed, not part of any task.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('scratch: an item is a number', () => {
  assert.equal(typeof 1, 'number');
});

test('scratch: an empty list has no items', () => {
  assert.equal([].length, 0);
});

test('scratch: a header is a string', () => {
  assert.equal(typeof 'item', 'string');
});
