// Shared test harness: builds mock data, provides the in-memory Firebase mock,
// and runs the full check flow against a given browser context configuration.
// Used by modal.test.mjs (desktop) and mobile.test.mjs (iOS/Android emulation).
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(__dirname, '..');
export const OUT = path.join(__dirname, 'screenshots');
mkdirSync(OUT, { recursive: true });

export const mockUser = { uid: 'MOCK-TEST-UID-do-not-use', displayName: 'Mock Tester', email: 'mock@example.test' };

function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Deterministic mock data relative to a fixed "today" (June 8 2026).
export function buildMockDoc() {
  const today = new Date(2026, 5, 8);
  const mockData = {};
  const start = new Date(today); start.setDate(start.getDate() - 14 * 7);
  const end = new Date(2026, 5, 30);
  let wk = 0, lastMon = null;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const monday = new Date(d); monday.setDate(d.getDate() - ((dow + 6) % 7));
    const mk = fmt(monday);
    if (mk !== lastMon) { lastMon = mk; wk++; }
    const officeQuota = [2, 3, 4][wk % 3];
    const idxInWeek = (dow + 6) % 7;
    let val = idxInWeek < officeQuota ? 'office' : 'home';
    if (wk % 5 === 0 && idxInWeek === 4) val = 'nonworkday';
    if (d > today && fmt(d) > fmt(today) && d.getMonth() !== 5) continue;
    mockData[fmt(d)] = val;
  }
  const mockDoc = Object.assign({}, mockData, {
    weeklyGoals: { office: 3, running: 2, weights: 3, coldPlunge: 1, yoga: 1, hiking: 1, ski: 0 }
  });
  return { mockDoc, dayCount: Object.keys(mockData).length, weeks: wk };
}

export const FIREBASE_MOCK = `
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

// Runs the full flow in a fresh context. `label` names the run; `prefix` prefixes
// screenshot files. `keyboard` toggles the Esc check (off for touch-only devices).
// Returns an array of { name, ok } results.
export async function runChecks(browser, { contextOptions = {}, label, prefix, keyboard = true }) {
  const { mockDoc } = buildMockDoc();
  const results = [];
  const check = (name, cond, extra = '') => {
    results.push({ name, ok: !!cond });
    console.log(`  ${cond ? 'PASS' : 'FAIL'} - ${name}${extra ? '  (' + extra + ')' : ''}`);
  };

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  // The seeded data is built around a fixed "today" (June 8 2026, see
  // buildMockDoc) and the checks click "June 10, 2026", so shift the app's
  // clock to that date by a constant offset. Only Date is faked — timers
  // keep running on real time.
  const FAKE_NOW = new Date(2026, 5, 8, 12, 0, 0).getTime();
  await page.addInitScript(fakeNow => {
    const RealDate = Date;
    const offset = fakeNow - RealDate.now();
    class ShiftedDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) super(RealDate.now() + offset);
        else super(...args);
      }
      static now() { return RealDate.now() + offset; }
    }
    ShiftedDate.parse = RealDate.parse;
    ShiftedDate.UTC = RealDate.UTC;
    window.Date = ShiftedDate;
  }, FAKE_NOW);

  await page.addInitScript(({ doc, user, uid }) => {
    window.__MOCK_FIRESTORE__ = { ['users/' + uid]: doc };
    window.__MOCK_USER__ = user;
    window.__WRITES__ = 0;
  }, { doc: mockDoc, user: mockUser, uid: mockUser.uid });

  const realHits = [];
  page.on('request', r => {
    if (/firestore\.googleapis\.com|identitytoolkit|firebaseio|securetoken/.test(r.url())) realHits.push(r.url());
  });

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
  await page.waitForSelector('.calendar-day .location-indicator.office', { timeout: 15000 });

  const officeCells = await page.$$eval('.location-indicator.office', els => els.length);
  const homeCells = await page.$$eval('.location-indicator.home', els => els.length);
  const belt = (await page.textContent('#beltValue').catch(() => null)) || '';
  const avg = (await page.textContent('#avgWeeklyOffice').catch(() => null)) || '';
  check('calendar rendered office indicators', officeCells > 0, `${officeCells} office cells`);
  check('calendar rendered home indicators', homeCells > 0, `${homeCells} home cells`);
  check('BELT value computed (numeric)', /\d/.test(belt), `BELT="${belt.trim()}" avg="${avg.trim()}"`);
  await page.screenshot({ path: path.join(OUT, `${prefix}-calendar.png`), fullPage: true });

  const dayCell = page.locator('.calendar-day[aria-label*="June 10, 2026"]').first();
  const openModal = async () => {
    await dayCell.click();
    await page.waitForSelector('#modal', { state: 'visible' });
  };
  const isClosed = async () => !(await page.locator('#modal').isVisible());
  // Guaranteed reset between independent sub-tests (don't assert here).
  const forceClose = async () => {
    if (await page.locator('#modal').isVisible()) {
      await page.locator('#modal .close').click();
      await page.waitForSelector('#modal', { state: 'hidden' });
    }
  };

  await openModal();
  check('day tap/click opens location picker', await page.locator('#modal').isVisible());
  await page.waitForTimeout(300);
  await page.locator('#modal .modal-content').screenshot({ path: path.join(OUT, `${prefix}-modal.png`) });
  await forceClose();

  if (keyboard) {
    await openModal();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    check('Escape closes the modal', await isClosed());
    await forceClose();
  }

  await openModal();
  await page.locator('#modal .close').click();
  await page.waitForTimeout(150);
  check('X button closes the modal', await isClosed());
  await forceClose();

  await openModal();
  await page.locator('#modal').click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(150);
  check('Backdrop tap/click closes the modal', await isClosed());
  await forceClose();

  check('aborting wrote nothing to Firestore', (await page.evaluate(() => window.__WRITES__)) === 0);
  check('no requests to real Firebase backend', realHits.length === 0, realHits.join(', '));
  check('no page errors', errors.length === 0, errors.join(' | '));

  await context.close();
  return results;
}
