import { t } from './t.mjs';

export default {
  id: 'r4',
  previous_version: '4.0.0',
  prs: [
    {
      number: 371, title: 'feat(worker): add rate limiter', labels: ['feature'], author: 'harbormaster', merged_at: '2026-06-01',
      body: t`Adds §limiter: { max, durationMs }§ to the worker options, so a worker can stay below the limits of a downstream API.

Closes #369`,
      diff: t`--- a/src/types.ts
+++ b/src/types.ts
@@ -44,4 +44,5 @@ export interface WorkerOptions {
   shutdownTimeoutMs?: number;
+  limiter?: { max: number; durationMs: number };
 }
--- a/src/worker.ts
+++ b/src/worker.ts
@@ -120,2 +120,3 @@ export class Worker extends EventEmitter {
+    if (this.limiter) await this.limiter.wait();
     const job = await this.store.next(this.keys.wait, this.opts.pollMs);`,
    },
    {
      number: 373, title: 'Revert "feat(worker): add rate limiter"', labels: ['revert'], author: 'tidewatcher', merged_at: '2026-06-03',
      body: t`This reverts #371. Waiting in the poll loop blocks lock renewal, jobs got marked as stalled under load.`,
      diff: t`--- a/src/types.ts
+++ b/src/types.ts
@@ -44,5 +44,4 @@ export interface WorkerOptions {
   shutdownTimeoutMs?: number;
-  limiter?: { max: number; durationMs: number };
 }
--- a/src/worker.ts
+++ b/src/worker.ts
@@ -120,3 +120,2 @@ export class Worker extends EventEmitter {
-    if (this.limiter) await this.limiter.wait();
     const job = await this.store.next(this.keys.wait, this.opts.pollMs);`,
    },
    {
      number: 376, title: 'feat(worker): add rate limiter (reland)', labels: ['feature'], author: 'harbormaster', merged_at: '2026-06-08',
      body: t`Second attempt at #371. The limiter now runs outside the poll loop so lock renewal keeps going. The option is §limiter: { max, perMs }§, §durationMs§ read like the job duration in review.

Closes #369`,
      diff: t`--- a/src/types.ts
+++ b/src/types.ts
@@ -44,4 +44,5 @@ export interface WorkerOptions {
   shutdownTimeoutMs?: number;
+  limiter?: { max: number; perMs: number };
 }
--- a/src/worker.ts
+++ b/src/worker.ts
@@ -72,3 +72,5 @@ export class Worker extends EventEmitter {
   private async loop() {
+    // One token bucket per worker instance, deliberately not shared.
+    this.bucket = this.opts.limiter ? new TokenBucket(this.opts.limiter) : null;
     while (this.running) {
@@ -120,2 +122,3 @@ export class Worker extends EventEmitter {
+    if (this.bucket && !this.bucket.take()) return this.scheduleWake(this.bucket.nextInMs());
     const job = await this.store.next(this.keys.wait, this.opts.pollMs);`,
    },
    {
      number: 378, title: 'chore(queue): deprecate job option timeout in favour of timeoutMs', labels: ['deprecation'], author: 'tidewatcher', merged_at: '2026-06-10',
      body: t`All other durations carry a unit. Both names work, §timeout§ logs a warning once.`,
      diff: t`--- a/src/types.ts
+++ b/src/types.ts
@@ -12,3 +12,5 @@ export interface JobOptions {
   backoffMs?: number;
+  /** @deprecated Use timeoutMs. */
   timeout?: number;
+  timeoutMs?: number;
 }
--- a/src/job.ts
+++ b/src/job.ts
@@ -21,2 +21,5 @@ export function normalize(opts: JobOptions) {
+  if (opts.timeout !== undefined) {
+    warnOnce('job option timeout is deprecated, use timeoutMs');
+    opts.timeoutMs ??= opts.timeout;
+  }
   return opts;`,
    },
    {
      number: 379, title: 'ci: add CodeQL workflow', labels: ['ci'], author: 'bollard-dev', merged_at: '2026-06-11',
      body: t`Runs on push to main.`,
      diff: t`--- /dev/null
+++ b/.github/workflows/codeql.yml
@@ -0,0 +1,4 @@
+name: CodeQL
+on:
+  push:
+    branches: [main]`,
    },
    {
      number: 381, title: 'chore(deps-dev): bump eslint from 9.3.0 to 9.10.0', labels: ['dependencies'], author: 'dependabot[bot]', merged_at: '2026-06-12',
      body: t`Bumps eslint from 9.3.0 to 9.10.0.`,
      diff: t`--- a/package.json
+++ b/package.json
@@ -37,1 +37,1 @@
-    "eslint": "^9.3.0",
+    "eslint": "^9.10.0",`,
    },
  ],
  issues: [
    { number: 369, title: 'Throttle job processing', labels: ['enhancement'], body: t`We call an API that allows 100 requests per minute. It would be great if the worker could stay below that.` },
  ],
  cases: {
    kinds: ['feature-revert', 'internal', 'deprecation'],
    breaking_prs: [],
    reverted_prs: [371],
    internal_prs: [379, 381],
  },
  gold: {
    bump: 'minor', version: '4.1.0',
    sections: ['Features', 'Deprecations'],
    notes_md: t`# quaykit 4.1.0

This release adds a rate limiter for workers and deprecates the job option §timeout§.

## Features

- §Worker§ accepts §limiter: { max, perMs }§ to process at most §max§ jobs per §perMs§ milliseconds. Each worker instance has its own limit (#376).

## Deprecations

- The job option §timeout§ is deprecated and logs a warning once. It keeps working for now (#378).
  Migration: use §timeoutMs§ instead.`,
  },
  variants: {
    'missing-breaking': { na: 'Dieses Release enthält keinen Breaking Change.' },
    'wrong-bump': { na: 'Das Release ist kein Major-Release, „minor statt major“ ist nicht definiert.' },
    'ghost-pr': { edits: [{ find: '(#376)', replace: '(#377)' }] },
    'invented-claim': {
      edits: [{ find: t`Each worker instance has its own limit (#376).`, replace: t`The limit is shared across all workers of a queue (#376).` }],
    },
    'wrong-migration': {
      edits: [{ find: t`Migration: use §timeoutMs§ instead.`, replace: t`Migration: use §timeoutMillis§ instead.` }],
    },
    'reverted-listed': {
      edits: [{ find: t`- §Worker§ accepts §limiter: { max, perMs }§ to process at most §max§ jobs per §perMs§ milliseconds. Each worker instance has its own limit (#376).`, replace: t`- §Worker§ accepts §limiter: { max, durationMs }§ to process at most §max§ jobs per §durationMs§ milliseconds (#371).` }],
    },
    'embargo-leak': { na: 'Dieses Release enthält keinen Embargo-Fix.' },
    'internal-noise': {
      plan: { sections: ['Features', 'Deprecations', 'Maintenance'] },
      edits: [{ find: t`Migration: use §timeoutMs§ instead.`, replace: t`Migration: use §timeoutMs§ instead.

## Maintenance

- A CodeQL workflow now runs on every push to main (#379).
- Bumped eslint to 9.10.0 (#381).` }],
    },
    'hype-tone': {
      notes_md: t`# quaykit 4.1.0

Take control like never before! quaykit 4.1.0 brings a powerful new rate limiter to your workers and paves the way for cleaner job options with §timeoutMs§.

## Features

- Introducing the incredible rate limiter: §Worker§ accepts §limiter: { max, perMs }§ to process at most §max§ jobs per §perMs§ milliseconds. Each worker instance has its own limit, so you stay effortlessly in charge (#376).

## Deprecations

- The job option §timeout§ is deprecated and logs a warning once. It keeps working for now (#378).
  Migration: upgrade to the sleek new §timeoutMs§ instead.`,
    },
    'useless-true': {
      notes_md: t`# quaykit 4.1.0

Bug fixes and improvements, plus a small worker addition.

## Features

- Workers can now be configured with more options (#376).

## Deprecations

- A job option has been deprecated (#378).`,
    },
    'false-success': {},
    'lucky-path': {},
    gold: {},
    paraphrase: {
      notes_md: t`# quaykit 4.1.0

Workers get a rate limiter in this version, and the job option §timeout§ is on its way out.

## Features

- With §limiter: { max, perMs }§ a §Worker§ handles no more than §max§ jobs within §perMs§ milliseconds. The limit applies per worker instance (#376).

## Deprecations

- §timeout§ as a job option still works, but it is deprecated now and warns once (#378).
  Migration: switch to §timeoutMs§.`,
    },
    reordered: { reorder: ['Deprecations', 'Features'] },
    'extra-diligent': {},
  },
  e3: {
    base: 'invented-claim',
    edits: [
      { find: t`This release adds a rate limiter for workers and deprecates the job option §timeout§.`, replace: t`This release delivers a proven rate limiter for workers and deprecates the job option §timeout§.` },
      { find: t`The limit is shared across all workers of a queue (#376).`, replace: t`The limit is reliably shared across all workers of a queue, without exception (#376).` },
    ],
  },
};
