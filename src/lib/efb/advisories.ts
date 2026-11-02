export type WxArea = {
  id: string;
  hazard: string;
  label: string;
  detail: string;
  rings: [number, number][][];
  line: boolean;
};

export type WxPirep = {
  id: string;
  lat: number;
  lon: number;
  label: string;
};

export type WxAdvisories = {
  areas: WxArea[];
  pireps: WxPirep[];
  fetchedAt: string | null;
  valid: string;
  stale: boolean;
};

export const emptyAdvisories: WxAdvisories = {
  areas: [],
  pireps: [],
  fetchedAt: null,
  valid: "",
  stale: false,
};

type Geom = { type?: string; coordinates?: unknown };

function slim(ring: unknown): [number, number][] {
  if (!Array.isArray(ring)) return [];
  const step = ring.length > 80 ? Math.ceil(ring.length / 60) : 1;
  const out: [number, number][] = [];
  for (let i = 0; i < ring.length; i += step) {
    const p = ring[i];
    if (!Array.isArray(p) || p.length < 2) continue;
    const lon = Number(p[0]);
    const lat = Number(p[1]);
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      out.push([Math.round(lon * 1000) / 1000, Math.round(lat * 1000) / 1000]);
    }
  }
  return out;
}

export function geometryRings(geom: Geom | null | undefined): { rings: [number, number][][]; line: boolean } {
  if (!geom?.type || !geom.coordinates) return { rings: [], line: false };
  if (geom.type === "Polygon") {
    const coords = geom.coordinates as unknown[];
    return { rings: [slim(coords[0])].filter((r) => r.length >= 3), line: false };
  }
  if (geom.type === "MultiPolygon") {
    const coords = geom.coordinates as unknown[];
    return {
      rings: coords
        .map((poly) => slim(Array.isArray(poly) ? poly[0] : []))
        .filter((r) => r.length >= 3),
      line: false,
    };
  }
  if (geom.type === "LineString") return { rings: [slim(geom.coordinates)].filter((r) => r.length >= 2), line: true };
  if (geom.type === "MultiLineString") {
    const coords = geom.coordinates as unknown[];
    return { rings: coords.map((line) => slim(line)).filter((r) => r.length >= 2), line: true };
  }
  return { rings: [], line: false };
}

export function hazardLabel(hazard: string): string {
  const u = hazard.toUpperCase();
  if (u === "MT_OBSC" || u === "MTN_OBS" || u === "MTN-OBS") return "MTN OBSC";
  if (u.startsWith("TURB")) return "TURB";
  if (u === "SFC_WND" || u === "SFC-WIND") return "SFC WND";
  if (u === "FZLVL" || u === "M_FZLVL") return "FZ LVL";
  if (u === "CONV" || u === "TS") return "TS";
  if (u === "LLWS") return "LLWS";
  if (u === "VA") return "ASH";
  return u.replaceAll("_", " ").replaceAll("-", " ");
}

export function pirepLabel(raw: string): string {
  const piece = (tag: string) => {
    const match = raw.match(new RegExp(`/${tag} ([^/]+)`));
    return match ? match[1].trim() : "";
  };
  const body = piece("TB") || piece("IC") || piece("WX") || "PIREP";
  const fl = raw.match(/\/FL([0-9A-Z]+)/);
  return `${body}${fl ? ` ${fl[1]}` : ""}`.replace(/\s+/g, " ").slice(0, 32);
}
