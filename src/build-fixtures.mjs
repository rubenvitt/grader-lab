// Writes the JSON fixtures from the hand-written sources in fixtures/src/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const write = (dir, name, value) => writeFileSync(join(dir, name), JSON.stringify(value, null, 2) + '\n');

export function goldTranscript(prs, notes, version) {
  return [
    { turn: 1, tool: 'list_prs', args: {}, ok: true },
    ...prs.map((p) => ({ turn: 2, tool: 'get_pr', args: { id: p.number }, ok: true })),
    ...prs.map((p) => ({ turn: 3, tool: 'get_diff', args: { id: p.number }, ok: true })),
    { turn: 4, tool: 'publish_release', args: { version, notes }, ok: true },
  ];
}

export function emit(source, dir) {
  mkdirSync(dir, { recursive: true });
  const { id, previous_version, prs, issues, cases, gold, variants, e3 } = source;
  write(dir, 'release.json', { id, package: 'quaykit', previous_version, prs, issues });
  write(dir, 'cases.json', cases);
  write(dir, 'gold.json', {
    notes_md: gold.notes_md,
    plan: { bump: gold.bump, version: gold.version, sections: gold.sections },
    transcript: goldTranscript(prs, gold.notes_md, gold.version),
    sandbox: { published: true, version: gold.version, notes: gold.notes_md },
  });
  write(dir, 'variants.json', { variants, e3 });
}

if (import.meta.main) {
  for (const id of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']) {
    const { default: source } = await import(`../fixtures/src/${id}.mjs`);
    emit(source, join(root, 'fixtures/releases', id));
  }
  const { default: toy } = await import('../fixtures/src/toy.mjs');
  emit(toy, join(root, 'fixtures/smoke/toy'));
}
