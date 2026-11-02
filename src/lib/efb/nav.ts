import { airportsNear, getAirport } from "./airports";
import type { Aircraft, Airport } from "./types";

const R_NM = 3440.065;

export type LatLon = { lat: number; lon: number };

export function nearestAirports(lat: number, lon: number, limit = 6): { airport: Airport; nm: number }[] {
  const here = { lat, lon };
  let found: Airport[] = [];
  let pad = 0.35;
  while (pad <= 5 && found.length < limit * 4) {
    found = airportsNear(lat, lon, 0, 0, pad);
    pad *= 1.7;
  }
  return found
    .map((airport) => ({ airport, nm: haversineNm(here, airport) }))
    .sort((a, b) => a.nm - b.nm || a.airport.icao.localeCompare(b.airport.icao))
    .slice(0, limit);
}

export function haversineNm(a: LatLon, b: LatLon): number {
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = ((b.lat - a.lat) * Math.PI) / 180;
  const dl = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function trueCourse(a: LatLon, b: LatLon): number {
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dl = ((b.lon - a.lon) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return wrap360((Math.atan2(y, x) * 180) / Math.PI);
}

export function wrap360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function hdgText(deg: number): string {
  const r = Math.round(wrap360(deg));
  return r === 0 ? "360" : String(r).padStart(3, "0");
}

export function magCourse(tc: number, varEast: number): number {
  return wrap360(tc - varEast);
}

export function groundspeed(
  tas: number,
  tc: number,
  windFrom: number,
  windKts: number,
): { gs: number; wca: number } {
  if (tas <= 0) return { gs: 0, wca: 0 };
  const wa = ((windFrom - tc) * Math.PI) / 180;
  const head = windKts * Math.cos(wa);
  const cross = windKts * Math.sin(wa);
  if (Math.abs(cross) >= tas) return { gs: 0, wca: 0 };
  const wca = (Math.asin(cross / tas) * 180) / Math.PI;
  const gs = Math.sqrt(tas * tas - cross * cross) - head;
  return { gs: Math.max(0, gs), wca };
}

export function moveNm(from: LatLon, bearingDeg: number, distNm: number): LatLon {
  const d = distNm / R_NM;
  const br = (bearingDeg * Math.PI) / 180;
  const p1 = (from.lat * Math.PI) / 180;
  const l1 = (from.lon * Math.PI) / 180;
  const p2 = Math.asin(
    Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(br),
  );
  const l2 =
    l1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(p1),
      Math.cos(d) - Math.sin(p1) * Math.sin(p2),
    );
  let lon = (l2 * 180) / Math.PI;
  lon = ((lon + 540) % 360) - 180;
  return { lat: (p2 * 180) / Math.PI, lon };
}

export type Leg = {
  from: string;
  to: string;
  nm: number;
  tc: number;
  mc: number;
  /** Magnetic heading to fly after wind correction. */
  mh: number;
  gs: number;
  wca: number;
  min: number;
  gal: number;
  windFrom: number;
  windKts: number;
  /** Forecast temperature at altitude, °C, when the wind came from the FB product. */
  oat: number | null;
  windSource: "manual" | "forecast";
};

/** Wind lookup for a leg midpoint, or null to fall back to the manual wind. */
export type WindLookup = (lat: number, lon: number) => { dir: number; spd: number; temp: number | null } | null;

export function buildLegs(
  ids: string[],
  aircraft: Aircraft,
  windFrom: number,
  windKts: number,
  lookup?: WindLookup,
): Leg[] {
  const legs: Leg[] = [];
  for (let i = 0; i < ids.length - 1; i++) {
    const a = getAirport(ids[i]);
    const b = getAirport(ids[i + 1]);
    if (!a || !b) continue;
    const nm = haversineNm(a, b);
    const tc = trueCourse(a, b);
    const mc = magCourse(tc, (a.varE + b.varE) / 2);
    const fc = lookup ? lookup((a.lat + b.lat) / 2, (a.lon + b.lon) / 2) : null;
    const wFrom = fc ? fc.dir : windFrom;
    const wKts = fc ? fc.spd : windKts;
    const { gs, wca } = groundspeed(aircraft.tas, tc, wFrom, wKts);
    const min = gs > 1 ? (nm / gs) * 60 : Infinity;
    const gal = Number.isFinite(min) ? (min / 60) * aircraft.burnGph : Infinity;
    legs.push({
      from: a.icao,
      to: b.icao,
      nm,
      tc,
      mc,
      mh: wrap360(mc + wca),
      gs,
      wca,
      min,
      gal,
      windFrom: wFrom,
      windKts: wKts,
      oat: fc ? fc.temp : null,
      windSource: fc ? "forecast" : "manual",
    });
  }
  return legs;
}

export function totals(legs: Leg[]): { nm: number; min: number; gal: number } {
  return legs.reduce(
    (acc, l) => ({
      nm: acc.nm + l.nm,
      min: acc.min + (Number.isFinite(l.min) ? l.min : 0),
      gal: acc.gal + (Number.isFinite(l.gal) ? l.gal : 0),
    }),
    { nm: 0, min: 0, gal: 0 },
  );
}

export function positionAlong(
  ids: string[],
  distNm: number,
): { lat: number; lon: number; track: number; legIndex: number; intoNm: number } | null {
  if (ids.length === 0) return null;
  const first = getAirport(ids[0]);
  if (!first) return null;
  if (ids.length === 1 || distNm <= 0) {
    return { lat: first.lat, lon: first.lon, track: first.hdg ?? 0, legIndex: 0, intoNm: 0 };
  }
  let remain = distNm;
  for (let i = 0; i < ids.length - 1; i++) {
    const a = getAirport(ids[i]);
    const b = getAirport(ids[i + 1]);
    if (!a || !b) continue;
    const nm = haversineNm(a, b);
    const tc = trueCourse(a, b);
    if (remain <= nm || i === ids.length - 2) {
      const step = Math.min(Math.max(remain, 0), nm);
      const p = moveNm(a, tc, step);
      return { lat: p.lat, lon: p.lon, track: tc, legIndex: i, intoNm: step };
    }
    remain -= nm;
  }
  const last = getAirport(ids[ids.length - 1]);
  if (!last) return null;
  return { lat: last.lat, lon: last.lon, track: 0, legIndex: ids.length - 2, intoNm: 0 };
}

export function nextFix(
  ids: string[],
  here: LatLon,
): { icao: string; nm: number; tc: number; mc: number } | null {
  const pts = ids.map((id) => getAirport(id)).filter((a): a is Airport => Boolean(a));
  if (!pts.length) return null;
  const pack = (p: Airport) => {
    const tc = trueCourse(here, p);
    return { icao: p.icao, nm: haversineNm(here, p), tc, mc: magCourse(tc, p.varE) };
  };
  if (pts.length === 1) return pack(pts[0]);

  let best: { i: number; cross: number; along: number; len: number } | null = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const len = Math.max(haversineNm(a, b), 0.01);
    const ab = trueCourse(a, b);
    const ah = haversineNm(a, here);
    const delta = ((trueCourse(a, here) - ab) * Math.PI) / 180;
    const along = ah * Math.cos(delta);
    const cross = Math.abs(ah * Math.sin(delta));
    if (along < -2 || along > len + 2) continue;
    if (!best || cross < best.cross) best = { i, cross, along, len };
  }
  if (!best) {
    let near = pts[0];
    let dist = haversineNm(here, near);
    for (const p of pts) {
      const n = haversineNm(here, p);
      if (n < dist) {
        near = p;
        dist = n;
      }
    }
    const idx = pts.indexOf(near);
    return pack(dist < 0.5 && idx < pts.length - 1 ? pts[idx + 1] : near);
  }
  const passed = best.along > best.len - 0.4;
  const target = passed && best.i + 2 < pts.length ? pts[best.i + 2] : pts[best.i + 1];
  return pack(target);
}

export function routeDistance(ids: string[]): number {
  let n = 0;
  for (let i = 0; i < ids.length - 1; i++) {
    const a = getAirport(ids[i]);
    const b = getAirport(ids[i + 1]);
    if (a && b) n += haversineNm(a, b);
  }
  return n;
}

export function fmtMin(min: number): string {
  if (!Number.isFinite(min)) return "—";
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? `${h}:${String(r).padStart(2, "0")}` : `${r}m`;
}

export function fmtNm(nm: number): string {
  if (!Number.isFinite(nm)) return "—";
  if (nm < 10) return nm.toFixed(1);
  return String(Math.round(nm));
}

export function fmtGal(gal: number): string {
  if (!Number.isFinite(gal)) return "—";
  return gal.toFixed(1);
}
