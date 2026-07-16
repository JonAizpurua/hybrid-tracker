# Hybrid Tracker

Hybrid Tracker is a mobile-first, local-first progressive web app for four weekly gym sessions, two weekly runs, body weight, progression, personal records, statistics and portable backups. It is designed for rapid one-handed set entry on iPhone and remains useful on desktop.

## Quick start

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Open the URL printed by Vite. No account, database server or cloud credential is required for normal tracking.

Useful commands:

```bash
npm run dev          # local development server
npm run lint         # ESLint, with warnings treated as failures
npm test             # Vitest unit and integration tests
npm run test:e2e     # Playwright critical-flow tests
npm run build        # strict TypeScript check and production build
npm run preview      # serve the production build locally
```

The deployable static output is written to `dist/`.

## Product coverage

- Monday-first weekly schedule, monthly calendar, tap-based rescheduling and explicit same-day collision confirmation.
- Seeded Push, Pull, Legs and Upper routines, plus Easy Run and Interval Run plans.
- Editable exercise library, routine ordering, routine-specific sets/reps/rest, exercise archiving and immutable session snapshots.
- Previous-equivalent-set reference, weight prefill with empty reps, decimal loads, extra sets, post-completion edits, unilateral side pairs and per-side history.
- Pull-up bodyweight, weighted and assisted modes using the latest body weight on or before the workout date.
- Absolute-timestamp rest timer with add/subtract, pause, resume, skip, persistence and opt-in notifications.
- Epley estimated 1RM, PR history, better/neutral/worse classification, correct volume multipliers and double-progression recommendations with accept/ignore/dismiss/override controls.
- Manual run entry, calculated pace, optional interval detail, similar-heart-rate easy-run comparison and confirmed interval-block progression.
- Weight history, 68 kg default goal and three-month chart.
- Strength, volume, running, workout frequency and PR statistics with 1/3/6-month filters.
- Versioned local JSON backup, share fallback, previewed Merge/Replace restore, atomic imports and Google Drive `drive.file` integration.
- Fully on-device monthly PDF report with tables, comparisons, factual summary and charts.
- Installable manifest, original HT icon set, offline precache, service-worker update prompt and safe-area-aware portrait/landscape layouts.

## Architecture

The application deliberately has no backend.

```text
src/
  components/       reusable shell, modal, timer, status and error UI
  data/             Dexie database, seed programme and transactional repository
  domain/           pure calculations, backup merge and session-order rules
  pages/            route-level product workflows
  services/         local backup, Google Drive, notifications and PDF reports
  state/            small transient Zustand UI store
  test/             browser-like Vitest setup
e2e/                Playwright critical journeys
```

UI components never own authoritative training calculations. Formulae and integrity rules live in `src/domain`; IndexedDB reads/writes are concentrated in `src/data`; browser integrations live in `src/services`.

### IndexedDB schema

`HybridTrackerDatabase` currently uses schema version 3. Dexie migrations preserve prior records and add indexes without rewriting historical snapshots.

| Table | Purpose and important links |
| --- | --- |
| `exercises` | Editable global exercise definitions and archived state |
| `routines` | Gym/run templates |
| `routineExercises` | Ordered routine prescriptions; links routine to exercise |
| `scheduledWorkouts` | Date, kind and pending/in-progress/completed/skipped state |
| `sessions` | Gym session header and completion ratings; links to schedule |
| `sessionExercises` | Immutable prescription snapshot with planned and performed exercise IDs |
| `sets` | Working sets linked to a session exercise, including side and pull-up breakdown |
| `runs` | Official total-activity run record and optional interval rows |
| `weights` | One body-weight record per local date |
| `recommendations` | Recalculable progression result plus user decision |
| `personalRecords` | Recalculable estimated-1RM record history |
| `settings` | Goal weight, onboarding, notifications and interval plan |
| `backupMetadata` | Safe Google Drive file metadata and timestamps only |
| `restTimers` | Absolute target timestamp or paused seconds |

Every record uses a stable ID and ISO `createdAt`/`updatedAt` timestamps. Calendar dates are stored as local `yyyy-MM-dd` values so a UTC conversion cannot move a workout to another day. Session exercises and sets are snapshots: later routine edits cannot rewrite history.

