import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changedTokens, hitsTarget, orderAgreement, uniqueByText, wilson } from '../src/report.mjs';

test('changed tokens are the symmetric difference, so a removed name counts too', () => {
  const changed = changedTokens('set timeoutMs now', 'set timeout now');
  assert.deepEqual([...changed].sort(), ['timeout', 'timeoutms']);
});

test('a hit needs the right criterion, the word check also a changed token in the evidence', () => {
  const changed = new Set(['#319']);
  const row = { violations: [{ criterion: 'R2', evidence: 'Die Notes nennen #319.' }, { criterion: 'R7', evidence: 'Ton' }] };
  assert.deepEqual(hitsTarget(row, ['R2'], changed), { criterion: true, word: true });
  assert.deepEqual(hitsTarget(row, ['R7'], changed), { criterion: true, word: false });
  assert.deepEqual(hitsTarget(row, ['R3'], changed), { criterion: false, word: false });
});

test('unique text keeps the control when a mutation shares its text', () => {
  const items = [{ grader: 'g', release: 'r', variant: 'false-success', kind: 'mutation' }, { grader: 'g', release: 'r', variant: 'gold', kind: 'control' }, { grader: 'g', release: 'r', variant: 'hype', kind: 'mutation' }];
  const kept = uniqueByText(items, (v) => (v.variant === 'hype' ? 'other' : 'same'));
  assert.deepEqual(kept.map((v) => v.variant), ['gold', 'hype']);
});

test('order agreement separates consistent answers, one-sided equal and flips', () => {
  const row = (g, c, flip = false) => ({ reason: `Gold zuerst: ${g}, x | Kandidat zuerst: ${c}, y`, order_flip: flip });
  assert.deepEqual(orderAgreement([row('A', 'B'), row('equal', 'equal'), row('A', 'equal'), row('A', 'A', true)]), { total: 4, consistent: 2, inconsistent: 2, one_equal: 1, flips: 1 });
});

test('Wilson interval stays within 0 to 1 and widens with small n', () => {
  const round = ({ low, high }) => [low.toFixed(2), high.toFixed(2)];
  assert.deepEqual(round(wilson(3, 3)), ['0.44', '1.00']);
  assert.deepEqual(round(wilson(1, 3)), ['0.06', '0.79']);
  assert.deepEqual(round(wilson(0, 18)), ['0.00', '0.18']);
});
