import { test } from "node:test";
import assert from "node:assert/strict";
import { isImportant, mapNotamItem, notamKeyword, sortNotams } from "./notams.ts";

test("keyword and importance", () => {
  assert.equal(notamKeyword("!APA 10/123 APA RWY 17L/35R CLSD 2610311400-2611012200"), "RWY");
  assert.equal(notamKeyword("!APA 10/124 APA OBST TOWER LGT (ASR 1234) 393000N1045000W 6200FT U/S"), "OBST");
  assert.equal(isImportant("APA RWY 17L/35R CLSD"), true);
  assert.equal(isImportant("APA TWY A EDGE LGT U/S"), true);
  assert.equal(isImportant("APA AD AP WINDCONE FOR RWY 28 NOT STD"), false);
});

test("map item and sort", () => {
  const item = {
    properties: {
      coreNOTAMData: {
        notam: { id: "NOTAM_1", number: "10/123", location: "APA", icaoLocation: "KAPA", effectiveStart: "2026-10-31T14:00:00.000Z", effectiveEnd: "2026-11-01T22:00:00.000Z", text: "RWY 17L/35R CLSD" },
        notamTranslation: [{ type: "LOCAL_FORMAT", simpleText: "!APA 10/123 APA RWY 17L/35R CLSD 2610311400-2611012200" }],
      },
    },
  };
  const n = mapNotamItem(item)!;
  assert.equal(n.location, "KAPA");
  assert.equal(n.keyword, "RWY");
  assert.equal(n.important, true);
  const other = { ...n, id: "2", keyword: "COM", important: false };
  assert.deepEqual(sortNotams([other, n]).map((x) => x.id), ["NOTAM_1", "2"]);
  assert.equal(mapNotamItem({}), null);
});
