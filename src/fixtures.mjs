import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../fixtures/', import.meta.url).pathname;
const json = (dir, name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));

export function loadDir(dir) {
  return {
    release: json(dir, 'release.json'),
    gold: json(dir, 'gold.json'),
    cases: json(dir, 'cases.json'),
    ...json(dir, 'variants.json'),
  };
}

export const loadRelease = (id) => loadDir(join(root, 'releases', id));
export const loadToy = () => loadDir(join(root, 'smoke/toy'));
export const releaseIds = () => readdirSync(join(root, 'releases')).sort();
export const loadReleases = () => releaseIds().map(loadRelease);
