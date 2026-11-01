import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadReleases } from '../src/fixtures.mjs';
import { JUDGES, judgeRequest, loadPrompts, pairwiseRequest } from '../src/graders/llm.mjs';
import { PROVIDERS, buildArtifact, compactDiff, diffWords, gradeCode, graderContext, modelVerdict, recordedFor, runJudges, stateFrom } from '../site/js/lib.js';

const root = new URL('..', import.meta.url).pathname;
const demo = JSON.parse(readFileSync(`${root}data/results/demo.json`, 'utf8'));
const summary = JSON.parse(readFileSync(`${root}data/results/summary.json`, 'utf8'));
const browserPrompts = { ...demo.prompts, params: demo.params };

test('site data is an exact copy of data/results', () => {
  for (const file of ['summary.json', 'demo.json']) {
    assert.ok(readFileSync(`${root}site/data/${file}`).equals(readFileSync(`${root}data/results/${file}`)), file);
  }
});

test('the browser runs the grader sources byte for byte', () => {
  for (const name of ['code', 'llm-core']) {
    assert.ok(readFileSync(`${root}site/js/${name}.js`).equals(readFileSync(`${root}src/graders/${name}.mjs`)), name);
  }
});

// If this fails, the workbench lies: it would show a different verdict than the one on record.
test('every recorded artifact of e1 and e4, rebuilt from demo.json like the page does, gets its recorded code verdicts', () => {
  let checked = 0;
  for (const item of [...demo.e1, ...demo.e4]) {
    const release = demo.releases.find((r) => r.id === item.release);
    const got = gradeCode(buildArtifact(stateFrom(item.artifact)), graderContext(release, demo.params));
    assert.equal(Object.keys(got).length, 7);
    for (const [grader, verdict] of Object.entries(got)) {
      const want = item.verdicts[grader];
      const at = `${item.release} ${item.variant} ${grader}`;
      assert.equal(verdict.pass, want.pass, at);
      assert.deepEqual(verdict.findings, want.findings ?? [], at);
      if (want.score != null) assert.equal(Number(verdict.score.toFixed(3)), want.score, at);
      checked++;
    }
  }
  assert.equal(checked, (83 + 24) * 7);
});

test('prompts rendered from demo.json are the frozen prompts', () => {
  const frozen = loadPrompts();
  for (const fixture of loadReleases()) {
    const release = demo.releases.find((r) => r.id === fixture.release.id);
    const ctx = { release, gold: release.gold };
    const notes = release.gold.notes_md.replace('#', '# ');
    for (const g of JUDGES) assert.equal(judgeRequest(g, notes, ctx, browserPrompts).prompt, judgeRequest(g, notes, fixture, frozen).prompt);
    for (const o of ['gold-first', 'candidate-first']) assert.equal(pairwiseRequest(o, notes, ctx, browserPrompts).prompt, pairwiseRequest(o, notes, fixture, frozen).prompt);
  }
});

test('the matrix has a cell for every grader and row the page shows', () => {
  for (const cells of Object.values(summary.matrix)) assert.equal(Object.keys(cells).length, 16);
  assert.equal(Object.keys(summary.matrix).length, 11);
});

const r1 = demo.releases[0];
const goldItem = demo.e1.find((x) => x.release === 'r1' && x.variant === 'gold');
const base = { recorded: goldItem, live: null, release: 'r1', notes: 'x', judgeModel: 'gpt-6.1-terra' };

test('a grader that throws on half-typed text becomes a finding', () => {
  const state = { ...stateFrom(goldItem.artifact), notes: `${r1.gold.notes_md}\n## ` };
  assert.match(gradeCode(buildArtifact(state), graderContext(r1, demo.params)).schema.findings[0], /abgebrochen/);
});

test('recorded verdicts need the exact text of this release and name their repetitions', () => {
  assert.equal(recordedFor(demo, 'r1', `${r1.gold.notes_md} `, 'gold'), null);
  assert.equal(recordedFor(demo, 'r2', r1.gold.notes_md, 'gold'), null);
  assert.equal(recordedFor(demo, 'r1', r1.gold.notes_md, 'lucky-path').variant, 'lucky-path');
  assert.equal(modelVerdict('pairwise', base).source, 'aufgezeichnet · gpt-6.1-terra · 3 Wiederholungen');
  const agent = demo.e4.find((x) => x.artifact.notes_md);
  assert.equal(modelVerdict('pairwise', { ...base, recorded: agent }).source, 'aufgezeichnet · gpt-6.1-terra · 1 Wiederholung');
});

