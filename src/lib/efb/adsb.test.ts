import assert from "node:assert/strict";
import test from "node:test";
import { stratuxOwnship, stratuxTargets } from "./stratux.ts";

test("stratux traffic rows become targets", () => {
  const parsed = stratuxTargets(
    { abc: { Icao_addr: 123, Lat: 39.5, Lng: -104.8, Alt: 7500, Track: 180, Speed: 110, Tail: "N123" } },
    1,
  );
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].callsign, "N123");
  assert.equal(parsed[0].altFt, 7500);
});

test("stratux situation becomes ownship", () => {
  const own = stratuxOwnship({ GPSLatitude: 39.5, GPSLongitude: -104.8, GPSAltitudeMSL: 6000, GPSGroundSpeed: 90, GPSTrueCourse: 12, GPSFixQuality: 2 }, 1);
  assert.ok(own);
  assert.equal(own.gsKt, 90);
});
