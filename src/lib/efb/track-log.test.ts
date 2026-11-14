import assert from "node:assert/strict";
import test from "node:test";
import { trackHours } from "./track-log.ts";

test("airborne points set the hours", () => {
  const out = trackHours([
    { t: 0, lat: 39, lon: -104, altFt: 5000, gsKt: 0 },
    { t: 60_000, lat: 39.1, lon: -104, altFt: 7000, gsKt: 90 },
    { t: 31 * 60_000, lat: 39.5, lon: -104, altFt: 7000, gsKt: 90 },
  ]);
  assert.ok(out);
  assert.equal(out.hours, 0.5);
  assert.equal(out.from.lat, 39.1);
});

test("a one-minute track is ignored", () => {
  assert.equal(
    trackHours([
      { t: 0, lat: 39, lon: -104, altFt: null, gsKt: 10 },
      { t: 30_000, lat: 39, lon: -104, altFt: null, gsKt: 10 },
    ]),
    null,
  );
});
