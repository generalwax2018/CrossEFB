import { getAirport } from "./airports";
import { emptyTfrs, type MetarField, type StationWx, type Tfr, type TfrPack } from "./live";
import { emptyWinds, parseWindText, type WindPack, type WindStation } from "./winds";

const UA = { "user-agent": "CrossEFB/1.0 (planning aid)" };

/* ------------------------------------------------------------------ */
/* Small cache with in-flight de-duplication and stale fallback.       */
/* ------------------------------------------------------------------ */

type Slot<T> = { at: number; body: T; inflight: Promise<T> | null };
const slots = new Map<string, Slot<unknown>>();

async function cached<T>(key: string, freshMs: number, load: () => Promise<T>, onFail: (last: T | null) => T): Promise<T> {
  const slot = slots.get(key) as Slot<T> | undefined;
  if (slot && Date.now() - slot.at < freshMs) return slot.body;
  if (slot?.inflight) return slot.inflight;
  const run = load()
    .then((body) => {
      slots.set(key, { at: Date.now(), body, inflight: null });
      return body;
    })
    .catch(() => {
      const now = slots.get(key) as Slot<T> | undefined;
      const last = now && now.at > 0 ? now.body : null;
      if (now) now.inflight = null;
      return onFail(last);
    });
  if (slot) slot.inflight = run;
  else slots.set(key, { at: 0, body: null as T, inflight: run });
  if (slots.size > 400) {
    const oldest = [...slots.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) slots.delete(oldest[0]);
  }
  return run;
}

/* ------------------------------------------------------------------ */
/* METARs across the map                                               */
/* ------------------------------------------------------------------ */

