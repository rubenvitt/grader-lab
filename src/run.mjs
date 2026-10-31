// CLI: node src/run.mjs <plan|smoke|e1|e3|e4> [--max-seconds N] [--concurrency N] [--only <release>]
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { runAgent } from './agent.mjs';
import { callModel } from './engine/call-model.mjs';
import { countUsed, createSession, rawName } from './engine/session.mjs';
import { codeRows, gradeLlm, llmRequests } from './experiments.mjs';
import { loadReleases, loadToy } from './fixtures.mjs';
import { judgeRequest, loadPrompts, pairwiseRequest } from './graders/llm.mjs';
import { artifactsFor, distractionPair, notApplicable } from './mutate.mjs';

const root = new URL('..', import.meta.url).pathname;
const RAW = join(root, 'data/raw');
const RESULTS = join(root, 'data/results');
const BUDGET = 1500;
// Default stays below the 9-minute limit even with a call in flight at the deadline (timeout 120 s).
const DEFAULT_MAX_SECONDS = 400;
const ESTIMATED_AGENT_TURNS = 5;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { 'max-seconds': { type: 'string' }, concurrency: { type: 'string' }, only: { type: 'string' } },
});
const command = positionals[0];
const prompts = loadPrompts();
const fixtures = loadReleases();
const byId = new Map(fixtures.map((f) => [f.release.id, f]));

const session = (rawDir = RAW) => createSession({
  rawDir, callModel, budget: BUDGET,
  concurrency: Number(values.concurrency ?? 6),
  maxSeconds: Number(values['max-seconds'] ?? DEFAULT_MAX_SECONDS),
});

function finish(name, s, payload, expected) {
  mkdirSync(RESULTS, { recursive: true });
  const summary = s.summary();
  const complete = !summary.stopped && summary.failed === 0;
  writeFileSync(join(RESULTS, `${name}.json`), JSON.stringify({ complete, prompt_version: prompts.version, expected, ...payload }, null, 1));
  appendFileSync(join(RESULTS, 'run-log.jsonl'), JSON.stringify({ at: new Date().toISOString(), name, ...summary, complete }) + '\n');
  console.log(JSON.stringify({ name, complete, ...summary }));
  if (summary.stopped === 'rate-limit') { console.error('RATE LIMIT: Stand ist gesichert, Lauf gestoppt.'); process.exit(3); }
  if (summary.stopped && summary.stopped !== 'max-seconds') process.exit(4);
  if (!complete) process.exit(2); // partial: call again to continue
}

const e1Items = () => fixtures.flatMap((f) => artifactsFor(f));
const e3Items = () => fixtures.flatMap((f) => distractionPair(f));

async function gradeAll(items, name, reps, s) {
  const code = items.flatMap((i) => codeRows(i, byId.get(i.release), prompts, name));
  const llm = (await Promise.all(items.map((i) => gradeLlm(i, byId.get(i.release), prompts, reps, s, name)))).flat();
  return [...code, ...llm];
}

function plan() {
  const unique = (requests) => [...new Set(requests.map(rawName))];
  const requestsFor = (items, reps) => items.flatMap((i) => llmRequests(i, byId.get(i.release), prompts, reps));
  const e1 = unique(requestsFor(e1Items(), prompts.params.repetitions.e1));
  const e3 = unique(requestsFor(e3Items(), prompts.params.repetitions.e3)).filter((n) => !e1.includes(n));
  const runs = fixtures.length * 2 * prompts.params.agent.runs_per_prompt;
  const e4 = {
    agent_runs: runs,
    agent_calls_estimate: runs * ESTIMATED_AGENT_TURNS,
    agent_calls_max: runs * prompts.params.agent.max_turns,
    grading_calls_estimate: runs * 5 * prompts.params.repetitions.e4,
  };
  const cached = [...e1, ...e3].filter((n) => existsSync(join(RAW, n))).length;
  const used = countUsed(RAW);
  const total = e1.length + e3.length + e4.agent_calls_estimate + e4.grading_calls_estimate;
  console.log(JSON.stringify({
    artifacts_e1: e1Items().length,
    not_applicable: fixtures.flatMap(notApplicable).length,
    planned_calls: { e1: e1.length, e3_new: e3.length, e4 },
    total_estimate: total,
    total_worst_case: e1.length + e3.length + e4.agent_calls_max + e4.grading_calls_estimate,
    budget: BUDGET, used, cached_of_e1_e3: cached,
    fits: used + total - cached <= BUDGET,
  }, null, 1));
}

// Outside the evaluation: three calls that check agent protocol and both judge shapes against the real models.
async function smoke() {
  const toy = loadToy();
  const s = session(join(RAW, 'smoke'));
  const notes = toy.gold.notes_md;
  const once = { ...prompts, params: { ...prompts.params, agent: { ...prompts.params.agent, max_turns: 1 } } };
  const agent = await runAgent({ fixture: toy, promptVariant: 'careful', run: 1, session: s, prompts: once });
  const judge = await s.call({ ...judgeRequest('judge-sourced', notes, toy, prompts), rep: 1, meta: { experiment: 'smoke' } });
  const pair = await s.call({ ...pairwiseRequest('gold-first', notes.replace('prints the installed version', 'prints the version'), toy, prompts), rep: 1, meta: { experiment: 'smoke' } });
  console.log(JSON.stringify({ agent: { status: agent.status, transcript: agent.artifact.transcript }, judge: judge.parsed, pair: pair.parsed, tainted: [judge.tainted, pair.tainted], usage: [judge.usage, pair.usage], summary: s.summary() }, null, 1));
}

async function e1() {
  const s = session();
  const items = e1Items();
  const rows = await gradeAll(items, 'e1', prompts.params.repetitions.e1, s);
  finish('e1', s, { rows, not_applicable: fixtures.flatMap(notApplicable) }, items.length);
}

async function e3() {
  const s = session();
  const items = e3Items();
  const rows = await gradeAll(items, 'e3', prompts.params.repetitions.e3, s);
  finish('e3', s, { rows }, items.length);
}

async function e4() {
  const s = session();
  const name = values.only ? `e4-${values.only}` : 'e4';
  const jobs = fixtures.filter((f) => !values.only || f.release.id === values.only).flatMap((fixture) => ['naive', 'careful'].flatMap((promptVariant) =>
    Array.from({ length: prompts.params.agent.runs_per_prompt }, (_, i) => ({ fixture, promptVariant, run: i + 1 }))));
  const settled = await Promise.allSettled(jobs.map((j) => runAgent({ ...j, session: s, prompts })));
  const runs = jobs.flatMap((j, i) => (settled[i].status === 'fulfilled' ? [{
    release: j.fixture.release.id, variant: `${j.promptVariant}-${j.run}`, kind: 'agent', model: prompts.params.models.agent, ...settled[i].value,
  }] : []));
  const rows = await gradeAll(runs, name, prompts.params.repetitions.e4, s);
  finish(name, s, { runs, rows }, jobs.length);
}

const commands = { plan, smoke, e1, e3, e4 };
if (!commands[command]) {
  console.error('usage: node src/run.mjs <plan|smoke|e1|e3|e4> [--max-seconds N] [--concurrency N] [--only <release>]');
  process.exit(1);
}
await commands[command]();
