import assert from "node:assert/strict";
import test from "node:test";
import { relativeAttitude } from "./attitude.ts";

test("level attitude is zero pitch and bank", () => {
  assert.deepEqual(relativeAttitude(10, -4, 10, -4), { pitch: 0, roll: 0 });
});

test("nose up and right bank stay inside the view", () => {
  const a = relativeAttitude(40, 80, 0, 0);
  assert.equal(a.pitch, 25);
  assert.equal(a.roll, 45);
});
