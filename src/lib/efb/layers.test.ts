import { test } from "node:test";
import assert from "node:assert/strict";
import { RADAR_LAYER, SECTIONAL_LAYER, layerTiles, layerVisible, sniffImage } from "./layers.ts";

test("sniff tile bytes, not the FAA's octet-stream header", () => {
  assert.equal(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "image/jpeg");
  assert.equal(sniffImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])), "image/png");
  assert.equal(sniffImage(new TextEncoder().encode("<!DOCTYPE html><html>")), null);
});

test("zoomed far out, a chart layer draws nothing instead of hundreds of tiles", () => {
  assert.equal(layerTiles(SECTIONAL_LAYER, 39.7, -104.9, 1200, 800, 0.4).length, 0);
  assert.equal(layerVisible(SECTIONAL_LAYER, 0.4, 39.7), false);
  const near = layerTiles(SECTIONAL_LAYER, 39.7, -104.9, 1200, 800, 4);
  assert.ok(near.length > 0 && near.length <= 96);
  assert.ok(near.every((t) => t.z >= 8 && t.z <= 12));
  assert.ok(layerTiles(RADAR_LAYER, 39.7, -104.9, 1200, 800, 0.4).length > 0);
});
