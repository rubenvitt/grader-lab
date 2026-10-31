import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flakiness, matrix, rates, ratesByGrader, roganGladen, verdicts } from '../src/aggregate.mjs';

const row = (variant, kind, pass, rep = 1, grader = 'g', release = 'r1') => ({ release, variant, kind, grader, rep, pass });

test('verdict is the majority of the repetitions', () => {
  const [v] = verdicts([row('a', 'mutation', true, 1), row('a', 'mutation', false, 2), row('a', 'mutation', false, 3)]);
  assert.deepEqual([v.pass, v.passes, v.reps, v.unanimous], [false, 1, 3, false]);
  assert.equal(verdicts([row('a', 'mutation', true, 0)])[0].unanimous, true);
});

test('TPR is the pass share on clean cases, TNR the fail share on faulty cases', () => {
  const items = [
    { kind: 'control', pass: true }, { kind: 'control', pass: true }, { kind: 'control', pass: false }, { kind: 'control', pass: true },
    { kind: 'mutation', pass: false }, { kind: 'mutation', pass: true },
    { kind: 'agent', pass: false },
  ];
  assert.deepEqual(rates(items), { tpr: 0.75, tnr: 0.5, clean: 4, faulty: 2 });
  assert.deepEqual(rates([]), { tpr: null, tnr: null, clean: 0, faulty: 0 });
});

test('rates are grouped per grader', () => {
  const items = [{ grader: 'a', kind: 'control', pass: true }, { grader: 'b', kind: 'control', pass: false }];
  const out = ratesByGrader(items);
  assert.equal(out.a.tpr, 1);
  assert.equal(out.b.tpr, 0);
});

test('matrix counts findings per grader and variant', () => {
  const items = verdicts([row('m', 'mutation', false, 0, 'g', 'r1'), row('m', 'mutation', true, 0, 'g', 'r2')]);
  assert.deepEqual(matrix(items).g.m, { found: 1, total: 2, rate: 0.5 });
});

test('flakiness counts disagreeing cases among repeated graders only', () => {
  const items = verdicts([
    row('a', 'mutation', true, 1), row('a', 'mutation', false, 2), row('a', 'mutation', true, 3),
    row('b', 'mutation', true, 1), row('b', 'mutation', true, 2), row('b', 'mutation', true, 3),
    row('a', 'mutation', true, 0, 'code'),
  ]);
  assert.deepEqual(flakiness(items), { g: { disagreeing: 1, total: 2, rate: 0.5 } });
});

test('Rogan-Gladen correction with clamp and guard', () => {
  assert.ok(Math.abs(roganGladen(0.8, 0.9, 0.8) - (0.8 + 0.8 - 1) / 0.7) < 1e-12);
  assert.equal(roganGladen(1, 0.9, 0.95), 1);
  assert.equal(roganGladen(0, 0.9, 0.5), 0);
  assert.equal(roganGladen(0.5, 0.5, 0.5), null);
  assert.equal(roganGladen(0.5, 0.2, 0.3), null);
});
