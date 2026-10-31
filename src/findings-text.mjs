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
  return table(['Fehler', 'Erwartung der Spec', 'Gemessen bei den Erwarteten', 'Ergebnis', 'Fanden außerdem'], s.hypotheses.map((h) => [h.variant, h.expected, counts(h), h.outcome, h.others.join(', ') || '–']));
}

function onTargetTable(s) {
  const variants = Object.keys(s.on_target['judge-sourced']);
  return table(['Fehler', ...JUDGES.flatMap((g) => [`${SHORT[g]} durchgefallen`, `${SHORT[g]} Kriterium`, `${SHORT[g]} Kriterium + Wort`])], variants.map((v) => [v, ...JUDGES.flatMap((g) => {
    const c = s.on_target[g][v];
    return [`${c.failed}/${c.total}`, `${c.criterion}/${c.total}`, `${c.word}/${c.total}`];
  })]));
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
  return table(['Grader', 'beobachtet', 'TPR', 'TNR', 'korrigiert'], LLM.map((g) => {
    const r = s.e4.rogan[g];
    return [g, num(r.observed), num(r.tpr), num(r.tnr), r.corrected == null ? 'nicht definiert (TPR + TNR − 1 = 0)' : num(r.corrected)];
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
  const corrected = LLM.map((g) => s.e4.rogan[g].corrected).filter((x) => x != null);
  const [low, high] = [Math.min(...corrected), Math.max(...corrected)];
  const blindNeutralR1 = s.e3.rows.find((x) => x.release === 'r1')['judge-blind'].neutral;

  const examples = [
    example({
      title: 'Fehlalarm auf Gold: eine offensichtliche Folge gilt als unbelegt',
      exp: 'e1', release: 'r1', variant: 'gold', needle: 'Completed jobs are now removed by default',
      show: [{ grader: 'judge-sourced', rep: 3, evidence: 'Abrufverhalten' }, { grader: 'judge-sourced', rep: 1, evidence: 'finally' }],
      note: `Der Diff zeigt den neuen Default, die Folge für Nutzer steht nicht wörtlich darin. Die Rubric sagt: „Der PR-Text allein belegt nichts, was der Diff nicht hergibt.“ Der Judge nimmt das genau, und unsere Diffs sind Ausschnitte. Alle ${s.rates['judge-sourced'].clean} Kontrollen fallen bei ihm durch. In diesem Fall ist es ein echter Fehlalarm.`,
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
      note: `\`pairwise\` findet ${cell('pairwise', 'ghost-pr')} erfundene Verweise, obwohl er den Unterschied im Klartext benennt. Ohne Quellen gelten beide Fassungen als gleichwertig, und \`equal\` zählt nach der eingefrorenen Regel nicht als Bevorzugen. \`pr-refs\` kostet dagegen keinen einzigen Modellaufruf. Unerwartet: Auch \`judge-ref\` (${cell('judge-ref', 'ghost-pr')}) und \`judge-sourced\` (${cell('judge-sourced', 'ghost-pr')}) finden alle, die Hypothese „Code“ war zu eng.`,
    }),
    example({
      title: 'Der fehlende Breaking Change fällt beim Vergleich nicht auf',
      exp: 'e1', release: 'r3', variant: 'missing-breaking', absent: 'stalledIntervalMs',
      show: [{ grader: 'pairwise', rep: 1 }, { grader: 'judge-ref', rep: 1 }],
      note: `\`pairwise\` findet ${cell('pairwise', 'missing-breaking')}. Er sieht, dass ein Breaking Change nur in einer Fassung steht, wertet das aber nicht in beiden Reihenfolgen als Vorteil, solange die Quellen fehlen. Der Vergleich liefert hier also keine Referenz, sondern zwei Behauptungen. Die Hypothese „Referenz findet das“ stimmt nur für \`judge-ref\`, nicht für \`ref-similarity\` (${cell('ref-similarity', 'missing-breaking')}).`,
    }),
    example({
      title: 'Selbstbewusster Ton schadet, aber aus dem falschen Grund',
      exp: 'e3', release: 'r1', variant: 'invented-claim:confident', needle: 'definitively resolves',
      show: [{ grader: 'judge-blind', rep: 1 }, { grader: 'pairwise', rep: 1 }],
      note: `Dieselbe erfundene Aussage besteht bei \`judge-blind\` in neutraler Fassung ${blindNeutralR1.passes} von ${blindNeutralR1.reps} Wiederholungen. In selbstbewusster Fassung fällt sie durch, aber wegen des Tons: ${s.e3.blind_confident_fails_tone} von ${s.e3.blind_confident_fails} durchgefallenen Wiederholungen über alle Releases nennen R7. Die Erfindung selbst bleibt laut Begründung ungeprüft. Das Urteil stimmt, die Begründung trägt nicht. \`pairwise\` benennt die unbelegte Garantie dagegen, die zugespitzte Formulierung lenkt den Blick eher darauf.`,
    }),
    example({
      title: 'Leere Notes bestehen den blinden Judge',
      exp: 'e4', release: 'r3', variant: 'naive-2',
      show: [{ grader: 'judge-blind', rep: 1 }, { grader: 'judge-sourced', rep: 1 }],
      note: `Der Agent hat \`finish\` mit lauter \`null\` aufgerufen, ohne je zu veröffentlichen. Das passierte in ${empty} von ${total} Läufen, einmal sogar mit dem sorgfältigen Prompt (r4, \`careful-2\`). \`judge-blind\` lässt beide leeren Texte bestehen, \`pr-refs\` auch: Keine Verweise heißt keine falschen Verweise. Wer nichts sagt, sagt nichts Falsches.`,
    }),
    example({
      title: 'Fast perfekt, nie veröffentlicht, und die Referenz straft die bessere Migration ab',
      exp: 'e4', release: 'r5', variant: 'careful-2', needle: 'worker.pause(true|false)',
      show: [{ grader: 'judge-ref', rep: 1, evidence: 'drain: true|false' }, { grader: 'judge-sourced', rep: 1 }, { grader: 'pairwise', rep: 1 }],
      note: 'Drei Dinge in einem Lauf. Erstens ein echter `false-success`: `judge-sourced`, `judge-blind` und `pairwise` sind zufrieden, nur `functional` sieht, dass nichts veröffentlicht wurde. Die Hypothese „nur Functional“ hält auch beim echten Agenten. Zweitens deckt der Agent `pause(false)` ab, was Gold versäumt (Beispiel 2), und `pairwise` zieht seine Fassung in beiden Reihenfolgen vor. Drittens wertet `judge-ref` genau das als Verstoß, weil die Referenz es nicht enthält. Eine lückenhafte Referenz vererbt ihre Lücke an den Grader.',
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

Alle Zahlen und Zitate in dieser Datei erzeugt \`npm run report\` aus \`data/raw/\`, von Hand steht hier nur der verbindende Text. Grundlage: Prompts \`${s.prompt_version}\`, Agent \`${s.models.agent}\`, Judges \`${s.models.judge}\`, Effort \`${s.models.effort}\`.

## Das Wichtigste

- **Der scheinbar beste Grader hält am wenigsten, was seine Zahl verspricht.** \`judge-ref\` findet auf den Mutationen alles, was im Text steht (${count(u['judge-ref'].tnr, u['judge-ref'].faulty)} von ${u['judge-ref'].faulty} Texten, ${u['judge-ref'].clean - count(u['judge-ref'].tpr, u['judge-ref'].clean)} Fehlalarme). Auf echten Agent-Texten lässt er nur ${obs('judge-ref')} von ${total} bestehen. Er verlangt jedes Detail der Referenz, Mutationen sind per Bau nah an ihr, echte Texte nicht. Ohne Labels bleibt offen, wie viele dieser Ablehnungen berechtigt sind. Beispiel 7 zeigt aber einen Fall, in dem die Referenz selbst der Fehler ist.
- **\`judge-sourced\` lässt alle ${s.rates['judge-sourced'].clean} Kontrollen durchfallen.** TPR ${num(r['judge-sourced'].tpr)}, TNR ${num(r['judge-sourced'].tnr)}. Seine Fundrate von 100 % sagt allein deshalb nichts. Auf den Texten des Agenten lässt er dagegen ${obs('judge-sourced')} von ${total} bestehen. Vermutlich bieten die erklärenden Gold-Texte mehr Angriffsfläche als die knappen Agent-Texte. Ein Teil seiner Vorwürfe gegen Gold ist berechtigt.
- **Die Ablenkung aus E3 trat nicht ein, eher das Gegenteil.** Selbstbewusster Ton machte ${softer} Urteile milder und ${blind.harsher + pair.harsher} strenger.
- **Mutationen ersetzen keine echten Läufe.** TPR und TNR aus E1 übertragen sich schlecht auf E4. Die Korrektur nach Rogan-Gladen ergibt für dieselben Texte je nach Grader Werte zwischen ${num(low)} und ${num(high)}.

## Kennzahlen

Definition wie im Skill \`validate-evaluator\` und damit andersherum als oft üblich: „positiv“ heißt bestanden. **TPR** ist der Anteil fehlerfreier Fälle, die der Grader bestehen lässt. **TNR** ist der Anteil fehlerhafter Fälle, die er durchfallen lässt.

Das Urteil pro Artefakt ist die Mehrheit der Wiederholungen. E1 umfasst ${s.counts.artifacts} Artefakte (${s.counts.controls} Kontrollen, ${s.counts.mutations} Mutationen). ${s.counts.not_applicable} Kombinationen aus Release und Fehlerart sind nicht definiert, etwa ein Embargo-Leck ohne Embargo-Fix. Sie stehen in \`data/results/e1.json\`.

## E1: Matrix

Zellen zeigen, wie viele Artefakte durchgefallen sind. Bei Mutationen ist das die Fundrate, bei Kontrollen die Zahl der Fehlalarme.

${matrixTable(s)}

Spalten: ${GRADERS.map((g) => `\`${SHORT[g]}\` = ${g}`).join(', ')}.

### TPR und TNR

${ratesTable(s)}

Die Spalten „je Text“ gelten nur für LLM-Grader. \`gold\`, \`extra-diligent\`, \`false-success\` und \`lucky-path\` haben denselben Text und teilen sich dieselben Judge-Aufrufe. Die Spec-Zahl zählt sie mehrfach, \`false-success\` und \`lucky-path\` senken die TNR jedes Judges, obwohl kein Judge sie sehen kann. Je Text bleiben ${u['judge-ref'].clean} Kontrollen und ${u['judge-ref'].faulty} Mutationen.

### Hypothesen der Spec

Lesart: „Judge“ heißt \`judge-ref\`, \`judge-sourced\`, \`judge-blind\`. „Referenz“ heißt \`judge-ref\`, \`ref-similarity\`. „Eingetreten“ heißt: Alle Erwarteten finden alle Fälle, bei „nur“ findet zudem kein anderer etwas.

${hypothesisTable(s)}

Was davon nicht eintrat:

- \`ref-similarity\` findet keinen fehlenden Breaking Change (${cell('ref-similarity', 'missing-breaking')}) und keine falsche Migration (${cell('ref-similarity', 'wrong-migration')}). Eine fehlende Zeile oder ein falscher Optionsname bewegt die Ähnlichkeit kaum unter 0,7. Dafür schlägt der Grader bei allen ${s.matrix['ref-similarity'].paraphrase.total} Paraphrasen falsch an und bei allen ${total} Agent-Texten.
- \`semver-labels\` findet den falschen Bump in ${cell('semver-labels', 'wrong-bump')} Fällen. \`schema\` findet ihn in ${cell('schema', 'wrong-bump')}, ohne dafür gebaut zu sein: Ein Abschnitt „Breaking Changes“ bei Minor verstößt gegen die Strukturregel.
- \`judge-blind\` findet Fehler in Form und Ton, inhaltliche kaum: ${cell('judge-blind', 'invented-claim')} erfundene Aussagen, ${cell('judge-blind', 'ghost-pr')} Geister-PRs. Das steht nicht in der Spec, passt aber zur These.
- \`false-success\` und \`lucky-path\` sind nur scheinbar von \`judge-sourced\` gefunden. Er sieht denselben Text wie bei Gold und lehnt ihn genauso ab. Das ist kein Fund, sondern sein Grundrauschen.

### Trifft der Judge wirklich den eingebauten Fehler?

Eine Fundrate zählt nur das Durchfallen. Bei einem Judge, der alles ablehnt, ist das wertlos. Darum eine Zusatzprüfung, **nach den Läufen definiert und nicht Teil der vorab eingefrorenen Regeln**: Nennt die Mehrheit der Wiederholungen das zur Mutation passende Rubric-Kriterium, und enthält der Beleg ein Wort, das sich gegenüber Gold geändert hat? Die Prüfung ist grob. Ein Treffer kann Zufall sein, ein paraphrasierter Beleg kann durchrutschen.

${onTargetTable(s)}

\`judge-sourced\` meldet den eingebauten Fehler also meist tatsächlich, lehnt daneben aber auch Fehlerfreies ab. Er ist kein Zufallsgenerator, sondern zu streng. Der Prompt bleibt trotzdem unverändert: Eine Nachschärfung bis zur schönen Matrix wäre genau das, was die Spec ausschließt.

## E2: Stabilität

Quote der Fälle, in denen die drei Wiederholungen nicht einig sind. Die Spalte „je Text“ zählt jeden Text einmal.

${flakinessTable(s)}

Alle uneinigen Fälle:

${table(['Release', 'Fassung', 'Grader', 'bestanden'], s.disagreements.map((d) => [d.release, d.variant, d.grader, `${d.passes}/${d.reps}`]))}

Die Flakiness ist gering. Die Reihenfolge wirkt stärker: Bei \`pairwise\` antworten die beiden Reihenfolgen in ${s.pairwise_order.inconsistent} von ${s.pairwise_order.total} Wiederholungen nicht gleich, davon ${s.pairwise_order.one_equal}-mal als Präferenz gegen „equal“. Eine echte Umkehr gab es ${s.pairwise_order.flips}-mal. Die eingefrorene Regel fängt das ab, weil eine Fassung nur durchfällt, wenn Gold in beiden Reihenfolgen gewinnt. Das drückt aber auch die Fundrate von \`pairwise\`.

## E3: Ablenkung

Pro Release dieselbe erfundene Aussage (\`invented-claim\`), neutral und selbstbewusst formuliert. Die Zellen zeigen bestandene Wiederholungen. Alle Fassungen sind fehlerhaft, jedes Bestehen ist also ein Fehlurteil.

${e3Table(s)}

- \`judge-ref\` und \`judge-sourced\` lassen sich nicht beirren, beide Fassungen fallen in allen Wiederholungen durch.
- \`judge-blind\` lässt die neutrale Fassung in ${blind.pass_neutral} von ${s.e3.rows.length} Releases bestehen, die selbstbewusste in ${blind.pass_confident}.
- \`pairwise\` lässt die neutrale Fassung in ${pair.pass_neutral} von ${s.e3.rows.length} bestehen, die selbstbewusste in ${pair.pass_confident}.
- Bei \`pairwise\` gab es in ${s.e3.order.total} Wiederholungen ${s.e3.order.flips} echte Umkehrungen durch die Reihenfolge und ${s.e3.order.inconsistent} ungleiche Antworten.

Die Spec fragt nach Tripathi et al., ob sich ein Vergleich durch selbstbewussten Ton eher täuschen lässt als eine absolute Bewertung. Dieser kleine Aufbau zeigt das nicht. Die Aussagekraft ist aber begrenzt: Unsere selbstbewussten Fassungen enthalten Wörter wie „guaranteed“ und „definitively“. Die Rubric verbietet solchen Ton in R7 ausdrücklich, ein Judge hat also einen Anlass abzulehnen. Zudem verschärfen einzelne Formulierungen die Aussage etwas, der Inhalt ist nur annähernd gleich. Eine Ablenkung, die im Ton innerhalb der Rubric bleibt, haben wir nicht getestet.

## E4: Echter Agent

${total} Läufe: 2 Prompts, 6 Releases, je 2 Wiederholungen. Jeder LLM-Grader urteilt hier einmal, wie in \`params.json\` eingefroren. Es gibt keine menschlichen Labels, **darum stehen hier weder TPR noch TNR**. Die Tabelle zeigt nur, wer wem widerspricht.

${e4Table(s)}

${e4Prompts(s)}

Was auffällt:

- Sorgfalt hilft messbar, aber nicht überall. \`trajectory\` steigt von ${naive.passes.trajectory} auf ${careful.passes.trajectory}, \`schema\` von ${naive.passes.schema} auf ${careful.passes.schema}. Bei \`functional\` ändert sich fast nichts (${naive.passes.functional} zu ${careful.passes.functional}). ${careful.runs - careful.published} sorgfältige und ${naive.runs - naive.published} naive Läufe veröffentlichen nie.
- ${unpublished} von ${total} Läufen haben nichts veröffentlicht, ${planMissing} haben \`finish\` ohne Plan aufgerufen, ${empty} davon ohne Notes. Der Status \`finished\` in \`e4.json\` sagt nur, dass \`finish\` kam.
- Die vier LLM-Grader sind sich in ${s.e4.llm_split} von ${total} Läufen uneinig. Über alle Grader gilt das für alle ${s.e4.all_split}, schon weil \`pr-refs\` jeden und \`ref-similarity\` keinen Lauf bestehen lässt.
- Am weitesten auseinander liegen \`judge-ref\` und \`judge-blind\` mit ${pairDisagree('judge-ref', 'judge-blind')} widersprüchlichen Läufen. \`judge-ref\` lehnt ab, wenn ein Detail der Referenz fehlt oder etwas hinzukommt, \`judge-blind\` lässt durch, was in sich sauber klingt.
- \`wording\` schlägt auf Agent-Texten kaum an: ${wordingHits} Treffer, davon ${empty} auf leeren Notes und einer wegen eines Embargo-Begriffs. Der Agent schreibt keinen Werbeton. Die hohen Fundraten aus E1 bleiben darum, wie in \`graders/prompts/v1/README.md\` angekündigt, eine Obergrenze ohne Gegenprobe.

## Rechenbeispiel Rogan-Gladen

Die beobachtete Pass-Rate eines Graders auf E4 lässt sich mit seinen Werten aus E1 korrigieren: geschätzte wahre Rate = (beobachtet + TNR − 1) / (TPR + TNR − 1).

${roganTable(s)}

Dieselben ${total} Texte, und die geschätzte Rate reicht je nach Grader von ${num(low)} bis ${num(high)}. Bei \`judge-ref\` wird das Ergebnis auf 0 begrenzt, bei \`judge-sourced\` ist die Formel gar nicht definiert. Die Korrektur setzt voraus, dass TPR und TNR auf den neuen Daten gelten. Hier tun sie das nachweislich nicht: \`judge-sourced\` hat auf den Kontrollen TPR ${num(r['judge-sourced'].tpr)} und lässt trotzdem ${obs('judge-sourced')} Agent-Texte bestehen. Das Beispiel zeigt deshalb vor allem die Grenze der Korrektur, nicht die Qualität des Agenten.

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
- Keine menschlichen Labels. Die Einordnungen in den Beispielen stammen vom Autor, nicht aus einer Messung.
`;
}
