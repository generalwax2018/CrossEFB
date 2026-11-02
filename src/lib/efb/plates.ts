/**
 * FAA digital Terminal Procedures (d-TPP).
 *
 * The 28-day cycle id is the two-digit year plus the cycle number within that
 * year ("2611"). The metafile at
 * https://aeronav.faa.gov/d-tpp/{cycle}/xml_data/d-tpp_Metafile.xml lists
 * every chart by airport; PDFs live at /d-tpp/{cycle}/{pdf_name}.
 */

const DAY = 24 * 3600 * 1000;
/** Effective 0901Z 29 Oct 2026 = cycle 2611. Every cycle is 28 days. */
const REF = Date.UTC(2026, 9, 29, 9, 1);

export function dtppCycle(now = new Date(), offset = 0): string {
  const k = Math.floor((now.getTime() - REF) / (28 * DAY)) + offset;
  const eff = new Date(REF + k * 28 * DAY);
  const start = Date.UTC(eff.getUTCFullYear(), 0, 1);
  const doy = Math.floor((eff.getTime() - start) / DAY);
  const n = Math.floor(doy / 28) + 1;
  return `${String(eff.getUTCFullYear()).slice(2)}${String(n).padStart(2, "0")}`;
}

export type PlateCode = "APD" | "IAP" | "DP" | "ODP" | "STR" | "MIN" | "HOT" | "LAH" | "DAU" | string;

export type Plate = { code: PlateCode; name: string; pdf: string };

export type PlateAirport = {
  ident: string;
  icao: string;
  name: string;
  city: string;
  state: string;
  plates: Plate[];
};

export type PlateIndex = {
  cycle: string;
  from: string;
  to: string;
  byIdent: Map<string, PlateAirport>;
};

const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
const field = (rec: string, name: string) => rec.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim() ?? "";

/** Parse the metafile text. Deleted charts (useraction D) are skipped. */
export function parseMetafile(xml: string): PlateIndex {
  const head = xml.slice(0, 400);
  const byIdent = new Map<string, PlateAirport>();
  const index: PlateIndex = {
    cycle: attr(head, "cycle"),
    from: attr(head, "from_edate").replace(/\s+/g, " ").trim(),
    to: attr(head, "to_edate").replace(/\s+/g, " ").trim(),
    byIdent,
  };
  let state = "";
  let city = "";
  const re = /<state_code ID="([^"]*)"|<city_name ID="([^"]*)"|<airport_name ([^>]*)>([\s\S]*?)<\/airport_name>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[1] !== undefined) {
      state = m[1];
      continue;
    }
    if (m[2] !== undefined) {
      city = m[2];
      continue;
    }
    const tag = m[3];
    const body = m[4];
    const ident = attr(tag, "apt_ident").toUpperCase();
    const icao = attr(tag, "icao_ident").toUpperCase();
    if (!ident) continue;
    const plates: Plate[] = [];
    const recRe = /<record>([\s\S]*?)<\/record>/g;
    let r: RegExpExecArray | null;
    while ((r = recRe.exec(body))) {
      const rec = r[1];
      if (field(rec, "useraction") === "D") continue;
      const pdf = field(rec, "pdf_name");
      if (!pdf) continue;
      plates.push({ code: field(rec, "chart_code"), name: field(rec, "chart_name"), pdf });
    }
    const airport: PlateAirport = { ident, icao, name: attr(tag, "ID"), city, state, plates };
    byIdent.set(ident, airport);
    if (icao) byIdent.set(icao, airport);
  }
  return index;
}

export const PLATE_GROUPS: { id: string; label: string; codes: string[] }[] = [
  { id: "apd", label: "Airport diagram", codes: ["APD"] },
  { id: "iap", label: "Approaches", codes: ["IAP"] },
  { id: "dp", label: "Departures", codes: ["DP", "ODP"] },
  { id: "star", label: "Arrivals", codes: ["STR"] },
  { id: "min", label: "Minimums & notices", codes: ["MIN", "HOT", "LAH", "DAU"] },
];
