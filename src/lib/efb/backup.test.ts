import { test } from "node:test";
import assert from "node:assert/strict";
import { backupState, pickBackup } from "./backup.ts";

test("backup drops the sync code", () => {
  const out = backupState({ route: ["KAPA"], syncKey: "secret-code", chartMode: "night" });
  assert.equal("syncKey" in out, false);
  assert.deepEqual(out.route, ["KAPA"]);
});

test("restore keeps known fields and drops anything else", () => {
  const picked = pickBackup({
    syncKey: "should-not-return",
    route: ["kapa", "kbjc"],
    chartMode: "red",
    fuelGal: 30,
    evil: { __proto__: true },
    tab: "docs",
    lat: 1,
    logbook: [
      { id: "a", date: "2026-10-01", from: "KAPA", to: "KBJC", total: 1.2, nightLdg: 2, nightFullStop: 1, remarks: "ok" },
      { id: "", date: "nope" },
    ],
  });
  assert.equal("syncKey" in picked, false);
  assert.equal("evil" in picked, false);
  assert.equal("lat" in picked, false);
  assert.equal("tab" in picked, false);
  assert.deepEqual(picked.route, ["KAPA", "KBJC"]);
  assert.equal(picked.chartMode, "red");
  assert.equal(picked.fuelGal, 30);
  assert.equal(picked.logbook?.length, 1);
  assert.equal(picked.logbook?.[0].nightFullStop, 1);
});

test("restore rejects a bad chart mode", () => {
  assert.equal(pickBackup({ chartMode: "nope" }).chartMode, undefined);
});
