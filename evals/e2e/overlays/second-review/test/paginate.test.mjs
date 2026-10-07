import { test } from 'node:test';
import assert from 'node:assert/strict';
import { items } from '../src/items.mjs';
import { paginate } from '../src/paginate.mjs';

test('paginate splits the items into pages of size, the last page holding the rest', () => {
  assert.deepEqual(paginate(items(7), 5), [[1, 2, 3, 4, 5], [6, 7]]);
});

test('paginate gives no pages for an empty list', () => {
  assert.deepEqual(paginate(items(0), 5), []);
});
