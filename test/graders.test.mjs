import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CODE_GRADERS, bumpSignal, citedNumbers, functional, nextVersion, prRefs, refSimilarity, revertState, schema, semverLabels, similarity, trajectory, wording } from '../src/graders/code.mjs';
import { loadReleases, loadToy } from '../src/fixtures.mjs';
import { JUDGES, judgeRequest, loadPrompts, pairwiseRequest, pairwiseVerdict, renderSources } from '../src/graders/llm.mjs';

const prompts = loadPrompts();
const { params } = prompts;
const pr = (number, title, labels = [], body = '', merged_at = `2026-01-${String(number % 28 + 1).padStart(2, '0')}`) => ({ number, title, labels, body, merged_at, diff: '' });
const release = (prs, issues = []) => ({ id: 't', package: 'quaykit', previous_version: '2.3.2', prs, issues });
const ctx = (r, extra = {}) => ({ release: r, params, cases: {}, gold: { notes_md: 'x' }, ...extra });
const notes = (version, body) => `# quaykit ${version}\n\nSummary sentence.\n\n${body}`;
const artifact = (over = {}) => ({
  notes_md: notes('2.4.0', '## Features\n\n- Adds a thing (#1).'),
  plan: { bump: 'minor', version: '2.4.0', sections: ['Features'] },
  transcript: [], sandbox: { published: true, version: '2.4.0', notes: 'n' }, ...over,
});

test('nextVersion', () => {
  assert.equal(nextVersion('2.3.2', 'major'), '3.0.0');
  assert.equal(nextVersion('2.3.2', 'minor'), '2.4.0');
  assert.equal(nextVersion('2.3.2', 'patch'), '2.3.3');
});

test('revert detection: title, body, follow-ups, revert of a revert, reland', () => {
  const a = pr(1, 'feat: a');
  const fix = pr(2, 'fix: a again');
  const revert = pr(3, 'Revert "feat: a"', ['revert'], 'This reverts #1 together with the follow-up #2. See #9.');
  assert.deepEqual([...revertState(release([a, fix, revert])).reverted].sort(), [1, 2]);

  const byBody = pr(4, 'chore: back out', [], 'Reverts #1.');
  assert.deepEqual([...revertState(release([a, byBody])).reverted], [1]);

  const again = pr(5, 'Revert "Revert "feat: a""', [], 'Reverts #4.');
  const { reverted } = revertState(release([a, byBody, again]));
  assert.ok(!reverted.has(1) && reverted.has(4));

  const reland = pr(6, 'feat: a (reland)', [], 'Second attempt at #1.');
  assert.deepEqual([...revertState(release([a, pr(2, 'Revert "feat: a"'), reland])).reverted], [1]);
});

test('pr-refs: existence, issues, reverted, revert PRs, links', () => {
  const r = release([pr(1, 'feat: a'), pr(2, 'Revert "feat: a"'), pr(3, 'fix: b')], [{ number: 7, title: 'i', labels: [], body: '' }]);
  const check = (text) => prRefs({ notes_md: text }, ctx(r)).pass;
  assert.ok(check('(#3) and issue #7'));
  assert.ok(!check('(#9)'));
  assert.ok(!check('(#1)'));
  assert.ok(!check('(#2)'));
  assert.ok(!check('see https://example.org/quaykit/pull/9'));
  assert.deepEqual(citedNumbers('a#5 &#39; (#6)'), [6]);
});

test('bump signals: bang, footer, labels, prefixes', () => {
  assert.equal(bumpSignal(pr(1, 'feat(x)!: a')), 'major');
  assert.equal(bumpSignal(pr(1, 'fix: a', [], 'text\n\nBREAKING CHANGE: b')), 'major');
  assert.equal(bumpSignal(pr(1, 'chore: a', ['breaking'])), 'major');
  assert.equal(bumpSignal(pr(1, 'chore: a', ['deprecation'])), 'minor');
  assert.equal(bumpSignal(pr(1, 'feat: a')), 'minor');
  assert.equal(bumpSignal(pr(1, 'perf: a')), 'patch');
  assert.equal(bumpSignal(pr(1, 'chore: a')), 'none');
});

