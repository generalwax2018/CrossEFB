import { test } from "node:test";
import assert from "node:assert/strict";
import { crc16, decode, decodeDatagram, deframe, frame, type TrafficTarget } from "./gdl90.ts";

const hex = (s: string) => Uint8Array.from(s.trim().split(/\s+/).map((h) => parseInt(h, 16)));

test("heartbeat example from the GDL 90 spec (CRC 0x8BB3)", () => {
  const data = hex("7E 00 81 41 DB D0 08 02 B3 8B 7E");
  assert.equal(crc16(hex("00 81 41 DB D0 08 02")), 0x8bb3);
  const msgs = decodeDatagram(data);
  assert.equal(msgs.length, 1);
  assert.deepEqual(msgs[0], { kind: "heartbeat", gpsValid: true, uatInitialized: true });
});

test("traffic report example from the GDL 90 spec", () => {
  const msg = hex("14 00 AB 45 49 1F EF 15 A8 89 78 0F 09 A9 07 B0 01 20 01 4E 38 32 35 56 20 20 20 00");
  const t = decode(msg) as TrafficTarget;
  assert.equal(t.kind, "traffic");
  assert.equal(t.address, "AB4549");
  assert.ok(Math.abs(t.lat - 44.90708) < 1e-4, String(t.lat));
  assert.ok(Math.abs(t.lon - -122.99488) < 1e-4, String(t.lon));
  assert.equal(t.altFt, 5000);
  assert.equal(t.airborne, true);
  assert.equal(t.nic, 10);
  assert.equal(t.nacp, 9);
  assert.equal(t.gsKt, 123);
  assert.equal(t.vsFpm, 64);
  assert.ok(Math.abs((t.track ?? 0) - 45) < 0.01, String(t.track));
  assert.equal(t.emitter, 1);
  assert.equal(t.callsign, "N825V");
});

test("framing round trip with escaped bytes and bad CRC rejection", () => {
  const msg = Uint8Array.from([11, 0x7e, 0x7d, 0x00, 0x0a]);
  const framed = frame(msg);
  assert.ok(framed.includes(0x7d));
  assert.deepEqual([...deframe(framed)[0]], [...msg]);
  const bad = framed.slice();
  bad[2] ^= 0xff;
  assert.equal(deframe(bad).length, 0);
  const geo = decode(Uint8Array.from([11, 0x03, 0xe8, 0x00, 0x0a]));
  assert.deepEqual(geo, { kind: "geoalt", altFt: 5000, vfom: 10 });
});

test("two messages in one datagram", () => {
  const hb = hex("00 81 41 DB D0 08 02");
  const both = Uint8Array.from([...frame(hb), ...frame(hb)]);
  assert.equal(decodeDatagram(both).length, 2);
});
