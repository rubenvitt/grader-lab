import { t } from './t.mjs';

// Outside the evaluation: only used to check the plumbing against the real model.
export default {
  id: 'toy',
  previous_version: '1.2.3',
  prs: [
    {
      number: 11, title: 'feat(cli): add quaykit version', labels: ['feature'], author: 'harbormaster', merged_at: '2026-01-05',
      body: t`Prints the installed version.`,
      diff: t`--- a/src/cli/index.ts
+++ b/src/cli/index.ts
@@ -4,1 +4,2 @@
+program.command('version').action(() => console.log(pkg.version));`,
    },
    {
      number: 12, title: 'ci: run tests on Node 24', labels: ['ci'], author: 'bollard-dev', merged_at: '2026-01-06',
      body: t`Adds Node 24 to the matrix.`,
      diff: t`--- a/.github/workflows/test.yml
+++ b/.github/workflows/test.yml
@@ -9,1 +9,1 @@
-        node: [22]
+        node: [22, 24]`,
    },
  ],
  issues: [],
  cases: { kinds: [], breaking_prs: [], reverted_prs: [], internal_prs: [12] },
  gold: {
    bump: 'minor', version: '1.3.0',
    sections: ['Features'],
    notes_md: t`# quaykit 1.3.0

This release adds a version command to the CLI.

## Features

- §quaykit version§ prints the installed version (#11).`,
  },
  variants: {},
  e3: null,
};
