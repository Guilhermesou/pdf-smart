import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePageSelection,
  formatPageSelection,
} from '../lib/pdf/selection.ts';
test('accepts numbers, ranges, duplicates and typographic dashes', () => {
  assert.deepEqual(parsePageSelection('1, 3, 5–8; 7', 10), [1, 3, 5, 6, 7, 8]);
  assert.equal(formatPageSelection([8, 1, 7, 3, 6, 5, 7]), '1, 3, 5–8');
});
test('rejects invalid or out-of-range selections atomically', () => {
  for (const input of [
    '',
    '0',
    '3-1',
    '1, 11',
    '-2',
    '1,,2',
    '1-3x',
    '1.5',
    '99999999999999999',
  ])
    assert.throws(() => parsePageSelection(input, 10));
});
