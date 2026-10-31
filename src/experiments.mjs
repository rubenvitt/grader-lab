// Grades artifacts: code graders directly, LLM graders through the session. Returns one row per repetition.
import { CODE_GRADERS } from './graders/code.mjs';
import { JUDGES, judgeRequest, pairwiseRequest, pairwiseVerdict } from './graders/llm.mjs';

const ORDERS = ['gold-first', 'candidate-first'];

function context(fixture, prompts) {
  return { release: fixture.release, gold: fixture.gold, cases: fixture.cases, params: prompts.params };
}

export function codeRows(item, fixture, prompts, experiment) {
  const ctx = context(fixture, prompts);
  return Object.entries(CODE_GRADERS).map(([grader, fn]) => {
    const { pass, findings, score } = fn(item.artifact, ctx);
    return { experiment, release: item.release, variant: item.variant, kind: item.kind, grader, rep: 0, pass, model: null, prompt_version: prompts.version, findings, ...(score != null ? { score } : {}) };
  });
}

// Every LLM request one artifact needs. Used for planning and grading, so both agree on the cache keys.
export function llmRequests(item, fixture, prompts, reps) {
  const notes = item.artifact.notes_md;
  const out = [];
  for (let rep = 1; rep <= reps; rep++) {
    for (const grader of JUDGES) out.push({ grader, rep, ...judgeRequest(grader, notes, fixture, prompts) });
    for (const order of ORDERS) out.push({ grader: 'pairwise', order, rep, ...pairwiseRequest(order, notes, fixture, prompts) });
  }
  return out;
}

export async function gradeLlm(item, fixture, prompts, reps, session, experiment) {
  const requests = llmRequests(item, fixture, prompts, reps);
  const meta = { experiment, release: item.release, variant: item.variant };
  const answers = await Promise.allSettled(requests.map((r) => session.call({ ...r, meta: { ...meta, grader: r.grader, order: r.order } })));
  const base = { experiment, release: item.release, variant: item.variant, kind: item.kind, prompt_version: prompts.version };
  const rows = [];
  const pairs = new Map();
  answers.forEach((a, i) => {
    const r = requests[i];
    if (a.status !== 'fulfilled') return;
    const raw = `${a.value.input_hash}-${r.model}-r${r.rep}.json`;
    if (r.grader !== 'pairwise') {
      rows.push({ ...base, grader: r.grader, rep: r.rep, pass: a.value.parsed.pass, model: r.model, reason: a.value.parsed.reason, violations: a.value.parsed.violations, tainted: a.value.tainted, raw });
      return;
    }
    const pair = pairs.get(r.rep) ?? {};
    pairs.set(r.rep, { ...pair, [r.order]: a.value, raws: [...(pair.raws ?? []), raw] });
  });
  for (const [rep, pair] of pairs) {
    if (!pair['gold-first'] || !pair['candidate-first']) continue;
    const { pass, order_flip, reason } = pairwiseVerdict(pair['gold-first'].parsed, pair['candidate-first'].parsed);
    rows.push({ ...base, grader: 'pairwise', rep, pass, order_flip, model: prompts.params.models.judge, reason, tainted: pair['gold-first'].tainted || pair['candidate-first'].tainted, raw: pair.raws });
  }
  return rows;
}
