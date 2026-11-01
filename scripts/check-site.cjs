// Serves site/ under /grader-lab/ like GitHub Pages and plays through the workbench.
// Playwright is no dependency of this project: NODE_PATH=<dir with node_modules> node scripts/check-site.cjs
// CHROMIUM_PATH optionally names a browser binary, SHOTS the screenshot folder (default .tmp/site-check).
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const SITE = path.join(__dirname, '../site');
const SHOTS = process.env.SHOTS ?? path.join(__dirname, '../.tmp/site-check');
fs.mkdirSync(SHOTS, { recursive: true });
const KEY = 'placeholder-not-a-real-key';
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (!url.startsWith('/grader-lab/')) { res.writeHead(404); return res.end('outside base'); }
  const file = path.join(SITE, url.slice('/grader-lab/'.length) || 'index.html');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
const problems = [];
const check = (ok, label) => { console.log(ok ? 'ok  ' : 'FAIL', label); if (!ok) problems.push(label); };

async function run(browser, { name, viewport, colorScheme, shot }) {
  const context = await browser.newContext({ viewport, colorScheme, hasTouch: viewport.width < 500 });
  const page = await context.newPage();
  const consoleLines = [], requests = [];
  page.on('pageerror', (e) => consoleLines.push({ type: 'pageerror', text: e.message }));
  page.on('console', (m) => consoleLines.push({ type: m.type(), text: `${m.text()} ${m.location().url}` }));
  page.on('request', (r) => requests.push(r));

  // No request to a model provider ever leaves this script: unknown calls fail loudly.
  let provider = {};
  const route = (host) => page.route(`https://${host}/**`, (r) => {
    const body = r.request().postDataJSON();
    (provider.calls ??= []).push({ host, headers: r.request().headers(), body });
    const respond = (s, json) => r.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(json) });
    if (provider.abort) return r.abort('failed');
    if (provider.status) return respond(provider.status, { error: { message: `Incorrect API key provided: ${KEY}` } });
    const pair = (body.response_format?.json_schema.schema ?? body.output_config.format.schema).properties.better;
    const text = JSON.stringify(pair ? { reason: 'Gold ist genauer.', better: 'equal' } : { violations: [{ criterion: 'R2', evidence: 'Mock-Befund' }], reason: 'Mock-Begründung', pass: false });
    respond(200, host.includes('openai') ? { choices: [{ finish_reason: 'stop', message: { content: text } }] } : { stop_reason: 'end_turn', content: [{ type: 'text', text }] });
  });
  await route('api.openai.com');
  await route('api.anthropic.com');

  await page.goto('http://localhost:4173/grader-lab/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#count:not(:empty)');
  const label = (t) => `[${name}] ${t}`;
  const row = (id) => page.locator(`.row:has(code.name:text-is("${id}"))`);
  const status = (id) => row(id).locator('.status').textContent();
  const state = (id) => row(id).getAttribute('data-state');
  const count = () => page.textContent('#count');
  const edit = async (fn) => { const v = await page.inputValue('#notes'); await page.fill('#notes', fn(v)); await page.waitForTimeout(220); };
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  await page.keyboard.press('Tab');
  check(await page.evaluate(() => document.activeElement.classList.contains('skip')), label('first Tab reaches the skip link'));
  check(await page.evaluate(() => [...document.querySelectorAll('[data-prose]')].map((n) => n.textContent.trim().split(/\s+/).length).reduce((a, b) => a + b, 0) <= 125), label('prose stays around 120 words'));
  check(requests.filter((r) => r.url().startsWith('http://localhost')).every((r) => new URL(r.url()).pathname.startsWith('/grader-lab/')), label('all same-origin requests stay under /grader-lab/'));
  check(requests.every((r) => !/api\.(openai|anthropic)\.com/.test(r.url())), label('nothing goes to a provider without a click'));
  check(await noHScroll(), label('no horizontal page scroll at start'));
  check((await page.locator('.rows .row').count()) === 11, label('eleven rows'));
  if (viewport.width > 1000) {
    const bottom = await page.evaluate(() => Math.max(...['#token', '#diff', '.prs'].map((s) => document.querySelector(s).getBoundingClientRect().bottom)));
    check(bottom <= viewport.height, label(`bench fits without scrolling: ${Math.round(bottom)}`));
  }

  // State 1: gold, recorded
  check((await page.textContent('#model-source')).includes('aufgezeichnet · gpt-6.1-terra · 3 Wiederholungen'), label('state 1 marks recorded verdicts'));
  check((await status('judge-sourced')) === 'schlägt an', label('recorded verdict: judge-sourced fails gold'));
  await row('judge-sourced').locator('summary').click();
  check((await row('judge-sourced').locator('.more').textContent()).includes('R'), label('row opens with findings'));
  await row('judge-sourced').locator('summary').click();
  check(await page.locator('#run').isHidden(), label('no run button without a key'));
  const snap = async (what) => { if (!shot) return; await page.waitForTimeout(600); await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await page.screenshot({ path: `${SHOTS}/${name}-${what}.png` }); };
  await snap('gold');

  // Text change: code graders react at once, models fall to state 2
  await edit((v) => `${v}\n\n## Fixes\n\n- This is revolutionary and refers to #999.`);
  check((await status('wording')) === 'schlägt an' && (await status('pr-refs')) === 'schlägt an', label('text change flips wording and pr-refs'));
  check((await row('pr-refs').locator('.first').textContent()).includes('#999'), label('first finding names the ghost PR'));
  for (const id of ['judge-ref', 'judge-sourced', 'judge-blind', 'pairwise']) check((await state(id)) === 'unchecked', label(`state 2 for ${id}`));
  check((await row('judge-ref').textContent()).includes('nicht geprüft') && (await row('judge-ref').textContent()).includes('braucht ein Modell'), label('state 2 wording'));
  check((await page.locator('#diff ins').count()) > 0, label('diff under the text shows the addition'));
  check((await count()).includes('4 nicht geprüft'), label(`count names the unchecked: ${await count()}`));
  await edit((v) => `${v}\n## `);
  check((await row('schema').locator('.first').textContent()).includes('abgebrochen'), label('half-typed heading does not break the page'));

  // Chips, reset, toggles
  await page.click('#reset');
  check((await page.inputValue('#notes')) === (await page.evaluate(() => fetch('data/demo.json').then((r) => r.json()).then((d) => d.releases[0].gold.notes_md))), label('reset restores the text'));
  await page.click('#chips button:has-text("Geister-PR")');
  check((await state('pr-refs')) === 'fail' && (await page.getAttribute('#chips button:has-text("Geister-PR")', 'aria-pressed')) === 'true', label('chip builds the fault in'));
  check((await page.textContent('#model-source')).includes('aufgezeichnet'), label('mutation text is recorded'));
  await snap('fault');
  await page.click('#chips button:has-text("Geister-PR")');
  check((await page.inputValue('#variant')) === 'gold', label('second click takes the fault out'));

  await page.uncheck('#published');
  check((await state('functional')) === 'fail' && (await state('wording')) === 'pass', label('false-success by hand: functional fails'));
  check((await page.textContent('#model-source')).includes('aufgezeichnet'), label('switch keeps recorded judges, they only read text'));
  await page.check('#published');
  await page.uncheck('#diffs');
  check((await state('trajectory')) === 'fail' && (await state('functional')) === 'pass', label('lucky-path by hand: only trajectory fails'));
  await page.check('#diffs');
  await page.selectOption('#bump', 'patch');
  check((await page.inputValue('#version')) === '2.3.3' && (await state('semver-labels')) === 'fail' && (await state('schema')) === 'fail', label('bump switch moves the version and hits semver and schema'));
  await page.click('#reset');

  // Versions: controls, agents, every release
  await page.click('#releases button:has-text("r3")');
  await page.selectOption('#variant', 'naive-2');
  check((await page.inputValue('#notes')) === '' && (await state('schema')) === 'fail', label('agent run with empty notes'));
  check((await page.textContent('#model-source')).includes('1 Wiederholung'), label('agent verdicts name one repetition'));
  await page.selectOption('#variant', 'careful-2');
  check((await state('functional')) === 'fail', label('agent run with a differing published text fails functional'));
  await page.selectOption('#variant', 'paraphrase');
  await page.locator('.prs > summary').click();
  await page.locator('.pr > summary').first().click();
  check((await page.locator('.pr pre').first().textContent()).length > 0, label('PR opens with its diff'));
  check(await noHScroll(), label('no horizontal scroll with PR open'));
  await page.locator('.prs > summary').click();

  // Every version of every release loads and renders.
  let versions = 0, tallest = 0;
  for (const release of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']) {
    await page.click(`#releases button:has-text("${release}")`);
    for (const value of await page.locator('#variant option').evaluateAll((list) => list.map((o) => o.value))) {
      await page.selectOption('#variant', value);
      versions++;
      if (viewport.width > 1000) tallest = Math.max(tallest, await page.evaluate(() => document.getElementById('model-rows').getBoundingClientRect().bottom));
    }
  }
  check(versions === 107 && !consoleLines.some((l) => l.type === 'pageerror'), label(`every version loads: ${versions}`));
  check(await noHScroll(), label('no horizontal scroll after every version'));
  if (viewport.width > 1000) {
    check(tallest <= viewport.height, label(`grader rows stay in view for every version: ${Math.round(tallest)}`));
    check(await page.evaluate(() => { const m = document.querySelector('.matrix-scroll'); return m.scrollWidth <= m.clientWidth; }), label('matrix fits without its own scrollbar'));
  }

  // Matrix
  await page.locator('#matrix').scrollIntoViewIfNeeded();
  check((await page.locator('#matrix tbody tr:not(.band)').count()) === 16, label('matrix rows'));
  if (shot) await page.locator('.matrix').screenshot({ path: `${SHOTS}/${name}-matrix.png` });
  await page.locator('#matrix tr:has(button:has-text("Embargo verraten")) td').nth(2).click();
  check((await page.inputValue('#variant')) === 'embargo-leak', label('matrix row loads the version'));
  await page.locator('#matrix tr:has(button:has-text("Diffs nie gelesen")) button').focus();
  await page.keyboard.press('Enter');
  check((await page.inputValue('#variant')) === 'lucky-path' && (await state('trajectory')) === 'fail', label('matrix row by keyboard'));
  check(await page.evaluate(() => document.activeElement.id === 'notes'), label('focus lands in the text'));
  await page.click('#releases button:has-text("r1")');

  // Keyboard: row toggle
  await row('schema').locator('summary').focus();
  await page.keyboard.press('Enter');
  check(await row('schema').evaluate((d) => d.open), label('Enter opens a row'));
  await page.keyboard.press('Enter');

  // State 3 with mocks: OpenAI, stale, Anthropic, 401
  await edit((v) => `${v}\n`);
  await page.fill('#key', KEY);
  check((await page.textContent('#run')).includes('5 Aufrufe'), label('button names the call count'));
  await page.click('#run');
  await page.waitForSelector('#run:not([disabled])');
  check(provider.calls?.length === 5 && provider.calls.every((c) => c.host === 'api.openai.com' && c.headers.authorization === `Bearer ${KEY}`), label('five calls to OpenAI'));
  check(provider.calls[0].body.response_format.json_schema.strict === true, label('OpenAI schema strict'));
  check((await page.textContent('#model-source')).includes('live · gpt-6.1-terra'), label('live result marked'));
  check((await state('judge-ref')) === 'fail' && (await row('judge-ref').textContent()).includes('Mock-Befund'), label('live verdict shown'));
  check((await state('pairwise')) === 'pass', label('pairwise follows the frozen rule'));
  await snap('live');
  await edit((v) => `${v} `);
  check((await state('judge-ref')) === 'stale' && (await status('judge-ref')).includes('veraltet') && (await page.textContent('#model-source')).includes('veraltet'), label('text change marks the result stale'));

  provider = {};
  await page.selectOption('#provider', 'anthropic');
  check((await page.inputValue('#key')) === '' && (await page.inputValue('#model')) === 'claude-sonnet-5-5' && await page.locator('#run').isHidden(), label('provider switch clears the key and sets the model'));
  await page.fill('#key', KEY);
  await page.click('#run');
  await page.waitForSelector('#run:not([disabled])');
  const h = provider.calls?.[0]?.headers ?? {};
  check(provider.calls?.length === 5 && h['x-api-key'] === KEY && h['anthropic-version'] === '2023-06-01' && h['anthropic-dangerous-direct-browser-access'] === 'true', label('five calls to Anthropic with its headers'));
  check(provider.calls[0].body.output_config.format.type === 'json_schema' && !provider.calls[0].body.tool_choice, label('Anthropic structured output'));
  check((await page.textContent('#model-source')).includes('live · claude-sonnet-5-5'), label('live result names the model'));

  await edit((v) => `${v} `);
  provider = { status: 401 };
  await page.click('#run');
  await page.waitForSelector('#run:not([disabled])');
  check((await row('judge-ref').textContent()).includes('(401)'), label('401 shows at the grader'));
  check((await state('judge-ref')) === 'unchecked', label('401 keeps state 2'));
  check(!(await page.locator('body').textContent()).includes(KEY), label('key not in the page text'));
  await snap('401');
  provider = { status: 429 };
  await page.click('#run');
  await page.waitForSelector('#run:not([disabled])');
  check((await row('judge-blind').textContent()).includes('(429)'), label('429 shows at the grader'));
  provider = { abort: true };
  await page.click('#run');
  await page.waitForSelector('#run:not([disabled])');
  check((await row('pairwise').textContent()).includes('CORS') && (await state('pairwise')) === 'unchecked', label('blocked request shows at the grader, state 2 stays'));

  const leaks = await page.evaluate((k) => ({
    local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage), cookie: document.cookie, url: location.href, attr: document.documentElement.outerHTML,
  }), KEY);
  for (const [where, text] of Object.entries(leaks)) check(!text.includes(KEY), label(`key not in ${where}`));
  check(requests.filter((r) => !/api\.(openai|anthropic)\.com/.test(r.url())).every((r) => !JSON.stringify(r.headers()).includes(KEY) && !r.url().includes(KEY)), label('key only goes to the provider'));
  check(consoleLines.every((l) => !l.text.includes(KEY)), label('key not in the console'));
  // Chromium itself logs the mocked 401, 429 and aborted calls as failed resources, nothing else may appear.
  const relevant = consoleLines.filter((l) => ['error', 'warning', 'pageerror'].includes(l.type) && !/fonts\.g/.test(l.text) && !(l.type === 'error' && /status of 4(01|29)|ERR_FAILED/.test(l.text) && /api\.anthropic\.com|api\.openai\.com/.test(l.text)));
  check(relevant.length === 0, label(`console clean ${relevant.map((l) => `${l.type}: ${l.text}`).join(' | ')}`));
  check(await noHScroll(), label('no horizontal page scroll at end'));
  await context.close();
}

(async () => {
  await new Promise((r) => server.listen(4173, r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  await run(browser, { name: 'desktop-light', viewport: { width: 1280, height: 800 }, colorScheme: 'light', shot: true });
  await run(browser, { name: 'desktop-dark', viewport: { width: 1280, height: 800 }, colorScheme: 'dark', shot: true });
  await run(browser, { name: 'mobile-light', viewport: { width: 375, height: 812 }, colorScheme: 'light', shot: true });
  await run(browser, { name: 'mobile-dark', viewport: { width: 375, height: 812 }, colorScheme: 'dark' });
  await browser.close();
  server.close();
  console.log(problems.length ? `\n${problems.length} PROBLEME` : '\nalles ok');
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
