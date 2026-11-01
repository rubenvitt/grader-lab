// Renders docs/findings.md. Every figure comes from the summary, every quote and reason from the result rows.
const GRADERS = ['schema', 'pr-refs', 'semver-labels', 'wording', 'ref-similarity', 'functional', 'trajectory', 'judge-ref', 'judge-sourced', 'judge-blind', 'pairwise'];
const LLM = ['judge-ref', 'judge-sourced', 'judge-blind', 'pairwise'];
const JUDGES = LLM.slice(0, 3);
const VARIANTS = ['missing-breaking', 'wrong-bump', 'ghost-pr', 'invented-claim', 'wrong-migration', 'reverted-listed', 'embargo-leak',
  'internal-noise', 'hype-tone', 'useless-true', 'false-success', 'lucky-path', 'gold', 'paraphrase', 'reordered', 'extra-diligent'];
const CONTROLS = new Set(['gold', 'paraphrase', 'reordered', 'extra-diligent']);
const SHORT = { schema: 'schema', 'pr-refs': 'pr-refs', 'semver-labels': 'semver', wording: 'wording', 'ref-similarity': 'ref-sim', functional: 'funct', trajectory: 'traj', 'judge-ref': 'j-ref', 'judge-sourced': 'j-src', 'judge-blind': 'j-blind', pairwise: 'pair' };

const num = (x, d = 2) => x.toFixed(d).replace('.', ',');
const pct = (x) => `${Math.round(x * 100)} %`;
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const clip = (text, max = 420) => (text.length > max ? `${text.slice(0, text.lastIndexOf(' ', max))} …` : text);
const count = (rate, total) => Math.round(rate * total);
const range = (w) => `${num(w.low)} bis ${num(w.high)}`;
const words = (text) => text.split(/\s+/).filter(Boolean).length;

function matrixTable(s) {
  const rows = VARIANTS.map((v) => [CONTROLS.has(v) ? `${v} (Kontrolle)` : v, ...GRADERS.map((g) => { const c = s.matrix[g][v]; return `${c.found}/${c.total}`; })]);
  return table(['Fassung', ...GRADERS.map((g) => SHORT[g])], rows);
}

function ratesTable(s) {
  return table(['Grader', 'TPR', 'TNR', 'TPR je Text', 'TNR je Text'], GRADERS.map((g) => {
    const r = s.rates[g];
    const u = s.rates_unique_text[g];
    return [g, `${num(r.tpr)} (${count(r.tpr, r.clean)}/${r.clean})`, `${num(r.tnr)} (${count(r.tnr, r.faulty)}/${r.faulty})`,
      u ? `${num(u.tpr)} (${count(u.tpr, u.clean)}/${u.clean})` : '–', u ? `${num(u.tnr)} (${count(u.tnr, u.faulty)}/${u.faulty})` : '–'];
  }));
}

function hypothesisTable(s) {
  const counts = (h) => Object.entries(h.found).map(([g, c]) => `${g} ${c.found}/${c.total}`).join(', ');
  return table(['Fehler', 'Erwartung der Spec', 'Gemessen bei den Erwarteten', 'Ergebnis', 'Anmerkung', 'Fanden außerdem'], s.hypotheses.map((h) => [h.variant, h.expected, counts(h), h.outcome, h.note ?? '–', h.others.join(', ') || '–']));
}

function onTargetTable(s) {
  const variants = Object.keys(s.on_target['judge-sourced']);
  return table(['Fehler', ...JUDGES.flatMap((g) => [`${SHORT[g]} durchgefallen`, `${SHORT[g]} Kriterium`, `${SHORT[g]} Kriterium + Wort`])], variants.map((v) => [v, ...JUDGES.flatMap((g) => {
    const c = s.on_target[g][v];
    return [`${c.failed}/${c.total}`, `${c.criterion}/${c.total}`, `${c.word}/${c.total}`];
  })]));
}

function placeboTable(s) {
  const cells = s.on_target['judge-sourced'];
  return table(['Fehler', 'Mutation Kriterium', 'Gold Kriterium', 'Mutation Kriterium + Wort', 'Gold Kriterium + Wort'], Object.entries(cells).map(([v, c]) => [v, `${c.criterion}/${c.total}`, `${c.gold_criterion}/${c.total}`, `${c.word}/${c.total}`, `${c.gold_word}/${c.total}`]));
}

function goldClaimsTable(s) {
  return table(['Release', 'Vorwurf von `judge-sourced`', 'Wiederholungen'], s.gold_claims.map((c) => [c.release, c.topic, `${c.hits}/${c.reps}`]));
}

function similarityTable(s) {
  return table(['Schwelle', 'Kontrollen bestanden', 'Paraphrasen bestanden', 'Mutationen durchgefallen', 'Agent-Texte bestanden'], s.ref_similarity.thresholds.map((t) => [
    num(t.threshold), `${t.clean_pass}/${t.clean}`, `${t.paraphrase_pass}/${t.paraphrases}`, `${t.faulty_fail}/${t.faulty}`, `${t.agent_pass}/${t.agents}`]));
}

function flakinessTable(s) {
  return table(['Grader', 'uneinig je Artefakt', 'uneinig je Text'], LLM.map((g) => {
    const [a, u] = [s.flakiness[g], s.flakiness_unique_text[g]];
    return [g, `${a.disagreeing}/${a.total} (${pct(a.rate)})`, `${u.disagreeing}/${u.total} (${pct(u.rate)})`];
  }));
}

function e3Table(s) {
  const cell = (c) => `${c.passes}/${c.reps}`;
  return table(['Release', ...LLM.flatMap((g) => [`${SHORT[g]} neutral`, `${SHORT[g]} selbstbewusst`])], s.e3.rows.map((r) => [r.release, ...LLM.flatMap((g) => [cell(r[g].neutral), cell(r[g].confident)])]));
}

function e4Table(s) {
  const mark = (x) => (x ? 'P' : '**F**');
  return table(['Release', 'Lauf', 'publ.', ...GRADERS.map((g) => SHORT[g])], s.e4.runs.map((r) => [r.release, r.variant, r.published ? 'ja' : '**nein**', ...GRADERS.map((g) => mark(r.passes[g]))]));
}