type RawMetar = {
  icaoId?: string;
  lat?: number;
  lon?: number;
  fltCat?: string;
  wdir?: number | string;
  wspd?: number;
  wgst?: number;
  obsTime?: number;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Snap a box outward to a 1° grid so nearby views share a cache entry. */
function snap(south: number, west: number, north: number, east: number) {
  return {
    south: Math.max(-90, Math.floor(south)),
    west: Math.max(-180, Math.floor(west)),
    north: Math.min(90, Math.ceil(north)),
    east: Math.min(180, Math.ceil(east)),
  };
}

export async function metarField(box: { south: number; west: number; north: number; east: number }): Promise<MetarField> {
  const b = snap(box.south, box.west, box.north, box.east);
  if (b.north - b.south > 14 || b.east - b.west > 24) return { stations: [], fetchedAt: null, tooWide: true };
  const key = `metar:${b.south},${b.west},${b.north},${b.east}`;
  return cached<MetarField>(
    key,
    5 * 60 * 1000,
    async () => {
      const url = `https://aviationweather.gov/api/data/metar?bbox=${b.south},${b.west},${b.north},${b.east}&format=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: UA });
      if (res.status === 204) return { stations: [], fetchedAt: new Date().toISOString() };
      if (!res.ok) throw new Error(String(res.status));
      const raw = (await res.json()) as RawMetar[];
      const seen = new Set<string>();
      const stations: StationWx[] = [];
      for (const m of Array.isArray(raw) ? raw : []) {
        const id = m.icaoId?.toUpperCase();
        const lat = num(m.lat);
        const lon = num(m.lon);
        if (!id || lat == null || lon == null || seen.has(id)) continue;
        seen.add(id);
        stations.push({
          id,
          lat,
          lon,
          cat: (m.fltCat ?? "").toUpperCase(),
          wdir: m.wdir === "VRB" ? null : num(m.wdir),
          wspd: num(m.wspd),
          wgst: num(m.wgst),
          obs: m.obsTime ? new Date(m.obsTime * 1000).toISOString().slice(11, 16) + "Z" : "",
        });
      }
      return { stations, fetchedAt: new Date().toISOString() };
    },
    (last) => last ?? { stations: [], fetchedAt: null },
  );
}

/* ------------------------------------------------------------------ */
/* TFRs                                                                */
/* ------------------------------------------------------------------ */

const TFR_SHAPES =
  "https://tfr.faa.gov/geoserver/TFR/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=TFR:V_TFR_LOC&maxFeatures=1000&outputFormat=application/json&srsname=EPSG:4326";
const TFR_LIST = "https://tfr.faa.gov/tfrapi/getTfrList";

type TfrFeature = {
  properties?: { NOTAM_KEY?: string; TITLE?: string; LEGAL?: string; STATE?: string };
  geometry?: { type?: string; coordinates?: unknown };
};

type TfrListRow = { notam_id?: string; type?: string; description?: string; state?: string };

function ringsOf(geom: TfrFeature["geometry"]): [number, number][][] {
  if (!geom || !Array.isArray(geom.coordinates)) return [];
  const toRing = (r: unknown): [number, number][] =>
    Array.isArray(r)
      ? r
          .filter((p): p is [number, number] => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
          .map((p) => [Number(p[0]), Number(p[1])])
      : [];
  if (geom.type === "Polygon") return [toRing((geom.coordinates as unknown[])[0])].filter((r) => r.length > 2);
  if (geom.type === "MultiPolygon")
    return (geom.coordinates as unknown[][]).map((poly) => toRing(poly[0])).filter((r) => r.length > 2);
  return [];
}

export async function tfrPack(): Promise<TfrPack> {
  return cached<TfrPack>(
    "tfr",
    10 * 60 * 1000,
    async () => {
      const signal = AbortSignal.timeout(15000);
      const [shapesRes, listRes] = await Promise.all([
        fetch(TFR_SHAPES, { signal, headers: UA }),
        fetch(TFR_LIST, { signal, headers: UA }).catch(() => null),
      ]);
      if (!shapesRes.ok) throw new Error(String(shapesRes.status));
      const shapes = (await shapesRes.json()) as { features?: TfrFeature[] };
      const list: TfrListRow[] = listRes?.ok ? ((await listRes.json()) as TfrListRow[]) : [];
      const active = new Map(list.filter((r) => r.notam_id).map((r) => [r.notam_id!, r]));
      const byId = new Map<string, Tfr>();
      for (const f of shapes.features ?? []) {
        const key = f.properties?.NOTAM_KEY ?? "";
        const id = key.split("-")[0];
        if (!id) continue;
        // The shape layer can lag behind; when the list loaded, trust it.
        if (active.size && !active.has(id)) continue;
        const row = active.get(id);
        const rings = ringsOf(f.geometry);
        if (!rings.length) continue;
        const prev = byId.get(id);
        if (prev) {
          prev.rings.push(...rings);
          continue;
        }
        byId.set(id, {
          id,
          type: row?.type ?? f.properties?.LEGAL ?? "TFR",
          title: row?.description ?? f.properties?.TITLE ?? id,
          state: row?.state ?? f.properties?.STATE ?? "",
          rings,
          link: `https://tfr.faa.gov/tfr3/?page=detail_${id.replace("/", "_")}`,
        });
      }
      return { tfrs: [...byId.values()], fetchedAt: new Date().toISOString(), stale: false };
    },
    (last) => (last ? { ...last, stale: true } : emptyTfrs),
  );
}

/* ------------------------------------------------------------------ */
/* Winds aloft                                                         */
/* ------------------------------------------------------------------ */

export async function windPack(fcst: "06" | "12" | "24"): Promise<WindPack> {
  return cached<WindPack>(
    `winds:${fcst}`,
    20 * 60 * 1000,
    async () => {
      const url = `https://aviationweather.gov/api/data/windtemp?region=all&level=low&fcst=${fcst}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: UA });
      if (!res.ok) {
        const text = await res.text();
        if (text.toLowerCase().includes("discontinued")) {
          return {
            stations: [],
            valid: "",
            forUse: "",
            fetchedAt: new Date().toISOString(),
            stale: false,
            note: "The NWS ended the FB winds tables on 3 Nov 2026. Use a manual wind. The graphical forecast is on aviationweather.gov.",
          };
        }
        throw new Error(String(res.status));
      }
      const parsed = parseWindText(await res.text());
      const stations: WindStation[] = [];
      for (const row of parsed.rows) {
        const a = getAirport(`K${row.id}`) ?? getAirport(`P${row.id}`) ?? getAirport(row.id);
        if (!a) continue;
        stations.push({ id: row.id, lat: a.lat, lon: a.lon, levels: row.levels });
      }
      return { stations, valid: parsed.valid, forUse: parsed.forUse, fetchedAt: new Date().toISOString(), stale: false };
    },
    (last) => (last ? { ...last, stale: true } : emptyWinds),
  );
}
