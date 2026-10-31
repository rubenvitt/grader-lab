import { t } from './t.mjs';

export default {
  id: 'r1',
  previous_version: '2.3.2',
  prs: [
    {
      number: 301, title: 'feat(queue): add priority lanes', labels: ['feature'], author: 'harbormaster', merged_at: '2026-03-02',
      body: t`Adds named lanes to a queue. Jobs added with §lane§ are picked up from the highest lane first.

Closes #296`,
      diff: t`--- a/src/queue.ts
+++ b/src/queue.ts
@@ -18,6 +18,8 @@ export interface QueueOptions {
   connection: StoreConnection;
   defaultJobOptions?: JobOptions;
+  /** Named lanes, highest priority first. */
+  lanes?: string[];
 }
@@ -64,7 +66,8 @@ export class Queue {
   async add(name: string, data: unknown, opts: JobOptions = {}) {
-    const key = this.keys.wait;
+    const lane = opts.lane ?? 'default';
+    const key = this.keys.lane(lane);
     return this.store.push(key, this.serialize(name, data, opts));
   }`,
    },
    {
      number: 304, title: 'fix(worker): release lock when handler throws synchronously', labels: ['bug'], author: 'tidewatcher', merged_at: '2026-03-04',
      body: t`A handler that throws before its first §await§ skipped the §finally§ path, so the lock stayed until it expired and the job looked stuck.

Fixes #298`,
      diff: t`--- a/src/worker.ts
+++ b/src/worker.ts
@@ -141,9 +141,13 @@ export class Worker {
   private async runJob(job: Job) {
     const lock = await this.store.acquireLock(job.id, this.opts.lockDurationMs);
-    const result = await this.handler(job);
-    await this.store.release(lock);
-    return result;
+    try {
+      return await this.handler(job);
+    } finally {
+      await this.store.release(lock);
+    }
   }`,
    },
    {
      number: 307, title: 'chore: reduce redis memory footprint', labels: ['chore'], author: 'bollard-dev', merged_at: '2026-03-06',
      body: t`Busy queues keep a lot of finished entries around and the Redis instance grows without bound. This trims the memory profile.`,
      diff: t`--- a/src/defaults.ts
+++ b/src/defaults.ts
@@ -3,8 +3,8 @@
 export const DEFAULT_JOB_OPTIONS: JobOptions = {
   attempts: 1,
   backoffMs: 0,
-  removeOnComplete: false,
+  removeOnComplete: true,
   removeOnFail: false,
 };`,
    },
    {
      number: 309, title: 'docs: fix typo in retries guide', labels: ['docs'], author: 'tidewatcher', merged_at: '2026-03-06',
      body: t`Small typo fix.`,
      diff: t`--- a/docs/retries.md
+++ b/docs/retries.md
@@ -12,1 +12,1 @@
-Set §attemps§ to the number of tries.
+Set §attempts§ to the number of tries.`,
    },
    {
      number: 312, title: "fix(lanes): don't starve default lane when high lane is busy", labels: ['bug'], author: 'harbormaster', merged_at: '2026-03-09',
      body: t`After four jobs from a higher lane the worker now takes one from the default lane.`,
      diff: t`--- a/src/worker.ts
+++ b/src/worker.ts
@@ -96,7 +96,11 @@ export class Worker {
   private nextLane() {
-    return this.lanes[0];
+    this.served = (this.served + 1) % 5;
+    return this.served === 0 ? 'default' : this.lanes[0];
   }`,
    },
    {
      number: 315, title: 'Revert "feat(queue): add priority lanes"', labels: ['revert'], author: 'harbormaster', merged_at: '2026-03-11',
      body: t`This reverts #301 together with the follow-up #312. Lanes deadlock when combined with sticky concurrency, see #313. We will come back to this with a different design.`,
      diff: t`--- a/src/queue.ts
+++ b/src/queue.ts
@@ -18,8 +18,6 @@ export interface QueueOptions {
   connection: StoreConnection;
   defaultJobOptions?: JobOptions;
-  /** Named lanes, highest priority first. */
-  lanes?: string[];
 }
@@ -66,8 +64,7 @@ export class Queue {
   async add(name: string, data: unknown, opts: JobOptions = {}) {
-    const lane = opts.lane ?? 'default';
-    const key = this.keys.lane(lane);
+    const key = this.keys.wait;
     return this.store.push(key, this.serialize(name, data, opts));
   }
--- a/src/worker.ts
+++ b/src/worker.ts
@@ -96,11 +96,7 @@ export class Worker {
-  private nextLane() {
-    this.served = (this.served + 1) % 5;
-    return this.served === 0 ? 'default' : this.lanes[0];
-  }`,
    },
    {
      number: 318, title: 'feat(cli): add quaykit inspect --json', labels: ['feature'], author: 'bollard-dev', merged_at: '2026-03-12',
      body: t`Machine-readable output for §quaykit inspect§, so that scripts do not have to parse the table.`,
      diff: t`--- a/src/cli/inspect.ts
+++ b/src/cli/inspect.ts
@@ -22,5 +22,10 @@ export async function inspect(argv: Args) {
   const stats = await queue.stats();
+  if (argv.json) {
+    process.stdout.write(JSON.stringify(stats) + '\n');
+    return;
+  }
   printTable(stats);
 }`,
    },
    {
      number: 320, title: 'ci: cache pnpm store in GitHub Actions', labels: ['ci'], author: 'bollard-dev', merged_at: '2026-03-13',
      body: t`Cuts install time on CI.`,
      diff: t`--- a/.github/workflows/test.yml
+++ b/.github/workflows/test.yml
@@ -14,3 +14,5 @@ jobs:
       - uses: actions/setup-node@v4
+        with:
+          cache: pnpm
       - run: pnpm install --frozen-lockfile`,
    },
    {
      number: 322, title: 'chore(deps-dev): bump vitest from 1.6.0 to 2.1.1', labels: ['dependencies'], author: 'dependabot[bot]', merged_at: '2026-03-14',
      body: t`Bumps vitest from 1.6.0 to 2.1.1.`,
      diff: t`--- a/package.json
+++ b/package.json
@@ -41,1 +41,1 @@
-    "vitest": "^1.6.0",
+    "vitest": "^2.1.1",`,
    },
  ],
  issues: [
    { number: 296, title: 'Support job priorities', labels: ['enhancement'], body: t`We need urgent jobs to overtake a backlog of slow ones.` },
    { number: 298, title: 'Job stuck in active after handler throws', labels: ['bug'], body: t`If the handler throws right away the job stays in active for the whole lock duration.` },
    { number: 313, title: 'Worker deadlock with lanes and sticky concurrency', labels: ['bug'], body: t`Two workers end up waiting on each other once a sticky group sits in a higher lane.` },
  ],
  cases: {
    kinds: ['hidden-breaking', 'feature-revert', 'internal', 'migration'],
    breaking_prs: [307],
    reverted_prs: [301, 312],
    internal_prs: [309, 320, 322],
  },
  gold: {
    bump: 'major', version: '3.0.0',
    sections: ['Breaking Changes', 'Features', 'Fixes'],
    notes_md: t`# quaykit 3.0.0

This release changes how long completed jobs are kept, adds JSON output to the CLI and fixes a lock leak in workers.

## Breaking Changes

- Completed jobs are now removed by default: §removeOnComplete§ defaults to §true§ instead of §false§, so a finished job can no longer be fetched from the queue unless you opt in (#307).
  Migration: to keep the old behaviour, pass §defaultJobOptions: { removeOnComplete: false }§ when you create the §Queue§.

## Features

- §quaykit inspect --json§ prints the queue statistics as JSON instead of a table (#318).

## Fixes

- A worker now releases the job lock when the handler throws synchronously, so the job no longer sits in active until the lock expires (#304).`,
  },
  variants: {
    'missing-breaking': {
      plan: { sections: ['Features', 'Fixes'] },
      edits: [
        { find: t`This release changes how long completed jobs are kept, adds JSON output`, replace: t`This release adds JSON output` },
        { find: t`## Breaking Changes

- Completed jobs are now removed by default: §removeOnComplete§ defaults to §true§ instead of §false§, so a finished job can no longer be fetched from the queue unless you opt in (#307).
  Migration: to keep the old behaviour, pass §defaultJobOptions: { removeOnComplete: false }§ when you create the §Queue§.

`, replace: '' },
      ],
    },
    'wrong-bump': {
      plan: { bump: 'minor', version: '2.4.0' },
      edits: [{ find: '# quaykit 3.0.0', replace: '# quaykit 2.4.0' }],
    },
    'ghost-pr': { edits: [{ find: '(#318)', replace: '(#319)' }] },
    'invented-claim': {
      edits: [{ find: t`so the job no longer sits in active until the lock expires (#304).`, replace: t`and the job is retried on the next poll instead of sitting in active until the lock expires (#304).` }],
    },
    'wrong-migration': {
      edits: [{ find: t`pass §defaultJobOptions: { removeOnComplete: false }§`, replace: t`pass §defaultJobOptions: { keepCompleted: true }§` }],
    },
    'reverted-listed': {
      edits: [{ find: t`- §quaykit inspect --json§ prints`, replace: t`- Priority lanes: pass §lanes§ to a §Queue§ and §lane§ to §add()§ so that urgent jobs overtake the backlog (#301).
- §quaykit inspect --json§ prints` }],
    },
    'embargo-leak': { na: 'Dieses Release enthält keinen Embargo-Fix.' },
    'internal-noise': {
      plan: { sections: ['Breaking Changes', 'Features', 'Fixes', 'Internal'] },
      edits: [{ find: t`until the lock expires (#304).`, replace: t`until the lock expires (#304).

## Internal

- CI now caches the pnpm store in GitHub Actions (#320).
- Bumped vitest to 2.1.1 (#322).` }],
    },
    'hype-tone': {
      notes_md: t`# quaykit 3.0.0

Say hello to the leanest quaykit ever! This game-changing release supercharges your Redis, unleashes JSON output in the CLI and makes workers more bulletproof than ever.

## Breaking Changes

- Enjoy a dramatically cleaner queue: §removeOnComplete§ now defaults to §true§ instead of §false§, which means finished jobs vanish automatically and can no longer be fetched unless you opt in (#307).
  Migration: craving the old behaviour? Just pass §defaultJobOptions: { removeOnComplete: false }§ when you create the §Queue§.

## Features

- Unleash the power of automation: §quaykit inspect --json§ delivers your queue statistics as beautiful JSON instead of a table (#318).

## Fixes

- Rock-solid locks: a worker now effortlessly releases the job lock when the handler throws synchronously, so the job no longer sits in active until the lock expires (#304).`,
    },
    'useless-true': {
      notes_md: t`# quaykit 3.0.0

This release contains changes to job handling and tooling.

## Breaking Changes

- Some default behaviour has changed (#307).

## Features

- The CLI has been improved (#318).

## Fixes

- Various improvements to worker reliability (#304).`,
    },
    'false-success': {},
    'lucky-path': {},
    gold: {},
    paraphrase: {
      notes_md: t`# quaykit 3.0.0

With this version finished jobs are cleaned up automatically, the command line tool can emit JSON, and a worker lock leak is gone.

## Breaking Changes

- §removeOnComplete§ is now §true§ out of the box (previously §false§). Jobs disappear as soon as they complete and cannot be retrieved from the queue afterwards unless you opt in (#307).
  Migration: set §defaultJobOptions: { removeOnComplete: false }§ on your §Queue§ to get the previous behaviour back.

## Features

- Pass §--json§ to §quaykit inspect§ to get the queue statistics as JSON rather than a table (#318).

## Fixes

- Handlers that throw synchronously no longer leave the lock held: the worker frees it right away, instead of the job staying in active until the lock runs out (#304).`,
    },
    reordered: { reorder: ['Fixes', 'Features', 'Breaking Changes'] },
    'extra-diligent': {},
  },
  e3: {
    base: 'invented-claim',
    edits: [
      { find: t`This release changes how long completed jobs are kept, adds JSON output to the CLI and fixes a lock leak in workers.`, replace: t`This release definitively resolves job retention, fully delivers JSON output in the CLI and permanently eliminates the lock leak in workers.` },
      { find: t`A worker now releases the job lock when the handler throws synchronously, and the job is retried`, replace: t`A worker now always releases the job lock when the handler throws synchronously, and the job is guaranteed to be retried` },
    ],
  },
};
