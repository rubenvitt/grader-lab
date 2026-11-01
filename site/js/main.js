// Wires the workbench to the DOM. All grading logic lives in lib.js and the copied grader modules.
import { nextVersion } from './code.js';
import { LIVE_CALLS, PROVIDERS, buildArtifact, compactDiff, diffWords, gradeCode, graderContext, modelVerdict, recordedFor, runJudges, stateFrom } from './lib.js';

const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

const CODE = {
  schema: 'Struktur und Pflichtabschnitte stimmen.',
  'pr-refs': 'Jede #Nummer existiert und ist nicht zurückgenommen.',
  'semver-labels': 'Bump passt zu Labels und Commit-Präfixen.',
  wording: 'Keine verbotenen Wörter, Embargo-Begriffe, passende Länge.',
  'ref-similarity': 'Text ist der Referenz ähnlich genug.',
  functional: 'Sandbox: veröffentlicht, Version stimmt.',
  trajectory: 'Jeder Diff gelesen, bevor veröffentlicht wird.',
};
const MODEL = {
  'judge-ref': 'Modell vergleicht mit der Referenz.',
  'judge-sourced': 'Modell prüft die Rubric gegen PRs und Diffs.',
  'judge-blind': 'Modell prüft die Rubric, sieht nur die Notes.',
  pairwise: 'Modell wählt zwischen Text und Referenz, beide Reihenfolgen.',
};
const GRADERS = [...Object.keys(CODE), ...Object.keys(MODEL)];

const MUTATIONS = {
  'missing-breaking': 'Breaking fehlt', 'wrong-bump': 'Bump zu klein', 'ghost-pr': 'Geister-PR', 'invented-claim': 'erfundene Aussage',
  'wrong-migration': 'falsche Migration', 'reverted-listed': 'Revert drin', 'embargo-leak': 'Embargo verraten', 'internal-noise': 'CI-Interna',
  'hype-tone': 'Werbeton', 'useless-true': 'wahr, aber leer', 'false-success': 'nie veröffentlicht', 'lucky-path': 'Diffs nie gelesen',
};
const CONTROLS = { paraphrase: 'umformuliert', reordered: 'umsortiert', 'extra-diligent': 'zusätzliche Aufrufe' };
const AGENTS = { naive: 'Agent naiv', careful: 'Agent sorgfältig' };
const agentLabel = (variant) => { const [prompt, run] = variant.split('-'); return `${AGENTS[prompt]} ${run}`; };

const STATUS = { fail: 'schlägt an', pass: 'besteht', unchecked: 'nicht geprüft', running: 'läuft' };

let demo, prompts;
let release; // the selected release object
let variant = 'gold';
let state;
let live = null;
let running = false;
const rows = new Map();

const entry = (id = variant) => [...demo.e1, ...demo.e4].find((x) => x.release === release.id && x.variant === id);

function buildRow(id, why) {
  const details = el('details', 'row');
  const summary = el('summary');
  const status = el('span', 'status');
  const name = el('code', 'name', id);
  const first = el('span', 'first');
  summary.append(status, name, first);
  const more = el('div', 'more');
  const line = el('p', 'why', why);
  line.dataset.prose = '';
  const list = el('ul', 'findings');
  const note = el('p', 'note');
  more.append(line, list, note);
  details.append(summary, more);
  const item = el('li');
  item.append(details);
  rows.set(id, { details, status, first, list, note, last: null });
  return item;
}

function showRow(id, { kind, first = '', findings = [], note = '', label = STATUS[kind] }) {
  const row = rows.get(id);
  row.details.dataset.state = kind;
  row.status.textContent = label;
  row.first.textContent = first;
  row.list.replaceChildren(...findings.map((f) => el('li', null, f)));
  row.note.textContent = note;
  if (row.last && row.last !== kind) {
    row.details.classList.remove('changed');
    void row.details.offsetWidth; // restart the animation
    row.details.classList.add('changed');
  }
  row.last = kind;
  $('lamps').children[GRADERS.indexOf(id)].dataset.state = kind;
}

function renderDiff() {
  const box = $('diff');
  const gold = release.gold.notes_md;
  if (state.notes === gold) return box.replaceChildren(el('span', 'dim', 'Text identisch mit der Referenz'));
  if (state.notes.length > 20000) return box.replaceChildren(el('span', 'dim', 'Text zu lang für den Vergleich mit der Referenz'));
  const parts = diffWords(gold, state.notes);
  const count = (type) => parts.filter((p) => p.type === type).flatMap((p) => p.text.split(/\s+/).filter(Boolean)).length;
  const marks = { add: 'ins', del: 'del', same: 'span', gap: 'span' };
  const [added, removed] = [count('add'), count('del')];
  if (!added && !removed) return box.replaceChildren(el('span', 'dim', 'gegenüber der Referenz: nur Leerraum geändert'));
  box.replaceChildren(
    el('span', 'dim', `gegenüber der Referenz: +${added} −${removed} Wörter `),
    ...compactDiff(parts).map((p) => el(marks[p.type], p.type === 'gap' ? 'dim' : null, p.text)),
  );
}

