// Pure judge logic without node imports: `npm run report` copies this file into the demo, which runs it in the browser.
export const fill = (template, values) => template.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k]);

export const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['violations', 'reason', 'pass'],
  properties: {
    violations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['criterion', 'evidence'],
        properties: { criterion: { type: 'string' }, evidence: { type: 'string' } },
      },
    },
    reason: { type: 'string' },
    pass: { type: 'boolean' },
  },
};

export const PAIRWISE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reason', 'better'],
  properties: { reason: { type: 'string' }, better: { type: 'string', enum: ['A', 'B', 'equal'] } },
};

export function renderSources(release) {
  const prs = release.prs.map((p) => [
    `--- PR #${p.number}: ${p.title}`,
    `Labels: ${p.labels.join(', ') || '(keine)'}`,
    `Autor: ${p.author}, gemergt: ${p.merged_at}`,
    `Text:\n${p.body}`,
    `Diff:\n${p.diff}`,
  ].join('\n'));
  const issues = release.issues.map((i) => `--- Issue #${i.number}: ${i.title}\nLabels: ${i.labels.join(', ')}\nText:\n${i.body}`);
  return [...prs, ...issues].join('\n\n');
}

export const JUDGES = ['judge-ref', 'judge-sourced', 'judge-blind'];
export const LLM_GRADERS = [...JUDGES, 'pairwise'];

export function judgeRequest(grader, notes, { release, gold }, prompts) {
  const { rubric, params } = prompts;
  const prompt = fill(prompts[grader], {
    rubric, notes, gold: gold.notes_md, previous_version: release.previous_version, sources: renderSources(release),
  });
  return { model: params.models.judge, effort: params.models.effort, prompt, schema: VERDICT_SCHEMA };
}

export function pairwiseRequest(order, notes, { gold }, prompts) {
  const [a, b] = order === 'gold-first' ? [gold.notes_md, notes] : [notes, gold.notes_md];
  const prompt = fill(prompts.pairwise, { rubric: prompts.rubric, a, b });
  return { model: prompts.params.models.judge, effort: prompts.params.models.effort, prompt, schema: PAIRWISE_SCHEMA };
}

export const goldPreferred = (order, parsed) => parsed.better === (order === 'gold-first' ? 'A' : 'B');
export const candidatePreferred = (order, parsed) => parsed.better === (order === 'gold-first' ? 'B' : 'A');

// Frozen rule: one repetition fails only if gold wins in both orders.
export function pairwiseVerdict(goldFirst, candidateFirst) {
  const gold = [goldPreferred('gold-first', goldFirst), goldPreferred('candidate-first', candidateFirst)];
  const candidate = [candidatePreferred('gold-first', goldFirst), candidatePreferred('candidate-first', candidateFirst)];
  return {
    pass: !(gold[0] && gold[1]),
    order_flip: (gold[0] && candidate[1]) || (candidate[0] && gold[1]),
    reason: `Gold zuerst: ${goldFirst.better}, ${goldFirst.reason} | Kandidat zuerst: ${candidateFirst.better}, ${candidateFirst.reason}`,
  };
}
