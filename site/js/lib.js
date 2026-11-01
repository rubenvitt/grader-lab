// Pure logic of the workbench without DOM access, tested in test/site.test.mjs.
import { CODE_GRADERS } from './code.js';
import { JUDGES, judgeRequest, pairwiseRequest, pairwiseVerdict } from './llm-core.js';

export const LIVE_CALLS = JUDGES.length + 2; // pairwise is two calls, one per order

// Word diff via longest common subsequence. Whitespace tokens stay, so the result keeps the line breaks.
export function diffWords(a, b) {
  const [x, y] = [a.split(/(\s+)/), b.split(/(\s+)/)];
  const width = y.length + 1;
  const lengths = new Uint16Array((x.length + 1) * width);
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      lengths[i * width + j] = x[i] === y[j]
        ? lengths[(i + 1) * width + j + 1] + 1
        : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
    }
  }
  const parts = [];
  const push = (type, text) => {
    if (parts.at(-1)?.type === type) parts.at(-1).text += text;
    else parts.push({ type, text });
  };
  let [i, j] = [0, 0];
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) { push('same', x[i]); i++; j++; }
    else if (j < y.length && (i === x.length || lengths[i * width + j + 1] >= lengths[(i + 1) * width + j])) push('add', y[j++]);
    else push('del', x[i++]);
  }
  return parts;
}

// Keeps the changes and a few words around them, long unchanged stretches become a gap.
export function compactDiff(parts, words = 5) {
  return parts.flatMap((part, i) => {
    if (part.type !== 'same') return [part];
    const tokens = part.text.split(/(\s+)/);
    const context = words * 2; // every word comes with its whitespace token
    const [head, tail] = [i === 0 ? 0 : context, i === parts.length - 1 ? 0 : context];
    if (tokens.length <= head + tail + 1) return [part];
    return [
      ...(head ? [{ type: 'same', text: tokens.slice(0, head).join('') }] : []),
      { type: 'gap', text: ' … ' },
      ...(tail ? [{ type: 'same', text: tokens.slice(-tail).join('') }] : []),
    ];
  });
}

// The editable state of one version. An override stays null where the sandbox simply follows plan and text.
export const stateFrom = (artifact) => ({
  notes: artifact.notes_md,
  plan: artifact.plan,
  published: artifact.sandbox.published,
  publishedVersion: artifact.sandbox.version === artifact.plan.version ? null : artifact.sandbox.version,
  publishedNotes: artifact.sandbox.notes ?? null,
  readDiffs: artifact.read_diffs,
});

// Turn numbers only need to say "diffs before publishing", that is all the trajectory grader reads.
export function buildArtifact(state) {
  const { notes, plan, published, publishedVersion, publishedNotes, readDiffs } = state;
  return {
    notes_md: notes,
    plan,
    transcript: [
      ...readDiffs.map((id) => ({ turn: 1, tool: 'get_diff', args: { id }, ok: true })),
      ...(published ? [{ turn: 2, tool: 'publish_release', args: {}, ok: true }] : []),
    ],
    sandbox: { published, version: published ? publishedVersion ?? plan.version : null, notes: published ? publishedNotes ?? notes : null },
  };
}

export const graderContext = (release, params) => ({ release, gold: release.gold, cases: release.cases, params });

// The frozen schema grader throws on a half-typed heading such as "## ", which must not take the page down.
export function gradeCode(artifact, ctx) {
  return Object.fromEntries(Object.entries(CODE_GRADERS).map(([id, grade]) => {
    try {
      return [id, grade(artifact, ctx)];
    } catch {
      return [id, { pass: false, findings: ['Grader abgebrochen: Text lässt sich nicht lesen, etwa eine Überschrift ohne Titel'] }];
    }
  }));
}

// Judges only ever see the text, so a recorded verdict holds for every version with that exact text in this release.
export function recordedFor(demo, release, notes, variant) {
  const hits = [...demo.e1, ...demo.e4].filter((x) => x.release === release && x.artifact.notes_md === notes);
  return hits.find((x) => x.variant === variant) ?? hits[0] ?? null;
}

const repetitions = (n) => `${n} ${n === 1 ? 'Wiederholung' : 'Wiederholungen'}`;

