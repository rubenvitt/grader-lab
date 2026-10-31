// Turns result rows into verdicts, the matrix and the trust figures.
const key = (...parts) => parts.join('|');

export function groupBy(rows, fn) {
  const groups = new Map();
  for (const row of rows) {
    const k = fn(row);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(row);
  }
  return groups;
}

// One verdict per artifact and grader: majority of the repetitions.
export function verdicts(rows) {
  return [...groupBy(rows, (r) => key(r.release, r.variant, r.grader)).values()].map((reps) => {
    const passes = reps.filter((r) => r.pass).length;
    const { release, variant, kind, grader } = reps[0];
    return { release, variant, kind, grader, reps: reps.length, passes, pass: passes * 2 > reps.length, unanimous: passes === 0 || passes === reps.length };
  });
}

export function matrix(items) {
  const cells = {};
  for (const [k, group] of groupBy(items, (v) => key(v.grader, v.variant))) {
    const [grader, variant] = k.split('|');
    const found = group.filter((v) => !v.pass).length;
    (cells[grader] ??= {})[variant] = { found, total: group.length, rate: found / group.length };
  }
  return cells;
}

// Definition from the validate-evaluator skill, as the spec demands:
// TPR = share of clean cases the grader passes; TNR = share of faulty cases it fails.
export function rates(items) {
  const clean = items.filter((v) => v.kind === 'control');
  const faulty = items.filter((v) => v.kind === 'mutation');
  const share = (list, fn) => (list.length ? list.filter(fn).length / list.length : null);
  return { tpr: share(clean, (v) => v.pass), tnr: share(faulty, (v) => !v.pass), clean: clean.length, faulty: faulty.length };
}

export function ratesByGrader(items) {
  return Object.fromEntries([...groupBy(items, (v) => v.grader)].map(([g, list]) => [g, rates(list)]));
}

export function flakiness(items) {
  const repeated = items.filter((v) => v.reps > 1);
  return Object.fromEntries([...groupBy(repeated, (v) => v.grader)].map(([g, list]) => [g, {
    disagreeing: list.filter((v) => !v.unanimous).length, total: list.length, rate: list.filter((v) => !v.unanimous).length / list.length,
  }]));
}

export function roganGladen(observed, tpr, tnr) {
  const denominator = tpr + tnr - 1;
  if (denominator <= 0) return null; // the grader is no better than chance, nothing can be corrected
  return Math.min(1, Math.max(0, (observed + tnr - 1) / denominator));
}
