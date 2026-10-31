// The agent under test: a plain tool loop over repeated, stateless model calls.
import { fill } from './graders/llm.mjs';

const nullable = (type) => ({ type: [type, 'null'] });

export const ACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['calls'],
  properties: {
    calls: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tool', 'id', 'version', 'notes', 'bump', 'sections'],
        properties: {
          tool: { type: 'string', enum: ['list_prs', 'get_pr', 'get_diff', 'get_issue', 'publish_release', 'finish'] },
          id: nullable('integer'),
          version: nullable('string'),
          notes: nullable('string'),
          bump: nullable('string'),
          sections: { type: ['array', 'null'], items: { type: 'string' } },
        },
      },
    },
  },
};

export function createTools(release) {
  const pr = (id) => release.prs.find((p) => p.number === id);
  const sandbox = { published: false, version: null, notes: null };
  const notFound = (id) => ({ error: `#${id} not found` });
  return {
    sandbox,
    list_prs: () => release.prs.map(({ number, title, labels }) => ({ id: number, title, labels })),
    get_pr: ({ id }) => {
      const p = pr(id);
      return p ? { id, title: p.title, labels: p.labels, author: p.author, merged_at: p.merged_at, body: p.body } : notFound(id);
    },
    get_diff: ({ id }) => (pr(id) ? { id, diff: pr(id).diff } : notFound(id)),
    get_issue: ({ id }) => release.issues.find((i) => i.number === id) ?? notFound(id),
    publish_release: ({ version, notes }) => {
      if (sandbox.published) return { error: 'already published' };
      if (!version || !notes) return { error: 'version and notes are required' };
      Object.assign(sandbox, { published: true, version, notes });
      return { published: true, version };
    },
  };
}

function argsOf({ tool, id, version, notes }) {
  if (tool === 'publish_release') return { version, notes };
  return tool === 'list_prs' ? {} : { id };
}

export async function runAgent({ fixture, promptVariant, run, session, prompts }) {
  const { release } = fixture;
  const { params } = prompts;
  const maxTurns = params.agent.max_turns;
  const model = params.models.agent;
  const tools = createTools(release);
  const transcript = [];
  const history = [];
  let finished = null;
  let status = 'max_turns';

  for (let turn = 1; turn <= maxTurns && !finished; turn++) {
    const prompt = fill(prompts['agent-protocol'], {
      previous_version: release.previous_version,
      max_turns: maxTurns,
      instructions: prompts[`agent-${promptVariant}`],
      history: history.length ? JSON.stringify(history) : '(noch keine Züge)',
    });
    const answer = await session.call({
      model, effort: params.models.effort, prompt, schema: ACTION_SCHEMA, rep: run,
      meta: { experiment: 'e4', release: release.id, prompt: promptVariant, run, turn },
    });
    const { calls } = answer.parsed;
    if (!calls.length) { status = 'no_calls'; break; }
    const results = [];
    for (const call of calls) {
      if (call.tool === 'finish') { finished = call; status = 'finished'; break; }
      const args = argsOf(call);
      const result = tools[call.tool](args);
      transcript.push({ turn, tool: call.tool, args, ok: !result.error });
      results.push({ tool: call.tool, args, result });
    }
    history.push({ turn, results });
  }

  const { sandbox } = tools;
  return {
    status,
    turns: Math.max(0, ...transcript.map((c) => c.turn)),
    artifact: {
      notes_md: finished?.notes ?? sandbox.notes ?? '',
      plan: { bump: finished?.bump ?? null, version: finished?.version ?? null, sections: finished?.sections ?? null },
      transcript,
      sandbox: { ...sandbox },
    },
  };
}
