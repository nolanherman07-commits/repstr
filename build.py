#!/usr/bin/env python3
"""Build the REPSTR website into dist/.

Usage:
    python3 build.py          build the public site into dist/
    python3 build.py --bump   also bump the sample-simulation storage version (visitors get fresh sample data)

Output (dist/):
    index.html               landing page (savings check, STR quiz, screenshots, pricing, FAQ)
    cpa/index.html           firm portal + "for CPAs" page (clients, alerts, review and sign-off; saved in the CPA's browser)
    app/index.html           the app (blank - every visitor starts with an empty account saved in their own browser)
    img/                     screenshots used on the landing page (from src/img)
    simulation.html          5-year sample simulation (3 properties)
    simulation-big.html      big investor sample (35 short-term rentals)
    simulation-section8.html Section 8 sample (3 years)
    test-new.html            "first visit every time" demo - never saves anything
    .nojekyll                tells GitHub Pages to serve files as-is

Optional private build: if src/core.js exists (your personal copy - it is git-ignored),
it is built into private/REPSTR_personal.html, which is also git-ignored and never deployed.
No dependencies beyond the Python 3 standard library.
"""
import os, json, sys
D = os.path.dirname(os.path.abspath(__file__))
S = os.path.join(D, 'src')
O = os.path.join(D, 'dist')
sys.path.insert(0, S)
from themes import css as theme_css

M = (1 << 32) - 1
def imul(a, b): return (a * b) & M
def hs(s):
    """Same hash the page computes on its own code at load time (tamper lock)."""
    a, b = 0xdeadbeef, 0x41c6ce57
    for ch in s:
        for c in ([ord(ch)] if ord(ch) < 0x10000 else [0xD800 + ((ord(ch) - 0x10000) >> 10), 0xDC00 + ((ord(ch) - 0x10000) & 0x3FF)]):
            a = imul(a ^ c, 2654435761); b = imul(b ^ c, 1597334677)
    a2 = imul(a ^ (a >> 16), 2246822507) ^ imul(b ^ (b >> 13), 3266489909)
    b2 = imul(b ^ (b >> 16), 2246822507) ^ imul(a2 ^ (a2 >> 13), 3266489909)
    return 4294967296 * (2097151 & b2) + a2

def rd(f): return open(os.path.join(S, f), encoding='utf-8').read()
def check(c, n):
    assert '</script' not in c.lower(), n + ': contains </script'
    assert '\r' not in c, n + ': contains CR'
    assert all(ord(x) < 128 for x in c), n + ': non-ASCII character in app code'
def one(old, new, c, n):
    assert c.count(old) == 1, n + ': expected exactly 1 match for ' + old[:60]
    return c.replace(old, new)

KX = "const K=CPAM?'repstr.cpa.v1':CVID?'repstr.cpa.c.'+CVID:'dealtracker.blank.v1',"

def sim(c, state, key, yr):
    """Sample simulation: frozen date + seeded data."""
    c = one(KX, "const Date=class extends globalThis.Date{constructor(...a){if(a.length)super(...a);else super(" + str(yr) + ",11,15)}};\nconst K='" + key + "',", c, 'sim')
    c = one("const cut0=()=>{const d=new Date();return d.getFullYear()*12+d.getMonth()};", "const cut0=()=>" + str(yr) + "*12+11;", c, 'sim')
    st = json.dumps(json.loads(rd(state)), separators=(',', ':')).replace('\\', '\\\\').replace("'", "\\'")
    c = one("let S;try{S=JSON.parse(localStorage.getItem(K))}catch(e){}\n", "let S;try{S=JSON.parse(localStorage.getItem(K))}catch(e){}\nif(!S)S=JSON.parse('" + st + "');\n", c, 'sim')
    return c

SITE = 'https://' + open(os.path.join(S, 'CNAME')).read().strip() + '/' if os.path.exists(os.path.join(S, 'CNAME')) else 'https://nolanherman07-commits.github.io/repstr/'
ICON = '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect width=%2732%27 height=%2732%27 rx=%277%27 fill=%27%2316335f%27/%3E%3Ccircle cx=%2716%27 cy=%2716%27 r=%277%27 fill=%27%23f2b134%27/%3E%3C/svg%3E">'
DESC = 'Free 1-minute check: see what a short-term rental or Real Estate Professional Status saves you in taxes - federal and state - before you buy.'
META = ('<meta name="description" content="' + DESC + '">'
        '<meta property="og:type" content="website"><meta property="og:site_name" content="REPSTR">'
        '<meta property="og:title" content="See your STR / REPS tax savings before you buy">'
        '<meta property="og:description" content="' + DESC + '">'
        '<meta property="og:url" content="' + SITE + '"><meta property="og:image" content="' + SITE + 'img/og.png">'
        '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
        '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="' + SITE + 'img/og.png">')

DESC_CPA = 'For CPAs with real estate clients: an hours log clients keep as they go, a dashboard of who will meet the REPS and STR tests by December 31, review and sign-off, and an audit binder with citations.'
META_CPA = META.replace(DESC, DESC_CPA).replace('See your STR / REPS tax savings before you buy', 'REPSTR for CPAs').replace('content="' + SITE + '">', 'content="' + SITE + 'cpa/">')

def build(core, path, title=None, theme='navy', meta=''):
    check(core, path)
    t = rd('template.html').replace('@@THEME@@', theme_css(theme))
    if title: t = one('<title>REPSTR</title>', '<title>' + title + '</title>', t, path)
    t = t.replace('</title>', '</title>' + ICON + meta, 1)
    html = t.replace('@@H@@', str(hs(core))).replace('@@CORE@@', core)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8', newline='\n').write(html)
    print('built', os.path.relpath(path, D))

