# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page web app for tracking daily work location (home / office / non-work day) on a monthly calendar, backed by Firebase. It also pulls workouts from Strava onto the calendar and computes fitness/office "goals" and a custom **BELT** metric. There is **no build system, no package.json, no test suite, and no framework** — just three hand-written files served as static assets.

## Files

- `index.html` — markup for the whole app: the calendar grid, all modals (location picker, Strava connect, settings/goals, migration, BELT overview), and the Firebase CDN script tags.
- `app.js` (~2700 lines) — all application logic. Plain functions on the global scope, wired up via `addEventListener` in `initializeApp()`.
- `styles.css` — all styling.
- `config.js` — Firebase web config. **Committed on purpose** (Firebase web config is not secret; access is controlled by `firestore.rules` + API-key domain restrictions). `config.example.js` is the template.
- `firestore.rules` — owner-only security rules (each user can only read/write `users/{their-uid}`).

## Running / developing

There is no dev server or build. Open `index.html` in a browser (or serve the directory with any static server, e.g. `python3 -m http.server`). The app talks to the live `rto-db` Firebase project.

**Cache-busting:** `app.js` is loaded as `app.js?v=YYYYMMDD<letter>` in `index.html`. After meaningful JS changes, bump that query string or browsers (and GitHub Pages) will serve a stale copy. There's no automation for this — edit `index.html` by hand.

Deployment is static hosting (GitHub Pages). Pushing to the default branch publishes.

## Data model

Everything for a user lives in one Firestore document: `users/{firebaseAuthUid}`.

- Date keys `YYYY-MM-DD` → `"home"` | `"office"` | `"nonworkday"`.
- `stravaActivities` → map of `YYYY-MM-DD` → activity data cached from Strava.
- `weeklyGoals` → `{ office, running, weights, coldPlunge, yoga, hiking, ski }`.
- Strava OAuth tokens (access/refresh) are also stored on this doc.

The document is read once into `currentUserData` and kept live via `subscribeToUserDoc()` (`onSnapshot`).

## Architecture notes

- **Auth gates everything.** `auth.onAuthStateChanged` → `onSignedIn` / `onSignedOut`. `currentUser` is the Firebase `uid` and is used directly as the Firestore doc ID. Most functions early-return if `!currentUser || !db`.

- **BELT metric (`computeWorkStats`, app.js).** This is the central domain concept. It buckets days into ISO weeks (Monday start), counts office days per week, then over a **12-week window** takes the **best 8 weeks by office-day count** and averages them — that average is "BELT". The current week is excluded from averages unless its Friday has data. Read this function before touching any stats/week logic.

- **What-If mode.** `whatIfMode` + `whatIfData` hold tentative location overrides that are **not persisted to Firebase**. `getEffectiveData(baseData)` merges overrides over real data (a `null` override means "cleared"). Stats recompute against the effective data with `includeFuture = true` so projected future weeks count. When editing calendar/stats code, always go through `getEffectiveData` rather than reading `currentUserData` directly.

- **Strava integration.** OAuth via `startStravaOAuth` → redirect → `handleStravaOAuthCallback` → `exchangeStravaCodeForToken`. The callback writes tokens to the user doc, so it only runs after sign-in (guarded by `stravaCallbackHandled`). Activities are fetched (`fetchStravaActivities`), saved (`saveStravaActivitiesToDB`), and classified by sport via the `isRunningActivity` / `isWeightTrainingActivity` / `isYogaActivity` / `isColdPlungeActivity` / `isHikingActivity` / `isSkiActivity` predicates → `getActivityCategories` → `getActivityIcon` (emoji shown on the day cell).

- **Migration.** Older data was keyed by typed display name; it's now keyed by `uid`. `maybeOfferMigration` / `runMigration` copy a named doc into the uid doc on first sign-in. This must happen while Firestore rules are still open — see `FIREBASE_CHECKLIST.md`.

- **Rendering.** `renderCalendar()` rebuilds the month grid; `addWeekStatsCells` injects per-week office-day stats cells; `updateMonthlyStatus` / `updateYearToDateStatus` / `updateStats` refresh the summary numbers. There's no virtual DOM — these functions mutate the DOM directly and are re-called after data changes.

## Conventions

- All user-facing errors go through `showToast(message, type)` rather than `alert`.
- Any HTML built from user/external data is run through `escapeHtml`.
- Dates: use `formatDateKey(date)` to produce the `YYYY-MM-DD` key, `parseDateKey` to read one back, and `getMondayOfWeek` for week bucketing. Don't hand-roll date math — week alignment depends on these.
