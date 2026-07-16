// Strava connect-flow smoke test (Chromium). Runs the real app with mocked
// Firebase, a mocked token worker (strava-worker/), and a mocked Strava API —
// it never contacts real backends. Covers: unconfigured toast, OAuth redirect,
// code exchange on callback, and automatic token refresh.
//
// Run:  cd test && npm install && npm run test:strava
import { createRequire } from 'module';
import { buildMockDoc, mockUser, FIREBASE_MOCK, REPO } from './harness.mjs';
import path from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const results = [];
const check = (name, cond, extra = '') => {
  results.push(!!cond);
  console.log(`  ${cond ? 'PASS' : 'FAIL'} - ${name}${extra ? '  (' + extra + ')' : ''}`);
};

const browser = await chromium.launch();

async function newAppPage({ stravaConfig, extraDoc = {}, workerHandler }) {
  const { mockDoc } = buildMockDoc();
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.addInitScript(({ doc, user, uid, cfg }) => {
    window.__MOCK_FIRESTORE__ = { ['users/' + uid]: doc };
    window.__MOCK_USER__ = user;
    window.__WRITES__ = 0;
    window.__STRAVA_CFG__ = cfg;
  }, { doc: { ...mockDoc, ...extraDoc }, user: mockUser, uid: mockUser.uid, cfg: stravaConfig });

  let appServed = false;
  await page.route('**/firebasejs/**', route => {
    const u = route.request().url();
    if (!appServed && /firebase-app-compat/.test(u)) {
      appServed = true;
      return route.fulfill({ contentType: 'application/javascript', body: FIREBASE_MOCK });
    }
    return route.fulfill({ contentType: 'application/javascript', body: '/* mocked */' });
  });
  // Override config.js's stravaConfig with the per-test one
  await page.route('**/config.js*', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.firebaseConfig={apiKey:'x',authDomain:'x',projectId:'x',storageBucket:'x',messagingSenderId:'x',appId:'x'};
             window.stravaConfig = window.__STRAVA_CFG__ || {};`
    }));
  if (workerHandler) await page.route('**/mock-worker.workers.dev/**', workerHandler);
  // Block real Strava API calls; return empty activity list
  await page.route('https://www.strava.com/api/**', route =>
    route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '[]' }));
  return { page, context, errors };
}

// --- 1. Unconfigured: Connect click shows the "not configured" toast ---
{
  const { page, context, errors } = await newAppPage({ stravaConfig: { clientId: '', tokenEndpoint: '' } });
  await page.goto('file://' + path.join(REPO, 'index.html'));
  await page.waitForSelector('.calendar-day .location-indicator.office', { timeout: 15000 });
  await page.click('#settingsBtn');
  await page.waitForSelector('#stravaConnectBtn', { state: 'visible' });
  await page.click('#stravaConnectBtn');
  const toast = await page.waitForSelector('.toast', { timeout: 5000 });
  const text = await toast.textContent();
  check('unconfigured: toast explains missing config', /not configured/.test(text), text.trim());
  check('unconfigured: no page errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

// --- 2. Configured: Connect click redirects to Strava authorize with shared clientId ---
{
  const { page, context, errors } = await newAppPage({
    stravaConfig: { clientId: '424242', tokenEndpoint: 'https://mock-worker.workers.dev' }
  });
  let authUrl = null;
  await page.route('https://www.strava.com/oauth/authorize*', route => {
    authUrl = route.request().url();
    return route.fulfill({ contentType: 'text/html', body: '<title>strava</title>ok' });
  });
  await page.goto('file://' + path.join(REPO, 'index.html'));
  await page.waitForSelector('.calendar-day .location-indicator.office', { timeout: 15000 });
  await page.click('#settingsBtn');
  await page.waitForSelector('#stravaConnectBtn', { state: 'visible' });
  await page.click('#stravaConnectBtn');
  await page.waitForURL('**/oauth/authorize*', { timeout: 5000 });
  const landed = page.url();
  check('configured: redirects to Strava authorize', landed.includes('strava.com/oauth/authorize'), landed);
  check('configured: uses shared clientId', landed.includes('client_id=424242'));
  check('configured: requests activity scope', /scope=activity(%3A|:)read_all/.test(landed));
  check('configured: no page errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

// --- 3. OAuth callback: ?code= is exchanged at the worker and tokens saved ---
{
  let exchangeBody = null;
  const { page, context, errors } = await newAppPage({
    stravaConfig: { clientId: '424242', tokenEndpoint: 'https://mock-worker.workers.dev' },
    workerHandler: async route => {
      const req = route.request();
      if (req.method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        });
      }
      if (req.url().endsWith('/exchange') && req.method() === 'POST') {
        exchangeBody = JSON.parse(req.postData());
        return route.fulfill({
          contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ access_token: 'AT-new', refresh_token: 'RT-new', expires_at: 9999999999 })
        });
      }
      return route.fulfill({ status: 404, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' });
    }
  });
  await page.goto('file://' + path.join(REPO, 'index.html') + '?code=THECODE&scope=activity:read_all');
  await page.waitForSelector('.calendar-day .location-indicator.office', { timeout: 15000 });
  await page.waitForFunction(() => {
    const store = window.__MOCK_FIRESTORE__;
    const doc = store && store['users/MOCK-TEST-UID-do-not-use'];
    return doc && doc.stravaAccessToken === 'AT-new';
  }, { timeout: 10000 });
  const doc = await page.evaluate(() => window.__MOCK_FIRESTORE__['users/MOCK-TEST-UID-do-not-use']);
  check('callback: code POSTed to worker /exchange', exchangeBody && exchangeBody.code === 'THECODE');
  check('callback: access token saved to user doc', doc.stravaAccessToken === 'AT-new');
  check('callback: refresh token saved', doc.stravaRefreshToken === 'RT-new');
  check('callback: expiry saved', doc.stravaTokenExpiresAt === 9999999999);
  check('callback: code stripped from URL', !page.url().includes('code=THECODE'), page.url());
  check('callback: no page errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

// --- 4. Expired token: proactive refresh via worker /refresh before fetching ---
{
  let refreshBody = null;
  const { page, context, errors } = await newAppPage({
    stravaConfig: { clientId: '424242', tokenEndpoint: 'https://mock-worker.workers.dev' },
    extraDoc: {
      stravaAccessToken: 'AT-stale',
      stravaRefreshToken: 'RT-old',
      stravaTokenExpiresAt: 1000  // long expired
    },
    workerHandler: async route => {
      const req = route.request();
      if (req.method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        });
      }
      if (req.url().endsWith('/refresh') && req.method() === 'POST') {
        refreshBody = JSON.parse(req.postData());
        return route.fulfill({
          contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ access_token: 'AT-fresh', refresh_token: 'RT-fresh', expires_at: 9999999999 })
        });
      }
      return route.fulfill({ status: 404, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' });
    }
  });
  const apiTokens = [];
  await page.route('https://www.strava.com/api/v3/athlete/activities*', route => {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type'
    };
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }
    apiTokens.push(route.request().headers()['authorization']);
    return route.fulfill({ contentType: 'application/json', headers: corsHeaders, body: '[]' });
  });
  await page.goto('file://' + path.join(REPO, 'index.html'));
  await page.waitForSelector('.calendar-day .location-indicator.office', { timeout: 15000 });
  await page.waitForFunction(() => {
    const doc = window.__MOCK_FIRESTORE__['users/MOCK-TEST-UID-do-not-use'];
    return doc && doc.stravaAccessToken === 'AT-fresh';
  }, { timeout: 10000 });
  check('refresh: old refresh token POSTed to /refresh', refreshBody && refreshBody.refresh_token === 'RT-old');
  const doc = await page.evaluate(() => window.__MOCK_FIRESTORE__['users/MOCK-TEST-UID-do-not-use']);
  check('refresh: new tokens persisted', doc.stravaAccessToken === 'AT-fresh' && doc.stravaRefreshToken === 'RT-fresh');
  const deadline = Date.now() + 5000;
  while (!apiTokens.some(t => t === 'Bearer AT-fresh') && Date.now() < deadline) {
    await page.waitForTimeout(100);
  }
  check('refresh: activities fetched with fresh token', apiTokens.some(t => t === 'Bearer AT-fresh'), apiTokens.join(', '));
  check('refresh: no page errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

await browser.close();
const failed = results.filter(r => !r).length;
console.log(failed === 0 ? `\nAll ${results.length} checks passed` : `\n${failed}/${results.length} checks FAILED`);
process.exit(failed === 0 ? 0 : 1);
