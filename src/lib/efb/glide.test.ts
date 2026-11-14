import assert from "node:assert/strict";
import test from "node:test";
import { firstTerrainConflict, glideRing, offsetNm } from "./glide.ts";

test("still-air glide distance", () => {
  const g = glideRing({ altFt: 9000, groundFt: 3000, ratio: 9, windFromDeg: 0, windKt: 0, glideKt: 70 });
  assert.ok(g);
  assert.ok(Math.abs(g.nm - (6000 * 9) / 6076) < 0.01);
  assert.equal(g.driftNm, 0);
});

test("wind shifts the ring downwind and will not exceed the glide speed", () => {
  const g = glideRing({ altFt: 9000, groundFt: 3000, ratio: 9, windFromDeg: 270, windKt: 20, glideKt: 70 });
  assert.ok(g);
  assert.equal(g.blowToDeg, 90);
  assert.ok(Math.abs(g.driftNm - (20 / 70) * g.nm) < 0.01);
});

test("too low to draw a ring", () => {
  assert.equal(glideRing({ altFt: 5400, groundFt: 5300, ratio: 9, windFromDeg: 0, windKt: 0, glideKt: 70 }), null);
});

test("offset moves north", () => {
  const p = offsetNm(40, -105, 0, 60);
  assert.ok(Math.abs(p.lat - 41) < 0.001);
  assert.ok(Math.abs(p.lon + 105) < 0.001);
});

test("terrain above the glide path is the nearest conflict", () => {
  const hit = firstTerrainConflict(9000, 9, [
    { nm: 6, elevFt: 4000 },
    { nm: 2, elevFt: 8500 },
  ]);
  assert.ok(hit);
  assert.equal(hit.nm, 2);
  assert.ok(hit.pathFt < 8500);
});

test("clear terrain is not a conflict", () => {
  assert.equal(firstTerrainConflict(9000, 9, [{ nm: 2, elevFt: 5000 }]), null);
});
