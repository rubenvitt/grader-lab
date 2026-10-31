import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ACTION_SCHEMA, createTools, runAgent } from '../src/agent.mjs';
import { createSession } from '../src/engine/session.mjs';
import { loadToy } from '../src/fixtures.mjs';
import { functional, trajectory } from '../src/graders/code.mjs';
import { loadPrompts } from '../src/graders/llm.mjs';

const prompts = loadPrompts();
const fixture = loadToy();
const { release, gold } = fixture;
const blank = { id: null, version: null, notes: null, bump: null, sections: null };
const use = (tool, over = {}) => ({ ...blank, tool, ...over });
const finish = use('finish', { bump: 'minor', version: '1.3.0', sections: ['Features'], notes: gold.notes_md });
const publish = use('publish_release', { version: '1.3.0', notes: gold.notes_md });

function scripted(turns, rawDir = mkdtempSync(join(tmpdir(), 'gl-'))) {
  const seen = [];
  let i = 0;
  const callModel = async ({ prompt }) => {
    seen.push(prompt);
    const parsed = { calls: turns[i++] ?? [] };
    return { text: JSON.stringify(parsed), parsed, usage: null, tainted: false, events: [] };
  };
  return { seen, session: createSession({ rawDir, callModel }), rawDir };
}
const run = (session, promptVariant = 'careful') => runAgent({ fixture, promptVariant, run: 1, session, prompts });

test('action schema is strict: every key required, nullable instead of optional', () => {
  const item = ACTION_SCHEMA.properties.calls.items;
  assert.deepEqual(item.required.slice().sort(), Object.keys(item.properties).sort());
  assert.equal(item.additionalProperties, false);
});

test('a full run batches calls per turn and records transcript and sandbox', async () => {
  const { session, seen } = scripted([
    [use('list_prs')],
    [use('get_pr', { id: 11 }), use('get_pr', { id: 12 }), use('get_diff', { id: 11 }), use('get_diff', { id: 12 })],
    [publish],
    [finish],
  ]);
  const { status, artifact, turns } = await run(session);
  assert.equal(status, 'finished');
  assert.equal(turns, 3);
  assert.deepEqual(artifact.transcript.map((c) => [c.turn, c.tool]), [
    [1, 'list_prs'], [2, 'get_pr'], [2, 'get_pr'], [2, 'get_diff'], [2, 'get_diff'], [3, 'publish_release'],
  ]);
  assert.deepEqual(artifact.sandbox, { published: true, version: '1.3.0', notes: gold.notes_md });
  assert.deepEqual(artifact.plan, { bump: 'minor', version: '1.3.0', sections: ['Features'] });
  assert.equal(artifact.notes_md, gold.notes_md);
  assert.ok(seen[1].includes('feat(cli): add quaykit version'), 'tool results reach the next turn');
  assert.ok(seen[2].includes('command(\'version\')') || seen[2].includes("program.command"), 'diff reaches the next turn');
  assert.ok(functional(artifact, { release }).pass && trajectory(artifact, { release }).pass);
});

test('a resumed run replays from raw without new model calls', async () => {
  const turns = [[use('list_prs')], [publish], [finish]];
  const first = scripted(turns);
  const a = await run(first.session);
  const second = scripted([], first.rawDir);
  const b = await run(second.session);
  assert.deepEqual(a, b);
  assert.equal(second.seen.length, 0);
});

test('finishing without publishing is a real false success', async () => {
  const { session } = scripted([[use('list_prs')], [finish]]);
  const { artifact } = await run(session);
  assert.equal(artifact.notes_md, gold.notes_md);
  assert.equal(artifact.sandbox.published, false);
  assert.ok(!functional(artifact, { release }).pass);
});

test('diffs requested in the publishing turn do not count as read', async () => {
  const { session } = scripted([[use('get_diff', { id: 11 }), use('get_diff', { id: 12 }), publish], [finish]]);
  const { artifact } = await run(session);
  assert.ok(!trajectory(artifact, { release }).pass);
});

test('the tool loop survives bad calls and stops at the turn limit', async () => {
  const { session } = scripted(Array.from({ length: 20 }, () => [use('get_diff', { id: 999 })]));
  const { status, artifact } = await run(session);
  assert.equal(status, 'max_turns');
  assert.equal(artifact.transcript.length, prompts.params.agent.max_turns);
  assert.ok(artifact.transcript.every((c) => !c.ok));
  assert.equal(artifact.notes_md, '');
});

test('an empty turn ends the run', async () => {
  const { session } = scripted([[]]);
  assert.equal((await run(session)).status, 'no_calls');
});

test('publishing works once, and tools hide the annotations', () => {
  const tools = createTools(release);
  assert.ok(tools.publish_release({ version: '1.3.0', notes: 'n' }).published);
  assert.ok(tools.publish_release({ version: '1.3.1', notes: 'm' }).error);
  assert.equal(tools.sandbox.version, '1.3.0');
  assert.deepEqual(Object.keys(tools.list_prs()[0]), ['id', 'title', 'labels']);
  assert.ok(tools.get_issue({ id: 1 }).error);
});

test('both prompt variants render completely', async () => {
  for (const variant of ['naive', 'careful']) {
    const { session, seen } = scripted([[finish]]);
    await run(session, variant);
    assert.doesNotMatch(seen[0], /\{\{/);
    assert.ok(seen[0].includes(release.previous_version));
    assert.ok(!seen[0].includes(gold.notes_md));
  }
});
