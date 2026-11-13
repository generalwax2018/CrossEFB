# CrossEFB

Electronic flight bag for Android, PC, and Chromebook. It runs in the browser, installs on the home screen, and has an optional Android shell for ADS-B. ForeFlight stays on Apple.

This is **not a certified EFB** and not a navigation GPS. Do not use it as a sole source for navigation. Check the official chart, the weather, and the NOTAMs before anyone flies.

## What it does

**Charts**
- FAA VFR sectional (downloaded from the FAA and replaced each 56-day edition), plus Terminal Area, IFR Low, and IFR High from the FAA chart tile service. Class B/C/D rings from the airport catalog.
- Approach plates, airport diagrams, departures, arrivals, and minimums from the FAA d-TPP, shown in the app with pdf.js, including night colors.
- Five display modes: Night, Day, Red, Green, and Haze (high-contrast yellow).

**Weather and airspace**
- Live METAR/TAF and flight-category dots for every reporting airport in view (aviationweather.gov).
- NEXRAD radar, G-AIRMET, SIGMET, and PIREP overlays.
- TFRs from tfr.faa.gov, drawn on the chart and checked against the route.
- NOTAMs only if the person hosting this copy adds their own FAA API keys (see below). There is no key in this repository.
- Forecast wind is a manual entry. The NWS ended the FB winds-aloft tables on 3 Nov 2026.

**Flying**
- GPS track with own-ship, groundspeed, track, altitude, next fix, desired track, distance, and ETE. Screen stays awake.
- ADS-B traffic and receiver GPS from GDL 90 receivers (Stratux, Sentry, …) through the Android shell in `android-shell/`.
- No-wind glide range ring and an emergency Nearest list with Direct-To.

**Planning and records**
- Route by search, tap, or typed string; saved plans; your own aircraft profiles.
- Flight file: nav log, weight and balance, takeoff and landing, briefing with a go/no-go summary, risk score, checklist, logbook, and rental checkout. The logbook is a working copy: print it and write on the blank lines, or export a CSV. It does not replace the official book. Instructor mode keeps a student roster on this device and tags dual given and ground to each student.
- Offline: save route charts and plates, or a whole map area; the app shell opens without signal.
- End-to-end encrypted sync between devices with a sync code, plus backup/restore to a file.
- Data sources panel showing the edition or fetch time of every feed.

Not in this app: flight-plan filing (it hands off to 1800wxbrief), terrain/synthetic vision.

## Run

```bash
npm install
npm run dev        # http://127.0.0.1:8080
npm run test:efb   # flight-logic unit tests
npm run build
```

### Server environment

The repository does not include an FAA key. Each person who hosts CrossEFB adds their own. Pilots using a hosted copy never type a key into the app.

| Variable | Who sets it | Purpose |
| --- | --- | --- |
| `FAA_NOTAM_CLIENT_ID`, `FAA_NOTAM_CLIENT_SECRET` | The host | That host's FAA NOTAM API credentials. NOTAMs stay off until both are set. |
| `FAA_NOTAM_API_URL` | The host, optional | Endpoint override, for a later FAA interface. |
| `DATABASE_URL` | The host, optional | Postgres for encrypted sync. Without it a local database is used. |

Copy `.env.example` and fill it in on the machine or in the host's settings. Never commit the filled-in file, and never put a key in an issue, a screenshot, or a chat.

Register for the API with the FAA. CrossEFB cannot share one key across other people's servers. Charts, weather, plates, and TFRs do not use this key.

### Sync privacy

The sync code never leaves the device. The server stores a SHA-256 of the code as the row id and AES-GCM ciphertext made on the device, so it cannot read plans, aircraft, or the logbook.

## Code map

- `src/lib/efb` — navigation math, parsers (winds aloft, GDL 90, d-TPP, NOTAMs), stores, and tests.
- `src/components/efb` — the UI.
- `src/routes/api` — server routes for charts, weather, TFRs, plates, NOTAMs, and sync.
- `android-shell/` — Capacitor app that forwards ADS-B packets. See its README.

## License

[MIT](LICENSE). Copyright 2026 Michael Waxman.
