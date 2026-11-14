import type { TrafficTarget } from "./gdl90.ts";

export type StratuxTarget = TrafficTarget & { seen: number };

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Stratux getTraffic JSON. Other receivers are ignored. */
export function stratuxTargets(body: unknown, now: number): StratuxTarget[] {
  if (!body || typeof body !== "object") return [];
  const traffic: StratuxTarget[] = [];
  for (const [key, raw] of Object.entries(body as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const lat = num(row.Lat);
    const lon = num(row.Lng);
    if (lat == null || lon == null || (lat === 0 && lon === 0)) continue;
    traffic.push({
      kind: "traffic",
      alert: false,
      addrType: 0,
      address: String(row.Icao_addr ?? key),
      lat,
      lon,
      altFt: num(row.Alt),
      airborne: row.OnGround !== true,
      nic: 0,
      nacp: 8,
      gsKt: num(row.Speed),
      vsFpm: num(row.Vvel),
      track: num(row.Track),
      emitter: 0,
      callsign: typeof row.Tail === "string" ? row.Tail.trim() : "",
      emergency: 0,
      seen: now,
    });
  }
  return traffic;
}

/** Stratux getSituation JSON, or null when the GPS has no fix. */
export function stratuxOwnship(body: unknown, now: number): StratuxTarget | null {
  if (!body || typeof body !== "object") return null;
  const row = body as Record<string, unknown>;
  const lat = num(row.GPSLatitude);
  const lon = num(row.GPSLongitude);
  if (lat == null || lon == null || Math.abs(lat) < 0.01) return null;
  return {
    kind: "ownship",
    alert: false,
    addrType: 0,
    address: "own",
    lat,
    lon,
    altFt: num(row.GPSAltitudeMSL),
    airborne: (num(row.GPSGroundSpeed) ?? 0) > 30,
    nic: 0,
    nacp: (num(row.GPSFixQuality) ?? 0) >= 1 ? 9 : 0,
    gsKt: num(row.GPSGroundSpeed),
    vsFpm: null,
    track: num(row.GPSTrueCourse),
    emitter: 0,
    callsign: "",
    emergency: 0,
    seen: now,
  };
}
