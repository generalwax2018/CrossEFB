/**
 * Winds and temperatures aloft (the FAA "FB" product, formerly FD).
 *
 * The text comes from aviationweather.gov/api/data/windtemp. Columns are
 * fixed width and blank where a level is below the station, so the header
 * row decides where each level's group starts.
 *
 *   FT  3000    6000    9000   12000   18000   24000  30000  34000  39000
 *   DEN              3529+01 3411-03 2215-16 2314-28 213632 242736 243144
 */

export type WindCell = { dir: number; spd: number; temp: number | null };

export type WindStation = {
  id: string;
  lat: number;
  lon: number;
  /** Altitude in feet → wind. Missing levels are absent. */
  levels: Record<number, WindCell>;
};

export type WindPack = {
  stations: WindStation[];
  valid: string;
  forUse: string;
  fetchedAt: string | null;
  stale: boolean;
  /** Set when the forecast product itself is unavailable, not just a slow fetch. */
  note?: string;
};

export const emptyWinds: WindPack = { stations: [], valid: "", forUse: "", fetchedAt: null, stale: false };

/** Decode one group such as "2715", "2715+08", "271534" or "9900". */
export function decodeGroup(group: string, altFt: number): WindCell | null {
  const g = group.trim();
  if (!/^\d{4}([+-]\d{2}|\d{2})?$/.test(g)) return null;
  let dd = Number(g.slice(0, 2));
  let ff = Number(g.slice(2, 4));
  let temp: number | null = null;
  const t = g.slice(4);
  if (t) {
    const n = Number(t.replace("+", ""));
    // Above 24,000 ft the sign is omitted and temperatures are negative.
    temp = t.startsWith("+") || t.startsWith("-") ? n : altFt > 24000 ? -n : n;
  }
  if (dd === 99 && ff === 0) return { dir: 0, spd: 0, temp };
  if (dd >= 51 && dd <= 86) {
    dd -= 50;
    ff += 100;
  }
  if (dd < 1 || dd > 36) return null;
  return { dir: dd * 10, spd: ff, temp };
}

/** Parse the full text product into rows keyed by station identifier. */
export function parseWindText(text: string): { rows: { id: string; levels: Record<number, WindCell> }[]; valid: string; forUse: string } {
  const lines = text.replace(/\r/g, "").split("\n");
  const rows: { id: string; levels: Record<number, WindCell> }[] = [];
  let cols: { alt: number; start: number; end: number }[] = [];
  let valid = "";
  let forUse = "";
  for (const line of lines) {
    const v = line.match(/VALID\s+(\d{6}Z)/);
    if (v && !valid) valid = v[1];
    const u = line.match(/FOR USE\s+(\d{4}-\d{4}Z)/);
    if (u && !forUse) forUse = u[1];
    if (line.startsWith("FT")) {
      // Each group is right-aligned under its altitude label.
      cols = [];
      const re = /\d{4,5}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line))) {
        const end = m.index + m[0].length;
        cols.push({ alt: Number(m[0]), start: Math.max(3, end - 7), end });
      }
      continue;
    }
    if (!cols.length) continue;
    const id = line.slice(0, 3).trim();
    if (!/^[A-Z0-9]{3}$/.test(id) || line.length < 8) continue;
    const levels: Record<number, WindCell> = {};
    for (const c of cols) {
      const tokens = line.slice(c.start, c.end).trim().split(/\s+/);
      const cell = decodeGroup(tokens[tokens.length - 1] ?? "", c.alt);
      if (cell) levels[c.alt] = cell;
    }
    if (Object.keys(levels).length) rows.push({ id, levels });
  }
  return { rows, valid, forUse };
}

const R_NM = 3440.065;

function distNm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toR = Math.PI / 180;
  const dLat = (bLat - aLat) * toR;
  const dLon = (bLon - aLon) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toR) * Math.cos(bLat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Wind at one station and altitude, interpolated between reported levels. */
function stationAt(st: WindStation, altFt: number): WindCell | null {
  const alts = Object.keys(st.levels)
    .map(Number)
    .sort((a, b) => a - b);
  if (!alts.length) return null;
  if (altFt <= alts[0]) return st.levels[alts[0]];
  if (altFt >= alts[alts.length - 1]) return st.levels[alts[alts.length - 1]];
  for (let i = 0; i < alts.length - 1; i++) {
    const lo = alts[i];
    const hi = alts[i + 1];
    if (altFt < lo || altFt > hi) continue;
    const f = (altFt - lo) / (hi - lo);
    return blend([
      { cell: st.levels[lo], w: 1 - f },
      { cell: st.levels[hi], w: f },
    ]);
  }
  return null;
}

/** Average winds as vectors so 350° and 010° give 360°, not 180°. */
function blend(parts: { cell: WindCell; w: number }[]): WindCell | null {
  let u = 0;
  let v = 0;
  let t = 0;
  let tw = 0;
  let wsum = 0;
  for (const { cell, w } of parts) {
    if (w <= 0) continue;
    const r = (cell.dir * Math.PI) / 180;
    u += Math.sin(r) * cell.spd * w;
    v += Math.cos(r) * cell.spd * w;
    if (cell.temp != null) {
      t += cell.temp * w;
      tw += w;
    }
    wsum += w;
  }
  if (wsum <= 0) return null;
  u /= wsum;
  v /= wsum;
  const spd = Math.hypot(u, v);
  let dir = (Math.atan2(u, v) * 180) / Math.PI;
  if (dir <= 0) dir += 360;
  return { dir: spd < 0.5 ? 0 : Math.round(dir), spd: Math.round(spd), temp: tw > 0 ? Math.round(t / tw) : null };
}

/**
 * Forecast wind at a point and altitude: inverse-distance weighting of the
 * three nearest stations within 300 NM. Returns null when none are close.
 */
export function windAt(stations: WindStation[], lat: number, lon: number, altFt: number): (WindCell & { stations: string[] }) | null {
  const near = stations
    .map((st) => ({ st, d: distNm(lat, lon, st.lat, st.lon) }))
    .filter((x) => x.d <= 300)
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);
  const parts: { cell: WindCell; w: number }[] = [];
  const used: string[] = [];
  for (const { st, d } of near) {
    const cell = stationAt(st, altFt);
    if (!cell) continue;
    parts.push({ cell, w: 1 / Math.max(5, d) ** 2 });
    used.push(st.id);
  }
  const out = blend(parts);
  return out ? { ...out, stations: used } : null;
}
