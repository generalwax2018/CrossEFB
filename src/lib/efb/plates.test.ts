import { test } from "node:test";
import assert from "node:assert/strict";
import { dtppCycle, parseMetafile } from "./plates.ts";

const XML = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>\r
<digital_tpp cycle="2611" from_edate="0901Z  10/29/26" to_edate="0901Z  11/26/26">\r
  <state_code ID="CO" state_fullname="COLORADO">\r
    <city_name ID="DENVER" volume="SW-1">\r
      <airport_name ID="CENTENNIAL" military="N" apt_ident="APA" icao_ident="KAPA" alnum="5715">\r
        <record>\r
          <chartseq>10100</chartseq>\r
          <chart_code>MIN</chart_code>\r
          <chart_name>TAKEOFF MINIMUMS</chart_name>\r
          <useraction></useraction>\r
          <pdf_name>SW1TO.PDF</pdf_name>\r
        </record>\r
        <record>\r
          <chart_code>IAP</chart_code>\r
          <chart_name>ILS OR LOC RWY 35R</chart_name>\r
          <useraction></useraction>\r
          <pdf_name>05715IL35R.PDF</pdf_name>\r
        </record>\r
        <record>\r
          <chart_code>IAP</chart_code>\r
          <chart_name>OLD ONE</chart_name>\r
          <useraction>D</useraction>\r
          <pdf_name>05715OLD.PDF</pdf_name>\r
        </record>\r
        <record>\r
          <chart_code>APD</chart_code>\r
          <chart_name>AIRPORT DIAGRAM</chart_name>\r
          <useraction></useraction>\r
          <pdf_name>05715AD.PDF</pdf_name>\r
        </record>\r
      </airport_name>\r
    </city_name>\r
    <city_name ID="ERIE" volume="SW-1">\r
      <airport_name ID="ERIE MUNI" military="N" apt_ident="EIK" icao_ident="" alnum="1">\r
        <record>\r
          <chart_code>IAP</chart_code>\r
          <chart_name>RNAV (GPS) RWY 33</chart_name>\r
          <useraction></useraction>\r
          <pdf_name>00001R33.PDF</pdf_name>\r
        </record>\r
      </airport_name>\r
    </city_name>\r
  </state_code>\r
</digital_tpp>`;

test("parse metafile", () => {
  const idx = parseMetafile(XML);
  assert.equal(idx.cycle, "2611");
  assert.equal(idx.from, "0901Z 10/29/26");
  const apa = idx.byIdent.get("KAPA")!;
  assert.equal(apa, idx.byIdent.get("APA"));
  assert.equal(apa.city, "DENVER");
  assert.equal(apa.state, "CO");
  assert.deepEqual(apa.plates.map((p) => p.pdf), ["SW1TO.PDF", "05715IL35R.PDF", "05715AD.PDF"]);
  const eik = idx.byIdent.get("EIK")!;
  assert.equal(eik.city, "ERIE");
  assert.equal(eik.plates.length, 1);
});

test("cycle ids", () => {
  assert.equal(dtppCycle(new Date("2026-11-02T00:00:00Z")), "2611");
  assert.equal(dtppCycle(new Date("2026-10-29T08:00:00Z")), "2610");
  assert.equal(dtppCycle(new Date("2026-11-26T10:00:00Z")), "2612");
  assert.equal(dtppCycle(new Date("2027-01-21T10:00:00Z")), "2701");
  assert.equal(dtppCycle(new Date("2026-11-02T00:00:00Z"), -1), "2610");
});