test('model verdict states: unchecked, live, stale, and errors keep what is known', () => {
  const live = { release: 'r1', notes: 'x', model: 'm', results: { 'judge-ref': { pass: true, reason: 'ok' }, pairwise: { error: 'kaputt' } } };
  const none = { ...base, recorded: null };
  assert.equal(modelVerdict('judge-ref', none).state, 'unchecked');
  assert.equal(modelVerdict('judge-ref', { ...none, live }).source, 'live · m');
  assert.equal(modelVerdict('judge-ref', { ...none, live, notes: 'y' }).state, 'stale');
  assert.equal(modelVerdict('judge-ref', { ...none, live, release: 'r2' }).state, 'unchecked');
  assert.deepEqual(modelVerdict('pairwise', { ...none, live }), { state: 'unchecked', error: 'kaputt' });
  assert.equal(modelVerdict('pairwise', { ...none, live, notes: 'y' }).error, undefined);
  assert.equal(modelVerdict('pairwise', { ...base, live }).state, 'recorded');
});

const key = 'placeholder-not-a-key';
const verdictJson = JSON.stringify({ violations: [], reason: 'r', pass: true });
const pairJson = JSON.stringify({ reason: 'r', better: 'A' });
const okFetch = (wrap) => async (_, init) => {
  const body = JSON.parse(init.body);
  const pairwise = (body.response_format?.json_schema.schema ?? body.output_config.format.schema).properties.better;
  return { ok: true, json: async () => wrap(pairwise ? pairJson : verdictJson) };
};

test('both adapters send a schema-bound request and turn the answer into verdicts', async () => {
  const wraps = {
    openai: (content) => ({ choices: [{ finish_reason: 'stop', message: { content } }] }),
    anthropic: (text) => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }] }),
  };
  for (const provider of Object.keys(PROVIDERS)) {
    const calls = [];
    const inner = okFetch(wraps[provider]);
    const result = await runJudges({ provider, key, model: 'm' }, r1, 'text', browserPrompts, (url, init) => { calls.push({ url, init }); return inner(url, init); });
    assert.equal(calls.length, 5);
    assert.equal(calls[0].url, PROVIDERS[provider].url);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.model, 'm');
    assert.equal(body.messages[0].role, 'user');
    assert.ok(!calls[0].init.body.includes(key), 'key stays out of the body');
    assert.deepEqual(result.results['judge-ref'], JSON.parse(verdictJson));
    assert.equal(result.results.pairwise.order_flip, true); // A in both orders: once gold, once the candidate
  }
  const anthropic = JSON.parse((await new Promise((resolve) => { runJudges({ provider: 'anthropic', key, model: 'm' }, r1, 't', browserPrompts, async (_, init) => { resolve(init); throw new Error('stop'); }); })).body);
  assert.deepEqual(Object.keys(anthropic.output_config.format), ['type', 'schema']);
  assert.equal(anthropic.tool_choice, undefined);
});

test('errors name the cause in our own words and never echo the provider body', async () => {
  const echo = { ok: false, status: 401, json: async () => ({ error: { message: `Incorrect API key provided: ${key}` } }) };
  const run = (fetchFn) => runJudges({ provider: 'openai', key, model: 'm' }, r1, 't', browserPrompts, fetchFn);
  const denied = await run(async () => echo);
  assert.match(denied.results['judge-ref'].error, /Key ab \(401\)/);
  assert.ok(!JSON.stringify(denied).includes(key));
  assert.match((await run(async () => ({ ...echo, status: 429 }))).results.pairwise.error, /Rate-Limit/);
  assert.match((await run(async () => { throw new TypeError('Failed to fetch'); })).results['judge-blind'].error, /CORS/);
  assert.match((await run(async () => ({ ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{' } }] }) }))).results['judge-ref'].error, /Schema/);
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

test('compactDiff keeps the changes and context, a long unchanged stretch becomes a gap', () => {
  const words = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
  const parts = compactDiff(diffWords(words, words.replace('w20', 'neu')), 2);
  assert.deepEqual(parts.filter((p) => p.type !== 'same').map((p) => p.type), ['gap', 'add', 'del', 'gap']);
  assert.ok(sides(parts, 'add').includes('w19 neu w21'));
});
