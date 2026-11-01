import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

export type StreetKind = "water" | "park" | "road" | "hwy";

export type StreetGeom = {
  kind: StreetKind;
  closed: boolean;
  pts: [number, number][];
};

const RANK: Record<StreetKind, number> = { water: 0, park: 1, road: 2, hwy: 3 };

let templatePromise: Promise<string> | null = null;
const cache = new Map<string, StreetGeom[]>();

function tileTemplate(): Promise<string> {
  if (!templatePromise) {
    templatePromise = fetch("https://tiles.openfreemap.org/planet")
      .then((res) => {
        if (!res.ok) throw new Error("tilejson");
        return res.json() as Promise<{ tiles?: string[] }>;
      })
      .then((json) => {
        const url = json.tiles?.[0];
        if (!url) throw new Error("tilejson");
        return url;
      })
      .catch((err) => {
        templatePromise = null;
        throw err;
      });
  }
  return templatePromise;
}

function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

function kindOf(layer: string, props: Record<string, number | string | boolean>, z: number): StreetKind | null {
  if (layer === "water") return "water";
  if (layer === "park") return z >= 12 ? "park" : null;
  if (layer === "landcover") {
    if (z < 10) return null;
    const cls = String(props.class ?? "");
    if (cls === "wood" || cls === "grass") return "park";
    return null;
  }
  if (layer === "landuse") {
    const cls = String(props.class ?? "");
    if (cls === "park" || cls === "forest") return "park";
    return null;
  }
  if (layer === "transportation") {
    const cls = String(props.class ?? "");
    if (cls === "motorway" || cls === "trunk" || cls === "primary") return "hwy";
    if (cls === "secondary" && z >= 9) return "road";
    if ((cls === "tertiary" || cls === "minor") && z >= 11) return "road";
  }
  return null;
}

function decode(buf: ArrayBuffer, z: number, x: number, y: number): StreetGeom[] {
  const tile = new VectorTile(new PbfReader(buf));
  const out: StreetGeom[] = [];
  const n = 2 ** z;
  for (const name of ["water", "park", "landuse", "landcover", "transportation"] as const) {
    const layer = tile.layers[name];
    if (!layer) continue;
    const extent = layer.extent || 4096;
    const step = z < 9 ? 3 : 1;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const kind = kindOf(name, feature.properties, z);
      if (!kind) continue;
      for (const ring of feature.loadGeometry()) {
        if (ring.length < 2) continue;
        const pts: [number, number][] = [];
        for (let p = 0; p < ring.length; p += step) {
          const point = ring[p];
          const lon = ((x + point.x / extent) / n) * 360 - 180;
          const lat = tileYToLat(y + point.y / extent, z);
          pts.push([lon, lat]);
        }
        const last = ring[ring.length - 1];
        const end: [number, number] = [
          ((x + last.x / extent) / n) * 360 - 180,
          tileYToLat(y + last.y / extent, z),
        ];
        if (pts[pts.length - 1][0] !== end[0] || pts[pts.length - 1][1] !== end[1]) pts.push(end);
        if (pts.length >= 2) out.push({ kind, closed: feature.type === 3, pts });
      }
    }
  }
  out.sort((a, b) => RANK[a.kind] - RANK[b.kind]);
  return out;
}

export function streetTileIds(lat: number, lon: number, w: number, h: number, pxPerNm: number): string[] {
  const zoom = Math.log2(Math.max(0.01, pxPerNm) * Math.max(0.2, Math.cos((lat * Math.PI) / 180)) * (21600 / 512));
  const z = Math.max(5, Math.min(12, Math.round(zoom)));
  const latSpan = h / pxPerNm / 60;
  const lonSpan = w / pxPerNm / (60 * Math.cos((lat * Math.PI) / 180));
  const n = 2 ** z;
  const x0 = Math.floor(((lon - lonSpan / 2 + 180) / 360) * n);
  const x1 = Math.floor(((lon + lonSpan / 2 + 180) / 360) * n);
  const yNorth = (1 - Math.log(Math.tan(((lat + latSpan / 2) * Math.PI) / 180) + 1 / Math.cos(((lat + latSpan / 2) * Math.PI) / 180)) / Math.PI) / 2;
  const ySouth = (1 - Math.log(Math.tan(((lat - latSpan / 2) * Math.PI) / 180) + 1 / Math.cos(((lat - latSpan / 2) * Math.PI) / 180)) / Math.PI) / 2;
  const y0 = Math.max(0, Math.floor(yNorth * n));
  const y1 = Math.min(n - 1, Math.floor(ySouth * n));
  const ids: string[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const xx = ((x % n) + n) % n;
      ids.push(`${z}/${xx}/${y}`);
      if (ids.length >= 20) return ids;
    }
  }
  return ids;
}

export async function loadStreetTile(id: string): Promise<StreetGeom[]> {
  const hit = cache.get(id);
  if (hit) return hit;
  const [z, x, y] = id.split("/").map(Number);
  try {
    const template = await tileTemplate();
    const res = await fetch(template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)));
    if (!res.ok) return [];
    const geoms = decode(await res.arrayBuffer(), z, x, y);
    cache.set(id, geoms);
    return geoms;
  } catch {
    return [];
  }
}