function verdictFindings(v) {
  return [...(v.violations ?? []).map((x) => `${x.criterion}: ${x.evidence}`), ...(v.reason ? [v.reason.replace('Gold zuerst', 'Referenz zuerst')] : [])];
}

function grade() {
  const artifact = buildArtifact(state);
  const code = gradeCode(artifact, graderContext(release, demo.params));
  for (const [id, v] of Object.entries(code)) showRow(id, { kind: v.pass ? 'pass' : 'fail', first: v.findings[0] ?? '', findings: v.findings, note: v.score == null ? '' : `Ähnlichkeit ${v.score.toFixed(3)}` });

  const recorded = recordedFor(demo, release.id, state.notes, variant);
  const verdicts = Object.keys(MODEL).map((id) => [id, modelVerdict(id, { recorded, live, release: release.id, notes: state.notes, judgeModel: demo.models.judge })]);
  for (const [id, v] of verdicts) {
    if (running) { showRow(id, { kind: 'running' }); continue; }
    if (v.state === 'unchecked') { showRow(id, { kind: 'unchecked', first: v.error ?? 'braucht ein Modell', findings: v.error ? ['braucht ein Modell'] : [] }); continue; }
    const findings = verdictFindings(v);
    const first = v.error ?? findings[0] ?? '';
    const split = v.reps > 1 && v.passes !== 0 && v.passes !== v.reps ? `${v.passes} von ${v.reps} Wiederholungen bestehen. ` : '';
    const note = `${split}${v.source}`;
    if (v.state === 'stale') showRow(id, { kind: 'stale', label: `veraltet, ${v.pass ? 'bestand' : 'schlug an'}`, first: 'Text seit dem Lauf geändert', findings, note });
    else showRow(id, { kind: v.pass ? 'pass' : 'fail', first, findings: v.error ? [v.error, ...findings] : findings, note });
  }
  const sources = [...new Set(verdicts.map(([, v]) => v.source).filter(Boolean))];
  $('model-source').textContent = running ? `${LIVE_CALLS} Aufrufe laufen` : sources.join(', ');

  const states = GRADERS.map((id) => rows.get(id).details.dataset.state);
  const fails = states.filter((s) => s === 'fail').length;
  const open = states.filter((s) => s !== 'fail' && s !== 'pass').length;
  $('count').textContent = `${fails} von ${GRADERS.length} ${fails === 1 ? 'schlägt' : 'schlagen'} an${open ? `, ${open} nicht geprüft` : ''}`;
  renderDiff();
  renderRun();
}

function renderRun() {
  const key = $('key').value;
  $('run').hidden = !key;
  $('run').disabled = running;
  $('run').textContent = running ? 'läuft …' : `Judges prüfen, ${LIVE_CALLS} Aufrufe`;
}

function renderSwitches() {
  const { plan, published, readDiffs } = state;
  $('bump').value = plan.bump ?? '';
  $('version').value = plan.version ?? '';
  $('published').checked = published;
  $('diffs').checked = readDiffs.length === release.prs.length;
  $('diffs').indeterminate = readDiffs.length > 0 && readDiffs.length < release.prs.length;
  $('diff-count').textContent = `${readDiffs.length} von ${release.prs.length}`;
}

function renderPicks() {
  for (const b of $('releases').children) b.setAttribute('aria-pressed', String(b.dataset.id === release.id));
  for (const b of $('chips').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.id === variant));
  $('variant').value = variant;
}

function touched() {
  const base = stateFrom(entry().artifact);
  $('reset').disabled = JSON.stringify(state) === JSON.stringify(base);
}

function change(patch) {
  Object.assign(state, patch);
  renderSwitches();
  touched();
  grade();
}

function load(id) {
  variant = id;
  state = stateFrom(entry().artifact);
  $('notes').value = state.notes;
  renderPicks();
  renderSwitches();
  touched();
  grade();
}

function renderRelease() {
  const here = [...demo.e1, ...demo.e4].filter((x) => x.release === release.id).map((x) => x.variant);
  const group = (label, items) => {
    const box = el('optgroup');
    box.label = label;
    for (const [value, text] of items) { const o = el('option', null, text); o.value = value; box.append(o); }
    return box;
  };
  const mutations = Object.entries(MUTATIONS).filter(([id]) => here.includes(id));
  $('variant').replaceChildren(
    group('Referenz', [['gold', 'Referenz']]),
    group('Fehler', mutations),
    group('Kontrollen', Object.entries(CONTROLS).filter(([id]) => here.includes(id))),
    group('Echte Agent-Läufe', here.filter((v) => /^(naive|careful)-/.test(v)).map((v) => [v, agentLabel(v)])),
  );
  $('chips').replaceChildren(el('span', 'chips-label', 'Fehler einbauen'), ...mutations.map(([id, text]) => {
    const b = el('button', 'chip', text);
    b.type = 'button';
    b.dataset.id = id;
    b.addEventListener('click', () => load(variant === id ? 'gold' : id));
    return b;
  }));
  $('pr-count').textContent = String(release.prs.length);
  $('prs').replaceChildren(...release.prs.map((pr) => {
    const box = el('details', 'pr');
    box.append(el('summary', null, `#${pr.number} ${pr.title}`), el('p', 'dim', pr.labels.join(', ') || 'keine Labels'), el('p', null, pr.body));
    const pre = el('pre');
    for (const line of pr.diff.split('\n')) pre.append(el('span', line.startsWith('+') ? 'plus' : line.startsWith('-') ? 'minus' : null, `${line}\n`));
    box.append(pre);
    return box;
  }));
}

