# Liftlog

Offline-first gym tracker for iPhone, built as an installable PWA. React + TypeScript + Vite + Dexie (IndexedDB). No account, backend or subscription.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (phone on same Wi-Fi: use the Network URL)
npm test           # 68 tests
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/ locally
```

## Deploy (free static hosting)

iPhone installation needs **HTTPS**; localhost only works on the computer. Any static host works because the build uses relative paths (`base: './'`).

**Netlify (simplest):** run `npm run build`, open app.netlify.com/drop, drag the `dist` folder in. You get an `https://….netlify.app` URL.

**Cloudflare Pages / Vercel / GitHub Pages:** build command `npm run build`, output directory `dist`. For GitHub Pages, publish the contents of `dist` (e.g. with the `gh-pages` branch).

After deploying, open the URL once on your iPhone with internet so the service worker can cache everything.

## Install on iPhone (iOS 17/18-era Safari; same steps on iPhone 17)

1. Open the deployed `https://` URL in **Safari** (not Chrome or an in-app browser).
2. Tap the **Share** button (square with an arrow).
3. Scroll and tap **Add to Home Screen**. (On newer iOS, if you don't see it, tap **View More** first.)
4. Keep "Open as Web App" on, name it **Liftlog**, tap **Add**.
5. Launch from the Home Screen icon. Wait for the first load to finish, then try Airplane Mode: the app and your data keep working.

## Data and backups

- Everything lives in IndexedDB on the device. Weights are stored in kg; the lb/kg switch only changes display.
- **Settings → Export** writes `liftlog-backup-YYYY-MM-DD.json` (share sheet → Save to Files / iCloud Drive). **Import** validates the file first, then merges (no duplicates, newer edit wins) or replaces.
- iOS can evict website data for web apps that go unused for a long time. Home Screen apps are treated more generously, and Liftlog asks the browser to protect storage, but **keep an occasional backup**.

## Project structure

```
src/
  types.ts            data model (exercises, templates, sessions, sets, settings, timer)
  data/seed.ts        exercise library, the five-day program, defaults
  db/db.ts            Dexie schema v1 → v2 with upgrade migration
  db/repo.ts          all writes (start/finish session, sets, templates, timer, reset)
  db/backup.ts        export, validation, schema migration, merge/replace import
  engine/             progression, records, volume, recommendations, next-workout, warm-ups
  lib/                units (kg/lb), timer maths, date helpers
  components/ screens/ UI
  test/               test setup and fixtures
```

## How recommendations work

All rules run locally on your logged sets (`src/engine/`):

- **Load increase:** suggested only when every planned working set reached the top of the rep range (for 1 or 2 sessions, your setting), average RIR isn't below your minimum, and the loads matched. The jump is the exercise's practical increment (editable per exercise). Nothing changes until you tap "Use …".
- **Decline:** two consecutive drops (estimated strength, or total reps at the same load) → "review recovery before adding load".
- **Volume:** completed working sets per muscle over the last 7 days; indirect work counts as half a set. Flags muscles under 60% of plan (after two weeks of history) and weeks above 24 effective sets.
- **Recovery:** optional sleep/energy/soreness/recovery ratings; low averages suggest a lighter day. It is a training suggestion, not a medical assessment.
- Every card has a **Why?** with the numbers, and a confidence label that says when history is thin.

## Known limitations

- iOS web apps cannot sound alarms or send notifications while locked or backgrounded without a push server. The rest timer is clock-based, so it is always correct when you return, but it only beeps while the app is open. Vibration is not available to web apps on iPhone.
- Layout was verified by static checks and DOM tests, not on a real iPhone (see TEST-RESULTS.txt). Please do a quick visual pass on your device.
