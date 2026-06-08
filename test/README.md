# Tests

Headless end-to-end smoke tests for the calendar. They load the real
`index.html` / `app.js` / `styles.css` in a browser (via Playwright) but swap
Firebase for an **in-memory mock** seeded under a throwaway uid.

**They never contact the real Firebase project**, so they cannot read or modify
any real user's data — each run asserts zero requests to `*.googleapis.com` /
`identitytoolkit` / etc.

## Run

```bash
cd test
npm install        # one-time; also downloads Chromium + WebKit builds

npm test           # desktop (Chromium)
npm run test:mobile  # iOS (Mobile Safari/WebKit) + Android (Mobile Chrome/Chromium)
```

Each run prints PASS/FAIL per check and writes screenshots to
`test/screenshots/` (gitignored):

- `desktop-calendar.png` / `desktop-modal.png`
- `ios-calendar.png` / `ios-modal.png`
- `android-calendar.png` / `android-modal.png`

## What it covers

- Calendar renders home/office/non-work-day indicators from data
- BELT + weekly-average stats compute and display
- Day tap/click opens the location picker
- Picker closes via **Esc** (desktop), the **×** button, and **backdrop** tap/click
- Aborting the picker writes nothing to Firestore
- No requests reach the real Firebase backend; no page errors

Mobile runs use Playwright device descriptors (iPhone 13, Pixel 7), so mobile
viewport, touch taps, and the mobile user-agent are all exercised. The Esc check
is skipped on touch devices (no physical keyboard); the ×/backdrop paths cover
closing there.

## Layout

- `harness.mjs` — shared mock data, the in-memory Firebase mock, and the
  `runChecks()` flow used by both runners.
- `modal.test.mjs` — desktop runner.
- `mobile.test.mjs` — iOS + Android runner.

`runChecks` exits the process non-zero if any check fails (CI-friendly). To
exercise other states, adjust the seeded data in `buildMockDoc()` in
`harness.mjs`.
