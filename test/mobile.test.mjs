// Mobile emulation smoke test: runs the full flow under an iOS (WebKit / Mobile
// Safari) and an Android (Chromium / Mobile Chrome) device profile.
//
// Run:  cd test && npm install && npm run test:mobile
import { createRequire } from 'module';
import { runChecks, buildMockDoc, mockUser, OUT } from './harness.mjs';

const require = createRequire(import.meta.url);
const { webkit, chromium, devices } = require('playwright');

const { dayCount, weeks } = buildMockDoc();
console.log(`Seeded ${dayCount} day entries across ~${weeks} weeks under uid=${mockUser.uid}\n`);

// devices[...] descriptors carry viewport, userAgent, deviceScaleFactor, isMobile
// and hasTouch — so taps, mobile layout and the mobile UA are all exercised.
const targets = [
  { label: 'iOS · iPhone 13 (Mobile Safari/WebKit)', prefix: 'ios', launcher: webkit, device: devices['iPhone 13'] },
  { label: 'Android · Pixel 7 (Mobile Chrome/Chromium)', prefix: 'android', launcher: chromium, device: devices['Pixel 7'] },
];

let totalFail = 0;
for (const t of targets) {
  console.log(`### ${t.label}`);
  const browser = await t.launcher.launch();
  // Real phones have no Esc key, so skip that check on touch devices; cover the
  // user-facing close paths (× button and backdrop tap) instead.
  const results = await runChecks(browser, {
    contextOptions: t.device,
    label: t.label,
    prefix: t.prefix,
    keyboard: false,
  });
  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  totalFail += failed;
  console.log(`  -> ${results.length - failed}/${results.length} passed\n`);
}

console.log(`Screenshots in ${OUT} (ios-*.png, android-*.png)`);
process.exit(totalFail ? 1 : 0);
