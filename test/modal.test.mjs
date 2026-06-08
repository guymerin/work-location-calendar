// End-to-end smoke test for the Work Location Calendar.
//
// Runs the real index.html / app.js / styles.css in headless Chromium, but
// replaces Firebase with an in-memory mock seeded under a throwaway uid. It NEVER
// contacts the real Firebase project, so it cannot read or write any real user's
// data (this is asserted explicitly: zero requests to *.googleapis.com etc.).
//
// Run:  cd test && npm install && npm test
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'screenshots');
mkdirSync(OUT, { recursive: true });

// ---- Build mock data (relative to a fixed "today" for deterministic output) ----
function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const today = new Date(2026, 5, 8); // June 8 2026
const mockData = {};
const start = new Date(today); start.setDate(start.getDate() - 14 * 7);
const end = new Date(2026, 5, 30);
let wk = 0, lastMon = null;
for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) continue;                 // skip weekends
  const monday = new Date(d); monday.setDate(d.getDate() - ((dow + 6) % 7));
  const mk = fmt(monday);
  if (mk !== lastMon) { lastMon = mk; wk++; }
  const officeQuota = [2, 3, 4][wk % 3];                // vary office days per week
  const idxInWeek = (dow + 6) % 7;                      // Mon=0 .. Fri=4
  let val = idxInWeek < officeQuota ? 'office' : 'home';
  if (wk % 5 === 0 && idxInWeek === 4) val = 'nonworkday';
  if (d > today && fmt(d) > fmt(today) && d.getMonth() !== 5) continue; // keep most future empty
  mockData[fmt(d)] = val;
}
const mockDoc = Object.assign({}, mockData, {
  weeklyGoals: { office: 3, running: 2, weights: 3, coldPlunge: 1, yoga: 1, hiking: 1, ski: 0 }
});
const mockUser = { uid: 'MOCK-TEST-UID-do-not-use', displayName: 'Mock Tester', email: 'mock@example.test' };
console.log(`Seeded ${Object.keys(mockData).length} day entries across ~${wk} weeks under uid=${mockUser.uid}`);

// ---- Mock firebase (compat API) injected in place of the app-compat CDN script ----
const FIREBASE_MOCK = `
(function(){
  const store = window.__MOCK_FIRESTORE__;
  const listeners = {};
  function snap(p){ const d = store[p]; return { exists: !!d, data: function(){ return d ? JSON.parse(JSON.stringify(d)) : undefined; } }; }
  function DocRef(p){ this.p = p; }
  DocRef.prototype.get = function(){ return Promise.resolve(snap(this.p)); };
  DocRef.prototype.set = function(obj, opts){
    window.__WRITES__ = (window.__WRITES__||0) + 1;
    const cur = store[this.p] || {};
    store[this.p] = (opts && opts.merge) ? Object.assign({}, cur, obj) : Object.assign({}, obj);
    (listeners[this.p]||[]).forEach(fn => fn(snap(this.p)));
    return Promise.resolve();
  };
  DocRef.prototype.onSnapshot = function(cb){ (listeners[this.p]=listeners[this.p]||[]).push(cb); cb(snap(this.p)); return function(){}; };
  function Coll(n){ this.n = n; }
  Coll.prototype.doc = function(id){ return new DocRef(this.n + '/' + id); };
  function FS(){}
  FS.prototype.collection = function(n){ return new Coll(n); };
  const user = window.__MOCK_USER__;
  function Auth(){ this.currentUser = user; }
  Auth.prototype.onAuthStateChanged = function(cb){ setTimeout(function(){ cb(user); }, 0); return function(){}; };
  Auth.prototype.signInWithPopup = function(){ return Promise.resolve({ user: user }); };
  Auth.prototype.signOut = function(){ return Promise.resolve(); };
  let _fs, _auth;
  const authFn = function(){ return _auth || (_auth = new Auth()); };
  authFn.GoogleAuthProvider = function(){};
  window.firebase = {
    initializeApp: function(){ return {}; },
    firestore: function(){ return _fs || (_fs = new FS()); },
    auth: authFn
  };
})();
`;

const results = [];
function check(name, cond, extra = '') {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}${extra ? '  (' + extra + ')' : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });

// Seed globals BEFORE any page script runs.
await page.addInitScript(({ doc, user, uid }) => {
  window.__MOCK_FIRESTORE__ = { ['users/' + uid]: doc };
  window.__MOCK_USER__ = user;
  window.__WRITES__ = 0;
}, { doc: mockDoc, user: mockUser, uid: mockUser.uid });

// Fail loudly if anything tries to reach the REAL backend.
const realHits = [];
page.on('request', r => {
  if (/firestore\.googleapis\.com|identitytoolkit|firebaseio|securetoken/.test(r.url())) realHits.push(r.url());
});

// Intercept the three Firebase CDN scripts: first returns the mock, others empty.
let appServed = false;
await page.route('**/firebasejs/**', async route => {
  const u = route.request().url();
  if (!appServed && /firebase-app-compat/.test(u)) {
    appServed = true;
    return route.fulfill({ contentType: 'application/javascript', body: FIREBASE_MOCK });
  }
  return route.fulfill({ contentType: 'application/javascript', body: '/* mocked */' });
});

const errors = [];
page.on('pageerror', e => errors.push(String(e)));

await page.goto('file://' + path.join(REPO, 'index.html'));
await page.waitForSelector('.calendar-day .location-indicator.office', { timeout: 8000 });

// --- Rendering ---
const officeCells = await page.$$eval('.location-indicator.office', els => els.length);
const homeCells = await page.$$eval('.location-indicator.home', els => els.length);
const belt = (await page.textContent('#beltValue').catch(() => null)) || '';
const avg = (await page.textContent('#avgWeeklyOffice').catch(() => null)) || '';
check('calendar rendered office indicators', officeCells > 0, `${officeCells} office cells`);
check('calendar rendered home indicators', homeCells > 0, `${homeCells} home cells`);
check('BELT value computed (numeric)', /\d/.test(belt), `BELT="${belt.trim()}" avg="${avg.trim()}"`);
await page.screenshot({ path: path.join(OUT, '01-calendar.png'), fullPage: true });

// --- Open modal ---
const dayCell = page.locator('.calendar-day[aria-label*="June 10, 2026"]').first();
await dayCell.click();
await page.waitForSelector('#modal', { state: 'visible' });
check('day click opens location picker', await page.locator('#modal').isVisible());
await page.waitForTimeout(300);
await page.locator('#modal .modal-content').screenshot({ path: path.join(OUT, '02-modal-open.png') });

// --- Esc closes ---
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check('Escape closes the modal', !(await page.locator('#modal').isVisible()));

// --- X (close button) closes ---
await dayCell.click();
await page.waitForSelector('#modal', { state: 'visible' });
await page.locator('#modal .close').click();
await page.waitForTimeout(150);
check('X button closes the modal', !(await page.locator('#modal').isVisible()));

// --- Backdrop click closes ---
await dayCell.click();
await page.waitForSelector('#modal', { state: 'visible' });
await page.locator('#modal').click({ position: { x: 5, y: 5 } });
await page.waitForTimeout(150);
check('Backdrop click closes the modal', !(await page.locator('#modal').isVisible()));

// --- Aborting must NOT write, and the real backend must never be touched ---
check('aborting (Esc/X/backdrop) wrote nothing to Firestore', (await page.evaluate(() => window.__WRITES__)) === 0);
check('no requests to real Firebase backend', realHits.length === 0, realHits.join(', '));
check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();

const failed = results.filter(r => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
console.log('Screenshots in ' + OUT);
process.exit(failed.length ? 1 : 0);
