# CrossEFB

Electronic flight bag for a computer browser, in **beta**. It is a planning aid. It is **not for flight**. It is not a certified EFB and not a navigation GPS. Do not use it in the airplane, and do not use it as a sole source. Check the official chart, the weather, and the NOTAMs before anyone flies. A phone browser can open it, but there is no store app yet. An optional Android shell for ADS-B is in `android-shell/`.

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
- Forecast wind is typed in, or taken from the old FB tables where a region still publishes them. The CONUS tables ended on 3 Nov 2026. The official replacement is the [GFA wind chart](https://aviationweather.gov/gfa/). The nav log can copy a draft plan. See [Flight plan filing](#flight-plan-filing). This app does not file.

**Flying**
- GPS track with own-ship, groundspeed, track, altitude, next fix, desired track, distance, and ETE. Screen stays awake.
- The phone browser can plan and look at the chart. There is no Play Store app yet. ADS-B on a phone needs the Android shell in `android-shell/`, which you build in Android Studio. A secure website cannot open a receiver on the airplane Wi-Fi.
- ADS-B traffic and receiver GPS from GDL 90 receivers (Stratux, Sentry, …) through that Android shell. On an insecure page, a Stratux at 192.168.10.1 is read directly.
- Glide ring uses the wind on the plan and the highest terrain sampled under you. Still an aid, not a terrain warning.
- A terrain tint and a wings-level view of the ground ahead. Not synthetic vision: there is no pitch or bank.

**Planning and records**
- Route by search, tap, or typed string; saved plans; your own aircraft profiles.
- Flight file: nav log, weight and balance, takeoff and landing, briefing with a go/no-go summary, risk score, checklist, logbook, and rental checkout. The logbook is a working copy: print it and write on the blank lines, or export a CSV. It does not replace the official book. Instructor mode keeps a student roster on this device and tags dual given and ground to each student.
- Offline: save route charts and plates, or a whole map area; the app shell opens without signal.
- End-to-end encrypted sync between devices with a sync code, plus backup/restore to a file.
- Data sources panel showing the edition or fetch time of every feed.

Not in this app: submitting a flight plan to Leidos, certified synthetic vision, and a store-installed phone app. Copy the draft and file it yourself at [1800wxbrief](https://www.1800wxbrief.com/).

## Flight plan filing

CrossEFB does **not** file flight plans. **Copy flight plan** on the nav log writes a draft you paste into [1800wxbrief.com](https://www.1800wxbrief.com/), or read to a briefer at 1-800-WX-BRIEF. That site is the official US flight service, run by Leidos. Filing there is free and needs the pilot's own account. The draft is a head start. It is not a complete plan: fuel on board, aircraft color, the pilot's name and phone, and a real equipment code are still filled in there. The draft says it is not a filed plan.

Leidos will not accept a filing sent by this app. Their web service can file, amend, activate, close, and cancel a plan, but only for a vendor they have approved. That is not set up. It would take all of the following, and none of them are in the repository:

1. The person who hosts CrossEFB signs Leidos's terms and receives a vendor username and password. Those stay on the server. They are never committed.
2. The pilot has a free 1800wxbrief account.
3. The pilot turns this app on under Account, then Service Provider Authorization. Leidos rejects the request if they have not.
4. The app sends that pilot's username plus a complete plan. A domestic plan is enough inside the US. An ICAO plan is required when the flight leaves US airspace, goes over water, or needs performance-based routing.

Until that vendor account exists, do not add a File button that pretends to submit.

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

Copyright 2026 Michael Waxman.

CrossEFB is free software under the [GNU Affero General Public License v3.0](LICENSE). You may use, change, and share it, including as a hosted app. If you run a changed copy for other people, you must offer them the source of that version under the same license. There is no warranty.

Source for this copy: https://github.com/generalwax2018/CrossEFB
