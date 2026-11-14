// Cloud accounts test: sign-up, sync between two "devices", the copy chooser, and the client <-> CPA round trip.
// Nothing real is contacted: the site is served from dist/ and Supabase is replaced by a small in-memory stand-in
// that applies the same access rules as supabase/schema.sql.
// Usage: npm run test:cloud   (builds with a test Supabase address, then runs this file)
const {chromium} = require('playwright');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const SITE = 'https://repstr.test', SB = 'https://sb.test';
const dist = path.join(__dirname, 'dist');
const MIME = {'.html': 'text/html', '.png': 'image/png', '.js': 'text/javascript'};

// ---------- in-memory Supabase stand-in ----------
const users = {}, toks = {}, refr = {}, T = {files: [], client_files: [], reviews: []};
const PK = {files: ['user_id', 'kind'], client_files: ['client_id', 'firm_id'], reviews: ['firm_id', 'client_id']};
const calls = [];
let TTL = 3600;
const sess = u => { const at = 'at_' + crypto.randomBytes(8).toString('hex'), rt = 'rt_' + crypto.randomBytes(8).toString('hex');
  toks[at] = {uid: u.id, exp: Date.now() + TTL * 1000}; refr[rt] = u.email;
  return {access_token: at, refresh_token: rt, expires_in: TTL, token_type: 'bearer', user: {id: u.id, email: u.email, identities: [{}]}}; };
const who = h => { const t = toks[(h.authorization || '').replace(/^Bearer /, '')]; return t && t.exp > Date.now() ? t.uid : null; };
const canRead = (t, r, me) => t == 'files' ? r.user_id == me : r.client_id == me || r.firm_id == me;
const canWrite = (t, r, me) => t == 'files' ? r.user_id == me
  : t == 'client_files' ? r.client_id == me && r.firm_id != me
  : r.firm_id == me && T.client_files.some(c => c.client_id == r.client_id && c.firm_id == me);