function e4Prompts(s) {
  const { naive, careful } = s.e4.byPrompt;
  return table(['Grader', `besteht naiv (von ${naive.runs})`, `besteht sorgfältig (von ${careful.runs})`], GRADERS.map((g) => [g, naive.passes[g], careful.passes[g]]));
}

function roganTable(s) {
  const shown = (x) => (x.corrected == null ? 'nicht definiert (TPR + TNR − 1 = 0)' : x.raw === x.corrected ? num(x.corrected) : `${num(x.corrected)} (roh ${num(x.raw)})`);
  return table(['Grader', 'beobachtet', 'TPR', 'TNR', 'korrigiert', 'TPR je Text', 'TNR je Text', 'korrigiert je Text'], LLM.map((g) => {
    const r = s.e4.rogan[g];
    return [g, num(r.observed), num(r.tpr), num(r.tnr), shown(r), num(r.by_text.tpr), num(r.by_text.tnr), shown(r.by_text)];
  }));
}

function exampleRenderer({ e1, e3, e4, artifacts, key, fixtures }) {
  const sets = { e1: e1.rows, e3: e3.rows, e4: e4.rows };
  const results = (rows, release, variant) => GRADERS.map((g) => {
    const reps = rows.filter((r) => r.release === release && r.variant === variant && r.grader === g);
    const passes = reps.filter((r) => r.pass).length;
    return { g, passes, n: reps.length, pass: passes * 2 > reps.length };
  });
  const lineWith = (notes, needle) => {
    const line = notes.split('\n').find((l) => l.includes(needle));
    if (!line) throw new Error(`quote not found: ${needle}`);
    return line.trimStart();
  };
  let n = 0;
  return ({ title, exp, release, variant, needle, absent, show, note }) => {
    const rows = sets[exp];
    const notes = artifacts.get(key(release, variant)).notes_md;
    const gold = fixtures.find((f) => f.release.id === release).gold.notes_md;
    const quote = absent ? `In Gold steht, hier fehlt:\n\n> ${lineWith(gold, absent)}` : notes ? `> ${lineWith(notes, needle)}` : 'Die Notes sind leer.';
    const verdicts = results(rows, release, variant);
    const list = (pass) => verdicts.filter((v) => v.pass === pass).map((v) => (v.n > 1 ? `${v.g} (${v.passes}/${v.n})` : v.g)).join(', ') || '–';
    const reasons = show.map(({ grader, rep = 1, evidence }) => {
      const row = rows.find((r) => r.release === release && r.variant === variant && r.grader === grader && r.rep === rep);
      const hit = evidence && row.violations.find((v) => v.evidence.includes(evidence));
      if (evidence && !hit) throw new Error(`evidence not found: ${evidence}`);
      const text = row.findings ? row.findings.join('; ') : hit ? `${hit.criterion}: ${hit.evidence}` : row.reason;
      return `- \`${grader}\`${rep ? `, Wiederholung ${rep}` : ''}: „${clip(text)}“`;
    });
    n++;
    return [
      `### ${n}. ${title}`, '',
      `Experiment ${exp.toUpperCase()}, Release ${release}, Fassung \`${variant}\``, '',
      quote, '',
      `Bestehen lassen: ${list(true)}.`, '',
      `Durchfallen lassen: ${list(false)}.`, '',
      'Begründungen:', '', ...reasons, '',
      note, '',
    ].join('\n');
  };
}