function pick(id, version = 'gold') {
  release = demo.releases.find((r) => r.id === id);
  renderRelease();
  load(version);
}

function renderMatrix(matrix) {
  const head = el('tr');
  head.append(el('th', null, 'Fassung'));
  for (const g of GRADERS) { const th = el('th', null, g); th.scope = 'col'; head.append(th); }
  const thead = el('thead');
  thead.append(head);
  const section = (title, labels) => {
    const body = el('tbody');
    const titleRow = el('tr', 'band');
    const cell = el('th', null, title);
    cell.colSpan = GRADERS.length + 1;
    cell.scope = 'colgroup';
    titleRow.append(cell);
    body.append(titleRow);
    for (const [id, label] of Object.entries(labels)) {
      const row = el('tr');
      const th = el('th');
      th.scope = 'row';
      const go = el('button', null, label);
      go.type = 'button';
      th.append(go);
      row.append(th);
      for (const g of GRADERS) {
        const { found, total } = matrix[g][id];
        const td = el('td', found === 0 ? 'none' : found === total ? 'all' : 'some', `${found}/${total}`);
        row.append(td);
      }
      row.addEventListener('click', () => {
        const target = demo.e1.find((x) => x.variant === id && x.release === release.id) ?? demo.e1.find((x) => x.variant === id);
        pick(target.release, id);
        document.querySelector('.bench').scrollIntoView({ block: 'start' });
        $('notes').focus({ preventScroll: true });
      });
      body.append(row);
    }
    return body;
  };
  $('matrix').replaceChildren(thead, section('Eingebaute Fehler', MUTATIONS), section('Kontrollen, jeder Treffer ist ein Fehlalarm', { gold: 'Gold', ...CONTROLS }));
}

async function runLive() {
  const notes = state.notes;
  const connection = { provider: $('provider').value, key: $('key').value, model: $('model').value.trim() };
  running = true;
  grade();
  live = await runJudges(connection, release, notes, prompts);
  running = false;
  grade();
}

let timer;
function wire() {
  $('notes').addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.notes = $('notes').value; touched(); grade(); }, 120);
  });
  $('variant').addEventListener('change', () => load($('variant').value));
  $('bump').addEventListener('change', () => {
    const bump = $('bump').value || null;
    change({ plan: { ...state.plan, bump, version: bump ? nextVersion(release.previous_version, bump) : state.plan.version } });
  });
  $('version').addEventListener('input', () => { state.plan = { ...state.plan, version: $('version').value || null }; touched(); grade(); });
  $('published').addEventListener('change', () => change({ published: $('published').checked }));
  $('diffs').addEventListener('change', () => change({ readDiffs: $('diffs').checked ? release.prs.map((p) => p.number) : [] }));
  $('reset').addEventListener('click', () => load(variant));
  $('run').addEventListener('click', runLive);
  $('key').addEventListener('input', renderRun);
  $('provider').addEventListener('change', () => {
    $('key').value = ''; // a key of one provider must never travel to the other
    $('model').value = PROVIDERS[$('provider').value].model;
    renderRun();
  });
}

async function start() {
  const base = new URL('../data/', import.meta.url);
  const [data, summary] = await Promise.all(['demo.json', 'summary.json'].map((f) => fetch(new URL(f, base)).then((r) => r.json())));
  demo = data;
  prompts = { ...demo.prompts, params: demo.params };

  $('lamps').replaceChildren(...GRADERS.map(() => el('li')));
  $('code-rows').replaceChildren(...Object.entries(CODE).map(([id, why]) => buildRow(id, why)));
  $('model-rows').replaceChildren(...Object.entries(MODEL).map(([id, why]) => buildRow(id, why)));
  $('releases').replaceChildren(...demo.releases.map((r) => {
    const b = el('button', null, r.id);
    b.type = 'button';
    b.dataset.id = r.id;
    b.addEventListener('click', () => pick(r.id));
    return b;
  }));
  for (const [id, { label, model }] of Object.entries(PROVIDERS)) {
    const o = el('option', null, label);
    o.value = id;
    $('provider').append(o);
    if ($('provider').options.length === 1) $('model').value = model;
  }
  renderMatrix(summary.matrix);
  wire();
  pick(demo.releases[0].id);
}

start().catch(() => {
  $('count').textContent = 'Daten konnten nicht geladen werden. Lade die Seite neu.';
});
