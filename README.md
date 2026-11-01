# CrossEFB

Planning electronic flight bag for Android and PC. ForeFlight stays on Apple. CrossEFB is the chart, the flight computer, and live weather in a browser — install it on a phone, or leave it open on a desktop.

This is a **planning aid**, not a certified EFB. Do not use it as a sole source for navigation.

## What it does

- Moving chart with public US airports (planning data, not a chart supplement), plus Class B / C / D rings where the catalog has them
- Airport search, origin, destination, stops, and direct-to
- Wind, TAS, groundspeed, magnetic course, ETE, and fuel against usable
- Live METAR and TAF from aviationweather.gov (no sample weather)
- Aircraft profile, day and night chart, geolocation, and a simulated fly-along

The shared navigation math lives in `src/lib/efb`. A native Android or desktop shell can call the same functions later. This repository is the web client.

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:8080.

Plans, aircraft, and wind stay in the browser (`localStorage`). There is no account.
