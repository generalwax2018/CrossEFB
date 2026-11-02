import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeStates, newSyncCode, normalizeCode, openState, sealState, syncId } from "./sync.ts";

test("codes", () => {
  const c = newSyncCode();
  assert.match(c, /^[A-Z0-9]{4}(-[A-Z0-9]{1,4}){6}$/);
  assert.equal(normalizeCode(c.toLowerCase().replace(/-/g, " ")), c);
  assert.equal(normalizeCode("too short"), null);
  assert.notEqual(newSyncCode(), c);
});

test("seal and open round trip; wrong code fails", async () => {
  const code = newSyncCode();
  const blob = await sealState(code, { route: ["KAPA", "KBJC"] });
  const opened = await openState(code, blob);
  assert.deepEqual(opened.state, { route: ["KAPA", "KBJC"] });
  await assert.rejects(openState(newSyncCode(), blob));
  assert.equal((await syncId(code)).length, 64);
  assert.notEqual(await syncId(code), await syncId(newSyncCode()));
});

test("merge unions lists and lets the newer copy win settings", () => {
  const local = { route: ["KAPA"], logbook: [{ id: "a" }, { id: "b" }], plans: [], myAircraft: [{ profileId: "my-1" }] };
  const remote = { route: ["KDEN"], logbook: [{ id: "b" }, { id: "c" }], plans: [{ id: "p" }], myAircraft: [] };
  const m = mergeStates(local, remote, true);
  assert.deepEqual(m.route, ["KDEN"]);
  assert.deepEqual((m.logbook as { id: string }[]).map((x) => x.id).sort(), ["a", "b", "c"]);
  assert.equal((m.plans as unknown[]).length, 1);
  assert.equal((m.myAircraft as unknown[]).length, 1);
  assert.deepEqual(mergeStates(local, remote, false).route, ["KAPA"]);
});