// One model grader in its current state: live, recorded, stale or unchecked. An error never hides what is known.
export function modelVerdict(grader, { recorded, live, release, notes, judgeModel }) {
  const here = live?.release === release ? live : null;
  const result = here?.results[grader];
  const fresh = here?.notes === notes;
  const error = fresh ? result?.error : undefined;
  if (fresh && result?.pass !== undefined) return { state: 'live', ...result, source: `live · ${here.model}` };
  if (recorded) {
    const v = recorded.verdicts[grader];
    return { state: 'recorded', pass: v.pass, reason: v.reason, violations: v.violations, passes: v.passes, reps: v.reps, error, source: `aufgezeichnet · ${judgeModel} · ${repetitions(v.reps)}` };
  }
  if (result?.pass !== undefined) return { state: 'stale', ...result, source: `live · ${here.model} · veraltet` };
  return { state: 'unchecked', error };
}

const JSON_HEADER = { 'content-type': 'application/json' };
const userPrompt = (prompt) => [{ role: 'user', content: prompt }];

export const PROVIDERS = {
  openai: {
    label: 'OpenAI',
    model: 'gpt-6.1-terra',
    url: 'https://api.openai.com/v1/chat/completions',
    request: ({ key, model, effort, prompt, schema }) => ({
      headers: { ...JSON_HEADER, authorization: `Bearer ${key}` },
      body: { model, reasoning_effort: effort, messages: userPrompt(prompt), response_format: { type: 'json_schema', json_schema: { name: 'verdict', strict: true, schema } } },
    }),
    text: ({ choices: [{ message, finish_reason }] }) => (finish_reason === 'stop' && !message.refusal ? message.content : null),
  },
  anthropic: {
    label: 'Anthropic',
    model: 'claude-sonnet-5-5',
    url: 'https://api.anthropic.com/v1/messages',
    // Forced tool_choice answers 400 on claude-sonnet-5-5, structured output gives the same schema guarantee.
    request: ({ key, model, effort, prompt, schema }) => ({
      headers: { ...JSON_HEADER, 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: { model, max_tokens: 16000, messages: userPrompt(prompt), output_config: { effort, format: { type: 'json_schema', schema } } },
    }),
    text: ({ stop_reason, content }) => (stop_reason === 'end_turn' ? content.find((b) => b.type === 'text').text : null),
  },
};

// Own wording only: an error body can quote parts of the key, so it is never read.
function statusMessage(status) {
  if (status === 401 || status === 403) return `Der Anbieter lehnt den Key ab (${status}).`;
  if (status === 429) return 'Rate-Limit oder Guthaben erschöpft (429).';
  if (status === 400 || status === 404) return `Der Anbieter lehnt Modell oder Parameter ab (${status}). Prüfe den Modellnamen.`;
  return `Der Anbieter antwortet mit Status ${status}.`;
}

async function callProvider({ provider, key, model, effort }, { prompt, schema }, fetchFn) {
  const { url, request, text } = PROVIDERS[provider];
  const { headers, body } = request({ key, model, effort, prompt, schema });
  let response;
  try {
    response = await fetchFn(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
  } catch {
    throw new Error('Kein Kontakt zum Anbieter: Netz, CORS oder Zeitüberschreitung.');
  }
  if (!response.ok) throw new Error(statusMessage(response.status));
  try {
    const parsed = JSON.parse(text(await response.json()));
    if (schema.required.every((field) => field in parsed)) return parsed;
  } catch { /* falls through to the same message */ }
  throw new Error('Die Antwort passt nicht zum Schema, oder der Anbieter hat abgebrochen.');
}

// The same five requests as one repetition in the lab. Each grader keeps its own result or error.
export async function runJudges(connection, release, notes, prompts, fetchFn = fetch) {
  const call = (request) => callProvider({ ...connection, effort: prompts.params.models.effort }, request, fetchFn);
  const ctx = { release, gold: release.gold };
  const settled = await Promise.allSettled([
    ...JUDGES.map((grader) => call(judgeRequest(grader, notes, ctx, prompts))),
    call(pairwiseRequest('gold-first', notes, ctx, prompts)),
    call(pairwiseRequest('candidate-first', notes, ctx, prompts)),
  ]);
  const results = Object.fromEntries(JUDGES.map((grader, i) => {
    const { status, value, reason } = settled[i];
    return [grader, status === 'rejected' ? { error: reason.message } : value];
  }));
  const [goldFirst, candidateFirst] = settled.slice(JUDGES.length);
  const failed = [goldFirst, candidateFirst].find((s) => s.status === 'rejected');
  results.pairwise = failed ? { error: failed.reason.message } : pairwiseVerdict(goldFirst.value, candidateFirst.value);
  return { release: release.id, notes, model: connection.model, results };
}
