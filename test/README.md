# Tests

Headless end-to-end smoke test for the calendar. It loads the real
`index.html` / `app.js` / `styles.css` in Chromium (via Playwright) but swaps
Firebase for an **in-memory mock** seeded under a throwaway uid.

**It never contacts the real Firebase project**, so it cannot read or modify any
real user's data — the test asserts zero requests to `*.googleapis.com` /
`identitytoolkit` / etc.

## Run

```bash
cd test
npm install   # one-time; also downloads the Chromium build
npm test
```

A run prints PASS/FAIL for each check and writes screenshots to
`test/screenshots/` (gitignored):

- `01-calendar.png` — month populated with mock data + BELT/weekly stats
- `02-modal-open.png` — the day location picker

## What it covers

- Calendar renders home/office/non-work-day indicators from data
- BELT + weekly-average stats compute and display
- Day click opens the location picker
- Picker closes via **Esc**, the **×** button, and **backdrop click**
- Aborting the picker writes nothing to Firestore
- No requests reach the real Firebase backend; no page errors

## Adding cases

Everything lives in `modal.test.mjs`. The `check(name, cond, extra)` helper
records a pass/fail; the process exits non-zero if any check fails (CI-friendly).
Adjust the seeded `mockData` / `mockDoc` near the top to exercise other states.
