import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadReleases } from '../src/fixtures.mjs';
import { citedNumbers, similarity } from '../src/graders/code.mjs';
import { CONTROLS, MUTATIONS, applyVariant, artifactsFor, distractionPair, notApplicable } from '../src/mutate.mjs';

const fixtures = loadReleases();
const tools = (a) => a.transcript.map((c) => c.tool);
const lines = (s) => s.split('\n').filter(Boolean).sort();
const known = ({ release }) => new Set([...release.prs, ...release.issues].map((x) => x.number));

test('every release decides every mutation and control', () => {
  for (const f of fixtures) {
    for (const id of [...MUTATIONS, ...CONTROLS]) assert.ok(id in f.variants, `${f.release.id} ${id}`);
    for (const { reason } of notApplicable(f)) assert.ok(reason.length > 10);
  }
});

test('not applicable marks exactly the combinations without their preconditions', () => {
  for (const f of fixtures) {
    const na = (id) => Boolean(f.variants[id].na);
    assert.equal(na('missing-breaking'), f.cases.breaking_prs.length === 0, f.release.id);
    assert.equal(na('wrong-bump'), f.gold.plan.bump !== 'major', f.release.id);
    assert.equal(na('wrong-migration'), !f.gold.notes_md.includes('Migration:'), f.release.id);
    assert.equal(na('reverted-listed'), f.cases.reverted_prs.length === 0, f.release.id);
    assert.equal(na('embargo-leak'), !f.cases.embargo, f.release.id);
  }
});

test('every artifact keeps its four parts consistent', () => {
  for (const f of fixtures) {
    for (const { variant, artifact: a } of artifactsFor(f)) {
      const label = `${f.release.id} ${variant}`;
      assert.equal(a.notes_md.split('\n')[0], `# quaykit ${a.plan.version}`, label);
      assert.deepEqual(a.plan.sections.slice().sort(), [...a.notes_md.matchAll(/^## (.+)$/gm)].map((m) => m[1]).sort(), label);
      assert.doesNotMatch(a.notes_md, /\n{3}/, label);
      if (variant === 'false-success') continue;
      assert.deepEqual(a.sandbox, { published: true, version: a.plan.version, notes: a.notes_md }, label);
      const publish = a.transcript.find((c) => c.tool === 'publish_release');
      assert.deepEqual(publish.args, { version: a.plan.version, notes: a.notes_md }, label);
    }
  }
});

test('text mutations change the notes and leave the path alone', () => {
  for (const f of fixtures) {
    for (const { variant, kind, artifact: a } of artifactsFor(f)) {
      if (kind !== 'mutation' || ['false-success', 'lucky-path'].includes(variant)) continue;
      assert.notEqual(a.notes_md, f.gold.notes_md, `${f.release.id} ${variant}`);
      assert.deepEqual(tools(a), tools(f.gold), `${f.release.id} ${variant}`);
    }
  }
});

test('path mutations and extra-diligent keep the notes', () => {
  for (const f of fixtures) {
    const a = Object.fromEntries(artifactsFor(f).map((x) => [x.variant, x.artifact]));
    assert.equal(a['false-success'].notes_md, f.gold.notes_md);
    assert.ok(!tools(a['false-success']).includes('publish_release'));
    assert.equal(a['false-success'].sandbox.published, false);
    assert.equal(a['lucky-path'].notes_md, f.gold.notes_md);
    assert.ok(!tools(a['lucky-path']).includes('get_diff'));
    assert.equal(a['lucky-path'].sandbox.published, true);
    assert.equal(a['extra-diligent'].notes_md, f.gold.notes_md);
    assert.ok(tools(a['extra-diligent']).includes('get_issue'));
    const turnOf = (tool) => a['extra-diligent'].transcript.find((c) => c.tool === tool).turn;
    assert.ok(turnOf('get_issue') < turnOf('publish_release'));
    assert.deepEqual(a.gold, f.gold);
  }
});

test('controls change form only', () => {
  for (const f of fixtures) {
    const a = Object.fromEntries(artifactsFor(f).map((x) => [x.variant, x.artifact]));
    assert.deepEqual(lines(a.reordered.notes_md), lines(f.gold.notes_md));
    assert.notDeepEqual(a.reordered.plan.sections, f.gold.plan.sections);
    assert.notEqual(a.paraphrase.notes_md, f.gold.notes_md);
    assert.deepEqual(citedNumbers(a.paraphrase.notes_md).sort(), citedNumbers(f.gold.notes_md).sort());
    assert.deepEqual(a.paraphrase.plan, f.gold.plan);
    assert.ok(similarity(a.paraphrase.notes_md, f.gold.notes_md) < 0.95, f.release.id);
  }
});

test('each mutation does what its name says', () => {
  for (const f of fixtures) {
    const a = Object.fromEntries(artifactsFor(f).map((x) => [x.variant, x.artifact]));
    const cited = (x) => citedNumbers(x.notes_md);
    const ids = known(f);
    assert.deepEqual(cited(a['hype-tone']).sort(), cited(f.gold).sort(), f.release.id);
    assert.equal(cited(a['ghost-pr']).filter((n) => !ids.has(n)).length, 1, f.release.id);
    assert.ok(a['useless-true'].notes_md.length < f.gold.notes_md.length, f.release.id);
    if (a['wrong-bump']) assert.equal(a['wrong-bump'].plan.bump, 'minor');
    if (a['missing-breaking']) assert.ok(f.cases.breaking_prs.some((n) => !cited(a['missing-breaking']).includes(n)), f.release.id);
    if (a['reverted-listed']) assert.ok(f.cases.reverted_prs.some((n) => cited(a['reverted-listed']).includes(n)), f.release.id);
    if (a['wrong-migration']) assert.ok(a['wrong-migration'].notes_md.includes('Migration:'));
  }
});

test('distraction pair: same references, other wording', () => {
  for (const f of fixtures) {
    const [neutral, confident] = distractionPair(f);
    assert.notEqual(neutral.artifact.notes_md, confident.artifact.notes_md);
    assert.deepEqual(citedNumbers(neutral.artifact.notes_md), citedNumbers(confident.artifact.notes_md));
    assert.equal(neutral.artifact.notes_md, applyVariant(f, f.e3.base, f.variants[f.e3.base]).notes_md);
    assert.equal(confident.artifact.sandbox.notes, confident.artifact.notes_md);
  }
});

test('an edit that does not match exactly once is an error', () => {
  const f = fixtures[0];
  assert.throws(() => applyVariant(f, 'x', { edits: [{ find: 'does not occur', replace: '' }] }), /exactly once/);
});
