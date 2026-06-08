// Desktop smoke test (Chromium). Runs the real app with a mocked, in-memory
// Firebase seeded under a throwaway uid — it NEVER contacts the real backend
// (asserted), so it cannot read or write any real user's data.
//
// Run:  cd test && npm install && npm test
import { createRequire } from 'module';
import { runChecks, buildMockDoc, mockUser, OUT } from './harness.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const { dayCount, weeks } = buildMockDoc();
console.log(`Seeded ${dayCount} day entries across ~${weeks} weeks under uid=${mockUser.uid}\n`);

console.log('### Desktop (Chromium)');
const browser = await chromium.launch();
const results = await runChecks(browser, {
  contextOptions: { viewport: { width: 1280, height: 1400 } },
  label: 'Desktop (Chromium)',
  prefix: 'desktop',
  keyboard: true,
});
await browser.close();

const failed = results.filter(r => !r.ok).length;
console.log(`\n=== ${results.length - failed}/${results.length} checks passed ===`);
console.log('Screenshots in ' + OUT + ' (desktop-*.png)');
process.exit(failed ? 1 : 0);
