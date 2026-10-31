import { t } from './t.mjs';

export default {
  id: 'r5',
  previous_version: '4.1.0',
  prs: [
    {
      number: 391, title: 'feat(store)!: require an explicit connection for RedisStore', labels: ['breaking', 'feature'], author: 'bollard-dev', merged_at: '2026-07-06',
      body: t`Connecting to §localhost:6379§ by default hid misconfigured deployments until the first job got lost.

BREAKING CHANGE: §new RedisStore()§ without §connection§ now throws.`,
      diff: t`--- a/src/store/redis.ts
+++ b/src/store/redis.ts
@@ -21,6 +21,8 @@ export class RedisStore implements Store {
-  constructor(opts: RedisStoreOptions = {}) {
-    this.client = new Redis(opts.connection ?? { host: 'localhost', port: 6379 });
+  constructor(opts: RedisStoreOptions) {
+    if (!opts?.connection) throw new QuaykitError('RedisStore needs a connection');
+    this.client = new Redis(opts.connection);
   }`,
    },
    {
      number: 393, title: 'chore: drop legacy option shims', labels: ['chore'], author: 'tidewatcher', merged_at: '2026-07-07',
      body: t`Removes code paths that have been sitting around for a while. Less code, less to maintain.`,
      diff: t`--- a/src/queue.ts
+++ b/src/queue.ts
@@ -131,6 +131,0 @@ export class Queue {
-  /** @deprecated Use {@link Queue.purge}. */
-  async clean(graceMs: number, status: JobStatus) {
-    warnOnce('queue.clean() is deprecated, use queue.purge({ status, olderThanMs })');
-    return this.purge({ status, olderThanMs: graceMs });
-  }
-
--- a/src/job.ts
+++ b/src/job.ts
@@ -21,5 +21,1 @@ export function normalize(opts: JobOptions) {
-  if (opts.timeout !== undefined) {
-    warnOnce('job option timeout is deprecated, use timeoutMs');
-    opts.timeoutMs ??= opts.timeout;
-  }
   return opts;
--- a/src/types.ts
+++ b/src/types.ts
@@ -13,3 +13,1 @@ export interface JobOptions {
-  /** @deprecated Use timeoutMs. */
-  timeout?: number;
   timeoutMs?: number;`,
    },
    {
      number: 395, title: 'feat(retry): add exponential jitter strategy', labels: ['feature'], author: 'harbormaster', merged_at: '2026-07-08',
      body: t`Opt in with §backoff: { type: 'jitter', baseMs }§. Helps against retry storms.

Closes #388`,
      diff: t`--- a/src/retry.ts
+++ b/src/retry.ts
@@ -7,4 +7,7 @@ export function nextDelay(attempt: number, backoff: Backoff) {
   if (backoff.type === 'fixed') return backoff.baseMs;
+  if (backoff.type === 'jitter') {
+    return Math.floor(Math.random() * backoff.baseMs * 2 ** attempt);
+  }
   return backoff.baseMs * 2 ** attempt;
 }`,
    },
    {
      number: 397, title: 'fix(worker): honor shutdownTimeoutMs during graceful close', labels: ['bug'], author: 'tidewatcher', merged_at: '2026-07-09',
      body: t`§worker.close()§ waited for active jobs forever and ignored the option.

Fixes #392`,
      diff: t`--- a/src/worker.ts
+++ b/src/worker.ts
@@ -203,3 +203,6 @@ export class Worker extends EventEmitter {
   async close() {
     this.running = false;
-    await Promise.all(this.active.values());
+    await Promise.race([
+      Promise.all(this.active.values()),
+      sleep(this.opts.shutdownTimeoutMs),
+    ]);
   }`,
    },
    {
      number: 399, title: 'chore(worker): deprecate boolean argument of worker.pause()', labels: ['deprecation'], author: 'tidewatcher', merged_at: '2026-07-10',
      body: t`§pause(true)§ does not say what it does. The boolean keeps working and warns once.`,
      diff: t`--- a/src/worker.ts
+++ b/src/worker.ts
@@ -188,3 +188,7 @@ export class Worker extends EventEmitter {
-  async pause(drain = false) {
+  async pause(opts: boolean | { drain?: boolean } = {}) {
+    if (typeof opts === 'boolean') {
+      warnOnce('worker.pause(boolean) is deprecated, use worker.pause({ drain })');
+      opts = { drain: opts };
+    }
+    const { drain = false } = opts;
     this.paused = true;`,
    },
    {
      number: 401, title: 'fix(cli): exit non-zero when inspect fails', labels: ['bug'], author: 'bollard-dev', merged_at: '2026-07-13',
      body: t`§quaykit inspect§ printed the error and exited with 0.`,
      diff: t`--- a/src/cli/index.ts
+++ b/src/cli/index.ts
@@ -18,3 +18,4 @@ main().catch((err) => {
   console.error(err.message);
+  process.exitCode = 1;
 });`,
    },
    {
      number: 402, title: 'docs: migration guide for v5', labels: ['docs'], author: 'bollard-dev', merged_at: '2026-07-14',
      body: t`Covers the store change.`,
      diff: t`--- /dev/null
+++ b/docs/migrate-v5.md
@@ -0,0 +1,3 @@
+# Migrating to v5
+
+Pass a §connection§ to §RedisStore§.`,
    },
    {
      number: 403, title: 'ci: publish with provenance', labels: ['ci'], author: 'bollard-dev', merged_at: '2026-07-14',
      body: t`Adds --provenance to the release workflow.`,
      diff: t`--- a/.github/workflows/release.yml
+++ b/.github/workflows/release.yml
@@ -20,1 +20,1 @@
-      - run: pnpm publish
+      - run: pnpm publish --provenance`,
    },
    {
      number: 404, title: 'refactor(store): extract key builder', labels: ['refactor'], author: 'harbormaster', merged_at: '2026-07-15',
      body: t`Pure move, shared with the Postgres store.`,
      diff: t`--- a/src/store/redis.ts
+++ b/src/store/redis.ts
@@ -3,2 +3,2 @@
-import { buildKeys } from './keys.js';
+import { buildKeys } from '../keys.js';`,
    },
    {
      number: 405, title: 'chore(deps-dev): bump vitest from 2.1.1 to 2.1.4', labels: ['dependencies'], author: 'dependabot[bot]', merged_at: '2026-07-15',
      body: t`Bumps vitest from 2.1.1 to 2.1.4.`,
      diff: t`--- a/package.json
+++ b/package.json
@@ -41,1 +41,1 @@
-    "vitest": "^2.1.1",
+    "vitest": "^2.1.4",`,
    },
  ],
  issues: [
    { number: 388, title: 'Retry storms after an outage', labels: ['enhancement'], body: t`All failed jobs come back at the same moment and knock the service over again.` },
    { number: 392, title: 'worker.close() hangs on deploy', labels: ['bug'], body: t`A stuck job keeps the process alive until the orchestrator kills it.` },
  ],
  cases: {
    kinds: ['hidden-breaking', 'internal', 'migration', 'deprecation'],
    breaking_prs: [391, 393],
    reverted_prs: [],
    internal_prs: [402, 403, 404, 405],
  },
  gold: {
    bump: 'major', version: '5.0.0',
    sections: ['Breaking Changes', 'Features', 'Fixes', 'Deprecations'],
    notes_md: t`# quaykit 5.0.0

This release makes the Redis connection explicit, removes two deprecated APIs, adds a jitter retry strategy and fixes graceful shutdown.

## Breaking Changes

- §new RedisStore()§ without §connection§ now throws instead of connecting to §localhost:6379§ (#391).
  Migration: pass §connection§ explicitly, for example §new RedisStore({ connection: { host: 'localhost', port: 6379 } })§.
- §queue.clean()§ and the job option §timeout§, both deprecated in earlier releases, have been removed (#393).
  Migration: call §queue.purge({ status, olderThanMs })§ and set §timeoutMs§.

## Features

- New retry strategy §backoff: { type: 'jitter', baseMs }§ spreads retries randomly so that they do not all arrive at once. It is opt-in (#395).

## Fixes

- §worker.close()§ now respects §shutdownTimeoutMs§ instead of waiting for active jobs forever (#397).
- §quaykit inspect§ exits with a non-zero code when it fails (#401).

## Deprecations

- Passing a boolean to §worker.pause()§ is deprecated and logs a warning once (#399).
  Migration: call §worker.pause({ drain: true })§.`,
  },
  variants: {
    'missing-breaking': {
      edits: [
        { find: t`This release makes the Redis connection explicit, removes two deprecated APIs, adds`, replace: t`This release makes the Redis connection explicit, adds` },
        { find: t`- §queue.clean()§ and the job option §timeout§, both deprecated in earlier releases, have been removed (#393).
  Migration: call §queue.purge({ status, olderThanMs })§ and set §timeoutMs§.
`, replace: '' },
      ],
    },
    'wrong-bump': {
      plan: { bump: 'minor', version: '4.2.0' },
      edits: [{ find: '# quaykit 5.0.0', replace: '# quaykit 4.2.0' }],
    },
    'ghost-pr': { edits: [{ find: '(#401)', replace: '(#400)' }] },
    'invented-claim': {
      edits: [{ find: t`spreads retries randomly so that they do not all arrive at once. It is opt-in (#395).`, replace: t`spreads retries randomly so that they do not all arrive at once. It is now the default for new queues (#395).` }],
    },
    'wrong-migration': {
      edits: [{ find: t`Migration: call §worker.pause({ drain: true })§.`, replace: t`Migration: call §worker.pause({ graceful: true })§.` }],
    },
    'reverted-listed': { na: 'Dieses Release enthält keinen Revert.' },
    'embargo-leak': { na: 'Dieses Release enthält keinen Embargo-Fix.' },
    'internal-noise': {
      plan: { sections: ['Breaking Changes', 'Features', 'Fixes', 'Deprecations', 'Internal'] },
      edits: [{ find: t`Migration: call §worker.pause({ drain: true })§.`, replace: t`Migration: call §worker.pause({ drain: true })§.

## Internal

- The release workflow now publishes with §--provenance§ (#403).
- The key builder moved to a shared module (#404).` }],
    },
    'hype-tone': {
      notes_md: t`# quaykit 5.0.0

The wait is over: quaykit 5.0.0 has landed! Experience explicit Redis connections, a radically leaner API, a stunning new jitter retry strategy and flawless graceful shutdown.

## Breaking Changes

- No more surprises: §new RedisStore()§ without §connection§ now throws instead of connecting to §localhost:6379§ (#391).
  Migration: simply pass §connection§ explicitly, for example §new RedisStore({ connection: { host: 'localhost', port: 6379 } })§.
- Leaner than ever: §queue.clean()§ and the job option §timeout§, both deprecated in earlier releases, have been removed (#393).
  Migration: call §queue.purge({ status, olderThanMs })§ and set §timeoutMs§.

## Features

- Meet the game-changing §backoff: { type: 'jitter', baseMs }§: it spreads retries randomly so that they do not all arrive at once. It is opt-in (#395).

## Fixes

- Shut down with confidence: §worker.close()§ now respects §shutdownTimeoutMs§ instead of waiting for active jobs forever (#397).
- §quaykit inspect§ now exits with a non-zero code when it fails (#401).

## Deprecations

- Passing a boolean to §worker.pause()§ is deprecated and logs a warning once (#399).
  Migration: enjoy the far more elegant §worker.pause({ drain: true })§.`,
    },
    'useless-true': {
      notes_md: t`# quaykit 5.0.0

This major version contains API changes and various improvements.

## Breaking Changes

- Store construction changed (#391).
- Old APIs were removed (#393).

## Features

- More retry options (#395).

## Fixes

- Shutdown behaviour improved (#397).
- CLI improvements (#401).

## Deprecations

- A worker argument is deprecated (#399).`,
    },
    'false-success': {},
    'lucky-path': {},
    gold: {},
    paraphrase: {
      notes_md: t`# quaykit 5.0.0

Redis connections must now be given explicitly, and two deprecated APIs are gone. On top of that there is a jitter option for retries and a fix for graceful shutdown.

## Breaking Changes

- Calling §new RedisStore()§ without a §connection§ raises an error now. It used to fall back to §localhost:6379§ (#391).
  Migration: always hand over a §connection§, such as §new RedisStore({ connection: { host: 'localhost', port: 6379 } })§.
- Both §queue.clean()§ and the job option §timeout§ are gone, after being deprecated in earlier releases (#393).
  Migration: use §queue.purge({ status, olderThanMs })§ and §timeoutMs§ in their place.

## Features

- Retries can opt in to §backoff: { type: 'jitter', baseMs }§, which randomises the delay so that jobs do not all come back at the same moment (#395).

## Fixes

- §shutdownTimeoutMs§ is now honoured by §worker.close()§, which previously waited for active jobs without any limit (#397).
- A failing §quaykit inspect§ now ends with a non-zero exit code (#401).

## Deprecations

- §worker.pause()§ with a boolean argument is deprecated and warns once (#399).
  Migration: write §worker.pause({ drain: true })§.`,
    },
    reordered: { reorder: ['Features', 'Fixes', 'Breaking Changes', 'Deprecations'] },
    'extra-diligent': {},
  },
  e3: {
    base: 'invented-claim',
    edits: [
      { find: t`This release makes the Redis connection explicit, removes two deprecated APIs, adds a jitter retry strategy and fixes graceful shutdown.`, replace: t`This release definitively makes the Redis connection explicit, fully removes two deprecated APIs, adds a proven jitter retry strategy and conclusively fixes graceful shutdown.` },
      { find: t`It is now the default for new queues (#395).`, replace: t`It is, without question, now the default for new queues (#395).` },
    ],
  },
};
