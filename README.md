# CrossEFB

Electronic flight bag for Android, PC, and Chromebook. It runs in the browser, and it can be installed on the home screen. ForeFlight stays on Apple.

This is **not a certified EFB** and not a navigation GPS. Do not use it as a sole source for navigation. Check the official chart, the weather, and the NOTAMs before anyone flies.

## What it does

- Moving chart on the current FAA VFR sectional. The app downloads the national set from the FAA and replaces it when the 56-day edition changes. OpenStreetMap streets show only where a sheet is not on disk yet. Class B / C / D rings come from the airport catalog. Day and night chart.
- Airport search, origin, destination, stops, and direct-to. Tap the route line to insert the nearest field.
- Track uses this device's GPS: own-ship, groundspeed, track, GPS altitude, and bearing to the next fix. The screen stays awake. Drag the chart to look ahead, then follow again. The play button only previews the planned route.
- Sectional tiles already viewed stay on the device if the signal drops. The app itself still has to load once while online.
- Wind, TAS, groundspeed, magnetic course, ETE, and fuel against usable. Sunrise through civil twilight. Favored runway from the live METAR.
- Live METAR and TAF from aviationweather.gov. No sample weather.
- G-AIRMET, SIGMET, and recent PIREP overlay from the same National Weather Service feed. The chart reloads them every few minutes and names what is overhead. The cloud button hides the layer.
- One flight file from the same plan: nav log, weight and balance, takeoff and landing, briefing, risk score, checklist, logbook, and rental checkout. Sample aircraft are a 172S, 182T, PA-28-181, and SR22. Those numbers are not your POH.

Not in this app: approach plates, IFR enroute charts, terminal area charts, NOTAMs, traffic, radar, or flight-plan filing.

The shared navigation math lives in `src/lib/efb`. A native Android or desktop shell can call the same functions later. This repository is the web client.

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:8080.

Plans, aircraft, the logbook, and wind stay in the browser (`localStorage`). There is no account.