export function renderFindings(s, inputs) {
  const example = exampleRenderer(inputs);
  const { naive, careful } = s.e4.byPrompt;
  const r = s.rates;
  const u = s.rates_unique_text;
  const total = s.e4.runs.length;
  const unpublished = s.e4.runs.filter((x) => !x.published).length;
  const empty = s.e4.runs.filter((x) => x.empty_notes).length;
  const planMissing = s.e4.runs.filter((x) => x.plan_missing).length;
  const wordingHits = 2 * naive.runs - naive.passes.wording - careful.passes.wording;
  const blind = s.e3.change['judge-blind'];
  const pair = s.e3.change.pairwise;
  const softer = LLM.reduce((n, g) => n + s.e3.change[g].softer, 0);
  const cell = (g, v) => `${s.matrix[g][v].found}/${s.matrix[g][v].total}`;
  const obs = (g) => count(s.e4.observed[g], total);
  const pairDisagree = (a, b) => s.e4.pairs.find((p) => p.a === a && p.b === b).disagree;
  const spread = (pick) => {
    const values = LLM.map(pick).filter((x) => x != null);
    return [Math.min(...values), Math.max(...values)];
  };
  const [low, high] = spread((g) => s.e4.rogan[g].corrected);
  const [lowText, highText] = spread((g) => s.e4.rogan[g].by_text.corrected);
  const jref = s.e4.rogan['judge-ref'];
  const notesWords = (release, variant) => words(inputs.artifacts.get(inputs.key(release, variant)).notes_md);
  const goldWords = (release) => words(inputs.fixtures.find((f) => f.release.id === release).gold.notes_md);
  const self = s.tpr_without_self['judge-ref'];
  const selfControls = r['judge-ref'].clean - self.total;
  const paraphrases = s.matrix.schema.paraphrase.total;
  const nThree = VARIANTS.filter((v) => !CONTROLS.has(v) && s.matrix.schema[v].total === 3).length;
  const softerText = softer ? `${softer} Urteile` : 'kein Urteil';
  const order = s.pairwise_order_without_self;
  const { naive: { functional_clean: cleanNaive }, careful: { functional_clean: cleanCareful } } = s.e4.byPrompt;
  const sim = s.ref_similarity.by_variant;
  const otherMin = Math.min(...VARIANTS.filter((v) => !CONTROLS.has(v) && !['hype-tone', 'useless-true'].includes(v)).map((v) => sim[v].min));
  const threshold = (t) => s.ref_similarity.thresholds.find((x) => x.threshold === t);
  const worst = Math.max(...LLM.map((g) => s.flakiness[g].disagreeing));
  const jsrcInvented = s.on_target['judge-sourced']['invented-claim'];
  const blindNeutralR1 = s.e3.rows.find((x) => x.release === 'r1')['judge-blind'].neutral;

  const examples = [
    example({
      title: 'Fehlalarm auf Gold: eine offensichtliche Folge gilt als unbelegt',
      exp: 'e1', release: 'r1', variant: 'gold', needle: 'Completed jobs are now removed by default',
      show: [{ grader: 'judge-sourced', rep: 3, evidence: 'Abrufverhalten' }, { grader: 'judge-sourced', rep: 1, evidence: 'finally' }],
      note: `Der Diff zeigt den neuen Default, die Folge für Nutzer steht nicht wörtlich darin. Die Rubric sagt: „Der PR-Text allein belegt nichts, was der Diff nicht hergibt.“ Der Judge nimmt das genau, und unsere Diffs sind Ausschnitte. Alle ${s.rates['judge-sourced'].clean} Kontrollen fallen bei ihm durch. Bei #307 hält der Autor das für einen echten Fehlalarm, die Folge ergibt sich aus dem Default. Dieses Urteil gilt nur für #307, und der Vorwurf kommt nur in 2 von 3 Wiederholungen. Bei #304 ist es weniger klar: Der Diff gibt das Lock frei und zeigt keine Statusänderung, Gold nennt aber eine. Dieser Vorwurf kommt in allen drei Wiederholungen, ob er trifft, entscheidet hier kein Label.`,
    }),
    example({
      title: 'Der Grader hat recht, das Label nicht',
      exp: 'e1', release: 'r5', variant: 'gold', needle: 'worker.pause({ drain: true })',
      show: [{ grader: 'judge-sourced', rep: 1, evidence: 'pause(false)' }],
      note: 'Gold ist hier wirklich lückenhaft. Der Diff reicht den Boolean als `drain` durch, wer `pause(false)` nach dieser Anleitung umstellt, ändert das Verhalten. „Fehlerfrei durch Konstruktion“ gilt also nur, soweit der Autor der Fixtures fehlerfrei war. In r6 meldet derselbe Judge in allen drei Wiederholungen, dass #414 bisher gültige Schemanamen ablehnt und darum ein Breaking Change sei. Das ist vertretbar, aber Auslegung. Fixtures und Labels bleiben trotzdem unverändert, die Lücke steht hier offen.',
    }),
    example({
      title: 'Pairwise sieht die erfundene PR-Nummer und zuckt mit den Schultern',
      exp: 'e1', release: 'r1', variant: 'ghost-pr', needle: '#319',
      show: [{ grader: 'pairwise', rep: 1 }],
      note: `\`pairwise\` findet ${cell('pairwise', 'ghost-pr')} erfundene Verweise, obwohl er den Unterschied im Klartext benennt. Ohne Quellen gelten beide Fassungen als gleichwertig, und \`equal\` zählt nach der eingefrorenen Regel nicht als Bevorzugen. \`pr-refs\` kostet dagegen keinen einzigen Modellaufruf. Das liegt auch am Prompt: \`pairwise\` erfährt nicht, welche Fassung Gold ist, und bewertet nur, „soweit sie sich aus den beiden Texten beurteilen lässt“. Unerwartet: Auch \`judge-ref\` (${cell('judge-ref', 'ghost-pr')}) und \`judge-sourced\` (${cell('judge-sourced', 'ghost-pr')}) finden alle, die Hypothese „Code“ war zu eng.`,
    }),
    example({
      title: 'Der fehlende Breaking Change fällt beim Vergleich nicht auf',
      exp: 'e1', release: 'r3', variant: 'missing-breaking', absent: 'stalledIntervalMs',
      show: [{ grader: 'pairwise', rep: 1 }, { grader: 'judge-ref', rep: 1 }],
      note: `\`pairwise\` findet ${cell('pairwise', 'missing-breaking')}. Er sieht, dass ein Breaking Change nur in einer Fassung steht, wertet das aber nicht in beiden Reihenfolgen als Vorteil, solange die Quellen fehlen. Der Prompt sagt ihm nicht, welche Fassung die Referenz ist, der Vergleich liefert hier also zwei Behauptungen. Die Hypothese „Referenz findet das“ stimmt nur für \`judge-ref\`, nicht für \`ref-similarity\` (${cell('ref-similarity', 'missing-breaking')}).`,
    }),
    example({
      title: 'Die selbstbewusste Fassung fällt durch, die Erfindung bleibt ungeprüft',
      exp: 'e3', release: 'r1', variant: 'invented-claim:confident', needle: 'definitively resolves',
      show: [{ grader: 'judge-blind', rep: 1 }, { grader: 'pairwise', rep: 1 }],
      note: `Die neutrale Fassung besteht bei \`judge-blind\` in ${blindNeutralR1.passes} von ${blindNeutralR1.reps} Wiederholungen. Die selbstbewusste fällt durch, weil sie gegen R7 verstößt: ${s.e3.blind_confident_fails_tone} von ${s.e3.blind_confident_fails} durchgefallenen Wiederholungen über alle Releases nennen R7. Das ist korrekt angewandte Rubric, keine Ablenkung, und die Erfindung selbst bleibt laut Begründung ungeprüft. \`pairwise\` benennt eine unbelegte Garantie, aber die hat erst die selbstbewusste Fassung hinzugefügt: „guaranteed“ steht nicht in der neutralen.`,
    }),
    example({
      title: 'Leere Notes bestehen den blinden Judge',
      exp: 'e4', release: 'r3', variant: 'naive-2',
      show: [{ grader: 'judge-blind', rep: 1 }, { grader: 'judge-sourced', rep: 1 }],
      note: `Der Lauf endet mit \`finish\` und lauter \`null\`, veröffentlicht wurde nichts. Das Protokoll erlaubt ein leeres \`finish\`, das Harness beendet den Lauf. Das ist keine belegte Entscheidung des Agenten: Hier steht \`finish\` im selben Zug hinter vier Leseaufrufen, deren Ergebnisse er nie sehen konnte, und in r4 \`careful-2\` widerspricht es der erklärten Absicht des Modells (siehe E4). Leere Notes gab es in ${empty} von ${total} Läufen. \`judge-blind\` lässt sie bestehen, und seine Begründung setzt fast wörtlich den Prompt um: „Was sich ohne Quellen nicht prüfen lässt, gilt als erfüllt.“ Beide Läufe teilen sich dabei ein und denselben Aufruf, denn der blinde Prompt enthält nichts Release-Spezifisches, das Urteil ist also nur einmal gefallen. \`pr-refs\` besteht ebenfalls: Keine Verweise heißt keine falschen Verweise. Wer nichts sagt, sagt nichts Falsches.`,
    }),
    example({
      title: 'Fast perfekt, nie veröffentlicht, und die Referenz straft die bessere Migration ab',
      exp: 'e4', release: 'r5', variant: 'careful-2', needle: 'worker.pause(true|false)',
      show: [{ grader: 'judge-ref', rep: 1, evidence: 'drain: true|false' }, { grader: 'judge-sourced', rep: 1 }, { grader: 'pairwise', rep: 1 }],
      note: 'Drei Dinge in einem Lauf. Erstens ein echter `false-success`: `judge-sourced`, `judge-blind` und `pairwise` sind zufrieden, nur `functional` sieht, dass nichts veröffentlicht wurde. Für die Hypothese „nur Functional“ ist das beim echten Agenten ein Beleg, n = 1. Zweitens deckt der Agent `pause(false)` ab, was Gold versäumt (Beispiel 2), und `pairwise` zieht seine Fassung in beiden Reihenfolgen vor. Drittens wertet `judge-ref` genau das als Verstoß, weil die Referenz es nicht enthält. Eine lückenhafte Referenz vererbt ihre Lücke an den Grader.',
    }),
    example({
      title: 'Versteckter Breaking Change: Struktur-Grader sind zufrieden, Judges nicht',
      exp: 'e4', release: 'r1', variant: 'naive-2', needle: 'Remove completed jobs by default',
      show: [{ grader: 'judge-blind', rep: 1, evidence: 'Performance' }],
      note: 'Der Fehler, für den das Fixture gebaut wurde, tritt beim naiven Agenten von selbst auf: Der Breaking Change landet unter „Performance“, der Bump ist Minor. `schema`, `pr-refs`, `semver-labels` und `wording` bestehen, denn Titel und Labels der PR verraten nichts. Überraschend findet ihn auch `judge-blind`, der nur den Text sieht, „by default“ reicht ihm als Hinweis.',
    }),
    example({
      title: 'Dieselbe Formulierung: Leck oder kein Leck',
      exp: 'e4', release: 'r6', variant: 'careful-2', needle: 'schema name handling',
      show: [{ grader: 'pairwise', rep: 1 }, { grader: 'judge-sourced', rep: 1 }, { grader: 'judge-ref', rep: 1, evidence: 'embargo' }, { grader: 'judge-blind', rep: 1 }],
      note: 'Alle vier LLM-Grader und `wording` lehnen ab, aber aus verschiedenen Gründen. `wording` trifft den Embargo-Begriff „schema name“. `pairwise` und `judge-ref` sehen darin ein Leck. `judge-sourced` schreibt ausdrücklich, das Embargo sei gewahrt, und lehnt wegen der Version ab. `judge-blind` findet den Satz bloß zu vage. Das gleiche Gesamturteil versteckt einen Widerspruch in der Sache. Wer nur bestanden oder durchgefallen liest, sieht ihn nicht.',
    }),
    example({
      title: 'Ein Leerzeichen am Zeilenende: `functional` ist auch nur ein System',
      exp: 'e4', release: 'r4', variant: 'careful-1', needle: 'timeoutMs',
      show: [{ grader: 'functional', rep: 0 }],
      note: 'Die veröffentlichte Fassung endet auf ein Leerzeichen hinter „(#378)“, die in `finish` gemeldete nicht. `functional` vergleicht bytegenau und fällt durch. Dasselbe passiert in r3 `careful-2`. In r2 `naive-1` und r4 `naive-2` ist die Abweichung dagegen inhaltlich: ein Tippfehler und eine fehlende Titelzeile. Die eingefrorene Regel unterscheidet das nicht, deterministisch heißt nicht fehlerfrei. Der Grader bleibt, wie er ist.',
    }),
  ].join('\n');

  return `# Befunde

Alle Tabellen, Kennzahlen und Zitate erzeugt \`npm run report\` aus \`data/raw/\`. Verbindender Text und einzelne Querverweise in den Beispielen sind von Hand geschrieben und gegen die Daten geprüft. Grundlage: Prompts \`${s.prompt_version}\`, Agent \`${s.models.agent}\`, Judges \`${s.models.judge}\`, Effort \`${s.models.effort}\`.

## Das Wichtigste

- **Der Grader, der auf Mutationen am besten aussieht, urteilt auf echten Texten am härtesten.** \`judge-ref\` findet auf den Mutationen alles, was im Text steht (${count(u['judge-ref'].tnr, u['judge-ref'].faulty)} von ${u['judge-ref'].faulty} Texten, Bereich ${range(s.ranges.jref_tnr_text)}, Spec-Zählung ${count(r['judge-ref'].tnr, r['judge-ref'].faulty)} von ${r['judge-ref'].faulty}). Die ${u['judge-ref'].clean - count(u['judge-ref'].tpr, u['judge-ref'].clean)} Fehlalarme tragen aber wenig: ${selfControls} der ${r['judge-ref'].clean} Kontrollen sind Gold selbst, echt gefordert ist er nur auf ${paraphrases} Paraphrasen vom selben Autor. Auf echten Agent-Texten lässt er nur ${obs('judge-ref')} von ${total} bestehen (Bereich ${range(s.ranges.jref_e4)}). Er verlangt jedes Detail der Referenz, Mutationen sind per Bau nah an ihr, echte Texte nicht. Ohne Labels bleibt offen, wie viele dieser Ablehnungen berechtigt sind. Beispiel 7 zeigt aber einen Fall, in dem die Referenz selbst der Fehler ist.
- **\`judge-sourced\` lässt alle ${s.rates['judge-sourced'].clean} Kontrollen durchfallen.** TPR ${num(r['judge-sourced'].tpr)}, TNR ${num(r['judge-sourced'].tnr)}. Seine Fundrate von 100 % sagt allein deshalb nichts. Die TPR ${num(r['judge-sourced'].tpr)} ist eine Eigenschaft von Grader, Rubric, Gold und Diff-Ausschnitten zusammen: In ${s.gold_claim_releases} von ${s.e3.rows.length} Releases wiederholt er Vorwürfe gegen Gold in allen drei Wiederholungen, und ein Teil davon trifft. Er ist streng und zugleich teils im Recht, ohne Labels ist das nicht trennbar. Auf den Texten des Agenten lässt er dagegen ${obs('judge-sourced')} von ${total} bestehen (Bereich ${range(s.ranges.jsrc_e4)}). Woran das liegt, ist offen. Die Textlänge erklärt es nicht: r2 \`careful-1\` (${notesWords('r2', 'careful-1')} Wörter, Gold ${goldWords('r2')}) und r5 \`careful-2\` (${notesWords('r5', 'careful-2')}, Gold ${goldWords('r5')}) bestehen. Beide nennen die Abbildung von \`graceMs\` auf \`olderThanMs\`, die in Gold fehlt, r5 \`careful-2\` dazu \`pause(false)\`.
- **Die Ablenkung aus E3 ist mit diesem Aufbau nicht prüfbar.** Die selbstbewussten Fassungen verletzen die Rubric zusätzlich und ändern den Inhalt. Selbstbewusster Ton machte ${softerText} milder und ${blind.harsher + pair.harsher} strenger, das ist korrektes Anwenden der Regeln und sagt über Ablenkung nichts.
- **Mutationen ersetzen keine echten Läufe.** TPR und TNR aus E1 übertragen sich schlecht auf E4. Die Korrektur nach Rogan-Gladen ergibt für dieselben Texte je nach Grader Werte zwischen ${num(low)} und ${num(high)} (je Artefakt) oder ${num(lowText)} und ${num(highText)} (je Text). Die genaue Spanne hängt an der Zählweise, dass die Korrektur streut, nicht.

## Kennzahlen

Definition wie im Skill \`validate-evaluator\` und damit andersherum als oft üblich: „positiv“ heißt bestanden. **TPR** ist der Anteil fehlerfreier Fälle, die der Grader bestehen lässt. **TNR** ist der Anteil fehlerhafter Fälle, die er durchfallen lässt.

Das Urteil pro Artefakt ist die Mehrheit der Wiederholungen. E1 umfasst ${s.counts.artifacts} Artefakte (${s.counts.controls} Kontrollen, ${s.counts.mutations} Mutationen). ${s.counts.not_applicable} Kombinationen aus Release und Fehlerart sind nicht definiert, etwa ein Embargo-Leck ohne Embargo-Fix. Sie stehen in \`data/results/e1.json\`.

„Bereich“ heißt hier 95-%-Wilson-Intervall. Es setzt unabhängige Fälle voraus, sechs Releases eines Autors sind das nicht, die Bereiche sind also eher zu eng. ${nThree} von 12 Fehlerarten haben n = 3: 3/3 entspricht ${range(s.ranges.cell_full_3)}, 1/3 entspricht ${range(s.ranges.cell_one_3)}. Weitere Kernzahlen je Text: TPR von \`judge-sourced\` ${range(s.ranges.jsrc_tpr_text)}, TNR von \`judge-blind\` ${range(s.ranges.blind_tnr_text)}, TNR von \`pairwise\` ${range(s.ranges.pair_tnr_text)}.

## E1: Matrix

Zellen zeigen, wie viele Artefakte durchgefallen sind. Bei Mutationen ist das die Fundrate, bei Kontrollen die Zahl der Fehlalarme.

${matrixTable(s)}

Spalten: ${GRADERS.map((g) => `\`${SHORT[g]}\` = ${g}`).join(', ')}.

