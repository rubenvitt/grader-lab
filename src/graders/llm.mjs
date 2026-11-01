// Renders judge prompts and turns raw answers into verdicts. Rendering must stay deterministic: it feeds the cache key.
import { readFileSync } from 'node:fs';

const dir = (version) => new URL(`../../graders/prompts/${version}/`, import.meta.url);

export function loadPrompts(version = 'v1') {
  const read = (name) => readFileSync(new URL(name, dir(version)), 'utf8');
  return {
    version,
    params: JSON.parse(read('params.json')),
    rubric: read('rubric.md').trim(),
    'judge-ref': read('judge-ref.md'),
    'judge-sourced': read('judge-sourced.md'),
    'judge-blind': read('judge-blind.md'),
    pairwise: read('pairwise.md'),
    'agent-protocol': read('agent-protocol.md'),
    'agent-naive': read('agent-naive.md').trim(),
    'agent-careful': read('agent-careful.md').trim(),
  };
}

export * from './llm-core.mjs';
