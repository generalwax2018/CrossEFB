import assert from "node:assert/strict";
import test from "node:test";
import { terrariumFeet, tileOf } from "./terrain.ts";

test("sea-level terrarium pixel is about zero feet", () => {
  assert.ok(Math.abs(terrariumFeet(128, 0, 0)) < 1);
});

test("one meter of terrarium height is about three feet", () => {
  const ft = terrariumFeet(128, 1, 0);
  assert.ok(ft > 3 && ft < 3.5);
});

test("tile of a known point stays inside the world", () => {
  const t = tileOf(39.57, -104.85, 8);
  assert.equal(t.x >= 0 && t.x < 256, true);
  assert.equal(t.y >= 0 && t.y < 256, true);
  assert.equal(t.px >= 0 && t.px < 256, true);
});
