import { test } from "node:test";
import assert from "node:assert/strict";
import { currency, goNoGo, logbookCsv } from "./brief.ts";
import { tfrsOnRoute } from "./live.ts";

const log = (date: string, dayLdg: number, nightLdg: number) => ({
  id: date, date, from: "KAPA", to: "KAPA", total: 1, night: 0, approaches: 0, dayLdg, nightLdg, pic: "Self", remarks: "", tail: "N1",
  studentId: "", student: "", dual: 0, ground: 0,
});

test("passenger currency", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  const items = currency([log("2026-10-20", 2, 0), log("2026-09-01", 1, 3)], { name: "", flightReview: "2025-03-15", medicalExpires: "2026-01-01", xwindMin: 12 }, now);
  const get = (id: string) => items.find((i) => i.id === id)!;
  assert.equal(get("day").ok, true);
  assert.match(get("day").detail, /2026-11-30/);
  assert.equal(get("night").ok, true);
  assert.equal(get("review").ok, true);
  assert.match(get("review").detail, /2027-03-31/);
  assert.equal(get("medical").ok, false);
});

test("csv escapes", () => {
  const csv = logbookCsv([{ ...log("2026-10-20", 1, 0), remarks: 'Pattern, "busy"' }]);
  assert.match(csv, /"Pattern, ""busy"""/);
});

test("tfr on route", () => {
  const square: [number, number][] = [[-105, 39.6], [-104.8, 39.6], [-104.8, 39.8], [-105, 39.8], [-105, 39.6]];
  const t = { id: "6/1234", type: "VIP", title: "x", state: "CO", rings: [square], link: "" };
  assert.equal(tfrsOnRoute([t], [{ lat: 39.5, lon: -104.9 }, { lat: 40.0, lon: -104.9 }]).length, 1);
  assert.equal(tfrsOnRoute([t], [{ lat: 39.5, lon: -105.3 }, { lat: 40.0, lon: -105.3 }]).length, 0);
});

test("go no-go", () => {
  const base = {
    originId: "KAPA", destId: "KBJC", originCat: "VFR", destCat: "VFR", surfaceWind: 8, crosswind: 4, maxXwind: 15, personalXwind: 12,
    fuelLeftGal: 30, reserveGal: 4.3, wbOk: true, wbReason: "inside", toMargin: 3, densityAlt: 6000, night: false, tfrIds: [], currency: [], passengers: false, notamsChecked: true,
  };
  assert.equal(goNoGo(base).verdict, "go");
  assert.equal(goNoGo({ ...base, destCat: "IFR" }).verdict, "nogo");
  assert.equal(goNoGo({ ...base, crosswind: 13 }).verdict, "caution");
  assert.equal(goNoGo({ ...base, tfrIds: ["6/1"] }).verdict, "nogo");
});

test("notam closures and unchecked notams caution", () => {
  const base = {
    originId: "KAPA", destId: "KBJC", originCat: "VFR", destCat: "VFR", surfaceWind: 8, crosswind: 4, maxXwind: 15, personalXwind: 12,
    fuelLeftGal: 30, reserveGal: 4.3, wbOk: true, wbReason: "inside", toMargin: 3, densityAlt: 6000, night: false, tfrIds: [], currency: [], passengers: false,
  };
  assert.equal(goNoGo(base).verdict, "caution");
  const r = goNoGo({ ...base, notamsChecked: true, notamAlerts: ["KBJC: RWY 12L/30R CLSD"] });
  assert.equal(r.verdict, "caution");
  assert.ok(r.items.some((i) => i.text.includes("RWY 12L/30R CLSD")));
});