test('semver-labels: lower bound, net-zero revert, version arithmetic', () => {
  const plan = (bump, version) => ({ plan: { bump, version } });
  const major = release([pr(1, 'feat!: a')]);
  assert.ok(!semverLabels(plan('minor', '2.4.0'), ctx(major)).pass);
  assert.ok(semverLabels(plan('major', '3.0.0'), ctx(major)).pass);
  assert.ok(semverLabels(plan('major', '3.0.0'), ctx(release([pr(1, 'chore: a')]))).pass, 'higher than labels is allowed');
  assert.ok(!semverLabels(plan('minor', '2.5.0'), ctx(release([pr(1, 'feat: a')]))).pass, 'version must follow from bump');
  const netZero = release([pr(1, 'feat: a'), pr(2, 'Revert "feat: a"'), pr(3, 'fix: b')]);
  assert.ok(semverLabels(plan('patch', '2.3.3'), ctx(netZero)).pass);
});

test('schema: order free, requires conditional sections and PR references', () => {
  const r = release([pr(1, 'feat: a')]);
  assert.ok(schema(artifact(), ctx(r)).pass);
  const two = artifact({ notes_md: notes('2.4.0', '## Fixes\n\n- b (#1).\n\n## Features\n\n- a (#1).'), plan: { bump: 'minor', version: '2.4.0', sections: ['Features', 'Fixes'] } });
  assert.ok(schema(two, ctx(r)).pass);
  assert.ok(!schema(artifact({ plan: { bump: 'minor', version: '2.5.0', sections: ['Features'] } }), ctx(r)).pass);
  assert.ok(!schema(artifact({ plan: { bump: 'major', version: '2.4.0', sections: ['Features'] } }), ctx(r)).pass);
  assert.ok(!schema(artifact({ notes_md: notes('2.4.0', '## Features\n\n- no reference.') }), ctx(r)).pass);
  assert.ok(!schema(artifact({ notes_md: notes('2.4.0', '## Internal\n\n- x (#1).'), plan: { bump: 'minor', version: '2.4.0', sections: ['Internal'] } }), ctx(r)).pass);
  const embargo = release([pr(1, 'fix: a', ['security', 'embargo'])]);
  assert.ok(!schema(artifact(), ctx(embargo)).pass);
});

test('wording: banned, vague, internal, embargo, exclamation, length', () => {
  const long = 'word '.repeat(30);
  const check = (text, cases = {}) => wording({ notes_md: `${long}${text}` }, ctx(release([]), { cases })).pass;
  assert.ok(check('Plain sentence.'));
  assert.ok(!check('A Powerful release.'));
  assert.ok(!check('Various improvements.'));
  assert.ok(!check('CI now caches.'));
  assert.ok(check('Uses ci in lowercase as a word part: civic.'));
  assert.ok(!check('Bumped ESLint.'));
  assert.ok(!check('uses `timingSafeEqual`', { embargo: { terms: ['timingSafeEqual'] } }));
  assert.ok(!check('Wow!'));
  assert.ok(check('`!opts` is code.'));
  assert.ok(!wording({ notes_md: 'too short' }, ctx(release([]))).pass);
  assert.ok(!wording({ notes_md: 'word '.repeat(501) }, ctx(release([]))).pass);
});

test('ref-similarity: identical is 1, unrelated falls below the threshold', () => {
  assert.equal(Math.round(similarity('a b c', 'a b c') * 1000) / 1000, 1);
  assert.equal(similarity('', 'a'), 0);
  const gold = { notes_md: 'workers release the lock when a handler throws' };
  assert.ok(refSimilarity({ notes_md: gold.notes_md }, ctx(release([]), { gold })).pass);
  assert.ok(!refSimilarity({ notes_md: 'something else entirely' }, ctx(release([]), { gold })).pass);
});

