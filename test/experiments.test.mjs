import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { matrix, ratesByGrader, verdicts } from '../src/aggregate.mjs';
import { ModelError } from '../src/engine/call-model.mjs';
import { createSession } from '../src/engine/session.mjs';
import { codeRows, gradeLlm, llmRequests } from '../src/experiments.mjs';
import { loadReleases } from '../src/fixtures.mjs';
import { LLM_GRADERS, loadPrompts } from '../src/graders/llm.mjs';
import { artifactsFor } from '../src/mutate.mjs';

const prompts = loadPrompts();
const fixture = loadReleases()[0];
const items = artifactsFor(fixture);
const item = (variant) => items.find((i) => i.variant === variant);

// Fake judge: answers by schema, so the test exercises plumbing and says nothing about real judges.
function fakeModel({ schema }) {
  const parsed = schema.properties.better ? { reason: 'r', better: 'equal' } : { violations: [], reason: 'r', pass: true };
  return Promise.resolve({ text: JSON.stringify(parsed), parsed, usage: null, tainted: false, events: [] });
}
const session = (callModel = fakeModel) => createSession({ rawDir: mkdtempSync(join(tmpdir(), 'gl-')), callModel });

test('one repetition costs five calls: three judges and both pairwise orders', () => {
  assert.equal(llmRequests(item('paraphrase'), fixture, prompts, 1).length, 5);
  assert.equal(llmRequests(item('paraphrase'), fixture, prompts, 3).length, 15);
});

test('variants with gold notes share their judge calls with gold', () => {
  const keys = (v) => llmRequests(item(v), fixture, prompts, 1).map((r) => r.prompt);
  assert.deepEqual(keys('false-success'), keys('gold'));
  assert.deepEqual(keys('lucky-path'), keys('gold'));
  assert.deepEqual(keys('extra-diligent'), keys('gold'));
});

test('grading yields one row per grader and repetition and aggregates cleanly', async () => {
  const s = session();
  const chosen = [item('paraphrase'), item('ghost-pr')];
  const rows = (await Promise.all(chosen.map((i) => gradeLlm(i, fixture, prompts, 3, s, 'e1')))).flat();
  assert.equal(rows.length, 2 * LLM_GRADERS.length * 3);
  assert.ok(rows.every((r) => r.model === prompts.params.models.judge && r.prompt_version === 'v1' && r.raw));
  const all = [...rows, ...chosen.flatMap((i) => codeRows(i, fixture, prompts, 'e1'))];
  const v = verdicts(all);
  assert.equal(v.length, 2 * (LLM_GRADERS.length + 7));
  assert.equal(matrix(v).pairwise['ghost-pr'].total, 1);
  assert.equal(ratesByGrader(v)['judge-ref'].tpr, 1);
  assert.equal(s.summary().made, 2 * 15);
});

test('a failed call leaves a gap instead of a made-up verdict', async () => {
  let n = 0;
  const s = session((call) => (++n === 1 ? Promise.reject(new ModelError('boom')) : fakeModel(call)));
  const rows = await gradeLlm(item('paraphrase'), fixture, prompts, 1, s, 'e1');
  assert.equal(rows.length, LLM_GRADERS.length - 1);
  assert.equal(s.summary().failed, 1);
});
