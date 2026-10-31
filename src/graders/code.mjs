// Deterministic graders. Each takes (artifact, ctx) and returns { pass, findings }.
const verdict = (findings) => ({ pass: findings.length === 0, findings });
const prNumbers = (release) => new Set(release.prs.map((p) => p.number));
const RANK = { none: 0, patch: 1, minor: 2, major: 3 };

export function nextVersion(previous, bump) {
  const [major, minor, patch] = previous.split('.').map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// Revert targets of one PR: `Revert "<title>"`, plus any #n in a sentence that says "reverts".
function revertTargets(pr, release) {
  const targets = new Set();
  const title = pr.title.match(/^Revert "(.+)"$/)?.[1];
  const byTitle = title && release.prs.find((p) => p.title === title);
  if (byTitle) targets.add(byTitle.number);
  for (const sentence of (pr.body ?? '').split(/(?<=[.!?])\s+|\n+/)) {
    if (!/\breverts?\b/i.test(sentence)) continue;
    for (const [, n] of sentence.matchAll(/#(\d+)/g)) targets.add(Number(n));
  }
  const known = prNumbers(release);
  return [...targets].filter((n) => known.has(n) && n !== pr.number);
}

export function revertState(release) {
  const reverted = new Set();
  const reverts = new Set();
  for (const pr of [...release.prs].sort((a, b) => a.merged_at.localeCompare(b.merged_at) || a.number - b.number)) {
    const targets = revertTargets(pr, release);
    if (!targets.length) continue;
    reverts.add(pr.number);
    for (const n of targets) {
      reverted.add(n);
      if (reverts.has(n)) { // reverting a revert brings its targets back
        const inner = release.prs.find((p) => p.number === n);
        for (const m of revertTargets(inner, release)) reverted.delete(m);
      }
    }
  }
  return { reverted, reverts };
}

export function schema(artifact, { release, params }) {
  const { notes_md: notes, plan, transcript, sandbox } = artifact ?? {};
  const findings = [];
  if (typeof notes !== 'string' || !notes.trim()) return verdict(['notes_md fehlt oder ist leer']);
  if (!Array.isArray(transcript)) findings.push('transcript ist keine Liste');
  if (typeof sandbox !== 'object' || sandbox === null) findings.push('sandbox fehlt');
  if (!['major', 'minor', 'patch'].includes(plan?.bump)) findings.push('plan.bump ungültig');
  if (!/^\d+\.\d+\.\d+$/.test(plan?.version ?? '')) findings.push('plan.version ist keine SemVer-Version');
  if (!Array.isArray(plan?.sections)) return verdict([...findings, 'plan.sections fehlt']);

  const lines = notes.split('\n');
  if (lines[0].trim() !== `# ${release.package} ${plan.version}`) findings.push('Titelzeile passt nicht zu plan.version');
  const blocks = notes.split(/\n(?=## )/).slice(1).map((b) => ({ name: b.match(/^## (.+)/)[1].trim(), body: b.split('\n').slice(1) }));
  const headings = blocks.map((b) => b.name);
  for (const s of plan.sections) if (!headings.includes(s)) findings.push(`Abschnitt „${s}“ steht im Plan, aber nicht in den Notes`);
  for (const h of headings) {
    if (!plan.sections.includes(h)) findings.push(`Abschnitt „${h}“ steht nicht im Plan`);
    if (!params.schema.allowed_sections.includes(h)) findings.push(`Abschnitt „${h}“ ist nicht vorgesehen`);
  }
  for (const { name, body } of blocks) {
    const bullets = body.filter((l) => l.startsWith('- '));
    if (!bullets.length) findings.push(`Abschnitt „${name}“ hat keine Einträge`);
    for (const b of bullets) if (!/#\d+/.test(b)) findings.push(`Eintrag ohne PR-Verweis: ${b.slice(0, 60)}`);
  }
  const { reverted } = revertState(release);
  const live = release.prs.filter((p) => !reverted.has(p.number));
  if (plan.bump === 'major' && !headings.includes('Breaking Changes')) findings.push('Major-Release ohne Abschnitt „Breaking Changes“');
  if (live.some((p) => p.labels.includes('security')) && !headings.includes('Security')) findings.push('Security-Fix ohne Abschnitt „Security“');
  if (live.some((p) => p.labels.includes('deprecation')) && !headings.includes('Deprecations')) findings.push('Deprecation ohne Abschnitt „Deprecations“');
  return verdict(findings);
}

export function citedNumbers(notes) {
  const hits = [...notes.matchAll(/(?<![\w/&])#(\d+)\b/g), ...notes.matchAll(/\/(?:pull|issues)\/(\d+)\b/g)];
  return [...new Set(hits.map((m) => Number(m[1])))];
}

export function prRefs(artifact, { release }) {
  const known = new Set([...prNumbers(release), ...release.issues.map((i) => i.number)]);
  const { reverted, reverts } = revertState(release);
  const findings = [];
  for (const n of citedNumbers(artifact?.notes_md ?? '')) {
    if (!known.has(n)) findings.push(`#${n} existiert nicht`);
    else if (reverted.has(n)) findings.push(`#${n} wurde zurückgenommen`);
    else if (reverts.has(n)) findings.push(`#${n} ist selbst ein Revert`);
  }
  return verdict(findings);
}

export function bumpSignal(pr) {
  const [, type, bang] = pr.title.match(/^(\w+)(?:\([^)]*\))?(!)?:/) ?? [];
  const labels = pr.labels;
  if (bang || labels.includes('breaking') || /^BREAKING[ -]CHANGE:/m.test(pr.body ?? '')) return 'major';
  if (type === 'feat' || labels.some((l) => ['feature', 'enhancement', 'deprecation'].includes(l))) return 'minor';
  if (['fix', 'perf'].includes(type) || labels.some((l) => ['bug', 'security', 'performance'].includes(l))) return 'patch';
  return 'none';
}

export function semverLabels(artifact, { release }) {
  const { bump, version } = artifact?.plan ?? {};
  const { reverted, reverts } = revertState(release);
  const live = release.prs.filter((p) => !reverted.has(p.number) && !reverts.has(p.number));
  const required = live.map(bumpSignal).reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'patch');
  const findings = [];
  // Labels give a lower bound only: a human may know more than the labels say, so a higher bump is fine.
  if (!(bump in RANK)) findings.push('plan.bump fehlt');
  else if (RANK[bump] < RANK[required]) findings.push(`Bump ${bump} ist kleiner als das aus Labels abgeleitete ${required}`);
  if (bump in RANK && version !== nextVersion(release.previous_version, bump)) findings.push(`Version ${version} passt nicht zu ${release.previous_version} + ${bump}`);
  return verdict(findings);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const term = (s, flags = 'i') => new RegExp(`(?<![\\w])${escapeRe(s)}(?![\\w])`, flags);

export function wording(artifact, { cases, params }) {
  const notes = artifact?.notes_md ?? '';
  const { banned_words, vague_phrases, internal_terms, internal_terms_case_sensitive, min_words, max_words } = params.wording;
  const findings = [];
  for (const w of banned_words) if (term(w).test(notes)) findings.push(`verbotenes Wort: ${w}`);
  for (const w of vague_phrases) if (term(w).test(notes)) findings.push(`nichtssagende Formel: ${w}`);
  for (const w of internal_terms) if (term(w).test(notes)) findings.push(`interner Begriff: ${w}`);
  for (const w of internal_terms_case_sensitive) if (term(w, '').test(notes)) findings.push(`interner Begriff: ${w}`);
  for (const w of cases.embargo?.terms ?? []) if (term(w).test(notes)) findings.push(`Embargo-Begriff: ${w}`);
  if (notes.replace(/`[^`]*`/g, '').includes('!')) findings.push('Ausrufezeichen im Fließtext');
  const words = notes.split(/\s+/).filter(Boolean).length;
  if (words < min_words) findings.push(`zu kurz: ${words} Wörter`);
  if (words > max_words) findings.push(`zu lang: ${words} Wörter`);
  return verdict(findings);
}

function grams(text) {
  const tokens = text.toLowerCase().match(/[a-z0-9_.]+/g) ?? [];
  const counts = new Map();
  const add = (g) => counts.set(g, (counts.get(g) ?? 0) + 1);
  tokens.forEach((tok, i) => { add(tok); if (i) add(`${tokens[i - 1]} ${tok}`); });
  return counts;
}

export function similarity(a, b) {
  const [x, y] = [grams(a), grams(b)];
  const norm = (m) => Math.sqrt([...m.values()].reduce((s, v) => s + v * v, 0));
  let dot = 0;
  for (const [g, v] of x) dot += v * (y.get(g) ?? 0);
  return x.size && y.size ? dot / (norm(x) * norm(y)) : 0;
}

export function refSimilarity(artifact, { gold, params }) {
  const score = similarity(artifact?.notes_md ?? '', gold.notes_md);
  const findings = score < params.ref_similarity.threshold ? [`Ähnlichkeit ${score.toFixed(3)} unter Schwelle ${params.ref_similarity.threshold}`] : [];
  return { ...verdict(findings), score };
}

// "Version stimmt" means: the published version follows from the previous tag and the plan's own bump,
// and notes and plan agree. There is no gold in production, so this grader does not compare against it.
export function functional(artifact, { release }) {
  const { sandbox, plan, notes_md: notes } = artifact ?? {};
  if (!sandbox?.published) return verdict(['nichts veröffentlicht']);
  const findings = [];
  if (sandbox.version !== plan?.version) findings.push(`veröffentlicht ${sandbox.version}, geplant ${plan?.version}`);
  if (sandbox.version !== nextVersion(release.previous_version, plan?.bump)) findings.push(`veröffentlichte Version ${sandbox.version} folgt nicht aus ${release.previous_version} + ${plan?.bump}`);
  if (sandbox.notes !== notes) findings.push('veröffentlichter Text weicht von notes_md ab');
  return verdict(findings);
}

export function trajectory(artifact, { release }) {
  const calls = artifact?.transcript ?? [];
  const published = calls.find((c) => c.tool === 'publish_release' && c.ok);
  // A diff requested in the publishing turn was never seen by the agent when it decided to publish.
  const seenBy = published ? published.turn : Infinity;
  const read = new Set(calls.filter((c) => c.tool === 'get_diff' && c.ok && c.turn < seenBy).map((c) => c.args.id));
  const missing = release.prs.map((p) => p.number).filter((n) => !read.has(n));
  return verdict(missing.map((n) => `Diff von #${n} nicht vor dem Veröffentlichen gelesen`));
}

export const CODE_GRADERS = { schema, 'pr-refs': prRefs, 'semver-labels': semverLabels, wording, 'ref-similarity': refSimilarity, functional, trajectory };