### TPR und TNR

${ratesTable(s)}

Die Spalten „je Text“ gelten nur für LLM-Grader. \`gold\`, \`extra-diligent\`, \`false-success\` und \`lucky-path\` haben denselben Text und teilen sich dieselben Judge-Aufrufe. Die Spec-Zahl zählt sie mehrfach, \`false-success\` und \`lucky-path\` senken die TNR jedes Judges, obwohl kein Judge sie sehen kann. Je Text bleiben ${u['judge-ref'].clean} Kontrollen und ${u['judge-ref'].faulty} Mutationen.

Die TPR von 1,00 bei \`judge-ref\`, \`judge-blind\` und \`pairwise\` entsteht zum großen Teil durch die Konstruktion. ${selfControls} der ${r['judge-ref'].clean} Kontrollen (\`gold\`, \`extra-diligent\`) und ${u['judge-ref'].clean - self.total} der ${u['judge-ref'].clean} Texte vergleichen Gold mit sich selbst, die \`reordered\`-Texte liegen bei Ähnlichkeit ${num(sim.reordered.min)} oder höher. Ohne Selbstvergleich bestehen ${self.passes} von ${self.total} Texten, davon sind nur ${paraphrases} Paraphrasen, geschrieben vom selben Autor. Bei \`judge-sourced\` sind es ${s.tpr_without_self['judge-sourced'].passes} von ${s.tpr_without_self['judge-sourced'].total}.

### Hypothesen der Spec

Lesart: „Judge“ heißt \`judge-ref\`, \`judge-sourced\`, \`judge-blind\`. „Referenz“ heißt \`judge-ref\`, \`ref-similarity\`. „Eingetreten“ heißt: Alle Erwarteten finden alle Fälle, bei „nur“ findet zudem kein anderer etwas. **Die Spalte „Ergebnis“ ist eine nachträgliche Lesart.** Die Regel steht in \`src/report.mjs\` und entstand nach den Läufen, ebenso die Zuordnung der Spec-Wörter zu Gradern. Keine Fundzahl ändert sich dadurch.

${hypothesisTable(s)}

Zur Tabelle:

- \`ref-similarity\` findet keinen fehlenden Breaking Change (${cell('ref-similarity', 'missing-breaking')}) und keine falsche Migration (${cell('ref-similarity', 'wrong-migration')}). Beide bleiben über der Schwelle von 0,7. Dazu schlägt der Grader bei allen ${paraphrases} Paraphrasen falsch an und bei allen ${total} Agent-Texten. Das hängt an einer knappen Schwelle, siehe unten. Stabil ist: Fehlerfälle liegen näher an Gold als korrekte Paraphrasen.
- \`semver-labels\` findet den falschen Bump in ${cell('semver-labels', 'wrong-bump')} Fällen, das ist genau das Release, in dem Labels ihn hergeben. \`schema\` findet ihn in ${cell('schema', 'wrong-bump')} über eine Regel, die kurz vor dem Einfrieren genau dafür ergänzt wurde (Commit \`0d9f202\`). Dasselbe gilt für \`reverted-listed\` in r6, das \`schema\` über die zweite dort ergänzte Regel findet.
- \`judge-blind\` findet Fehler in Form und Ton, inhaltliche kaum: ${cell('judge-blind', 'invented-claim')} erfundene Aussagen, ${cell('judge-blind', 'ghost-pr')} Geister-PRs. Das ist nur zum Teil eine Eigenschaft der Methode, denn sein Prompt sagt: „Was sich ohne Quellen nicht prüfen lässt, gilt als erfüllt“ und „Unterstelle keine Fehler“. Ähnlich bei \`pairwise\`: Er erfährt nicht, welche Fassung Gold ist, und bewertet nur, „soweit sie sich aus den beiden Texten beurteilen lässt“. Beide Anweisungen bestimmen die Fundraten mit, als Beleg für die These taugen diese Zeilen also nur eingeschränkt.
- \`false-success\` und \`lucky-path\` sind nur scheinbar von \`judge-sourced\` gefunden. Er sieht denselben Text wie bei Gold und lehnt ihn genauso ab. Das ist kein Fund, sondern sein Grundrauschen.
- \`schema\` findet ${cell('schema', 'internal-noise')} bei \`internal-noise\` nur, weil vier dieser Mutationen eine eigene Überschrift „Internal“ oder „Maintenance“ mitbringen, die nicht in \`allowed_sections\` steht. Das ist ein Artefakt unserer Mutationen, kein inhaltlicher Fund. In r2 und r3 hängen die Einträge in bestehenden Abschnitten, dort findet \`schema\` nichts.

### \`ref-similarity\`: wie knapp die Schwelle ist

Nachträgliche Angabe, die eingefrorene Schwelle 0,7 gilt weiter. Paraphrasen liegen bei ${num(sim.paraphrase.min, 3)} bis ${num(sim.paraphrase.max, 3)}, also knapp darunter. \`useless-true\` liegt bei höchstens ${num(sim['useless-true'].max, 3)}, \`hype-tone\` ab ${num(sim['hype-tone'].min, 3)}, alle anderen Mutationen ab ${num(otherMin, 3)}.

${similarityTable(s)}

Jede Schwelle von ${num(Math.ceil(sim['useless-true'].max * 100) / 100)} bis ${num(Math.floor(sim.paraphrase.min * 100) / 100)} wäre auf E1 also strikt besser, ohne dass ein Fund verloren geht. Auch die Aussage zu den ${total} Agent-Texten hängt an der Schwelle: Bei ${num(0.55)} bestehen ${threshold(0.55).agent_pass}, bei ${num(0.5)} schon ${threshold(0.5).agent_pass}, bei ${num(0.45)} sind es ${threshold(0.45).agent_pass}.

### Trifft der Judge wirklich den eingebauten Fehler?

Eine Fundrate zählt nur das Durchfallen. Bei einem Judge, der alles ablehnt, ist das wertlos. Darum eine Zusatzprüfung, **nach den Läufen definiert und nicht Teil der vorab eingefrorenen Regeln**: Nennt die Mehrheit der Wiederholungen das zur Mutation passende Rubric-Kriterium, und enthält der Beleg ein Wort, das sich gegenüber Gold geändert hat? Die Prüfung ist grob. Ein Treffer kann Zufall sein, ein paraphrasierter Beleg kann durchrutschen.

${onTargetTable(s)}

Die Spalte „Kriterium“ belegt bei \`judge-sourced\` für sich nichts. Dieselbe Prüfung auf dem unveränderten Gold desselben Releases, mit denselben Wörtern, liefert bei \`ghost-pr\` und \`invented-claim\` schon ${s.on_target['judge-sourced']['ghost-pr'].gold_criterion}/${s.on_target['judge-sourced']['ghost-pr'].total} und ${jsrcInvented.gold_criterion}/${jsrcInvented.total}, denn R2 steht in ${s.r2_in_controls.reps} von ${s.r2_in_controls.total} Kontroll-Wiederholungen. Erst „Kriterium + Wort“ trennt:

${placeboTable(s)}

\`judge-sourced\` meldet den eingebauten Fehler also meist tatsächlich, lehnt daneben aber auch Texte ohne eingebauten Fehler ab. Er ist kein Zufallsgenerator. Er ist streng und zugleich teils im Recht, ohne Labels ist das nicht trennbar. Der Prompt bleibt trotzdem unverändert: Eine Nachschärfung bis zur schönen Matrix wäre genau das, was die Spec ausschließt.

### Was \`judge-sourced\` Gold vorwirft

Die Kontrollen sind nur annähernd fehlerfrei. Die Tabelle zählt Vorwürfe gegen die Gold-Texte über die drei Wiederholungen, Vorwürfe aus nur einer Wiederholung fehlen. Die Themen sind von Hand benannt, die Zahlen aus den Rohdaten. In ${s.gold_claim_releases} von ${s.e3.rows.length} Releases kommt mindestens ein Vorwurf in allen Wiederholungen. Ob er trifft, entscheidet hier kein Label, die Einordnung bleibt Sache des Lesers.

${goldClaimsTable(s)}

Der Satz „details will follow in a separate advisory“ steht in den Gold-Texten von r2, r3 und r6 und in keiner Quelle. Gemeldet wird er nur in r3, in den beiden anderen Releases nicht. Auch Strenge ist also nicht gleichmäßig.

## E2: Stabilität

Quote der Fälle, in denen die drei Wiederholungen nicht einig sind. Die Spalte „je Text“ zählt jeden Text einmal.

${flakinessTable(s)}

Alle uneinigen Fälle:

${table(['Release', 'Fassung', 'Grader', 'bestanden'], s.disagreements.map((d) => [d.release, d.variant, d.grader, `${d.passes}/${d.reps}`]))}

Auf diesen gold-nahen Texten ist die Flakiness gering, höchstens ${worst} von ${s.counts.artifacts} Artefakten je Grader. Für echte Texte ist sie nicht gemessen: In E4 urteilt jeder LLM-Grader genau einmal. Die Reihenfolge wirkt stärker: Bei \`pairwise\` antworten die beiden Reihenfolgen in ${s.pairwise_order.inconsistent} von ${s.pairwise_order.total} Wiederholungen nicht gleich, davon ${s.pairwise_order.one_equal}-mal als Präferenz gegen „equal“. Von den ${s.pairwise_order.total} sind ${s.pairwise_self_reps} Selbstvergleiche, in denen beide Reihenfolgen derselbe Aufruf sind. Ohne sie lautet die Quote ${order.inconsistent} von ${order.total}, rund ${Math.round((order.inconsistent / order.total) * 100)} statt ${Math.round((s.pairwise_order.inconsistent / s.pairwise_order.total) * 100)} %. Eine echte Umkehr gab es ${s.pairwise_order.flips}-mal. Die eingefrorene Regel fängt das ab, weil eine Fassung nur durchfällt, wenn Gold in beiden Reihenfolgen gewinnt. Das drückt aber auch die Fundrate von \`pairwise\`.

## E3: Ablenkung

Pro Release eine erfundene Aussage (\`invented-claim\`), einmal neutral und einmal selbstbewusst formuliert. Die Zellen zeigen bestandene Wiederholungen. Alle Fassungen sind fehlerhaft, jedes Bestehen ist also ein Fehlurteil.

${e3Table(s)}

- \`judge-ref\` lässt sich nicht beirren, beide Fassungen fallen in allen Wiederholungen durch. Bei \`judge-sourced\` ist das Ergebnis gleich, sagt aber wenig, denn er lässt auch alle Kontrollen durchfallen.
- \`judge-blind\` lässt die neutrale Fassung in ${blind.pass_neutral} von ${s.e3.rows.length} Releases bestehen, die selbstbewusste in ${blind.pass_confident}.
- \`pairwise\` lässt die neutrale Fassung in ${pair.pass_neutral} von ${s.e3.rows.length} bestehen, die selbstbewusste in ${pair.pass_confident}.
- Bei \`pairwise\` gab es in ${s.e3.order.total} Wiederholungen ${s.e3.order.flips} echte Umkehrungen durch die Reihenfolge und ${s.e3.order.inconsistent} ungleiche Antworten.

**Mit diesem Aufbau nicht prüfbar:** Die selbstbewussten Fassungen verletzen die Rubric zusätzlich und ändern den Inhalt. Die Spec fragt nach Tripathi et al., ob sich ein Vergleich durch selbstbewussten Ton eher täuschen lässt als eine absolute Bewertung, und verlangt dafür gleichen Inhalt. Davon weichen die Fassungen ab: In allen ${s.e3.rows.length} Releases ändern sie die Einleitung und fügen neue Zusicherungen hinzu, etwa „guaranteed“, „without exception“, „proven“ oder „permanently eliminates“. Damit verstoßen sie gegen R7 und gegen R2. Bei \`pairwise\` fallen alle ${s.e3.pair_confident_fails} selbstbewussten Wiederholungen durch (neutral ${s.e3.pair_neutral_fails} von ${s.e3.pair_neutral_total}), und in ${s.e3.pair_confident_unsupported} dieser Begründungen stehen unbelegte Garantien oder Aussagen, nicht nur der Ton. Das strengere Urteil ist also korrektes Anwenden der Regeln und sagt über Ablenkung nichts. \`pairwise\` vergleicht zudem nur gegen Gold, nie neutral gegen selbstbewusst, und n sind ${s.e3.rows.length} Releases. Eine Variante, die im Ton innerhalb der Rubric bleibt und den Inhalt nicht ändert, wäre ein neuer Lauf als \`v2\` und ist nicht Teil dieser Auswertung.

## E4: Echter Agent

${total} Läufe: 2 Prompts, 6 Releases, je 2 Wiederholungen. Jeder LLM-Grader urteilt hier einmal, wie in \`params.json\` eingefroren. Es gibt keine menschlichen Labels, **darum stehen hier weder TPR noch TNR**. Die Tabelle zeigt nur, wer wem widerspricht.

${e4Table(s)}

${e4Prompts(s)}

Bei \`judge-blind\` stecken zwei Läufe in einem Aufruf: Die leeren Notes aus r3 \`naive-2\` und r4 \`careful-2\` ergeben denselben Prompt und zählen je einmal bei naiv und bei sorgfältig.

Was auffällt:

- Sorgfalt hilft messbar, aber nicht überall, n sind je ${naive.runs} Läufe. \`trajectory\` steigt von ${naive.passes.trajectory} auf ${careful.passes.trajectory}, wobei der sorgfältige Prompt die Grader-Regel fast wörtlich vorgibt („Lies zu jeder PR den Text und den Diff, bevor du veröffentlichst“). Das misst teils nur, dass der Agent die Anweisung befolgt. \`schema\` steigt von ${naive.passes.schema} auf ${careful.passes.schema}. Bei \`functional\` ändert sich fast nichts (${naive.passes.functional} zu ${careful.passes.functional}). ${careful.runs - careful.published} sorgfältige und ${naive.runs - naive.published} naive Läufe veröffentlichen nie.
- Der Vergleich ${naive.passes.functional} zu ${careful.passes.functional} enthält die zwei Leerzeichen-Fälle aus Beispiel 10 und die drei Läufe mit leerem \`finish\`. Ohne diese fünf Läufe steht es ${cleanNaive.passes} von ${cleanNaive.runs} zu ${cleanCareful.passes} von ${cleanCareful.runs}. Das ist nur eine zusätzliche Lesart, gewertet bleibt jeder Lauf.
- ${unpublished} von ${total} Läufen haben nichts veröffentlicht, ${planMissing} haben \`finish\` ohne Plan aufgerufen, ${empty} davon ohne Notes. Der Status \`finished\` in \`e4.json\` sagt nur, dass \`finish\` kam. Das Protokoll erlaubt ein leeres \`finish\`, das Harness beendet den Lauf, \`publish_release\` lehnt fehlende Felder dagegen ab. In r4 \`careful-2\` widerspricht das der erklärten Absicht des Modells: Es schreibt im selben Zug, es hole noch die PR-Inhalte, „bevor ich veröffentliche“, und sendet dann \`finish\` mit lauter \`null\`. In r3 \`naive-2\` steht \`finish\` hinter vier Leseaufrufen im selben Zug, in r3 \`naive-1\` folgt es auf \`publish_release\`. Das spricht dafür, dass das Modell \`finish\` als Zugabschluss missversteht, bewiesen ist die Ursache nicht. Es betrifft 2 der ${unpublished} Läufe ohne Veröffentlichung, und r3 \`naive-1\` fällt bei \`schema\`, \`semver-labels\` und \`functional\` durch, obwohl korrekt 4.0.0 veröffentlicht wurde.
- Die vier LLM-Grader sind sich in ${s.e4.llm_split} von ${total} Läufen uneinig. Weil jeder von ihnen hier nur einmal urteilt, können diese Widersprüche auch Rauschen enthalten. Über alle Grader gilt das für alle ${s.e4.all_split}, schon weil \`pr-refs\` jeden und \`ref-similarity\` keinen Lauf bestehen lässt.
- Am weitesten auseinander liegen \`judge-ref\` und \`judge-blind\` mit ${pairDisagree('judge-ref', 'judge-blind')} widersprüchlichen Läufen. \`judge-ref\` lehnt ab, wenn ein Detail der Referenz fehlt oder etwas hinzukommt, \`judge-blind\` lässt durch, was in sich sauber klingt.
- \`wording\` schlägt auf Agent-Texten kaum an: ${wordingHits} Treffer, davon ${empty} auf leeren Notes und einer wegen eines Embargo-Begriffs. Der Agent schreibt keinen Werbeton. Die hohen Fundraten aus E1 bleiben darum, wie in \`graders/prompts/v1/README.md\` angekündigt, eine Obergrenze ohne Gegenprobe.

## Rechenbeispiel Rogan-Gladen

Die beobachtete Pass-Rate eines Graders auf E4 lässt sich mit seinen Werten aus E1 korrigieren: geschätzte wahre Rate = (beobachtet + TNR − 1) / (TPR + TNR − 1).

${roganTable(s)}

Dieselben ${total} Texte, und die geschätzte Rate reicht je nach Grader von ${num(low)} bis ${num(high)}. Rechnet man mit den Werten je Text, sind es ${num(lowText)} bis ${num(highText)}. Der Unterschied kommt aus der Zählweise: Die TNR je Artefakt enthält \`false-success\` und \`lucky-path\`, die kein Judge sehen kann. Bei \`judge-ref\` entsteht die Begrenzung auf 0 (Rohwert ${num(jref.raw)}) allein durch diese ${r['judge-ref'].faulty - u['judge-ref'].faulty} Fälle, je Text ergibt sich ${num(jref.by_text.corrected)}. Bei \`judge-sourced\` ist die Formel in beiden Rechnungen nicht definiert. Die Korrektur setzt voraus, dass TPR und TNR auf den neuen Daten gelten. Hier tun sie das nachweislich nicht: \`judge-sourced\` hat auf den Kontrollen TPR ${num(r['judge-sourced'].tpr)} und lässt trotzdem ${obs('judge-sourced')} Agent-Texte bestehen. Das Beispiel zeigt deshalb vor allem die Grenze der Korrektur, nicht die Qualität des Agenten.

## Beispiele

${examples}
## Datenlage und Einschränkungen

- ${s.raw.used} von 1.500 Modellaufrufen verbraucht: ${s.raw.answers} Rohantworten (davon ${s.raw.smoke} aus dem Smoke-Test außerhalb der Auswertung), ${s.raw.errors} Fehlversuche. Keine Lücken in E1, E3 und E4, keine Wiederholungen reduziert.
- \`tainted\`: ${s.raw.tainted} Antworten, davon ${s.raw.tainted_tool_use} mit echter Tool-Nutzung. Der Rest sind Transport-Hinweise, siehe \`docs/run-log.md\`.
- ${s.raw.reconnect_notices} Antworten trugen Reconnect-Hinweise (403 auf der WebSocket-Verbindung, Fallback auf HTTPS). Sie sind gültig und bleiben in der Auswertung.
- Widersprüche zwischen \`pass\` und \`violations\` in Judge-Antworten: ${s.pass_violation_mismatch}.
- Synthetische Fixtures, kleine Fallzahl, ein Modellstand, Effort \`${s.models.effort}\`. Mutationen, Gold und Grader stammen vom selben Autor. Gold ist nicht fehlerfrei (Beispiel 2), die Kontrollen sind also nur annähernd fehlerfrei.
- Die Diffs in den Fixtures sind Ausschnitte. Das begünstigt die „unbelegt“-Vorwürfe von \`judge-sourced\`. Mit vollständigen Diffs könnte seine TPR anders ausfallen, das ist nicht gemessen.
- Die Wortlisten von \`wording\` sind nach den Mutationen entstanden.
- Die Anweisungen in den Prompts von \`judge-blind\` und \`pairwise\` bestimmen deren Fundraten mit. \`pairwise\` kennt die Referenz nicht als solche. Auch \`judge-ref\` hat einen Prompt-Anteil: Er erklärt die Referenz für „korrekt und vollständig“ und wertet Aussagen ohne Entsprechung dort als Verstoß, das drückt seine Pass-Rate auf echten Texten.
- Die Rubrics und Prompts blieben unverändert. Nachträglich entstanden die Auswertungen je Text, die Zuordnung der Hypothesen, die Trefferprüfung und die Schwellen-Tabelle zu \`ref-similarity\`. Die Zahlen „je Text“ sind also keine vorab festgelegten Kennzahlen, die Spec-Zahlen stehen daneben.
- Keine menschlichen Labels. Die Einordnungen in den Beispielen stammen vom Autor, nicht aus einer Messung.
`;
}
