# CrossEFB

Planning electronic flight bag for Android and PC. ForeFlight stays on Apple. CrossEFB is the chart, the flight computer, and live weather in a browser — install it on a phone, or leave it open on a desktop.

This is a **planning aid**, not a certified EFB. Do not use it as a sole source for navigation.

## What it does

- Moving chart on the current FAA VFR sectional. The app downloads the national set from the FAA and replaces it when the 56-day edition changes. OpenStreetMap streets show only where a sheet is not on disk yet. Class B / C / D rings come from the airport catalog.
- Favored runway from the live METAR, nearest airports, and sunrise through civil twilight
- Airport search, origin, destination, stops, and direct-to
- Wind, TAS, groundspeed, magnetic course, ETE, and fuel against usable
- Live METAR and TAF from aviationweather.gov (no sample weather)
- G-AIRMET, SIGMET, and recent PIREP overlay from the same National Weather Service feed. The chart reloads them every few minutes.
- Aircraft profile, day and night chart, and a simulated route preview
- Track: live own-ship from the device GPS, groundspeed, track, GPS altitude, and bearing to the next fix. The screen stays awake. Dragging the chart pauses follow. Already-viewed sectional tiles are kept for a dropped signal. This is not a certified navigation GPS.

The shared navigation math lives in `src/lib/efb`. A native Android or desktop shell can call the same functions later. This repository is the web client.

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:8080.

Plans, aircraft, and wind stay in the browser (`localStorage`). There is no account.
