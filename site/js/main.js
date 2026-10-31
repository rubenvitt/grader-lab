import { diffWords, int, num2, renderMarkdown, roganGladen } from './lib.js';

const LLM = ['judge-ref', 'judge-sourced', 'judge-blind', 'pairwise'];
const LABEL = {
  'missing-breaking': 'Breaking Change fehlt', 'wrong-bump': 'minor statt major', 'ghost-pr': 'Verweis auf PR, die es nicht gibt',
  'invented-claim': 'erfundene Aussage', 'wrong-migration': 'falscher Optionsname in der Migration', 'reverted-listed': 'Zurückgenommenes steht drin',
  'embargo-leak': 'Embargo-Details im Text', 'internal-noise': 'CI-Interna in den Notes', 'hype-tone': 'Inhalt korrekt, Ton Marketing',
  'useless-true': 'alles wahr, nichts brauchbar', 'false-success': 'Notes korrekt, nie veröffentlicht', 'lucky-path': 'Ergebnis korrekt, Diffs nie gelesen',
  gold: 'unverändert', paraphrase: 'gleiche Fakten, andere Worte', reordered: 'andere Reihenfolge der Abschnitte', 'extra-diligent': 'zusätzliche Tool-Aufrufe, korrekt',
};
const METHOD = {
  schema: 'Struktur und Pflichtabschnitte', 'pr-refs': 'jede #n existiert und ist nicht zurückgenommen', 'semver-labels': 'Bump passt zu Labels und Commit-Präfixen',
  wording: 'verbotene Wörter, Embargo-Begriffe, Länge', 'ref-similarity': 'Textähnlichkeit zur Gold-Fassung', functional: 'Sandbox: veröffentlicht, Version stimmt',
  trajectory: 'jeder Diff gelesen, bevor veröffentlicht wird', 'judge-ref': 'LLM vergleicht mit Gold', 'judge-sourced': 'LLM prüft gegen PRs und Diffs, ohne Gold',
  'judge-blind': 'LLM sieht nur die Notes', pairwise: 'LLM vergleicht mit Gold, beide Reihenfolgen',
};
const RUNS = { 'careful-1': 'sorgfältig 1', 'careful-2': 'sorgfältig 2', 'naive-1': 'naiv 1', 'naive-2': 'naiv 2' };
// Hand-picked for the game: one release, labels by construction. r1 has no known gap in gold, unlike r5 and r6.
const GAME_RELEASE = 'r1';
const GAME = ['invented-claim', 'paraphrase', 'false-success', 'useless-true', 'wrong-migration', 'gold'];
const CASES = [
  ['r3', 'naive-2', 'Leere Notes bestehen', '`finish` mit lauter `null`, nichts veröffentlicht. `judge-blind` und `pr-refs` lassen das durch: Wer nichts sagt, sagt nichts Falsches.'],
  ['r5', 'careful-2', 'Fast perfekt, nie veröffentlicht', 'Drei LLM-Grader sind zufrieden, nur `functional` sieht es. Zugleich deckt der Agent `pause(false)` ab, was Gold versäumt, und `judge-ref` wertet genau das als Verstoß.'],
  ['r6', 'careful-2', 'Gleiches Urteil, Widerspruch in der Sache', 'Alle vier LLM-Grader lehnen ab. `pairwise` und `judge-ref` sehen ein Embargo-Leck, `judge-sourced` schreibt, das Embargo sei gewahrt, und lehnt wegen der Version ab.'],
  ['r4', 'careful-1', 'Ein Leerzeichen am Zeilenende', '`functional` vergleicht bytegenau und fällt durch. Deterministisch heißt nicht fehlerfrei, auch dieser Grader ist nur ein System.'],
];