## Data and backup behavior

IndexedDB is authoritative and saves after every meaningful action. Derived statistics and PR indexes can be rebuilt from source sets/runs/weights.

Local backups are versioned JSON files named like `hybrid-tracker-backup-2026-07-16.json`. Restore validates the top-level schema and relationships before any write. Merge uses stable IDs, chooses the newest `updatedAt` on a conflict and runs in one transaction. Replace requires a second confirmation and is also atomic.

Deleting all local data requires a warning, typing `DELETE`, and final confirmation. It does not delete a Drive backup. The default programme is reseeded afterward.

## Google Drive setup

Drive is optional. The app uses Google Identity Services and the Google Drive API directly in the browser with the least-permissive practical scope, `https://www.googleapis.com/auth/drive.file`. There is no client secret and no Hybrid Tracker account.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Under **APIs & Services → Library**, enable **Google Drive API**.
3. Under **Google Auth Platform / OAuth consent screen**, configure the app name and support email. For an External app in testing, add your Google account as a test user.
4. Under **Clients / Credentials**, create an **OAuth client ID** with application type **Web application**.
5. Add every development origin you actually use under **Authorized JavaScript origins**, for example `http://localhost:5173` and `http://127.0.0.1:4173`. Origins contain no path.
6. Add the final HTTPS production origin, for example `https://hybrid-tracker.pages.dev`.
7. Copy `.env.example` to `.env` and set:

   ```dotenv
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   ```

8. Restart the dev server, open **Settings → Backup and restore**, connect Drive, create a backup, then test restore in **Merge** mode first.

The first backup creates `HybridTrackerBackup.json`; later backups update the same Drive file ID. If local metadata is missing, the adapter searches for the exact app-created filename. OAuth tokens are held only in memory; reconnect after a full browser restart when requested. If no client ID is configured, Settings shows a setup-required state and all local features continue working.

Never commit `.env` or any credential. A web OAuth client ID is intentionally public; a client secret must never be added to this frontend.

## Static deployment

### Cloudflare Pages

1. Push this directory to a Git repository.
2. Create a Pages project with build command `npm run build` and output directory `dist`.
3. Add `VITE_GOOGLE_CLIENT_ID` as a production environment variable only if Drive is enabled.
4. Deploy, then add the exact generated HTTPS origin to the Google OAuth client.

The Vite base is relative (`./`), so the generated assets work at a static host root or subpath. The host must serve `index.html` for unknown navigation paths if direct deep links are expected. HTTPS is required for service workers, installation, notifications and Google OAuth outside localhost.

## Install on iPhone

1. Deploy or open Hybrid Tracker from an HTTPS address in Safari.
2. Let the first load complete so the offline files are cached.
3. Tap Safari’s **Share** button.
4. Choose **Add to Home Screen**, keep the name **Hybrid**, and tap **Add**.
5. Launch it from the Home Screen for standalone mode.

Safari does not show the Chromium install prompt. The Share-menu flow is the supported iPhone installation path.

## Notifications and offline notes

Timer notification permission is requested only from the explicit Settings action. A denial is recorded and the app does not repeatedly prompt. iOS may suspend a PWA in the background, so a notification cannot be guaranteed at the exact finishing second. The timer itself remains accurate because it stores an absolute target timestamp; returning to the app immediately shows that rest has finished.

Google Drive needs a network connection. Workouts, runs, timers, statistics, PDF reports and local backups do not.

## Test scope

Vitest covers the Epley formula, volume multipliers, all pull-up modes, progression and increment rules, unilateral weaker-side decisions, series comparison, PR recalculation, pace and heart-rate matching, weekly rollover, backup conflict resolution, prefill/timer persistence, history snapshots, restore modes, schedule collision confirmation and incomplete-session confirmation.

Playwright contains representative iPhone portrait and landscape journeys for gym completion/persistence, easy-run pace, weight entry, local backup, occupied-date rescheduling and horizontal-overflow checks. Live Google credentials and real iPhone notification delivery are deliberately excluded from automation.