test('functional compares the sandbox with plan and previous tag, not with gold', () => {
  const r = release([]);
  const plan = { bump: 'minor', version: '2.4.0', sections: [] };
  const ok = { notes_md: 'n', plan, sandbox: { published: true, version: '2.4.0', notes: 'n' } };
  assert.ok(functional(ok, ctx(r)).pass);
  assert.ok(!functional({ ...ok, sandbox: { published: false } }, ctx(r)).pass);
  assert.ok(!functional({ ...ok, sandbox: { ...ok.sandbox, version: '2.5.0' } }, ctx(r)).pass);
  assert.ok(!functional({ ...ok, sandbox: { ...ok.sandbox, notes: 'other' } }, ctx(r)).pass);
});

test('trajectory: strictly earlier turn, successful reads only', () => {
  const r = release([pr(1, 'a'), pr(2, 'b')]);
  const diff = (turn, id, ok = true) => ({ turn, tool: 'get_diff', args: { id }, ok });
  const publish = (turn) => ({ turn, tool: 'publish_release', args: {}, ok: true });
  const check = (transcript) => trajectory({ transcript }, ctx(r)).pass;
  assert.ok(check([diff(1, 1), diff(1, 2), publish(2)]));
  assert.ok(check([diff(1, 1), diff(1, 2)]), 'not publishing is functional’s business');
  assert.ok(!check([diff(1, 1), publish(2)]));
  assert.ok(!check([diff(1, 1), diff(2, 2), publish(2)]), 'same turn as publish');
  assert.ok(!check([diff(1, 1), diff(1, 2, false), publish(2)]));
  assert.ok(!check([diff(1, 1), publish(2), diff(3, 2)]));
});

test('no code grader throws on an empty or broken artifact', () => {
  const r = release([pr(1, 'a')]);
  const broken = [{}, { notes_md: '', plan: { bump: null, version: null, sections: null }, transcript: [], sandbox: { published: false } }];
  for (const a of broken) for (const grader of Object.values(CODE_GRADERS)) assert.equal(typeof grader(a, ctx(r)).pass, 'boolean');
});

test('judge prompts see exactly what the spec grants them', () => {
  const fixture = loadReleases()[0];
  const { gold } = fixture;
  const notes = 'CANDIDATE NOTES';
  const render = (g) => judgeRequest(g, notes, fixture, prompts).prompt;
  const goldLine = gold.notes_md.split('\n').at(-1);
  const diffLine = fixture.release.prs[0].diff.split('\n').at(-2);
  assert.ok(render('judge-ref').includes(goldLine) && !render('judge-ref').includes(diffLine));
  assert.ok(render('judge-sourced').includes(diffLine) && !render('judge-sourced').includes(goldLine));
  assert.ok(!render('judge-blind').includes(diffLine) && !render('judge-blind').includes(goldLine));
  for (const g of JUDGES) {
    assert.ok(render(g).includes(notes));
    assert.doesNotMatch(render(g), /\{\{/);
    assert.equal(render(g), render(g));
  }
});

test('pairwise swaps the order and never labels the gold version', () => {
  const toy = loadToy();
  const a = pairwiseRequest('gold-first', 'CAND', toy, prompts).prompt;
  const b = pairwiseRequest('candidate-first', 'CAND', toy, prompts).prompt;
  assert.ok(a.indexOf(toy.gold.notes_md) < a.indexOf('CAND'));
  assert.ok(b.indexOf(toy.gold.notes_md) > b.indexOf('CAND'));
  assert.doesNotMatch(a, /gold|referenz/i);
});

test('pairwise verdict: fails only if gold wins in both orders', () => {
  const v = (x, y) => pairwiseVerdict({ better: x, reason: '' }, { better: y, reason: '' });
  assert.equal(v('A', 'B').pass, false);
  assert.equal(v('A', 'A').pass, true);
  assert.equal(v('A', 'A').order_flip, true);
  assert.equal(v('B', 'A').pass, true);
  assert.equal(v('B', 'A').order_flip, false);
  assert.equal(v('equal', 'B').pass, true);
  assert.equal(v('equal', 'equal').pass, true);
});

test('sources contain labels and issues', () => {
  const text = renderSources(loadReleases()[1].release);
  assert.ok(text.includes('embargo') && text.includes('Issue #327'));
});