V = int(rd('sim_ver.txt').strip() or 1)
if '--bump' in sys.argv:
    V += 1; open(os.path.join(S, 'sim_ver.txt'), 'w').write(str(V) + '\n')
blank = rd('core_blank.js')
# Supabase settings (cloud accounts). Read from the environment, then from a .env file next to this script:
#   SUPABASE_URL              project URL
#   SUPABASE_PUBLISHABLE_KEY  publishable (anon) key - public by design, it ships inside the page
#   SUPABASE_SECRET_KEY       NEVER used by the site. It is read only so the build can refuse to leak it.
# .env is git-ignored. On GitHub the two public values come from .github/workflows/deploy.yml.
# With no URL or no publishable key, accounts are switched off and the site works entirely in the browser.
def dotenv(path):
    o = {}
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line: continue
            k, v = line.split('=', 1); k = k.replace('export ', '').strip(); v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'': v = v[1:-1]
            o[k] = v
    return o
ENV = dotenv(os.path.join(D, '.env'))
def cfg(*names):
    for n in names:
        v = os.environ.get(n) or ENV.get(n)
        if v: return v.strip()
    return ''
SB_URL = cfg('SUPABASE_URL', 'REPSTR_SB_URL').rstrip('/')
SB_KEY = cfg('SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', 'REPSTR_SB_KEY')
SB_SECRET = cfg('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY')
if SB_URL or SB_KEY:
    import re
    assert re.match(r'^https://[A-Za-z0-9.-]+(:\d+)?$', SB_URL), 'SUPABASE_URL must look like https://xxxx.supabase.co'
    assert re.match(r'^[A-Za-z0-9._-]{20,}$', SB_KEY), 'SUPABASE_PUBLISHABLE_KEY is missing or has unexpected characters'
    assert not SB_KEY.startswith('sb_secret_') and SB_KEY != SB_SECRET, 'SUPABASE_PUBLISHABLE_KEY holds a SECRET key - use the publishable (anon) key'
    if SB_KEY.count('.') == 2:
        import base64
        try: role = json.loads(base64.urlsafe_b64decode(SB_KEY.split('.')[1] + '==')).get('role')
        except Exception: role = None
        assert role != 'service_role', 'SUPABASE_PUBLISHABLE_KEY holds the service_role key - use the anon key'
    blank, n = re.subn(r"const SB_URL='[^']*',SB_KEY='[^']*';", lambda m: "const SB_URL='" + SB_URL + "',SB_KEY='" + SB_KEY + "';", blank)
    assert n == 1, 'SB_URL / SB_KEY line not found in core_blank.js'
    print('cloud accounts: ON (' + SB_URL + ')')
else:
    print('cloud accounts: off (no SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY)')
if SB_SECRET: assert SB_SECRET not in blank, 'the secret key is in the site code - remove it'

os.makedirs(O, exist_ok=True)
# landing page (main address) + the app at /app/
build(one("const LAND=0;", "const LAND=1;", blank, 'land'), os.path.join(O, 'index.html'), 'REPSTR - See your STR / REPS tax savings before you buy', meta=META)
build(blank, os.path.join(O, 'app', 'index.html'))
# firm portal for CPAs (client dashboard, review + sign-off) and the "for CPAs" page
build(one("const CPAM=0;", "const CPAM=1;", blank, 'cpa'), os.path.join(O, 'cpa', 'index.html'), 'REPSTR for CPAs - REPS and STR client records, audit-ready', meta=META_CPA)
import shutil
if os.path.isdir(os.path.join(S, 'img')):
    shutil.rmtree(os.path.join(O, 'img'), ignore_errors=True)
    shutil.copytree(os.path.join(S, 'img'), os.path.join(O, 'img'))
build(sim(blank, 'state.json', 'dealtracker.sim.v%d' % V, 2030), os.path.join(O, 'simulation.html'), 'REPSTR - 5 Year Simulation')
build(sim(blank, 'state_big.json', 'dealtracker.simbig.v%d' % V, 2030), os.path.join(O, 'simulation-big.html'), 'REPSTR - Big Investor Simulation')
build(sim(blank, 'state_s8.json', 'dealtracker.sims8.v%d' % V, 2027), os.path.join(O, 'simulation-section8.html'), 'REPSTR - Section 8 3 Year Simulation')
# "first visit every time": never reads or writes saved data
t = one("let S;try{S=JSON.parse(localStorage.getItem(K))}catch(e){}\n", "let S;\n", one(KX, "const K='dealtracker.testnew.v1',", blank, 'tfn'), 'tfn')
t = one("localStorage.setItem(K,JSON.stringify(S));SVE=0", "SVE=0", t, 'tfn')
t = one("if(window.__SEED&&window.__SEED.props)", "if(0)", t, 'tfn')
build(t, os.path.join(O, 'test-new.html'), 'REPSTR - Test file new')
open(os.path.join(O, '.nojekyll'), 'w').close()
# custom domain: put the domain (e.g. repstr.com) in src/CNAME and it is copied for GitHub Pages
if os.path.exists(os.path.join(S, 'CNAME')):
    shutil.copy(os.path.join(S, 'CNAME'), os.path.join(O, 'CNAME'))

# optional personal build (never committed, never deployed)
if os.path.exists(os.path.join(S, 'core.js')):
    build(rd('core.js'), os.path.join(D, 'private', 'REPSTR_personal.html'))
if SB_SECRET:
    for r_, _, fs_ in os.walk(O):
        for f_ in fs_:
            if f_.endswith('.html'): assert SB_SECRET not in open(os.path.join(r_, f_), encoding='utf-8').read(), 'secret key found in ' + f_
print('done - open dist/index.html in a browser, or run: npm start')
