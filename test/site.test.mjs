import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { roganGladen as reportFormula } from '../src/aggregate.mjs';
import { diffWords, renderMarkdown, roganGladen } from '../site/js/lib.js';

const root = new URL('..', import.meta.url).pathname;

test('site data is an exact copy of data/results', () => {
  for (const file of ['summary.json', 'demo.json']) {
    assert.ok(readFileSync(`${root}site/data/${file}`).equals(readFileSync(`${root}data/results/${file}`)), file);
  }
});

test('roganGladen in the demo equals the report, including clamping and undefined cases', () => {
  for (const observed of [0, 0.08, 0.5, 0.79, 1]) for (const tpr of [0, 0.5, 1]) for (const tnr of [0, 0.41, 0.8, 1]) {
    assert.equal(roganGladen(observed, tpr, tnr), reportFormula(observed, tpr, tnr));
  }
  assert.equal(roganGladen(0.5, 0, 1), null);
});

const sides = (parts, keep) => parts.filter((p) => p.type === 'same' || p.type === keep).map((p) => p.text).join('');

test('diffWords marks the changed word and reproduces both texts', () => {
  const [a, b] = ['pass `removeOnComplete: false`\nwhen you start', 'pass `keepCompleted: true`\nwhen you start'];
  const parts = diffWords(a, b);
  assert.equal(sides(parts, 'del'), a);
  assert.equal(sides(parts, 'add'), b);
  assert.deepEqual(parts.filter((p) => p.type === 'del').map((p) => p.text), ['`removeOnComplete:', 'false`']);
});

test('diffWords on identical and empty texts', () => {
  assert.deepEqual(diffWords('a b', 'a b'), [{ type: 'same', text: 'a b' }]);
  assert.equal(sides(diffWords('a b', ''), 'del'), 'a b');
  assert.equal(sides(diffWords('', 'a b'), 'add'), 'a b');
});

test('renderMarkdown escapes HTML, also inside code', () => {
  const html = renderMarkdown('# <b>x</b>\n\n- `<script>` & co\n  Migration: "a"');
  assert.ok(!html.includes('<script>') && !html.includes('<b>'));
  assert.ok(html.includes('<code>&lt;script&gt;</code> &amp; co<br>Migration: &quot;a&quot;'));
});

test('renderMarkdown groups list items and closes the list before a heading', () => {
  assert.equal(renderMarkdown('## A\n\n- one\n- two\n\n## B\ntext'), '<p class="md-h2">A</p><ul><li>one</li><li>two</li></ul><p class="md-h2">B</p><p>text</p>');
});