const canDel = (t, r, me) => t == 'files' ? r.user_id == me : r.client_id == me || r.firm_id == me;
function backend(method, url, headers, body) {
  const u = new URL(url), p = u.pathname, j = body ? JSON.parse(body) : {};
  calls.push(method + ' ' + p + u.search.slice(0, 60));
  if (!headers.apikey) return [401, {message: 'No API key found in request'}];
  if (p == '/auth/v1/signup') { if (users[j.email]) return [200, {id: crypto.randomUUID(), email: j.email, identities: []}];
    const x = users[j.email] = {id: crypto.randomUUID(), email: j.email, pw: j.password}; return [200, sess(x)]; }
  if (p == '/auth/v1/token') { const g = u.searchParams.get('grant_type');
    if (g == 'password') { const x = users[j.email]; return x && x.pw === j.password ? [200, sess(x)] : [400, {code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials'}]; }
    const e = refr[j.refresh_token]; if (!e) return [400, {code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token'}];
    delete refr[j.refresh_token]; return [200, sess(users[e])]; }
  if (p == '/auth/v1/logout') return [204, null];
  if (p == '/auth/v1/recover') return [200, {}];
  const me = who(headers);
  if (p == '/auth/v1/user') { const x = Object.values(users).find(x => x.id == me); if (!x) return [401, {code: 401, msg: 'invalid JWT'}];
    if (method == 'PUT' && j.password) x.pw = j.password; return [200, {id: x.id, email: x.email}]; }
  const m = p.match(/^\/rest\/v1\/(files|client_files|reviews)$/); if (!m) return [404, {message: 'not found'}];
  if (!me) return [401, {code: 'PGRST301', message: 'JWT expired'}];
  const t = m[1], F = [];
  u.searchParams.forEach((v, k) => { if (k == 'select' || k == 'on_conflict') return;
    if (v.startsWith('eq.')) F.push(r => String(r[k]) == v.slice(3));
    else if (v.startsWith('like.')) { const re = new RegExp('^' + v.slice(5).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/_/g, '.').replace(/\*/g, '.*') + '$'); F.push(r => re.test(String(r[k]))); }
    else throw new Error('filter not supported in the stand-in: ' + k + '=' + v); });
  const hit = r => F.every(f => f(r));
  if (method == 'GET') { const cols = (u.searchParams.get('select') || '*').split(',');
    return [200, T[t].filter(r => canRead(t, r, me) && hit(r)).map(r => cols[0] == '*' ? r : Object.fromEntries(cols.map(c => [c, r[c] === undefined ? null : r[c]])))]; }
  if (method == 'POST') { const row = Object.assign(t == 'files' ? {user_id: me} : t == 'client_files' ? {client_id: me, docs: null, docs_ts: 0} : {firm_id: me}, j);
    if (t != 'files' && !Object.values(users).some(x => x.id == (t == 'client_files' ? row.firm_id : row.client_id))) return [409, {code: '23503', message: 'violates foreign key constraint'}];
    if (!canWrite(t, row, me)) return [403, {code: '42501', message: 'new row violates row-level security policy'}];
    const old = T[t].find(r => PK[t].every(k => r[k] == row[k])); if (old) Object.assign(old, j); else T[t].push(row); return [201, null]; }
  if (method == 'DELETE') { T[t] = T[t].filter(r => !(canDel(t, r, me) && hit(r))); return [204, null]; }
  return [405, {message: 'method'}];
}

// ---------- helpers ----------
let bad = 0;
const ok = (c, name, extra) => { console.log((c ? 'ok    ' : 'FAIL  ') + name + (extra && !c ? '  -> ' + extra : '')); if (!c) bad = 1; };
const sample = (name, ts) => { const d = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'state.json'), 'utf8'));
  d.ts = ts; d.acct = {full: name}; d.hrs = [{id: 'h1testentry', d: '2030-03-02', h: 3, a: 'Showings', ct: ts}];
  d.ui = Object.assign(d.ui || {}, {ob: 'done', fx: 1, fxo: 0, gd: null, tourDone: 1, pg: 'tx'}); return d; };
async function device(browser, seed) {
  const ctx = await browser.newContext();
  const errs = [];
  await ctx.route(SITE + '/**', r => { let p = new URL(r.request().url()).pathname; if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dist, p); if (!fs.existsSync(f)) return r.fulfill({status: 404, body: 'x'});
    r.fulfill({status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f)}); });
  await ctx.route(SB + '/**', r => { const q = r.request(); const cors = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'};
    if (q.method() == 'OPTIONS') return r.fulfill({status: 204, headers: cors});
    let st, o; try { [st, o] = backend(q.method(), q.url(), q.headers(), q.postData()); } catch (e) { st = 500; o = {message: String(e)}; }
    r.fulfill({status: st, headers: Object.assign({'content-type': 'application/json'}, cors), body: o == null ? '' : JSON.stringify(o)}); });
  if (seed) await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem('seeded')) { localStorage.setItem(k, v); localStorage.setItem('seeded', '1'); } }, ['dealtracker.blank.v1', JSON.stringify(seed)]);
  const page = await ctx.newPage(); page.on('pageerror', e => errs.push(e.message));
  return {ctx, page, errs};
}
const settle = async (page, ms) => { await page.waitForTimeout(ms || 400); await page.evaluate(() => { const b = document.querySelector('[data-a=fxGo]'); if (b) b.click(); }); };
const click = (page, sel) => page.evaluate(s => { const b = document.querySelector(s); if (!b) throw new Error('not on the page: ' + s); b.click(); }, sel);
const signIn = async (page, em, pw, up) => { await click(page, '#acb'); if (up) await click(page, '[data-a="acM"][data-v="up"]');
  await page.fill('#acem', em); await page.fill('#acpw', pw); await click(page, '#acct .pill'); await page.waitForTimeout(700); };
const stored = (page, k) => page.evaluate(k => JSON.parse(localStorage.getItem(k)), k || 'dealtracker.blank.v1');
const badge = page => page.evaluate(() => (document.querySelector('#acb') || {}).textContent || '');
const wake = async (page, ms) => { await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(ms || 900); };
const dlgText = page => page.evaluate(() => (document.querySelector('#dlg') || {}).textContent || '');
const row = (t, f) => T[t].find(f);

