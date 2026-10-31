// Serves site/ under /grader-lab/ like GitHub Pages and plays through the page, screenshots land in .tmp/site-check.
// Playwright is no dependency of this project: NODE_PATH=<dir with node_modules/playwright> node scripts/check-site.cjs
// CHROMIUM_PATH optionally names a browser binary when the Playwright version has no matching download.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const SITE = path.join(__dirname, '../site');
const SHOTS = path.join(__dirname, '../.tmp/site-check');
fs.mkdirSync(SHOTS, { recursive: true });
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (!url.startsWith('/grader-lab/')) { res.writeHead(404); return res.end('outside base'); }
  let file = path.join(SITE, url.slice('/grader-lab/'.length) || 'index.html');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
const problems = [];
const check = (ok, label) => { console.log(ok ? 'ok  ' : 'FAIL', label); if (!ok) problems.push(label); };

async function run(browser, { name, viewport, colorScheme, blockStorage, everyCombination }) {
  const context = await browser.newContext({ viewport, colorScheme, hasTouch: viewport.width < 500 });
  if (blockStorage) await context.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }));
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()} ${m.location().url}`); });
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('http://localhost:4173/grader-lab/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.matrix');

  const label = (t) => `[${name}] ${t}`;
  await page.keyboard.press('Tab');
  check(await page.evaluate(() => document.activeElement.classList.contains('skip')), label('first Tab reaches the skip link'));
  check((await page.locator('#agent-app .seg button[data-value="r1"]').getAttribute('aria-pressed')) === 'true', label('initial selection is exposed and visible'));
  check((await page.locator('#agent-app .seg button[data-value="r2"]').getAttribute('aria-pressed')) === 'false', label('other options carry aria-pressed="false"'));
  check(await page.evaluate(() => [...document.querySelectorAll('[data-fact]')].every((el) => el.textContent.trim() && el.textContent !== 'undefined')), label('all data-fact filled'));
  const samePrefix = requests.filter((u) => u.startsWith('http://localhost')).every((u) => new URL(u).pathname.startsWith('/grader-lab/'));
  check(samePrefix, label('all same-origin requests stay under /grader-lab/'));
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check(await noHScroll(), label('no horizontal page scroll at top'));
  await page.screenshot({ path: `${SHOTS}/${name}-full.png`, fullPage: true });

  // Agent: every release and run, including empty notes
  for (const release of ['r3', 'r4']) {
    await page.click(`#agent-app .seg button[data-value="${release}"]`);
    for (const run of ['naive-2', 'careful-2', 'naive-1', 'careful-1']) await page.click(`#agent-app .seg button[data-value="${run}"]`);
  }
  await page.click('#agent-app .seg button[data-value="r3"]');
  await page.click('#agent-app .seg button[data-value="naive-2"]');
  check(await page.locator('#agent-app .notes-empty').count() === 1, label('empty notes shown'));
  await page.locator('#agent-app details.fold summary').first().click();
  await page.locator('#agent-app details.fold summary').nth(1).click();
  await page.locator('#agent-app .prs summary').first().click();
  await page.locator('#agent').screenshot({ path: `${SHOTS}/${name}-agent.png` });
  check(await noHScroll(), label('no horizontal scroll with agent details open'));

  if (everyCombination) {
    for (const release of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']) for (const run of ['naive-1', 'naive-2', 'careful-1', 'careful-2']) {
      await page.click(`#agent-app .seg button[data-value="${release}"]`);
      await page.click(`#agent-app .seg button[data-value="${run}"]`);
    }
  }

  // Game: back button, then all six, then reveal
  const liveRegion = await page.locator('#game-app [aria-live]').elementHandle();
  await page.click('#game-app .game-actions button:has-text("Durchfallen")');
  await page.waitForTimeout(600);
  const statusTop = await page.evaluate(() => document.querySelector('.game-status').getBoundingClientRect().top);
  check(statusTop >= 0 && statusTop < 200, label(`next version starts in view: ${Math.round(statusTop)}`));
  check(await liveRegion.evaluate((el) => el.isConnected && el === document.activeElement), label('live region survives the step and takes focus'));
  await page.click('#game-app .game-actions button:has-text("Zurück")');
  check((await page.locator('#game-app .game-actions button:has-text("Durchfallen")').getAttribute('aria-pressed')) === 'true', label('back shows the earlier choice'));
  await page.click('#game-app .game-actions button:has-text("Bestehen")');
  await page.locator('#grader').screenshot({ path: `${SHOTS}/${name}-game.png` });
  for (const verdict of ['Bestehen', 'Bestehen', 'Durchfallen', 'Bestehen', 'Bestehen']) await page.click(`#game-app .game-actions button:has-text("${verdict}")`);
  await page.waitForSelector('#game-app .reveal');
  await page.locator('#grader').screenshot({ path: `${SHOTS}/${name}-reveal.png` });
  check(await page.locator('.human .cell-you').count() === 6, label('six reader ratings in matrix column'));
  check(await noHScroll(), label('no horizontal scroll after reveal'));
  await page.click('#game-app .reveal button[aria-label="Fassung C ansehen"]');
  await page.waitForSelector('dialog[open]');
  await page.locator('dialog').screenshot({ path: `${SHOTS}/${name}-reveal-dialog.png` });
  await page.keyboard.press('Escape');

  // Matrix: keyboard, one cell by click, release switch
  const first = page.locator('button.cell[data-r="0"][data-c="0"]');
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  const focused = await page.evaluate(() => document.activeElement.getAttribute('aria-label'));
  check(focused?.startsWith('judge-blind, wrong-bump'), label(`arrow keys reach cell: ${focused}`));
  check(await page.locator('button.cell[tabindex="0"]').count() === 1, label('exactly one roving tab stop'));
  if (viewport.width < 500) {
    await page.locator('button.cell[data-r="2"][data-c="10"]').focus();
    let covered = 0;
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowLeft');
      covered += await page.evaluate(() => {
        const cell = document.activeElement;
        return cell.getBoundingClientRect().left < cell.closest('tr').querySelector('th').getBoundingClientRect().right ? 1 : 0;
      });
    }
    check(covered === 0, label(`focused cell never under the row header: ${covered}`));
    await page.locator('button.cell[data-r="1"][data-c="9"]').focus();
  }
  await page.keyboard.press('Enter');
  await page.waitForSelector('dialog[open]');
  check((await page.textContent('#detail-title')) === 'wrong-bump', label('Enter opens the cell detail'));
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog:not([open])', { state: 'attached' });
  check(await page.evaluate(() => document.activeElement.classList.contains('cell')), label('focus returns to the cell'));

  await page.locator('#matrix-app').scrollIntoViewIfNeeded();
  await page.locator('#matrix').screenshot({ path: `${SHOTS}/${name}-matrix.png` });
  await page.click('button.cell[aria-label^="judge-sourced, false-success"]');
  await page.waitForSelector('dialog[open]');
  check((await page.textContent('#detail-body')).includes('Der Text ist identisch'), label('false-success shows identical text'));
  await page.keyboard.press('Escape');
  await page.click('button.cell[aria-label^="wording, embargo-leak"]');
  await page.waitForSelector('dialog[open]');
  check((await page.textContent('#detail-body')).includes('nicht definiert'), label('undefined releases named'));
  await page.locator('#detail .seg button').last().focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  check(await page.evaluate(() => document.activeElement.closest('#detail .seg')?.querySelector('[aria-pressed="true"]') === document.activeElement), label('focus stays on the picked release'));
  await page.screenshot({ path: `${SHOTS}/${name}-dialog.png` });
  check(await page.evaluate(() => { const d = document.getElementById('detail'); return d.scrollWidth <= d.clientWidth; }), label('dialog without horizontal scroll'));
  await page.keyboard.press('Escape');

  if (everyCombination) {
    const cells = await page.locator('button.cell').count();
    check(cells === 176, label(`${cells} matrix cells`));
    for (let i = 0; i < cells; i++) {
      await page.locator('button.cell').nth(i).click();
      await page.waitForSelector('dialog[open]');
      await page.keyboard.press('Escape');
    }
  }

  for (const summary of await page.locator('#matrix details summary').all()) await summary.click();
  check(await noHScroll(), label('no horizontal scroll with hypotheses and gold claims open'));

  // Cases, slider, grader switch, distraction fold
  for (let i = 0; i < 4; i++) {
    await page.locator('#cases button').nth(i).click();
    await page.waitForSelector('dialog[open]');
    await page.keyboard.press('Escape');
  }
  const slider = page.locator('#observed');
  await slider.focus();
  await page.keyboard.press('ArrowLeft');
  const blind = await page.textContent('.rogan-result strong');
  await page.click('#rogan .seg button[data-value="judge-sourced"]');
  check((await page.textContent('.rogan-result strong')) === 'nicht definiert', label('rogan undefined for judge-sourced'));
  await page.click('#rogan .seg button[data-value="judge-blind"]');
  check((await page.textContent('.rogan-result strong')) === '0,49', label(`rogan default 0,49, after one step ${blind}`));
  await page.click('#rogan .seg button[data-value="text"]');
  check((await page.textContent('.rogan-result strong')) === '0,59', label('rogan per text 0,59'));
  await page.click('#rogan .seg button[data-value="artifact"]');
  await page.locator('#vertrauen').screenshot({ path: `${SHOTS}/${name}-trust.png` });
  await page.locator('#ablenkung details summary').click();
  await page.locator('#ablenkung').screenshot({ path: `${SHOTS}/${name}-e3.png` });
  await page.locator('#grenzen').screenshot({ path: `${SHOTS}/${name}-limits.png` });
  check(await noHScroll(), label('no horizontal scroll at end'));

  // Reload keeps the ratings unless storage is blocked, reset empties them.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.matrix');
  check(await page.locator('.human .cell-you').count() === (blockStorage ? 0 : 6), label('ratings after reload'));
  if (!blockStorage) {
    await page.click('#game-app button:has-text("Noch einmal")');
    await page.waitForTimeout(600);
    const top = await page.evaluate(() => document.querySelector('.game-status').getBoundingClientRect().top);
    check(top >= 0 && top < 200, label(`restart shows the first version: ${Math.round(top)}`));
    check(await page.locator('.human .cell-you').count() === 0, label('reset clears the column'));
  }
  const relevant = errors.filter((e) => !/fonts\.g/.test(e));
  check(relevant.length === 0, label(`console clean (${errors.length - relevant.length} font messages ignored) ${relevant.join(' | ')}`));
  await context.close();
}

(async () => {
  await new Promise((r) => server.listen(4173, r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  await run(browser, { name: 'desktop-light', viewport: { width: 1280, height: 800 }, colorScheme: 'light', everyCombination: true });
  await run(browser, { name: 'desktop-dark', viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
  await run(browser, { name: 'mobile-light', viewport: { width: 375, height: 812 }, colorScheme: 'light', everyCombination: true });
  await run(browser, { name: 'mobile-dark', viewport: { width: 375, height: 812 }, colorScheme: 'dark' });
  await run(browser, { name: 'blocked-storage', viewport: { width: 1280, height: 800 }, colorScheme: 'light', blockStorage: true });
  await browser.close();
  server.close();
  console.log(problems.length ? `\n${problems.length} PROBLEME` : '\nalles ok');
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
