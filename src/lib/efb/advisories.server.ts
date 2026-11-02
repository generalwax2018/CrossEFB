import {
  emptyAdvisories,
  geometryRings,
  hazardLabel,
  pirepLabel,
  type WxAdvisories,
  type WxArea,
  type WxPirep,
} from "./advisories";

const FRESH_MS = 4 * 60 * 1000;
const GAIRMET = "https://aviationweather.gov/api/data/gairmet?format=geojson";
const SIGMET = "https://aviationweather.gov/api/data/sigmet?format=geojson";
const PIREP = "https://aviationweather.gov/api/data/pirep?format=geojson&bbox=15,-179,73,-60&age=2";

type Feature = {
  properties?: Record<string, unknown>;
  geometry?: { type?: string; coordinates?: unknown };
};

let cache: { at: number; body: WxAdvisories } | null = null;
let inflight: Promise<WxAdvisories> | null = null;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function detailOf(props: Record<string, unknown>, label: string): string {
  const base = text(props.base);
  const top = text(props.top);
  const band = base || top ? [base, top].filter(Boolean).join("–") : "";
  const note = text(props.dueTo) || text(props.qualifier) || text(props.rawSigmet).split("\n")[0] || "";
  return [label, band, note].filter(Boolean).join(" · ").slice(0, 160);
}

function areasFrom(features: Feature[], prefix: string): WxArea[] {
  const areas: WxArea[] = [];
  features.forEach((feature, index) => {
    const props = feature.properties ?? {};
    const hazard = text(props.hazard) || prefix.toUpperCase();
    const drawn = geometryRings(feature.geometry);
    if (!drawn.rings.length) return;
    const label = hazardLabel(hazard);
    areas.push({
      id: `${prefix}-${index}-${text(props.tag) || text(props.seriesId) || "x"}-${hazard}`,
      hazard,
      label,
      detail: detailOf(props, label),
      rings: drawn.rings,
      line: drawn.line,
    });
  });
  return areas;
}

function pirepsFrom(features: Feature[]): WxPirep[] {
  const out: WxPirep[] = [];
  for (let index = 0; index < features.length && out.length < 500; index++) {
    const feature = features[index];
    const props = feature.properties ?? {};
    const coords = feature.geometry?.type === "Point" ? feature.geometry.coordinates : null;
    const lon = Array.isArray(coords) ? Number(coords[0]) : Number(props.lon);
    const lat = Array.isArray(coords) ? Number(coords[1]) : Number(props.lat);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const raw = text(props.rawOb);
    out.push({
      id: `${index}-${text(props.icaoId)}-${lat.toFixed(2)}-${lon.toFixed(2)}`,
      lat,
      lon,
      label: pirepLabel(raw || "PIREP"),
    });
  }
  return out;
}

async function readFeatures(url: string, signal: AbortSignal): Promise<{ features: Feature[]; valid: string }> {
  const res = await fetch(url, {
    signal,
    headers: { accept: "application/json", "user-agent": "CrossEFB/1.0 (planning aid)" },
  });
  if (res.status === 204) return { features: [], valid: "" };
  if (!res.ok) throw new Error(String(res.status));
  const body = (await res.json()) as { features?: Feature[]; validTime?: unknown };
  const validTime = body.validTime;
  const featureValid = text(body.features?.[0]?.properties?.validTime);
  const valid =
    typeof validTime === "string"
      ? validTime
      : typeof validTime === "number" && validTime > 1e9
        ? new Date(validTime * 1000).toISOString()
        : featureValid;
  return { features: Array.isArray(body.features) ? body.features : [], valid };
}

async function pull(): Promise<WxAdvisories> {
  const signal = AbortSignal.timeout(12000);
  const [gairmet, sigmet, pirep] = await Promise.all([
    readFeatures(GAIRMET, signal),
    readFeatures(SIGMET, signal),
    readFeatures(PIREP, signal),
  ]);
  const areas = [...areasFrom(gairmet.features, "g"), ...areasFrom(sigmet.features, "s")];
  return {
    areas,
    pireps: pirepsFrom(pirep.features),
    fetchedAt: new Date().toISOString(),
    valid: gairmet.valid,
    stale: false,
  };
}

export async function advisoryPack(): Promise<WxAdvisories> {
  if (cache && Date.now() - cache.at < FRESH_MS) return cache.body;
  if (!inflight) {
    inflight = pull().finally(() => {
      inflight = null;
    });
  }
  try {
    const body = await inflight;
    cache = { at: Date.now(), body };
    return body;
  } catch {
    if (cache) return { ...cache.body, stale: true };
    return emptyAdvisories;
  }
}
