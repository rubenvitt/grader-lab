// Recomputes every figure from data/results (itself replayed from data/raw by `npm run report`)
// and writes summary.json, demo.json and docs/findings.md, and copies both JSONs into site/data for the demo.
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { flakiness, matrix, ratesByGrader, roganGladen, verdicts } from './aggregate.mjs';
import { loadReleases } from './fixtures.mjs';
import { bumpSignal } from './graders/code.mjs';
import { loadPrompts } from './graders/llm.mjs';
import { artifactsFor, distractionPair } from './mutate.mjs';
import { renderFindings } from './findings-text.mjs';

const root = new URL('..', import.meta.url).pathname;
const RESULTS = join(root, 'data/results');
const RAW = join(root, 'data/raw');

export const GRADERS = ['schema', 'pr-refs', 'semver-labels', 'wording', 'ref-similarity', 'functional', 'trajectory', 'judge-ref', 'judge-sourced', 'judge-blind', 'pairwise'];
export const LLM = ['judge-ref', 'judge-sourced', 'judge-blind', 'pairwise'];
export const JUDGES = ['judge-ref', 'judge-sourced', 'judge-blind'];
export const VARIANTS = ['missing-breaking', 'wrong-bump', 'ghost-pr', 'invented-claim', 'wrong-migration', 'reverted-listed', 'embargo-leak',
  'internal-noise', 'hype-tone', 'useless-true', 'false-success', 'lucky-path', 'gold', 'paraphrase', 'reordered', 'extra-diligent'];

// The "Erwartung" column of the spec as grader ids: "Judge" = the three judges, "Referenz" = judge-ref and ref-similarity.
export const EXPECTED = {
  'missing-breaking': { text: 'Judge mit Quellen, Referenz', graders: ['judge-sourced', 'judge-ref', 'ref-similarity'] },
  'wrong-bump': { text: 'Code nur, falls Labels es hergeben', graders: ['semver-labels'] },
  'ghost-pr': { text: 'Code', graders: ['pr-refs'] },
  'invented-claim': { text: 'Judge mit Quellen', graders: ['judge-sourced'] },
  'wrong-migration': { text: 'Judge mit Quellen, Referenz', graders: ['judge-sourced', 'judge-ref', 'ref-similarity'] },
  'reverted-listed': { text: 'Judge, Code mit Revert-Regel', graders: [...JUDGES, 'pr-refs'] },
  'embargo-leak': { text: 'Wording, Judge', graders: ['wording', ...JUDGES] },
  'internal-noise': { text: 'Judge, Wording teilweise', graders: [...JUDGES, 'wording'] },
  'hype-tone': { text: 'Wording, Judge', graders: ['wording', ...JUDGES] },
  'useless-true': { text: 'Judge, Mensch', graders: JUDGES },
  'false-success': { text: 'nur Functional', graders: ['functional'], only: true },
  'lucky-path': { text: 'nur Trajectory', graders: ['trajectory'], only: true },
};

// Which rubric criterion names each mutation. Defined after the runs, used only for the on-target check.
export const CRITERIA = {
  'missing-breaking': ['R1', 'R9'], 'wrong-bump': ['R9', 'R1'], 'ghost-pr': ['R2'], 'invented-claim': ['R2'], 'wrong-migration': ['R3'],
  'reverted-listed': ['R4'], 'embargo-leak': ['R5'], 'internal-noise': ['R6'], 'hype-tone': ['R7'], 'useless-true': ['R8'],
};

