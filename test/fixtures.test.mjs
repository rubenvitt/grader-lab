import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { emit } from '../src/build-fixtures.mjs';
import { loadReleases, releaseIds } from '../src/fixtures.mjs';
import { CODE_GRADERS, citedNumbers, revertState } from '../src/graders/code.mjs';
import { loadPrompts } from '../src/graders/llm.mjs';

const fixtures = loadReleases();
const { params } = loadPrompts();

test('six releases with 6 to 10 PRs and at least one issue', () => {
  assert.equal(fixtures.length, 6);
  for (const { release } of fixtures) {
    assert.ok(release.prs.length >= 6 && release.prs.length <= 10, release.id);
    assert.ok(release.issues.length >= 1, release.id);
  }
});

test('every case kind occurs in at least two releases', () => {
  for (const kind of ['hidden-breaking', 'feature-revert', 'embargo', 'internal', 'migration', 'deprecation']) {
    assert.ok(fixtures.filter((f) => f.cases.kinds.includes(kind)).length >= 2, kind);
  }
});

test('JSON fixtures are in sync with their sources', async () => {
  for (const id of releaseIds()) {
    const { default: source } = await import(`../fixtures/src/${id}.mjs`);
    const dir = mkdtempSync(join(tmpdir(), 'gl-'));
    emit(source, dir);
    for (const f of ['release', 'gold', 'cases', 'variants']) {
      const committed = readFileSync(new URL(`../fixtures/releases/${id}/${f}.json`, import.meta.url), 'utf8');
      assert.equal(readFileSync(join(dir, `${f}.json`), 'utf8'), committed, `${id}/${f}`);
    }
  }
});

test('PR and issue numbers are distinct per release', () => {
  for (const { release } of fixtures) {
    const all = [...release.prs, ...release.issues].map((x) => x.number);
    assert.equal(new Set(all).size, all.length, release.id);
  }
});

test('annotations agree with the fixture data', () => {
  for (const { release, cases, gold } of fixtures) {
    assert.deepEqual([...revertState(release).reverted].sort(), [...cases.reverted_prs].sort(), release.id);
    const cited = citedNumbers(gold.notes_md);
    for (const n of cases.breaking_prs) assert.ok(cited.includes(n), `${release.id} #${n}`);
    for (const n of [...cases.internal_prs, ...cases.reverted_prs]) assert.ok(!cited.includes(n), `${release.id} #${n}`);
    if (cases.embargo) assert.ok(release.prs.find((p) => p.number === cases.embargo.pr).labels.includes('embargo'));
    if (cases.kinds.includes('hidden-breaking')) {
      assert.ok(cases.breaking_prs.some((n) => /^(chore|build)/.test(release.prs.find((p) => p.number === n).title)), release.id);
    }
  }
});

test('gold passes every code grader', () => {
  for (const { release, gold, cases } of fixtures) {
    for (const [name, grader] of Object.entries(CODE_GRADERS)) {
      const { pass, findings } = grader(gold, { release, gold, cases, params });
      assert.ok(pass, `${release.id} ${name}: ${findings}`);
    }
  }
});
