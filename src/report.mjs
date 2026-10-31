// Recomputes every figure from data/results (itself replayed from data/raw by `npm run report`)
// and writes summary.json, demo.json and docs/findings.md, and copies both JSONs into site/data for the demo.
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { flakiness, matrix, ratesByGrader, roganGladen, verdicts } from './aggregate.mjs';
import { loadReleases } from './fixtures.mjs';
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
        const cell = ((out[grader] ??= {})[variant] ??= { total: 0, failed: 0, criterion: 0, word: 0 });
        cell.total++;
        if (majority((r) => !r.pass)) cell.failed++;
        if (hits.filter((h) => h.criterion).length * 2 > reps.length) cell.criterion++;
        if (hits.filter((h) => h.word).length * 2 > reps.length) cell.word++;
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
  return {
    rows, change, order: orderAgreement(pairRows),
    code_unchanged: ['wording', 'ref-similarity'].every((g) => v.filter((x) => x.grader === g).every((x) => x.pass)),
    blind_confident_fails: blindFails.length,
    blind_confident_fails_tone: blindFails.filter((r) => r.violations.some((x) => x.criterion === 'R7')).length,
  };
}

function e4Tables(e4, ratesSpec) {
  const verdict = (r, g) => e4.rows.find((x) => x.release === r.release && x.variant === r.variant && x.grader === g).pass;
  const runs = e4.runs.map((r) => {
    const a = r.artifact;
    const passes = Object.fromEntries(GRADERS.map((g) => [g, verdict(r, g)]));
    return {
      release: r.release, variant: r.variant, status: r.status, turns: r.turns, published: a.sandbox.published, version: a.sandbox.version, plan_bump: a.plan.bump,
      empty_notes: !a.notes_md.trim(), plan_missing: a.plan.bump == null, passes,
      llm_split: new Set(LLM.map((g) => passes[g])).size > 1,
      all_split: new Set(GRADERS.map((g) => passes[g])).size > 1,
    };
  });
  const prompt = (name) => runs.filter((r) => r.variant.startsWith(name));
  const byPrompt = Object.fromEntries(['naive', 'careful'].map((name) => {
    const list = prompt(name);
    return [name, {
      runs: list.length, published: list.filter((r) => r.published).length, empty_notes: list.filter((r) => r.empty_notes).length, plan_missing: list.filter((r) => r.plan_missing).length,
      passes: Object.fromEntries(GRADERS.map((g) => [g, list.filter((r) => r.passes[g]).length])),
    }];
  }));
  const pairs = LLM.flatMap((a, i) => LLM.slice(i + 1).map((b) => ({ a, b, disagree: runs.filter((r) => r.passes[a] !== r.passes[b]).length })));
  const observed = Object.fromEntries(GRADERS.map((g) => [g, runs.filter((r) => r.passes[g]).length / runs.length]));
  const rogan = Object.fromEntries(LLM.map((g) => [g, { observed: observed[g], tpr: ratesSpec[g].tpr, tnr: ratesSpec[g].tnr, corrected: roganGladen(observed[g], ratesSpec[g].tpr, ratesSpec[g].tnr) }]));
  return { runs, byPrompt, pairs, observed, rogan, llm_split: runs.filter((r) => r.llm_split).length, all_split: runs.filter((r) => r.all_split).length };
}

function hypotheses(cells) {
  return Object.entries(EXPECTED).map(([variant, { text, graders, only }]) => {
    const cell = (g) => cells[g][variant];
    const full = graders.filter((g) => cell(g).found === cell(g).total);
    const some = graders.filter((g) => cell(g).found > 0);
    const others = GRADERS.filter((g) => !graders.includes(g) && cell(g).found > 0);
    const outcome = full.length === graders.length && !(only && others.length) ? 'eingetreten' : some.length ? 'teilweise' : 'nicht eingetreten';
    return { variant, expected: text, graders, found: Object.fromEntries(graders.map((g) => [g, cell(g)])), others, outcome };
  });
}

function compactArtifact(a, keep) {
  return {
    notes_md: a.notes_md, plan: a.plan, sandbox: { published: a.sandbox.published, version: a.sandbox.version, same_text: a.sandbox.notes === a.notes_md },
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
  const cells = matrix(v);
  return {
    prompt_version: prompts.version, models: prompts.params.models, raw: rawStats(),
    counts: { artifacts: new Set(v.map((i) => `${i.release}|${i.variant}`)).size, controls: rates.schema.clean, mutations: rates.schema.faulty, not_applicable: e1.not_applicable.length },
    matrix: cells, rates, rates_unique_text: ratesByGrader(unique),
    flakiness: flakiness(v), flakiness_unique_text: flakiness(unique),
    disagreements: llmOnly.filter((i) => !i.unanimous).map((i) => ({ release: i.release, variant: i.variant, grader: i.grader, passes: i.passes, reps: i.reps })),
    pairwise_order: orderAgreement(e1.rows.filter((r) => r.grader === 'pairwise')),
    pass_violation_mismatch: [...e1.rows, ...e3.rows, ...e4.rows].filter((r) => r.violations && r.pass !== (r.violations.length === 0)).length,
    hypotheses: hypotheses(cells), on_target: onTarget(e1.rows, fixtures, artifacts, key),
    e3: e3Table(e3), e4: e4Tables(e4, rates),
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
