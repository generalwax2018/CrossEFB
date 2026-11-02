/** Shapes shared by the live-data server routes and the client. */

export type StationWx = {
  id: string;
  lat: number;
  lon: number;
  cat: string;
  wdir: number | null;
  wspd: number | null;
  wgst: number | null;
  obs: string;
};

export type MetarField = { stations: StationWx[]; fetchedAt: string | null; tooWide?: boolean };

export type Tfr = {
  id: string;
  type: string;
  title: string;
  state: string;
  rings: [number, number][][];
  link: string;
};

export type TfrPack = { tfrs: Tfr[]; fetchedAt: string | null; stale: boolean };

export const emptyTfrs: TfrPack = { tfrs: [], fetchedAt: null, stale: false };

/** Even-odd point-in-polygon test on [lon, lat] rings. */
export function ringContains(ring: [number, number][], lat: number, lon: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const hit = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-9) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/**
 * TFRs that a straight-line route passes through (or near the edge of),
 * sampled every ~1 NM.
 */
export function tfrsOnRoute(tfrs: Tfr[], pts: { lat: number; lon: number }[]): Tfr[] {
  const hits: Tfr[] = [];
  if (pts.length === 0) return hits;
  const samples: { lat: number; lon: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    samples.push(a);
    if (!b) continue;
    const nm = Math.hypot((b.lat - a.lat) * 60, (b.lon - a.lon) * 60 * Math.cos((a.lat * Math.PI) / 180));
    const n = Math.min(600, Math.ceil(nm));
    for (let k = 1; k < n; k++) {
      const f = k / n;
      samples.push({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f });
    }
  }
  for (const t of tfrs) {
    const box = t.rings.flat();
    if (!box.length) continue;
    let s = 90;
    let n = -90;
    let w = 180;
    let e = -180;
    for (const [lon, lat] of box) {
      s = Math.min(s, lat);
      n = Math.max(n, lat);
      w = Math.min(w, lon);
      e = Math.max(e, lon);
    }
    const near = samples.filter((p) => p.lat >= s - 0.05 && p.lat <= n + 0.05 && p.lon >= w - 0.05 && p.lon <= e + 0.05);
    if (near.some((p) => t.rings.some((r) => ringContains(r, p.lat, p.lon)))) hits.push(t);
  }
  return hits;
}