(async () => {
  if (!fs.existsSync(path.join(dist, 'app', 'index.html'))) { console.error('Run the build first: npm run test:cloud'); process.exit(1); }
  if (!fs.readFileSync(path.join(dist, 'app', 'index.html'), 'utf8').includes(SB)) { console.error('dist/ was not built for this test. Use: npm run test:cloud'); process.exit(1); }
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {});
  const PW = 'test-only-' + crypto.randomBytes(6).toString('hex');

  // 1. investor signs up on device A: the browser's copy goes to the account
  const A = await device(browser, sample('Ada Investor', 1000));
  await A.page.goto(SITE + '/app/'); await settle(A.page);
  ok((await badge(A.page)) == 'Sign in', 'account button shows "Sign in" when signed out');
  await signIn(A.page, 'ada@example.com', 'short', 1);
  ok(/8 or more/.test(await A.page.evaluate(() => document.querySelector('#acct').textContent)), 'short password is refused before anything is sent');
  await A.page.fill('#acpw', PW); await click(A.page, '#acct .pill'); await A.page.waitForTimeout(900);
  const ada = users['ada@example.com'];
  ok(!!ada && /Saved/.test(await badge(A.page)), 'sign-up works and the badge says Saved', await badge(A.page));
  let f = row('files', r => ada && r.user_id == ada.id && r.kind == 'app');
  ok(!!f && JSON.parse(f.data).acct.full == 'Ada Investor', 'device A data is in the account');
  ok(!(await A.page.evaluate(() => JSON.stringify(localStorage))).includes(PW), 'the password is never written to browser storage');

  // 2. device B (empty browser) signs in: it receives the account's copy without being asked
  const B = await device(browser);
  await B.page.goto(SITE + '/app/'); await settle(B.page);
  await signIn(B.page, 'ada@example.com', 'wrong-password');
  ok(/Wrong email or password/.test(await B.page.evaluate(() => (document.querySelector('#acct') || {}).textContent || '')), 'wrong password gives a plain message');
  await B.page.fill('#acpw', PW); await click(B.page, '#acct .pill'); await B.page.waitForTimeout(900);
  let sB = await stored(B.page);
  ok(sB.acct && sB.acct.full == 'Ada Investor' && sB.props.length == 3, 'device B received the data', JSON.stringify(sB.acct));

  // 3. a change on B reaches A
  await click(B.page, '[data-a="pg"][data-v="tx"]'); await B.page.waitForTimeout(200); await click(B.page, '[data-a="cfO"]'); await B.page.waitForTimeout(200);
  await B.page.fill('input[data-p="acct.full"]', 'Ada B. Investor'); await B.page.waitForTimeout(4200);
  f = row('files', r => r.user_id == ada.id && r.kind == 'app');
  ok(JSON.parse(f.data).acct.full == 'Ada B. Investor', 'a change on device B is saved to the account');
  await wake(A.page, 1200);
  ok((await stored(A.page)).acct.full == 'Ada B. Investor', 'device A picks the change up');

  // 4. a browser that already has its own data is asked which copy to keep
  const C = await device(browser, sample('Someone Else', 500));
  await C.page.goto(SITE + '/app/'); await settle(C.page);
  await signIn(C.page, 'ada@example.com', PW);
  ok(/Which copy/.test(await C.page.evaluate(() => (document.querySelector('#acct') || {}).textContent || '')), 'a browser with its own data is asked which copy to keep');
  ok(JSON.parse(row('files', r => r.user_id == ada.id && r.kind == 'app').data).acct.full == 'Ada B. Investor', 'nothing is overwritten before the choice');
  await click(C.page, '[data-a="acUse"][data-v="cloud"]'); await C.page.waitForTimeout(900);
  ok((await stored(C.page)).acct.full == 'Ada B. Investor' && (await stored(C.page, 'dealtracker.blank.v1.bak')).acct.full == 'Someone Else', 'choosing the account copy replaces the browser copy and keeps a backup');
  await C.ctx.close();

  // 5. CPA firm: portal, sign-up, invite link carries the firm's id
  const P = await device(browser);
  await P.page.goto(SITE + '/cpa/'); await P.page.waitForTimeout(400);
  await click(P.page, '.cph [data-a="ctab"][data-v="firm"]'); await P.page.waitForTimeout(200);
  await P.page.fill('input[data-p="cpa.firm.n"]', 'Smith & Lee CPAs'); await P.page.waitForTimeout(400);
  await signIn(P.page, 'cpa@example.com', PW, 1);
  const cpa = users['cpa@example.com'];
  await click(P.page, '.cph [data-a="ctab"][data-v="firm"]'); await P.page.waitForTimeout(300);
  const inv = await P.page.evaluate(() => (document.querySelector('#invl') || {}).value || '');
  const invObj = inv ? JSON.parse(Buffer.from(inv.split('?f=')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()) : {};
  ok(!!cpa && invObj.i == cpa.id && invObj.n == 'Smith & Lee CPAs', 'the invite link carries the firm id', inv.slice(0, 80));
  await P.page.waitForTimeout(3500);
  ok(!!row('files', r => r.user_id == cpa.id && r.kind == 'cpa'), 'the portal is saved to the firm account');

  // 6. the client opens the invite link, connects and sends the file online
  await A.page.goto(inv); await settle(A.page, 600);
  await click(A.page, '[data-a="faskY"]'); await A.page.waitForTimeout(300);
  await click(A.page, '[data-a="pg"][data-v="tx"]'); await A.page.waitForTimeout(300);
  ok(await A.page.evaluate(() => !!document.querySelector('[data-a="shGo"]')), 'the client sees "Send to firm" on the Taxes tab');
  ok(!row('client_files', r => r.client_id == ada.id), 'nothing is shared before the client clicks Send');
  await click(A.page, '[data-a="shGo"]'); await A.page.waitForTimeout(900);
  let cf = row('client_files', r => r.client_id == ada.id && r.firm_id == cpa.id);
  ok(!!cf && JSON.parse(cf.payload).data.props.length == 3 && /Sent to Smith/.test(await dlgText(A.page)), 'the client file is sent to the firm', await dlgText(A.page));
  await click(A.page, '[data-a="dlgY"]');

  // 7. the firm picks it up; its working copy is saved to the firm account
  await click(P.page, '.cph [data-a="ctab"][data-v="dash"]'); await P.page.waitForTimeout(200);
  await click(P.page, '[data-a="shPoll"]'); await P.page.waitForTimeout(1200);
  ok(/1 new client/.test(await dlgText(P.page)), 'the firm portal receives the client', await dlgText(P.page));
  await click(P.page, '[data-a="dlgY"]'); await P.page.waitForTimeout(3500);
  const port = await stored(P.page, 'repstr.cpa.v1'), cl = port.cpa.cl[0];
  ok(cl && cl.uid == ada.id && cl.n == 'Ada B. Investor' && !!row('files', r => r.user_id == cpa.id && r.kind == 'c_' + cl.id), 'the client is listed and the working copy is in the firm account');

  // 8. the firm opens the client, reviews, and sends the review back
  await click(P.page, '[data-a="cOpen"]'); await P.page.waitForLoadState('load'); await P.page.waitForTimeout(700);
  ok(await P.page.evaluate(() => !!document.querySelector('#cvbar [data-a="rvSend"]')), 'CPA view has "Send review to client"');
  await P.page.evaluate(() => { const b = document.querySelector('[data-a="rvAll"]'); if (b && !b.disabled) b.click(); }); await P.page.waitForTimeout(300);
  await click(P.page, '#cvbar [data-a="rvSend"]'); await P.page.waitForTimeout(800);
  const rv = row('reviews', r => r.firm_id == cpa.id && r.client_id == ada.id);
  ok(!!rv && /Review sent/.test(await dlgText(P.page)), 'the review is sent', await dlgText(P.page));
  await click(P.page, '[data-a="dlgY"]');
  await wake(A.page, 1500);
  ok(/Review from/.test(await dlgText(A.page)), 'the client sees the review without importing a file', await dlgText(A.page));
  await click(A.page, '[data-a="dlgY"]'); await A.page.waitForTimeout(200);

  // 9. the client's later changes reach the firm automatically
  const ts0 = cf.ts;
  await click(A.page, '[data-a="cfO"]'); await A.page.waitForTimeout(200);
  await A.page.fill('input[data-p="acct.full"]', 'Ada Auto Investor'); await A.page.waitForTimeout(23000);
  cf = row('client_files', r => r.client_id == ada.id && r.firm_id == cpa.id);
  ok(cf.ts > ts0 && cf.name == 'Ada Auto Investor', 'later changes reach the firm automatically');

  // 10. access rules: another signed-in user cannot read Ada's rows or write a review for her
  const X = await device(browser);
  await X.page.goto(SITE + '/app/'); await settle(X.page); await signIn(X.page, 'eve@example.com', PW, 1);
  const eveTok = (await stored(X.page, 'repstr.auth.v1')).at;
  const asEve = (m, u, b) => backend(m, SB + u, {apikey: 'k', authorization: 'Bearer ' + eveTok}, b ? JSON.stringify(b) : null);
  ok(asEve('GET', '/rest/v1/files?select=*')[1].every(r => r.user_id != ada.id) && asEve('GET', '/rest/v1/client_files?select=*')[1].length == 0, 'another user sees none of the client\'s rows');
  ok(asEve('POST', '/rest/v1/reviews', {client_id: ada.id, ts: 1, payload: '{}'})[0] == 403, 'another user cannot send the client a review');
  await X.ctx.close();

  // 11. a second firm computer signs in and gets the portal and the client
  const P2 = await device(browser);
  await P2.page.goto(SITE + '/cpa/'); await P2.page.waitForTimeout(400);
  await signIn(P2.page, 'cpa@example.com', PW); await P2.page.waitForTimeout(1500);
  const port2 = await stored(P2.page, 'repstr.cpa.v1');
  ok(port2.cpa.firm.n == 'Smith & Lee CPAs' && port2.cpa.cl.length == 1 && !!(await stored(P2.page, 'repstr.cpa.c.' + port2.cpa.cl[0].id)), 'a second firm computer gets the portal and the client');
  await P2.ctx.close();

  // 12. an expired session is renewed quietly
  await B.page.evaluate(() => { const a = JSON.parse(localStorage.getItem('repstr.auth.v1')); a.exp = Date.now() - 1000; localStorage.setItem('repstr.auth.v1', JSON.stringify(a)); });
  await B.page.reload(); await settle(B.page, 900);
  ok(/Saved/.test(await badge(B.page)) && calls.some(c => /refresh_token/.test(c)), 'an expired session is renewed quietly', await badge(B.page));
  ok((await stored(B.page)).acct.full == 'Ada Auto Investor', 'device B has the latest data after reopening');

  // 13. disconnecting from the firm removes the shared file; sign-out; delete online copy
  await click(A.page, '[data-a="firmOff"]'); await A.page.waitForTimeout(200); await click(A.page, '[data-a="dlgY"]'); await A.page.waitForTimeout(700);
  ok(!row('client_files', r => r.client_id == ada.id), 'disconnecting removes the file the firm could read');
  await click(B.page, '#acb'); await click(B.page, '[data-a="acOut"]'); await B.page.waitForTimeout(400);
  ok((await badge(B.page)) == 'Sign in' && !(await stored(B.page, 'repstr.auth.v1')) && (await stored(B.page)).props.length == 3, 'sign-out keeps the browser copy and forgets the session');
  await click(A.page, '#acb'); await click(A.page, '[data-a="acDel"]'); await A.page.waitForTimeout(200); await click(A.page, '[data-a="dlgY"]'); await A.page.waitForTimeout(900);
  ok(!T.files.some(r => r.user_id == ada.id) && (await badge(A.page)) == 'Sign in' && (await stored(A.page)).props.length == 3, 'delete my online copy removes the account data, keeps the browser copy');

  for (const [n, d] of [['A', A], ['B', B], ['portal', P]]) ok(!d.errs.length, 'no JavaScript errors on ' + n, d.errs.join(' | '));
  await browser.close();
  console.log(bad ? 'FAILED' : 'Cloud accounts OK');
  process.exit(bad);
})().catch(e => { console.error(e); process.exit(1); });
