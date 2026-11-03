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

test('odd/even selection uses one-based current order and includes last odd page', async () => {
  const { paritySelection } = await import('../lib/pdf/selection.ts');
  assert.deepEqual(paritySelection(7, 'odd'), [1, 3, 5, 7]);
  assert.deepEqual(paritySelection(7, 'even'), [2, 4, 6]);
  assert.deepEqual(paritySelection(0, 'odd'), []);
  assert.equal(paritySelection(600, 'even').length, 300);
});

test('text search filters matching pages case-insensitively', () => {
  const pages = [
    { id: '1', text: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS' },
    { id: '2', text: 'Página em branco' },
    { id: '3', text: 'Assinatura das partes no contrato' },
  ];
  const query = 'contrato';
  const matches = pages.filter((p) =>
    p.text.toLowerCase().includes(query.toLowerCase()),
  );
  assert.deepEqual(
    matches.map((p) => p.id),
    ['1', '3'],
  );
});
