// Applies the hand-written variants of a release to its gold artifact.
export const MUTATIONS = ['missing-breaking', 'wrong-bump', 'ghost-pr', 'invented-claim', 'wrong-migration', 'reverted-listed',
  'embargo-leak', 'internal-noise', 'hype-tone', 'useless-true', 'false-success', 'lucky-path'];
export const CONTROLS = ['gold', 'paraphrase', 'reordered', 'extra-diligent'];

function applyEdits(notes, edits) {
  for (const { find, replace } of edits) {
    const hits = notes.split(find).length - 1;
    if (hits !== 1) throw new Error(`edit must match exactly once, matched ${hits}: ${find.slice(0, 60)}`);
    notes = notes.replace(find, () => replace);
  }
  return notes.replace(/\n{3,}/g, '\n\n').trimEnd();
}

function reorderSections(notes, order) {
  const [head, ...blocks] = notes.split(/\n(?=## )/);
  const byName = new Map(blocks.map((b) => [b.match(/^## (.+)/)[1], b.trimEnd()]));
  if (order.length !== byName.size || !order.every((n) => byName.has(n))) throw new Error(`bad section order: ${order}`);
  return [head.trimEnd(), ...order.map((n) => byName.get(n))].join('\n\n');
}

function renumber(transcript) {
  const turns = [...new Set(transcript.map((c) => c.turn))].sort((a, b) => a - b);
  return transcript.map((c) => ({ ...c, turn: turns.indexOf(c.turn) + 1 }));
}

function withPublishRefreshed(artifact) {
  const { notes_md: notes, plan: { version } } = artifact;
  return {
    ...artifact,
    sandbox: { published: true, version, notes },
    transcript: artifact.transcript.map((c) => (c.tool === 'publish_release' ? { ...c, args: { version, notes } } : c)),
  };
}

export function applyVariant({ release, gold }, id, variant) {
  if (variant.na) return null;
  let artifact = structuredClone(gold);
  if (variant.notes_md) artifact.notes_md = variant.notes_md;
  if (variant.edits) artifact.notes_md = applyEdits(artifact.notes_md, variant.edits);
  if (variant.plan) artifact.plan = { ...artifact.plan, ...variant.plan };
  if (variant.reorder) {
    artifact.notes_md = reorderSections(artifact.notes_md, variant.reorder);
    artifact.plan.sections = variant.reorder;
  }
  artifact = withPublishRefreshed(artifact);
  if (id === 'false-success') {
    artifact.transcript = artifact.transcript.filter((c) => c.tool !== 'publish_release');
    artifact.sandbox = { published: false, version: null, notes: null };
  }
  if (id === 'lucky-path') artifact.transcript = renumber(artifact.transcript.filter((c) => c.tool !== 'get_diff'));
  if (id === 'extra-diligent') {
    const issues = release.issues.map((i) => ({ turn: 3.5, tool: 'get_issue', args: { id: i.number }, ok: true }));
    artifact.transcript = renumber([...artifact.transcript, ...issues].sort((a, b) => a.turn - b.turn));
  }
  return artifact;
}

export function artifactsFor(fixture) {
  const out = [];
  for (const [ids, kind] of [[MUTATIONS, 'mutation'], [CONTROLS, 'control']]) {
    for (const id of ids) {
      const artifact = applyVariant(fixture, id, fixture.variants[id]);
      if (artifact) out.push({ release: fixture.release.id, variant: id, kind, artifact });
    }
  }
  return out;
}

export function notApplicable(fixture) {
  return Object.entries(fixture.variants).filter(([, v]) => v.na).map(([variant, v]) => ({ release: fixture.release.id, variant, reason: v.na }));
}

// E3: the same faulty content, once neutral and once confidently worded.
export function distractionPair(fixture) {
  const { base, edits } = fixture.e3;
  const neutral = applyVariant(fixture, base, fixture.variants[base]);
  const confident = withPublishRefreshed({ ...neutral, notes_md: applyEdits(neutral.notes_md, edits) });
  return [
    { release: fixture.release.id, variant: `${base}:neutral`, kind: 'mutation', artifact: neutral },
    { release: fixture.release.id, variant: `${base}:confident`, kind: 'mutation', artifact: confident },
  ];
}
