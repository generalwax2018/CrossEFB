import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeGroup, parseWindText, windAt } from "./winds.ts";

const SAMPLE = `
000
FBUS31 KWNO 021359
FD1US1
DATA BASED ON 021200Z    
VALID 021800Z   FOR USE 1400-2100Z. TEMPS NEG ABV 24000

FT  3000    6000    9000   12000   18000   24000  30000  34000  39000
ABR 2515 2610+09 2328+05 2423+01 2134-10 1940-21 172736 173347 224753
ACY 2208 9900+08 9900+03 2309-02 2615-14 2720-26 273243 264053 263863
DEN              3529+01 3411-03 2215-16 2314-28 213632 242736 243144
ZUN              3026-01 3131-03 3151-14 3197-20 810335 319244 294747
`;

test("decode groups", () => {
  assert.deepEqual(decodeGroup("2515", 3000), { dir: 250, spd: 15, temp: null });
  assert.deepEqual(decodeGroup("9900+08", 6000), { dir: 0, spd: 0, temp: 8 });
  assert.deepEqual(decodeGroup("172736", 30000), { dir: 170, spd: 27, temp: -36 });
  assert.deepEqual(decodeGroup("810335", 30000), { dir: 310, spd: 103, temp: -35 });
  assert.equal(decodeGroup("", 3000), null);
});

test("parse columns", () => {
  const p = parseWindText(SAMPLE);
  assert.equal(p.valid, "021800Z");
  assert.equal(p.forUse, "1400-2100Z");
  const den = p.rows.find((r) => r.id === "DEN")!;
  assert.equal(den.levels[3000], undefined);
  assert.equal(den.levels[6000], undefined);
  assert.deepEqual(den.levels[9000], { dir: 350, spd: 29, temp: 1 });
  assert.deepEqual(den.levels[12000], { dir: 340, spd: 11, temp: -3 });
  assert.deepEqual(den.levels[39000], { dir: 240, spd: 31, temp: -44 });
  const abr = p.rows.find((r) => r.id === "ABR")!;
  assert.deepEqual(abr.levels[3000], { dir: 250, spd: 15, temp: null });
  assert.deepEqual(abr.levels[6000], { dir: 260, spd: 10, temp: 9 });
  assert.equal(p.rows.length, 4);
});

test("interpolate", () => {
  const st = [{ id: "DEN", lat: 39.86, lon: -104.67, levels: { 9000: { dir: 350, spd: 20, temp: 0 }, 12000: { dir: 10, spd: 20, temp: -6 } } }];
  const w = windAt(st, 39.86, -104.67, 10500)!;
  assert.equal(w.spd, 20);
  assert.ok(w.dir === 360 || w.dir === 0 || Math.abs(w.dir - 360) <= 1, String(w.dir));
  assert.equal(w.temp, -3);
  assert.equal(windAt(st, 30, -80, 9000), null);
});

test("GFS pressure levels become altitude levels", async () => {
  const { gfsStations, windAt: at } = await import("./winds.ts");
  const pt = {
    hourly: {
      time: ["2026-11-18T21:00", "2026-11-18T22:00"],
      wind_speed_850hPa: [3.3, 1.0], wind_direction_850hPa: [301, 279], temperature_850hPa: [14.6, 15.3], geopotential_height_850hPa: [1520, 1525],
      wind_speed_700hPa: [19.6, 15.5], wind_direction_700hPa: [278, 272], temperature_700hPa: [1.1, 1.5], geopotential_height_700hPa: [3069, 3080],
      wind_speed_600hPa: [42.6, 39.8], wind_direction_600hPa: [279, 274], temperature_600hPa: [-7.7, -7.6], geopotential_height_600hPa: [4380, 4390],
    },
  };
  const st = gfsStations([pt], "2026-11-18T22", [{ lat: 39.6, lon: -104.9 }]);
  assert.equal(st.length, 1);
  assert.deepEqual(st[0].levels[10100], { dir: 272, spd: 16, temp: 1.5 });
  const w = at(st, 39.6, -104.9, 10100)!;
  assert.equal(w.spd, 16);
  assert.equal(w.dir, 272);
});