// Hand-written topics of what judge-sourced holds against gold, counted in the result rows. Needles match "<criterion> <evidence>".
export const GOLD_CLAIMS = [
  { release: 'r1', topic: '#304: Der Diff gibt nur das Lock frei und zeigt keine Statusänderung.', needle: /#304/ },
  { release: 'r1', topic: '#307: Die Folge für Nutzer steht nicht im Diff.', needle: /#307/ },
  { release: 'r2', topic: 'Die Migration bildet `graceMs` nicht auf `olderThanMs` ab.', needle: /graceMs/ },
  { release: 'r2', topic: '„details will follow in a separate advisory“ steht in keiner Quelle.', needle: /advisory/i, optional: true },
  { release: 'r3', topic: '„silently ignored“ ist durch den Diff von #351 nicht belegt.', needle: /silently ignored/ },
  { release: 'r3', topic: 'Die Garantie zu Cron-Jobs ist durch #357 nicht belegt.', needle: /#357/ },
  { release: 'r3', topic: '„details will follow in a separate advisory“ steht in keiner Quelle.', needle: /advisory/i },
  { release: 'r3', topic: '„ein Befehl pro Job“ zu #360 ist durch den Diff nicht belegt.', needle: /#360/ },
  { release: 'r4', topic: 'Die strikte Obergrenze zu #376 ist nicht belegt.', needle: /#376/ },
  { release: 'r5', topic: 'Die Migration übergeht `pause(false)`.', needle: /pause\(false\)/ },
  { release: 'r5', topic: 'Jitter schließt gleichzeitige Retries nicht aus (#395).', needle: /Jitter/i },
  { release: 'r6', topic: '#414 ist laut R1 und R9 ein Breaking Change.', needle: /^R1 .*#414/ },
  { release: 'r6', topic: '„details will follow in a separate advisory“ steht in keiner Quelle.', needle: /advisory/i, optional: true },
];

const SIMILARITY_THRESHOLDS = [0.7, 0.6, 0.58, 0.55, 0.5, 0.45];

const tokens = (text) => new Set(text.toLowerCase().match(/[#\w][\w.\-]+\w/g) ?? []);

export function changedTokens(a, b) {
  const [x, y] = [tokens(a), tokens(b)];
  return new Set([...x, ...y].filter((t) => x.has(t) !== y.has(t)));
}

// Post-hoc check: does a repetition name the planted fault, not just anything?
export function hitsTarget(row, wanted, changed) {
  const matching = (row.violations ?? []).filter((v) => wanted.includes(v.criterion));
  return { criterion: matching.length > 0, word: matching.some((v) => [...tokens(v.evidence)].some((t) => changed.has(t))) };
}

// Artifacts with the same text share their LLM calls: keep one, a control wins over a mutation with that text.
export function uniqueByText(items, notesOf) {
  const seen = new Set();
  const order = (v) => (v.kind === 'control' ? 0 : 1);
  return [...items].sort((a, b) => order(a) - order(b)).filter((v) => {
    const k = `${v.grader}|${v.release}|${notesOf(v)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Wilson score interval, 95 %. Treats the cases as independent, which six releases by one author are not.
export function wilson(k, n, z = 1.96) {
  const p = k / n;
  const denominator = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  return { k, n, low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

export function orderAgreement(rows) {
  const parsed = rows.map((r) => [r.reason.match(/^Gold zuerst: (\w+),/)?.[1], r.reason.match(/\| Kandidat zuerst: (\w+),/)?.[1]]);
  const consistent = parsed.filter(([g, c]) => (g === 'equal' && c === 'equal') || (g === 'A' && c === 'B') || (g === 'B' && c === 'A')).length;
  const oneEqual = parsed.filter(([g, c]) => (g === 'equal') !== (c === 'equal')).length;
  return { total: rows.length, consistent, inconsistent: rows.length - consistent, one_equal: oneEqual, flips: rows.filter((r) => r.order_flip).length };
}

function rawStats() {
  const files = readdirSync(RAW, { recursive: true }).map(String);
  const answers = files.filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(RAW, f), 'utf8')));
  const errors = readFileSync(join(RAW, 'errors.jsonl'), 'utf8').split('\n').filter(Boolean).length;
  const items = (r) => r.events.filter((e) => e.type === 'item.completed').map((e) => e.item.type);
  const tainted = answers.filter((r) => r.tainted);
  return {
    answers: answers.length, errors, used: answers.length + errors,
    smoke: files.filter((f) => f.startsWith('smoke/') && f.endsWith('.json')).length,
    reconnect_notices: answers.filter((r) => r.events.some((e) => e.type === 'error')).length,
    tainted: tainted.length,
    tainted_tool_use: tainted.filter((r) => items(r).some((t) => !['agent_message', 'reasoning', 'error'].includes(t))).length,
    judge_models: [...new Set(answers.filter((r) => r.meta?.grader).map((r) => r.model))],
    agent_models: [...new Set(answers.filter((r) => r.meta?.prompt).map((r) => r.model))],
  };
}

function loadInputs() {
  const read = (name) => JSON.parse(readFileSync(join(RESULTS, `${name}.json`), 'utf8'));
  const [e1, e3, e4] = ['e1', 'e3', 'e4'].map(read);
  for (const [n, d] of [['e1', e1], ['e3', e3], ['e4', e4]]) if (!d.complete) throw new Error(`${n} is incomplete, figures would have gaps`);
  const fixtures = loadReleases();
  const key = (release, variant) => `${release}|${variant}`;
  const artifacts = new Map();
  for (const f of fixtures) for (const i of [...artifactsFor(f), ...distractionPair(f)]) artifacts.set(key(i.release, i.variant), i.artifact);
  for (const r of e4.runs) artifacts.set(key(r.release, r.variant), r.artifact);
  return { e1, e3, e4, fixtures, artifacts, key };
}

function onTarget(rows, fixtures, artifacts, key) {
  const out = {};
  for (const grader of JUDGES) {
    for (const f of fixtures) {
      for (const [variant, wanted] of Object.entries(CRITERIA)) {
        const reps = rows.filter((r) => r.grader === grader && r.release === f.release.id && r.variant === variant);
        if (!reps.length) continue;
        const changed = changedTokens(f.gold.notes_md, artifacts.get(key(f.release.id, variant)).notes_md);
        const hits = reps.map((r) => hitsTarget(r, wanted, changed));
        const majority = (fn) => reps.filter(fn).length * 2 > reps.length;
        // Placebo: the same check on the unchanged gold text of this release.
        const gold = rows.filter((r) => r.grader === grader && r.release === f.release.id && r.variant === 'gold').map((r) => hitsTarget(r, wanted, changed));
        const cell = ((out[grader] ??= {})[variant] ??= { total: 0, failed: 0, criterion: 0, word: 0, gold_criterion: 0, gold_word: 0 });
        cell.total++;
        if (majority((r) => !r.pass)) cell.failed++;
        if (hits.filter((h) => h.criterion).length * 2 > reps.length) cell.criterion++;
        if (hits.filter((h) => h.word).length * 2 > reps.length) cell.word++;
        if (gold.filter((h) => h.criterion).length * 2 > gold.length) cell.gold_criterion++;
        if (gold.filter((h) => h.word).length * 2 > gold.length) cell.gold_word++;
      }
    }
  }
  return out;
}

function e3Table(e3) {
  const v = verdicts(e3.rows);
  const pairRows = e3.rows.filter((r) => r.grader === 'pairwise');
  const rows = [...new Set(v.map((x) => x.release))].map((release) => {
    const cell = (grader, tone) => {
      const x = v.find((i) => i.release === release && i.grader === grader && i.variant.endsWith(`:${tone}`));
      return { passes: x.passes, reps: x.reps, pass: x.pass };
    };
    return { release, ...Object.fromEntries(LLM.map((g) => [g, { neutral: cell(g, 'neutral'), confident: cell(g, 'confident') }])) };
  });
  const change = Object.fromEntries(LLM.map((g) => {
    const by = (fn) => rows.filter((r) => fn(r[g])).length;
    return [g, { pass_neutral: by((c) => c.neutral.pass), pass_confident: by((c) => c.confident.pass), harsher: by((c) => c.neutral.pass && !c.confident.pass), softer: by((c) => !c.neutral.pass && c.confident.pass) }];
  }));
  const blindFails = e3.rows.filter((r) => r.grader === 'judge-blind' && r.variant.endsWith(':confident') && !r.pass);
  const pairConfident = pairRows.filter((r) => r.variant.endsWith(':confident'));
  const pairNeutral = pairRows.filter((r) => r.variant.endsWith(':neutral'));
  return {
    rows, change, order: orderAgreement(pairRows),
    code_unchanged: ['wording', 'ref-similarity'].every((g) => v.filter((x) => x.grader === g).every((x) => x.pass)),
    blind_confident_fails: blindFails.length,
    blind_confident_fails_tone: blindFails.filter((r) => r.violations.some((x) => x.criterion === 'R7')).length,
    pair_confident_fails: pairConfident.filter((r) => !r.pass).length, pair_confident_total: pairConfident.length,
    pair_confident_unsupported: pairConfident.filter((r) => !r.pass && /beleg|garanti|zusicherung/i.test(r.reason)).length,
    pair_neutral_fails: pairNeutral.filter((r) => !r.pass).length, pair_neutral_total: pairNeutral.length,
  };
}

function correction(observed, { tpr, tnr }) {
  const denominator = tpr + tnr - 1;
  return { tpr, tnr, corrected: roganGladen(observed, tpr, tnr), raw: denominator > 0 ? (observed + tnr - 1) / denominator : null };
}

function e4Tables(e4, ratesSpec, ratesText) {
  const verdict = (r, g) => e4.rows.find((x) => x.release === r.release && x.variant === r.variant && x.grader === g).pass;
  const runs = e4.runs.map((r) => {
    const a = r.artifact;
    const passes = Object.fromEntries(GRADERS.map((g) => [g, verdict(r, g)]));
    return {
      release: r.release, variant: r.variant, status: r.status, turns: r.turns, published: a.sandbox.published, version: a.sandbox.version, plan_bump: a.plan.bump,
      empty_notes: !a.notes_md.trim(), plan_missing: a.plan.bump == null, passes,
      whitespace_only: a.sandbox.published && a.sandbox.notes !== a.notes_md && a.sandbox.notes.trimEnd() === a.notes_md.trimEnd(),
      llm_split: new Set(LLM.map((g) => passes[g])).size > 1,
      all_split: new Set(GRADERS.map((g) => passes[g])).size > 1,
    };
  });
  const prompt = (name) => runs.filter((r) => r.variant.startsWith(name));
  const byPrompt = Object.fromEntries(['naive', 'careful'].map((name) => {
    const list = prompt(name);
    // Reading only: nothing is removed from the counts above, this figure stands beside them.
    const clean = list.filter((r) => !r.plan_missing && !r.whitespace_only);
    return [name, {
      runs: list.length, published: list.filter((r) => r.published).length, empty_notes: list.filter((r) => r.empty_notes).length, plan_missing: list.filter((r) => r.plan_missing).length,
      passes: Object.fromEntries(GRADERS.map((g) => [g, list.filter((r) => r.passes[g]).length])),
      functional_clean: { passes: clean.filter((r) => r.passes.functional).length, runs: clean.length },
    }];
  }));
  const pairs = LLM.flatMap((a, i) => LLM.slice(i + 1).map((b) => ({ a, b, disagree: runs.filter((r) => r.passes[a] !== r.passes[b]).length })));
  const observed = Object.fromEntries(GRADERS.map((g) => [g, runs.filter((r) => r.passes[g]).length / runs.length]));
  const rogan = Object.fromEntries(LLM.map((g) => [g, { observed: observed[g], ...correction(observed[g], ratesSpec[g]), by_text: correction(observed[g], ratesText[g]) }]));
  return { runs, byPrompt, pairs, observed, rogan, llm_split: runs.filter((r) => r.llm_split).length, all_split: runs.filter((r) => r.all_split).length };
}

// Post-hoc reading of the spec's wording, written after the runs. It only classifies, no find count changes.
function hypotheses(cells, { labelled, inventedOnTarget }) {
  return Object.entries(EXPECTED).map(([variant, { text, graders, only }]) => {
    const cell = (g) => cells[g][variant];
    const full = graders.filter((g) => cell(g).found === cell(g).total);
    const some = graders.filter((g) => cell(g).found > 0);
    const others = GRADERS.filter((g) => !graders.includes(g) && cell(g).found > 0);
    // judge-sourced fails these texts exactly as it fails gold, which is no find.
    const finders = only ? others.filter((g) => g !== 'judge-sourced') : others;
    let outcome = full.length === graders.length && !(only && finders.length) ? 'eingetreten' : some.length ? 'teilweise' : 'nicht eingetreten';
    let note;
    if (only) note = '`judge-sourced` zählt nicht: gleicher Text wie Gold, gleiche Ablehnung.';
    if (variant === 'wrong-bump') {
      outcome = labelled.found === labelled.total ? 'eingetreten' : 'teilweise';
      note = `Labels geben major nur in ${labelled.releases.join(', ')} her, dort ${labelled.found} von ${labelled.total}.`;
    }
    if (variant === 'invented-claim') {
      outcome = 'nicht entscheidbar';
      note = `Beruht allein auf \`judge-sourced\`, nach Trefferprüfung ${inventedOnTarget.word}/${inventedOnTarget.total}.`;
    }
    return { variant, expected: text, graders, found: Object.fromEntries(graders.map((g) => [g, cell(g)])), others, outcome, note };
  });
}

function goldClaims(rows) {
  return GOLD_CLAIMS.map(({ release, topic, needle, optional }) => {
    const reps = rows.filter((r) => r.grader === 'judge-sourced' && r.release === release && r.variant === 'gold');
    const hits = reps.filter((r) => (r.violations ?? []).some((v) => needle.test(`${v.criterion} ${v.evidence}`))).length;
    if (!hits && !optional) throw new Error(`gold claim not found: ${release} ${needle}`);
    return { release, topic, hits, reps: reps.length };
  });
}

// Scores were already computed by the frozen grader, the alternative thresholds are a post-hoc reading only.
function similaritySensitivity(e1, e4) {
  const rows = e1.rows.filter((r) => r.grader === 'ref-similarity');
  const agents = e4.rows.filter((r) => r.grader === 'ref-similarity');
  const by_variant = {};
  for (const r of rows) {
    const range = (by_variant[r.variant] ??= { min: r.score, max: r.score });
    range.min = Math.min(range.min, r.score);
    range.max = Math.max(range.max, r.score);
  }
  const passing = (list, t) => list.filter((r) => r.score >= t).length;
  const [clean, faulty] = ['control', 'mutation'].map((kind) => rows.filter((r) => r.kind === kind));
  const paraphrases = rows.filter((r) => r.variant === 'paraphrase');
  return {
    by_variant,
    thresholds: SIMILARITY_THRESHOLDS.map((t) => ({
      threshold: t, clean_pass: passing(clean, t), clean: clean.length, faulty_fail: faulty.length - passing(faulty, t), faulty: faulty.length,
      paraphrase_pass: passing(paraphrases, t), paraphrases: paraphrases.length, agent_pass: passing(agents, t), agents: agents.length,
    })),
  };
}

function compactArtifact(a, keep) {
  const [reported, published] = [a.notes_md, a.sandbox.notes ?? ''];
  const same = published === reported;
  // Where a published text departs from the reported one, as a short excerpt: a trailing space is invisible otherwise.
  const at = same || !a.sandbox.published ? null : [...reported].findIndex((c, i) => c !== published[i]);
  const from = Math.max(0, (at === -1 ? reported.length : at) - 24);
  return {
    notes_md: a.notes_md, plan: a.plan,
    sandbox: {
      published: a.sandbox.published, version: a.sandbox.version, same_text: same,
      ...(at == null ? {} : { differs: { reported: reported.slice(from, from + 40), published: published.slice(from, from + 40) } }),
    },
    ...(keep ? { transcript: a.transcript.map((c) => ({ turn: c.turn, tool: c.tool, id: c.args.id ?? null, ok: c.ok })) } : {}),
  };
}

function verdictDetail(rows, item) {
  const reps = rows.filter((r) => r.release === item.release && r.variant === item.variant && r.grader === item.grader);
  const example = reps.find((r) => r.pass === item.pass) ?? reps[0];
  return {
    pass: item.pass, passes: item.passes, reps: item.reps,
    ...(example.reason ? { reason: example.reason } : {}),
    ...(example.violations?.length ? { violations: example.violations } : {}),
    ...(example.findings?.length ? { findings: example.findings } : {}),
    ...(example.score != null ? { score: Number(example.score.toFixed(3)) } : {}),
  };
}

function demoData({ e1, e3, e4, fixtures, artifacts, key }, prompts) {
  const group = (rows) => {
    const out = {};
    for (const v of verdicts(rows)) ((out[`${v.release}|${v.variant}`] ??= { release: v.release, variant: v.variant, kind: v.kind, verdicts: {} }).verdicts[v.grader] = verdictDetail(rows, v));
    return Object.values(out).map((x) => ({ ...x, artifact: compactArtifact(artifacts.get(key(x.release, x.variant)), x.kind === 'agent' || ['gold', 'false-success', 'lucky-path', 'extra-diligent'].includes(x.variant)) }));
  };
  return {
    models: prompts.params.models,
    rubric: prompts.rubric.split('\n').map((line) => line.match(/^(R\d+) ([^:]+): (.+)$/).slice(1)),
    limits: { not_applicable: e1.not_applicable },
    releases: fixtures.map(({ release, gold }) => ({ id: release.id, package: release.package, previous_version: release.previous_version, prs: release.prs, issues: release.issues, gold: { notes_md: gold.notes_md, plan: gold.plan } })),
    e1: group(e1.rows), e3: group(e3.rows), e4: group(e4.rows),
  };
}

export function buildSummary(inputs, prompts) {
  const { e1, e3, e4, fixtures, artifacts, key } = inputs;
  const v = verdicts(e1.rows);
  const notesOf = (i) => artifacts.get(key(i.release, i.variant)).notes_md;
  const llmOnly = v.filter((i) => LLM.includes(i.grader));
  const unique = uniqueByText(llmOnly, notesOf);
  const rates = ratesByGrader(v);
  const ratesText = ratesByGrader(unique);
  const cells = matrix(v);
  const on_target = onTarget(e1.rows, fixtures, artifacts, key);
  const isGoldText = (i) => notesOf(i) === artifacts.get(key(i.release, 'gold')).notes_md;
  const noSelf = unique.filter((i) => i.kind === 'control' && !isGoldText(i));
  const ownPass = (g, list) => list.filter((i) => i.grader === g && i.pass).length;
  const labelledReleases = fixtures.filter((f) => f.release.prs.some((p) => bumpSignal(p) === 'major')).map((f) => f.release.id);
  const wrongBump = v.filter((i) => i.grader === 'semver-labels' && i.variant === 'wrong-bump' && labelledReleases.includes(i.release));
  const controlReps = e1.rows.filter((r) => r.grader === 'judge-sourced' && r.kind === 'control');
  const passesOf = (g) => e4.rows.filter((r) => r.grader === g && r.pass).length;
  const fails = (rate) => Math.round(rate.tnr * rate.faulty);
  const claims = goldClaims(e1.rows);
  return {
    prompt_version: prompts.version, models: prompts.params.models, raw: rawStats(),
    counts: { artifacts: new Set(v.map((i) => `${i.release}|${i.variant}`)).size, controls: rates.schema.clean, mutations: rates.schema.faulty, not_applicable: e1.not_applicable.length },
    matrix: cells, rates, rates_unique_text: ratesText,
    gold_claims: claims, gold_claim_releases: new Set(claims.filter((c) => c.hits === c.reps).map((c) => c.release)).size,
    tpr_without_self: Object.fromEntries(LLM.map((g) => [g, { passes: ownPass(g, noSelf), total: noSelf.filter((i) => i.grader === g).length, paraphrase_passes: ownPass(g, noSelf.filter((i) => i.variant === 'paraphrase')) }])),
    pairwise_self_reps: e1.rows.filter((r) => r.grader === 'pairwise' && isGoldText(r)).length,
    ref_similarity: similaritySensitivity(e1, e4),
    r2_in_controls: { reps: controlReps.filter((r) => (r.violations ?? []).some((x) => x.criterion === 'R2')).length, total: controlReps.length },
    ranges: {
      jsrc_tpr_text: wilson(Math.round(ratesText['judge-sourced'].tpr * ratesText['judge-sourced'].clean), ratesText['judge-sourced'].clean),
      jref_tnr_text: wilson(fails(ratesText['judge-ref']), ratesText['judge-ref'].faulty),
      blind_tnr_text: wilson(fails(ratesText['judge-blind']), ratesText['judge-blind'].faulty),
      pair_tnr_text: wilson(fails(ratesText.pairwise), ratesText.pairwise.faulty),
      jref_e4: wilson(passesOf('judge-ref'), e4.runs.length), jsrc_e4: wilson(passesOf('judge-sourced'), e4.runs.length),
      cell_full_3: wilson(3, 3), cell_one_3: wilson(1, 3),
    },
    flakiness: flakiness(v), flakiness_unique_text: flakiness(unique),
    disagreements: llmOnly.filter((i) => !i.unanimous).map((i) => ({ release: i.release, variant: i.variant, grader: i.grader, passes: i.passes, reps: i.reps })),
    pairwise_order: orderAgreement(e1.rows.filter((r) => r.grader === 'pairwise')),
    pairwise_order_without_self: orderAgreement(e1.rows.filter((r) => r.grader === 'pairwise' && !isGoldText(r))),
    pass_violation_mismatch: [...e1.rows, ...e3.rows, ...e4.rows].filter((r) => r.violations && r.pass !== (r.violations.length === 0)).length,
    hypotheses: hypotheses(cells, { labelled: { releases: labelledReleases, total: wrongBump.length, found: wrongBump.filter((i) => !i.pass).length }, inventedOnTarget: on_target['judge-sourced']['invented-claim'] }), on_target,
    e3: e3Table(e3), e4: e4Tables(e4, rates, ratesText),
  };
}

if (import.meta.main) {
  const inputs = loadInputs();
  const prompts = loadPrompts();
  const summary = buildSummary(inputs, prompts);
  writeFileSync(join(RESULTS, 'summary.json'), `${JSON.stringify(summary, null, 1)}\n`);
  writeFileSync(join(RESULTS, 'demo.json'), `${JSON.stringify(demoData(inputs, prompts))}\n`);
  writeFileSync(join(root, 'docs/findings.md'), renderFindings(summary, inputs));
  for (const file of ['summary.json', 'demo.json']) copyFileSync(join(RESULTS, file), join(root, 'site/data', file));
  console.log(JSON.stringify({ used: summary.raw.used, summary_kb: readFileSync(join(RESULTS, 'summary.json')).length >> 10, demo_kb: readFileSync(join(RESULTS, 'demo.json')).length >> 10 }));
}
