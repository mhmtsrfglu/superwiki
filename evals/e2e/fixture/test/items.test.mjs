import { test } from 'node:test';
import assert from 'node:assert/strict';
import { items } from '../src/items.mjs';

test('items(n) lists 1 to n', () => {
  assert.deepEqual(items(3), [1, 2, 3]);
  assert.deepEqual(items(0), []);
});
