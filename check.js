// Smoke test: opens every built page in headless Chromium, confirms it is not locked,
// clicks every tab, and fails on any JavaScript error.
// Usage: npm run build && npm run check   (first time: npm install && npm run setup)
const {chromium} = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const dist = path.join(__dirname, 'dist');
  const files = ['app/index.html', 'simulation.html', 'simulation-big.html', 'simulation-section8.html', 'test-new.html'];
  const missing = files.concat(['cpa/index.html', 'index.html']).filter(f => !fs.existsSync(path.join(dist, f)));
  if (missing.length) { console.error('Missing build output:', missing.join(', '), '- run npm run build first'); process.exit(1); }
  // CHROMIUM_PATH lets you use a browser you already have instead of the one from 'npm run setup'.
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {});
  let bad = 0;
  for (const f of files) {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto('file://' + path.join(dist, f));
    await page.waitForTimeout(300);
    // close the first-visit welcome pop-up if it is showing
    await page.evaluate(() => { const b = document.querySelector('[data-a=fxGo]'); if (b) b.click(); });
    const locked = await page.evaluate(() => !document.querySelector('header'));
    const tabs = await page.$$eval('[data-a="pg"]', x => x.map(e => e.dataset.v));
    for (const v of tabs) {
      await page.evaluate(v => { const b = document.querySelector(`[data-a="pg"][data-v="${v}"]`); if (b) b.click(); }, v);
      await page.waitForTimeout(80);
    }
    console.log(f.padEnd(26), locked ? 'LOCKED' : 'ok', '| tabs:', tabs.length, '|', errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no errors');
    if (locked || errs.length || tabs.length < 5) bad = 1;
    await page.close();
  }
  // landing page: savings check + quiz render, no errors
  { const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto('file://' + path.join(dist, 'index.html')); await page.waitForTimeout(300);
    // the savings check and the quiz open in pop-ups
    const ok = await page.evaluate(async () => { const w = () => new Promise(r => setTimeout(r, 150)), c = v => { const b = document.querySelector('[data-a="lpO"][data-v="' + v + '"]'); if (b) b.click(); };
      c('chk'); await w(); const a = !!document.querySelector('#chk'); c('qz'); await w(); return a && !!document.querySelector('#quiz'); });
    console.log('index.html (landing)'.padEnd(26), ok ? 'ok' : 'MISSING PARTS', '|', errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no errors');
    if (!ok || errs.length) bad = 1; await page.close(); }
  // firm portal for CPAs: every tab renders, sample clients load and get a status, no errors
  { const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto('file://' + path.join(dist, 'cpa/index.html')); await page.waitForTimeout(300);
    const tabs = await page.$$eval('[data-a="ctab"]', x => [...new Set(x.map(e => e.dataset.v))]);
    for (const v of tabs) { await page.evaluate(v => document.querySelector(`.cph [data-a="ctab"][data-v="${v}"]`).click(), v); await page.waitForTimeout(80); }
    await page.evaluate(() => { document.querySelector('.cph [data-a="ctab"][data-v="about"]').click(); });
    await page.waitForTimeout(80); await page.evaluate(() => { const b = document.querySelector('[data-a="demoGo"]'); if (b) b.click(); }); await page.waitForTimeout(600);
    const n = await page.evaluate(() => document.querySelectorAll('.cpt .cpb').length);
    console.log('cpa/index.html (portal)'.padEnd(26), n === 3 ? 'ok' : 'SAMPLE CLIENTS MISSING', '| tabs:', tabs.length, '|', errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no errors');
    if (n !== 3 || errs.length || tabs.length < 4) bad = 1; await page.close(); }
  await browser.close();
  console.log(bad ? 'FAILED' : 'All pages OK');
  process.exit(bad);
})();