const h = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'html') el.innerHTML = value; // only ever output of renderMarkdown, which escapes
    else if (value === true) el.setAttribute(key, '');
    else if (value != null && value !== false) el.setAttribute(key, value);
  }
  el.append(...kids.flat(Infinity).filter((kid) => kid != null && kid !== false));
  return el;
};
const $ = (id) => document.getElementById(id);
const code = (text) => h('code', {}, text);
// Turns `backticks` in hand-written strings into code elements.
const rich = (text) => text.split(/`([^`]+)`/).map((part, i) => (i % 2 ? code(part) : part));
const scroller = (label, table) => h('div', { class: 'scroller', tabindex: 0, role: 'region', 'aria-label': label }, table);
const verdictWord = (pass) => (pass ? 'bestanden' : 'durchgefallen');

function segmented(label, options, value, onChange) {
  const group = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  const select = (next) => {
    for (const button of group.children) button.setAttribute('aria-pressed', button.dataset.value === next);
    onChange(next);
  };
  group.append(...options.map(([key, text]) => h('button', { type: 'button', 'data-value': key, 'aria-pressed': key === value, onclick: () => select(key) }, text)));
  return group;
}

// Blocked storage must not break anything, the state then simply lasts until reload.
const ratings = {
  key: 'grader-lab:ratings',
  memory: {},
  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.key));
      if (saved && typeof saved === 'object') this.memory = Object.fromEntries(Object.entries(saved).filter(([k, v]) => GAME.includes(k) && ['pass', 'fail'].includes(v)));
    } catch { /* blocked or corrupt: start empty */ }
    return this.memory;
  },
  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.memory)); } catch { /* blocked: stays in memory */ }
  },
};

function main(demo, summary) {
  const releases = new Map(demo.releases.map((r) => [r.id, r]));
  const entries = new Map([...demo.e1, ...demo.e3, ...demo.e4].map((e) => [`${e.release}|${e.variant}`, e]));
  const entry = (release, variant) => entries.get(`${release}|${variant}`);
  const graders = Object.keys(summary.matrix);
  const mutations = summary.hypotheses.map((x) => x.variant);
  const controls = Object.keys(summary.matrix.schema).filter((v) => !mutations.includes(v));
  const passCount = (grader) => summary.e4.byPrompt.naive.passes[grader] + summary.e4.byPrompt.careful.passes[grader];
  const countOf = ({ tnr, faulty }) => Math.round(tnr * faulty);
  // Same text as gold, rejected just like gold: durchgefallen, but not a find.
  const isNoise = (grader, variant) => grader === 'judge-sourced' && ['false-success', 'lucky-path'].includes(variant);

  function fillFacts() {
    const { rogan: rg, runs } = summary.e4;
    const corrected = Object.values(rg).map((x) => x.corrected).filter((x) => x != null);
    const change = Object.values(summary.e3.change);
    const sum = (key) => change.reduce((total, x) => total + x[key], 0);
    const facts = {
      faultKinds: mutations.length, graders: graders.length, calls: int(summary.raw.used), artifacts: summary.counts.artifacts,
      mutations: summary.counts.mutations, controls: summary.counts.controls, runs: runs.length,
      agentModel: demo.models.agent, judgeModel: demo.models.judge, effort: demo.models.effort,
      jsrcTpr: num2(summary.rates['judge-sourced'].tpr), jsrcTnr: num2(summary.rates['judge-sourced'].tnr),
      jrefMut: `${countOf(summary.rates_unique_text['judge-ref'])} von ${summary.rates_unique_text['judge-ref'].faulty}`,
      jrefE4: `${passCount('judge-ref')} von ${runs.length}`, jsrcE4: `${passCount('judge-sourced')} von ${runs.length}`,
      llmSplit: `${summary.e4.llm_split} von ${runs.length}`,
      roganRange: `${num2(Math.min(...corrected))} bis ${num2(Math.max(...corrected))}`,
      orderMismatch: `${summary.pairwise_order.inconsistent} von ${summary.pairwise_order.total}`, orderFlips: summary.pairwise_order.flips,
      softer: sum('softer'), harsher: sum('harsher'),
      blindTone: `${summary.e3.blind_confident_fails_tone} von ${summary.e3.blind_confident_fails}`,
      e3Flips: summary.e3.order.flips, e3Mismatch: summary.e3.order.inconsistent, e3Order: summary.e3.order.total,
    };
    for (const el of document.querySelectorAll('[data-fact]')) el.textContent = facts[el.dataset.fact];
  }

  function heroMap() {
    const cell = (grader, variant, control) => {
      const { found, total } = summary.matrix[grader][variant];
      const state = !found ? 'none' : isNoise(grader, variant) ? 'noise' : found < total ? 'part' : 'full';
      return h('span', { class: `dot dot-${state}${control ? ' dot-control' : ''}` });
    };
    const rows = graders.map((grader) => [
      h('span', { class: 'map-label' }, grader),
      mutations.map((v) => cell(grader, v, false)),
      h('span', { class: 'map-gap' }),
      controls.map((v) => cell(grader, v, true)),
    ]);
    $('hero-map').append(h('span', { class: 'map', 'aria-hidden': 'true' }, rows));
  }

  /* ---------- shared pieces ---------- */

  const notesView = (artifact) => (artifact.notes_md
    ? h('div', { class: 'notes', html: renderMarkdown(artifact.notes_md) })
    : h('p', { class: 'notes-empty' }, 'Die Notes sind leer.'));

  const prList = (release) => h('ol', { class: 'prs' }, release.prs.map((pr) => h('li', {}, h('details', {},
    h('summary', {}, h('span', { class: 'pr-no' }, `#${pr.number}`), h('span', {}, pr.title), pr.labels.map((label) => h('span', { class: 'label' }, label))),
    h('p', { class: 'pr-body' }, pr.body),
    h('pre', { class: 'code', tabindex: 0 }, pr.diff),
  ))));

  const transcriptView = (transcript) => {
    const turns = Object.groupBy(transcript, (call) => call.turn);
    return h('pre', { class: 'code', tabindex: 0 }, Object.entries(turns)
      .map(([turn, calls]) => `Zug ${turn}\n${calls.map((c) => `  ${c.tool}(${c.id ?? ''})${c.ok ? '' : '  fehlgeschlagen'}`).join('\n')}`).join('\n'));
  };

  const diffsRead = (e) => new Set(e.artifact.transcript.filter((c) => c.tool === 'get_diff').map((c) => c.id)).size;

  const factLine = (e) => {
    const { plan, sandbox, transcript } = e.artifact;
    const items = [
      ['Bump im Plan', plan.bump ?? 'keiner'],
      ['Version im Plan', plan.version ?? 'keine'],
      ['Veröffentlicht', sandbox.published ? `ja, ${sandbox.version}` : 'nein'],
      transcript && ['Diffs gelesen', `${diffsRead(e)} von ${releases.get(e.release).prs.length}`],
    ].filter(Boolean);
    return h('dl', { class: 'facts' }, items.map(([key, value]) => h('div', {}, h('dt', {}, key), h('dd', {}, value))));
  };

  const verdictList = (e) => h('ul', { class: 'verdicts' }, graders.map((grader) => {
    const v = e.verdicts[grader];
    return h('li', { class: v.pass ? 'is-pass' : 'is-fail' },
      h('code', {}, grader),
      h('span', {}, `${verdictWord(v.pass)}${v.reps > 1 ? `, ${v.passes} von ${v.reps}` : ''}`));
  }));

  const diffView = (from, to) => {
    if (from === to) return h('p', { class: 'note' }, 'Der Text ist identisch.');
    return h('pre', { class: 'diff', tabindex: 0 }, diffWords(from, to).map((part) => (part.type === 'same' ? part.text : h(part.type === 'add' ? 'ins' : 'del', {}, part.text))));
  };

  /* ---------- detail dialog ---------- */

  const reasonView = (grader, v) => h('div', { class: 'reason' },
    h('h3', {}, `${grader}: ${verdictWord(v.pass)}`),
    h('p', { class: 'note' }, `${METHOD[grader]}.${v.reps > 1 ? ` ${v.passes} von ${v.reps} Wiederholungen bestanden. Begründung aus einer Wiederholung mit diesem Urteil.` : ''}`),
    v.reason && h('p', {}, v.reason),
    v.violations && h('ul', {}, v.violations.map((x) => h('li', {}, h('strong', {}, x.criterion), ' ', x.evidence))),
    v.findings && h('ul', {}, v.findings.slice(0, 6).map((x) => h('li', {}, x)), v.findings.length > 6 && h('li', {}, `und ${v.findings.length - 6} weitere`)),
    !v.reason && !v.findings && h('p', {}, 'Keine Beanstandung.'),
    v.score != null && h('p', { class: 'note' }, `Ähnlichkeit ${v.score}`));

  function artifactView(e, grader, intro) {
    const gold = releases.get(e.release).gold;
    return [
      intro,
      grader && reasonView(grader, e.verdicts[grader]),
      h('h3', {}, e.kind === 'agent' ? 'Ergebnis des Laufs' : 'Artefakt'),
      factLine(e),
      e.artifact.notes_md && !e.artifact.sandbox.same_text && e.artifact.sandbox.published && h('p', { class: 'note' }, 'Der veröffentlichte Text weicht von den gemeldeten Notes ab.'),
      h('h3', {}, 'Diff zur Gold-Fassung'),
      e.artifact.notes_md ? diffView(gold.notes_md, e.artifact.notes_md) : h('p', { class: 'notes-empty' }, 'Die Notes sind leer.'),
      h('p', { class: 'note' }, 'Gold-Plan: ', gold.plan.bump, ', ', gold.plan.version, '.'),
      e.artifact.transcript && h('details', { class: 'fold' }, h('summary', {}, 'Transcript'), transcriptView(e.artifact.transcript)),
      h('details', { class: 'fold' }, h('summary', {}, 'Alle Grader zu dieser Fassung'), verdictList(e)),
    ];
  }

  function openDetail(title, subtitle, body) {
    $('detail-body').replaceChildren(h('h2', { id: 'detail-title' }, title), h('p', { class: 'meta' }, subtitle), ...[body].flat(Infinity).filter(Boolean));
    if (!$('detail').open) $('detail').showModal();
    $('detail').scrollTop = 0;
  }

  function openCell(grader, variant) {
    const cases = demo.releases.map((r) => ({ id: r.id, e: entry(r.id, variant), missing: demo.limits.not_applicable.find((x) => x.release === r.id && x.variant === variant) }));
    const available = cases.filter((c) => c.e);
    const first = available.find((c) => !c.e.verdicts[grader].pass) ?? available[0];
    const render = (id) => {
      const picked = cases.find((c) => c.id === id);
      const picker = segmented('Release', available.map((c) => [c.id, `${c.id}: ${verdictWord(c.e.verdicts[grader].pass)}`]), id, render);
      const undefinedHere = cases.filter((c) => c.missing).map((c) => h('li', {}, `${c.id}: nicht definiert. ${c.missing.reason}`));
      openDetail(variant, `${LABEL[variant]}, ${grader}`, [picker, undefinedHere.length > 0 && h('ul', { class: 'note' }, undefinedHere), artifactView(picked.e, grader)]);
    };
    render(first.id);
  }

  /* ---------- agent ---------- */

  function agentSection() {
    const state = { release: 'r1', run: 'careful-1' };
    const view = h('div', { class: 'agent-view' });
    const render = () => {
      const release = releases.get(state.release);
      const e = entry(state.release, state.run);
      const { sandbox, transcript } = e.artifact;
      const turns = new Set(transcript.map((c) => c.turn)).size;
      view.replaceChildren(
        h('div', {},
          h('h3', {}, `Eingabe: ${release.prs.length} gemergte PRs seit ${release.previous_version}`),
          prList(release)),
        h('div', {},
          h('h3', {}, 'Ausgabe'),
          h('p', { class: `run-state ${sandbox.published ? '' : 'is-fail'}` }, sandbox.published ? `Veröffentlicht als ${sandbox.version}` : 'Nichts veröffentlicht'),
          factLine(e),
          notesView(e.artifact),
          h('details', { class: 'fold' }, h('summary', {}, `Transcript: ${transcript.length} Tool-Aufrufe in ${turns} Zügen`), transcriptView(transcript)),
          h('details', { class: 'fold' }, h('summary', {}, 'Urteile der Grader zu diesem Lauf'), verdictList(e))),
      );
    };
    const set = (key) => (value) => { state[key] = value; render(); };
    $('agent-app').append(
      h('div', { class: 'controls' },
        h('div', {}, h('span', { class: 'control-label' }, 'Release'), segmented('Release', demo.releases.map((r) => [r.id, r.id]), state.release, set('release'))),
        h('div', {}, h('span', { class: 'control-label' }, 'Lauf'), segmented('Lauf', Object.entries(RUNS), state.run, set('run')))),
      view);
    render();
  }

  /* ---------- game ---------- */

  function gameSection(onReveal) {
    const answers = ratings.load();
    const root = $('game-app');
    const release = releases.get(GAME_RELEASE);
    const letter = (i) => 'ABCDEF'[i];
    let step = Math.max(0, GAME.findIndex((v) => !answers[v]));
    const done = () => GAME.every((v) => answers[v]);

    const answer = (verdict) => {
      answers[GAME[step]] = verdict;
      ratings.save();
      if (done()) { reveal(); root.querySelector('h3').focus(); } else {
        const next = GAME.findIndex((v, i) => i > step && !answers[v]);
        step = next === -1 ? GAME.findIndex((v) => !answers[v]) : next;
        rate();
      }
    };

    function rate() {
      const variant = GAME[step];
      const chosen = answers[variant];
      const pending = GAME.filter((v) => !answers[v]).length;
      root.replaceChildren(h('div', { class: 'game' },
        h('div', {},
          h('p', { class: 'meta', 'aria-live': 'polite' }, `Fassung ${letter(step)} von ${letter(GAME.length - 1)}, noch ${pending} offen`),
          notesView(entry(GAME_RELEASE, variant).artifact),
          h('div', { class: 'game-actions' },
            h('button', { type: 'button', class: 'btn', 'aria-pressed': chosen === 'pass', onclick: () => answer('pass') }, 'Bestehen lassen'),
            h('button', { type: 'button', class: 'btn', 'aria-pressed': chosen === 'fail', onclick: () => answer('fail') }, 'Durchfallen lassen'),
            step > 0 && h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { step--; rate(); } }, 'Zurück'))),
        h('div', {},
          h('details', { class: 'fold' }, h('summary', {}, `Quellen: ${release.prs.length} PRs mit Diff`), prList(release)),
          h('p', { class: 'note' }, 'Maßstab: Jede Aussage ist belegt, Breaking Changes stehen unter „Breaking Changes“, ein Nutzer erkennt, was er tun muss, der Ton ist sachlich.'))));
      root.querySelector('.game-actions button').focus({ preventScroll: true });
    }

    function reveal() {
      const correct = (variant, verdict) => (verdict === 'pass') === (entry(GAME_RELEASE, variant).kind === 'control');
      const score = (verdictOf) => GAME.filter((v) => correct(v, verdictOf(v))).length;
      const you = score((v) => answers[v]);
      const others = graders.map((grader) => ({ grader, right: score((v) => (entry(GAME_RELEASE, v).verdicts[grader].pass ? 'pass' : 'fail')) }))
        .sort((a, b) => b.right - a.right);
      const rows = GAME.map((variant, i) => {
        const e = entry(GAME_RELEASE, variant);
        const failed = graders.filter((grader) => !e.verdicts[grader].pass);
        return h('tr', {},
          h('th', { scope: 'row' }, letter(i)),
          h('td', {}, e.kind === 'control' ? 'fehlerfrei' : 'fehlerhaft'),
          h('td', {}, `${verdictWord(answers[variant] === 'pass')}, ${correct(variant, answers[variant]) ? 'stimmt' : 'stimmt nicht'}`),
          h('td', {}, code(variant), h('br'), LABEL[variant]),
          h('td', {}, failed.length ? failed.map((g, n) => [n > 0 && ', ', code(g)]) : 'keiner'),
          h('td', {}, h('button', { type: 'button', class: 'btn btn-s', 'aria-label': `Fassung ${letter(i)} ansehen`, onclick: () => openDetail(variant, `${LABEL[variant]}, Fassung ${letter(i)}`, artifactView(e)) }, 'Ansehen')));
      });
      root.replaceChildren(h('div', { class: 'reveal' },
        h('h3', { tabindex: -1 }, `Du triffst ${you} von ${GAME.length}, gemessen an der Konstruktion`),
        h('p', {}, rich('Die Fassungen C und F haben denselben Text. C wurde nie veröffentlicht. Das steht in keinem Text, weder du noch ein Judge kann es sehen, nur `functional` prüft die Sandbox. `judge-sourced` lehnt C zwar ab, aber F genauso.')),
        scroller('Auflösung', h('table', {},
          h('caption', {}, 'Auflösung der sechs Fassungen aus Release r1'),
          h('thead', {}, h('tr', {}, ['Fassung', 'Laut Konstruktion', 'Dein Urteil', 'Was drinsteckt', 'Durchfallen ließen', ''].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', {}, rows))),
        h('h3', {}, 'Treffer auf diesen sechs Fassungen'),
        h('ul', { class: 'bars' },
          h('li', { class: 'is-you' }, h('span', {}, 'du'), h('span', { class: 'bar', style: `--v:${you / GAME.length}` }), h('span', {}, `${you}/${GAME.length}`)),
          others.map(({ grader, right }) => h('li', {}, h('code', {}, grader), h('span', { class: 'bar', style: `--v:${right / GAME.length}` }), h('span', {}, `${right}/${GAME.length}`)))),
        h('p', { class: 'note' }, 'Sechs handverlesene Fassungen aus einem Release, das ist kein Leistungsvergleich. Deine Urteile stehen jetzt in der Spalte „Du“ der Matrix.'),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: restart }, 'Noch einmal bewerten')));
      onReveal(answers);
    }

    function restart() {
      for (const key of Object.keys(answers)) delete answers[key];
      ratings.save();
      step = 0;
      onReveal({});
      rate();
    }

    // Do not steal focus on load, rate() focuses only after an interaction.
    if (done()) reveal(); else {
      rate();
      document.activeElement?.blur();
    }
  }

  /* ---------- matrix ---------- */

  function matrixSection() {
    const humanCells = new Map();

    const cell = (grader, variant, r, c) => {
      const { found, total } = summary.matrix[grader][variant];
      const control = controls.includes(variant);
      const noise = isNoise(grader, variant);
      const state = !found ? 'none' : control ? 'alarm' : noise ? 'noise' : found < total ? 'part' : 'full';
      const mark = control && found ? ' !' : noise ? ' †' : '';
      const reading = control ? `${found} von ${total} Fehlalarme` : noise ? `${found} von ${total} durchgefallen, kein echter Fund` : `${found} von ${total} gefunden`;
      return h('td', {}, h('button', {
        type: 'button', class: `cell cell-${state}`, tabindex: r === 0 && c === 0 ? 0 : -1, 'data-r': r, 'data-c': c,
        'aria-label': `${grader}, ${variant}: ${reading}`, onclick: () => openCell(grader, variant),
      }, `${found}/${total}${mark}`));
    };

    const row = (variant, r) => {
      const human = h('td', { class: 'human' }, h('span', { class: 'cell cell-empty' }, h('span', { 'aria-hidden': 'true' }, '–'), h('span', { class: 'sr' }, 'nicht bewertet')));
      humanCells.set(variant, human);
      return h('tr', {},
        h('th', { scope: 'row' }, h('code', {}, variant), h('span', { class: 'row-label' }, LABEL[variant])),
        graders.map((grader, c) => cell(grader, variant, r, c)), human);
    };

    const group = (title, variants, offset) => h('tbody', {},
      h('tr', { class: 'group' }, h('th', { scope: 'rowgroup', colspan: graders.length + 2 }, h('span', {}, title))),
      variants.map((v, i) => row(v, offset + i)));

    const noModel = graders.filter((g) => !LLM.includes(g)).length;
    const table = h('table', { class: 'matrix' },
      h('caption', { class: 'sr' }, 'Grader mal Fehlerart: durchgefallene Artefakte je Zelle'),
      h('thead', {},
        h('tr', { class: 'head-group' },
          h('td'),
          h('th', { scope: 'colgroup', colspan: noModel }, 'ohne Modell'),
          h('th', { scope: 'colgroup', colspan: LLM.length }, 'mit Modell'),
          h('th', { scope: 'col', rowspan: 2, class: 'head-you' }, 'Du')),
        h('tr', {},
          h('th', { scope: 'col', class: 'head-corner' }, 'Fehlerart'),
          graders.map((g) => h('th', { scope: 'col', class: 'head-grader', title: METHOD[g] }, h('span', {}, g))))),
      group('Mutationen: durchgefallen heißt gefunden', mutations, 0),
      group('Kontrollen: durchgefallen heißt Fehlalarm', controls, mutations.length));

    const rowCount = mutations.length + controls.length;
    table.addEventListener('keydown', (event) => {
      const from = event.target.closest('button.cell');
      if (!from) return;
      let [r, c] = [Number(from.dataset.r), Number(from.dataset.c)];
      if (event.key === 'ArrowRight') c++;
      else if (event.key === 'ArrowLeft') c--;
      else if (event.key === 'ArrowDown') r++;
      else if (event.key === 'ArrowUp') r--;
      else if (event.key === 'Home') c = 0;
      else if (event.key === 'End') c = graders.length - 1;
      else return;
      event.preventDefault();
      if (r < 0 || r >= rowCount || c < 0 || c >= graders.length) return;
      from.tabIndex = -1;
      const to = table.querySelector(`[data-r="${r}"][data-c="${c}"]`);
      to.tabIndex = 0;
      to.focus();
    });
    table.addEventListener('focusin', (event) => {
      const to = event.target.closest('button.cell');
      if (!to) return;
      for (const other of table.querySelectorAll('button.cell[tabindex="0"]')) other.tabIndex = -1;
      to.tabIndex = 0;
    });

    $('matrix-app').append(scroller('Matrix, seitlich scrollbar', table));

    // The "Du" column holds nothing but what this reader rated, in the same unit as the other cells.
    return (answers) => {
      for (const [variant, td] of humanCells) {
        const verdict = answers[variant];
        td.firstChild.replaceChildren(...(verdict
          ? [h('span', { 'aria-hidden': 'true' }, verdict === 'fail' ? '1/1' : '0/1'), h('span', { class: 'sr' }, `Du: ${verdictWord(verdict === 'pass')}`)]
          : [h('span', { 'aria-hidden': 'true' }, '–'), h('span', { class: 'sr' }, 'nicht bewertet')]));
        td.firstChild.className = `cell ${verdict ? 'cell-you' : 'cell-empty'}`;
      }
    };
  }

  function hypotheses() {
    const rows = summary.hypotheses.map((x) => h('tr', {},
      h('th', { scope: 'row' }, code(x.variant)),
      h('td', {}, x.expected),
      h('td', {}, x.graders.map((g, i) => [i > 0 && ', ', `${g} ${x.found[g].found}/${x.found[g].total}`])),
      h('td', {}, x.outcome),
      h('td', {}, x.others.join(', ') || 'keiner')));
    $('hypotheses').append(scroller('Erwartung und Ergebnis', h('table', {},
      h('caption', { class: 'sr' }, 'Erwartung aus der Spezifikation gegen Messung'),
      h('thead', {}, h('tr', {}, ['Fehler', 'Erwartung', 'Gemessen bei den Erwarteten', 'Ergebnis', 'Fanden außerdem'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, rows))));
  }

  /* ---------- trust ---------- */

  function rates() {
    const pct = (rate) => h('span', { class: 'rate' }, h('span', { class: 'bar', style: `--v:${rate}` }), num2(rate));
    const rows = graders.map((grader) => {
      const r = summary.rates[grader];
      const unique = summary.rates_unique_text[grader];
      return h('tr', {},
        h('th', { scope: 'row' }, code(grader), h('span', { class: 'row-label' }, METHOD[grader])),
        h('td', {}, pct(r.tpr)),
        h('td', {}, pct(r.tnr)),
        h('td', {}, unique ? num2(unique.tpr) : '–'),
        h('td', {}, unique ? num2(unique.tnr) : '–'),
        h('td', {}, `${passCount(grader)} von ${summary.e4.runs.length}`));
    });
    const { clean, faulty } = summary.rates.schema;
    $('rates').append(scroller('TPR und TNR', h('table', {},
      h('caption', { class: 'sr' }, 'TPR und TNR je Grader und bestandene Läufe des echten Agenten'),
      h('thead', {}, h('tr', {}, [`TPR (${clean} fehlerfrei)`, `TNR (${faulty} fehlerhaft)`, 'TPR je Text', 'TNR je Text', 'Agent-Läufe bestanden'].reduce((cells, t) => [...cells, h('th', { scope: 'col' }, t)], [h('th', { scope: 'col' }, 'Grader')]))),
      h('tbody', {}, rows))));
  }

  function cases() {
    $('cases').append(...CASES.map(([release, variant, title, text]) => h('li', {},
      h('h4', {}, title),
      h('p', {}, rich(text)),
      h('button', {
        type: 'button', class: 'btn btn-s', onclick: () => {
          const e = entry(release, variant);
          openDetail(title, `${release}, Lauf ${RUNS[variant]}`, [h('h3', {}, 'Alle Grader zu diesem Lauf'), verdictList(e), artifactView(e).slice(0, -1)]);
        },
      }, `${release} ${RUNS[variant]} ansehen`))));
  }

  function rogan() {
    const data = summary.e4.rogan;
    // The observed rates are counts out of the agent runs, so the slider moves in runs and hits them exactly.
    const total = summary.e4.runs.length;
    const passes = (grader) => Math.round(data[grader].observed * total);
    const state = { grader: 'judge-blind', passes: passes('judge-blind') };
    const output = h('output', { class: 'rogan-result', for: 'observed' });
    const slider = h('input', {
      type: 'range', id: 'observed', min: 0, max: total, step: 1, value: state.passes,
      oninput: (event) => { state.passes = Number(event.target.value); render(); },
    });
    const sliderLabel = h('label', { for: 'observed' });
    function render() {
      const { tpr, tnr } = data[state.grader];
      const shown = state.passes / total;
      const corrected = roganGladen(shown, tpr, tnr);
      sliderLabel.textContent = `Beobachtete Pass-Rate: ${state.passes} von ${total} Läufen bestanden, ${num2(shown)}. Gemessen wurden ${passes(state.grader)} von ${total}.`;
      const raw = tpr + tnr - 1 > 0 ? (shown + tnr - 1) / (tpr + tnr - 1) : null;
      const remark = corrected == null ? `TPR + TNR − 1 = ${num2(tpr + tnr - 1)}, die Formel gibt hier nichts her.`
        : raw !== corrected ? 'Das Rohergebnis liegt außerhalb von 0 bis 1 und wird begrenzt.' : '';
      output.replaceChildren(
        h('span', { class: 'formula' }, `(${num2(shown)} + ${num2(tnr)} − 1) / (${num2(tpr)} + ${num2(tnr)} − 1)`),
        h('strong', {}, corrected == null ? 'nicht definiert' : num2(corrected)),
        h('span', { class: 'note' }, remark));
    }
    const pick = segmented('Grader', LLM.map((g) => [g, g]), state.grader, (grader) => {
      state.grader = grader;
      state.passes = passes(grader);
      slider.value = state.passes;
      render();
    });
    const table = h('table', {},
      h('caption', { class: 'sr' }, 'Korrektur der Pass-Rate auf dem echten Agenten'),
      h('thead', {}, h('tr', {}, ['Grader', 'beobachtet', 'TPR', 'TNR', 'korrigiert'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, LLM.map((g) => h('tr', {},
        h('th', { scope: 'row' }, code(g)),
        ['observed', 'tpr', 'tnr'].map((k) => h('td', {}, num2(data[g][k]))),
        h('td', {}, data[g].corrected == null ? 'nicht definiert' : num2(data[g].corrected))))));
    $('rogan').append(pick, sliderLabel, slider, output, scroller('Korrektur je Grader', table));
    render();
  }

  function flakiness() {
    const percent = ({ disagreeing, total, rate }) => `${disagreeing}/${total} (${Math.round(rate * 100)} %)`;
    $('flakiness').append(scroller('Stabilität', h('table', {},
      h('caption', { class: 'sr' }, 'Uneinige Fälle je LLM-Grader'),
      h('thead', {}, h('tr', {}, ['Grader', 'je Artefakt', 'je Text'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, LLM.map((g) => h('tr', {},
        h('th', { scope: 'row' }, code(g)),
        h('td', {}, percent(summary.flakiness[g])),
        h('td', {}, percent(summary.flakiness_unique_text[g]))))))));
  }

  /* ---------- distraction ---------- */

  function distraction() {
    const shown = (x) => h('td', { class: x.passes ? 'is-wrong' : '' }, `${x.passes}/${x.reps}${x.passes ? ' !' : ''}`);
    const table = h('table', { class: 'e3' },
      h('caption', { class: 'sr' }, 'Bestandene Wiederholungen je Release, neutral und selbstbewusst'),
      h('thead', {},
        h('tr', {}, h('td'), LLM.map((g) => h('th', { scope: 'colgroup', colspan: 2 }, g))),
        h('tr', {}, h('th', { scope: 'col' }, 'Release'), LLM.map(() => [h('th', { scope: 'col' }, 'neutral'), h('th', { scope: 'col' }, 'selbstbewusst')]))),
      h('tbody', {}, summary.e3.rows.map((row) => h('tr', {},
        h('th', { scope: 'row' }, row.release),
        LLM.map((g) => [shown(row[g].neutral), shown(row[g].confident)])))),
      h('tfoot', {}, h('tr', {},
        h('th', { scope: 'row' }, 'Releases bestanden'),
        LLM.map((g) => [h('td', {}, summary.e3.change[g].pass_neutral), h('td', {}, summary.e3.change[g].pass_confident)]))));
    $('distraction').append(scroller('Ablenkung', table));
    $('distraction').append(h('p', { class: 'note' }, 'Zellen zeigen bestandene Wiederholungen, ! markiert ein Fehlurteil. `judge-sourced` lässt auch alle Kontrollen durchfallen, seine Nullen sagen hier wenig.'.replaceAll('`', '')));
    const [neutral, confident] = ['neutral', 'confident'].map((tone) => entry('r1', `invented-claim:${tone}`).artifact.notes_md);
    $('distraction-diff').append(diffView(neutral, confident));
  }

  fillFacts();
  heroMap();
  agentSection();
  gameSection(matrixSection());
  hypotheses();
  rates();
  cases();
  rogan();
  flakiness();
  distraction();
  $('detail').addEventListener('click', (e) => { if (e.target === $('detail')) $('detail').close(); });
}

const notice = $('load-error');
try {
  const [demo, summary] = await Promise.all(['data/demo.json', 'data/summary.json'].map(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response.json();
  }));
  main(demo, summary);
} catch (error) {
  notice.hidden = false;
  notice.textContent = location.protocol === 'file:'
    ? 'Die Ergebnisdaten lassen sich nicht direkt aus dem Dateisystem laden. Starte im Ordner site einen lokalen Server, zum Beispiel: python3 -m http.server'
    : `Die Ergebnisdaten ließen sich nicht laden oder darstellen (${error.message}). Lade die Seite neu.`;
  throw error;
}
